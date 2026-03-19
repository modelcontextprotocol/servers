"""
Sift MCP Server
Exposes Sift's agent execution governance as MCP tools for Claude and other LLM clients.
Any Claude user can add this as an MCP server to govern their agent actions through Sift.
"""

import asyncio
import json
import secrets
import time
import uuid
import base64
import hashlib
from typing import Any

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

# Sift configuration
SIFT_BASE_URL = "http://sift-brain-alb-912942670.us-east-2.elb.amazonaws.com"
SIFT_TENANT = "eqhoai_alpha"

app = Server("sift-governance")


def canonical_json(data: dict) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="sift_authorize",
            description=(
                "Authorize an agent action through Sift's governance layer. "
                "Call this BEFORE executing any real-world action (API calls, file writes, transactions, emails, etc). "
                "Returns a signed receipt if the action is allowed, or a denial if it violates policy. "
                "This is the core of Sift: no action should execute without a valid authorization receipt."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Your registered agent ID in Sift"
                    },
                    "action": {
                        "type": "string",
                        "description": "The action being requested (e.g. 'send_email', 'execute_trade', 'write_file', 'api_call')"
                    },
                    "tool": {
                        "type": "string",
                        "description": "The specific tool being used (e.g. 'gmail.send', 'alpaca.order', 'filesystem.write')"
                    },
                    "intent": {
                        "type": "string",
                        "description": "Natural language description of what you are trying to do and why"
                    },
                    "risk_tier": {
                        "type": "integer",
                        "description": "Risk level 0-3 (0=read-only, 1=low-risk write, 2=medium-risk, 3=high-risk/financial)",
                        "default": 1
                    }
                },
                "required": ["agent_id", "action", "tool", "intent"]
            }
        ),
        types.Tool(
            name="sift_check_policy",
            description=(
                "Check what actions are allowed for a given agent before attempting them. "
                "Use this to understand your agent's permissions and avoid unnecessary authorization failures."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Your registered agent ID in Sift"
                    }
                },
                "required": ["agent_id"]
            }
        ),
        types.Tool(
            name="sift_register_agent",
            description=(
                "Get instructions for registering a new agent with Sift. "
                "Returns the steps needed to onboard your agent and start governing its actions."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[types.TextContent]:
    
    if name == "sift_authorize":
        agent_id = arguments.get("agent_id", "")
        action = arguments.get("action", "execute_request")
        tool = arguments.get("tool", "gateway.request")
        intent = arguments.get("intent", "")
        risk_tier = arguments.get("risk_tier", 1)

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # Step 1: Get challenge
                r = await client.post(
                    f"{SIFT_BASE_URL}/auth/challenge",
                    json={"tenant_id": SIFT_TENANT, "agent_id": agent_id},
                    headers={"X-Sift-Tenant": SIFT_TENANT}
                )
                
                if r.status_code != 200:
                    return [types.TextContent(
                        type="text",
                        text=f"SIFT_DENY: Could not get challenge for agent '{agent_id}'. "
                             f"Agent may not be registered. Status: {r.status_code}. "
                             f"Register at sift.walkosystems.com to get access."
                    )]
                
                nonce = r.json()["nonce"]
                
                # Step 2: Authorize (unsigned for unregistered agents - will be denied by policy)
                request_id = str(uuid.uuid4())
                timestamp = int(time.time())
                params = {"intent": intent, "tool": tool}
                params_hash = sha256_hex(canonical_json(params))
                
                auth_payload = {
                    "request_id": request_id,
                    "tenant_id": SIFT_TENANT,
                    "agent_id": agent_id,
                    "agent_role": "analyst",
                    "action": action,
                    "tool": tool,
                    "risk_tier": risk_tier,
                    "nonce": nonce,
                    "timestamp": timestamp,
                    "params": params,
                    "signature": "unsigned_mcp_request"
                }
                
                r2 = await client.post(
                    f"{SIFT_BASE_URL}/authorize",
                    json=auth_payload,
                    headers={"X-Sift-Tenant": SIFT_TENANT}
                )
                
                resp = r2.json()
                allowed = resp.get("allowed", False)
                receipt = resp.get("receipt", {})
                receipt_id = receipt.get("receipt_id", "no-receipt")
                decision = receipt.get("decision", "DENY")
                reason = resp.get("reason", "")
                
                if allowed:
                    return [types.TextContent(
                        type="text",
                        text=f"SIFT_ALLOW\n"
                             f"Receipt ID: {receipt_id}\n"
                             f"Agent: {agent_id}\n"
                             f"Action: {action} via {tool}\n"
                             f"Decision: {decision}\n"
                             f"Risk Tier: {risk_tier}\n"
                             f"Audit Hash: {receipt.get('canonical_request_hash', 'N/A')}\n"
                             f"Expires: {receipt.get('expiry', 'N/A')}\n\n"
                             f"Action is authorized. Proceed with execution."
                    )]
                else:
                    return [types.TextContent(
                        type="text",
                        text=f"SIFT_DENY\n"
                             f"Agent: {agent_id}\n"
                             f"Action: {action} via {tool}\n"
                             f"Decision: DENY\n"
                             f"Reason: {reason}\n\n"
                             f"Action is NOT authorized. Do not execute.\n"
                             f"To gain access, register your agent at sift.walkosystems.com"
                    )]
                    
        except Exception as e:
            return [types.TextContent(
                type="text",
                text=f"SIFT_ERROR: Could not reach Sift governance layer. Error: {str(e)}\n"
                     f"Failing closed -- do not execute the action until governance is confirmed."
            )]

    elif name == "sift_check_policy":
        agent_id = arguments.get("agent_id", "")
        return [types.TextContent(
            type="text",
            text=f"Policy check for agent: {agent_id}\n\n"
                 f"To check your agent's policy, contact jason@walkosystems.com with your agent ID.\n"
                 f"Current registered agents can query the /authorize endpoint to verify permissions.\n\n"
                 f"Sift endpoint: {SIFT_BASE_URL}\n"
                 f"Tenant: {SIFT_TENANT}\n"
                 f"Docs: sift.walkosystems.com"
        )]

    elif name == "sift_register_agent":
        return [types.TextContent(
            type="text",
            text="""To register your agent with Sift:

1. Go to sift.walkosystems.com and sign up ($29/month)
2. Email jason@walkosystems.com with:
   - Your desired agent_id
   - Your use case (what actions your agent will take)
   - Your Ed25519 public key (generate with: python -c "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey; from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat; import base64; k = Ed25519PrivateKey.generate(); print(base64.urlsafe_b64encode(k.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).rstrip(b'=').decode())")

3. You'll receive your tenant_id, agent_id, and policy configuration
4. Use sift_authorize before any real-world action

Every action gets a cryptographically signed receipt. Full audit trail. Fail-closed.

Questions? jason@walkosystems.com"""
        )]

    return [types.TextContent(type="text", text=f"Unknown tool: {name}")]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
