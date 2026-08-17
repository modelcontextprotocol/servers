from __future__ import annotations

import json
import sys
from typing import Any, TextIO

try:
    from mcp_server_action_gate.gate import AgentActionGate
    from mcp_server_action_gate.schema import Actor, CONSULTATION, INSTANT_AUDIT, ToolRequest
except ImportError:
    from aag.gate import AgentActionGate
    from aag.schema import Actor, CONSULTATION, INSTANT_AUDIT, ToolRequest

SERVER_NAME = "agent-action-gate"
SERVER_VERSION = "0.2.0"
PROTOCOL_VERSION = "2024-11-05"

INSTRUCTIONS = (
    "Gate/Prove proposed agent tool calls. This server never executes tools. "
    "Unattended destructive, provision, and decommission calls are DENY. "
    "Agent thought and model_confidence are never approval. "
    f"Paid evaluation: Instant Audit $499 {INSTANT_AUDIT} · consultation {CONSULTATION}"
)

TOOLS: list[dict[str, Any]] = [
    {
        "name": "gate_check",
        "description": (
            "Evaluate a proposed MCP/agent tool call under Gate/Prove. Never executes the tool. "
            "Unattended destructive/provision/decommission is DENY even at high model confidence. "
            f"Commercial: Instant Audit $499 {INSTANT_AUDIT}"
        ),
        "inputSchema": {
            "type": "object",
            "required": ["tool"],
            "properties": {
                "tool": {"type": "string", "description": "Tool name the agent wants to invoke"},
                "tier": {
                    "type": "string",
                    "enum": ["read", "write", "destructive", "provision", "decommission"],
                },
                "arguments": {"type": "object"},
                "thought": {"type": "string"},
                "model_confidence": {"type": "number"},
                "approved": {"type": "boolean", "description": "Human HITL approval flag"},
                "prove_token": {"type": "string", "description": "Must match AAG_PROVE_TOKEN"},
                "simulate": {"type": "boolean"},
                "actor_id": {"type": "string"},
                "idempotency_key": {"type": "string"},
            },
        },
    },
    {
        "name": "ledger_verify",
        "description": "Verify the Action Ledger hash chain for diligence evidence.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


class McpSession:
    def __init__(self, gate: AgentActionGate | None = None) -> None:
        self.gate = gate if gate is not None else AgentActionGate()

    def handle(self, message: dict[str, Any]) -> dict[str, Any] | None:
        if message.get("jsonrpc") != "2.0":
            return _error(message.get("id"), -32600, "Invalid Request")
        method = str(message.get("method") or "")
        msg_id = message.get("id")
        params = message.get("params") if isinstance(message.get("params"), dict) else {}

        if method.startswith("notifications/") or msg_id is None:
            return None

        if method == "initialize":
            return _result(
                msg_id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                    "instructions": INSTRUCTIONS,
                },
            )
        if method == "ping":
            return _result(msg_id, {})
        if method == "tools/list":
            return _result(msg_id, {"tools": TOOLS})
        if method == "tools/call":
            return _result(msg_id, self._call_tool(params))
        return _error(msg_id, -32601, f"Method not found: {method}")

    def _call_tool(self, params: dict[str, Any]) -> dict[str, Any]:
        name = str(params.get("name") or "")
        arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        if name == "ledger_verify":
            payload = {
                "ok": self.gate.ledger.verify_chain(),
                "entries": len(self.gate.ledger.entries),
                "instant_audit": INSTANT_AUDIT,
                "consultation": CONSULTATION,
            }
            return _tool_text(payload, is_error=False)
        if name != "gate_check":
            return _tool_text({"error": f"unknown_tool:{name}"}, is_error=True)
        tool = str(arguments.get("tool") or "")
        if not tool:
            return _tool_text({"error": "missing_tool"}, is_error=True)
        confidence = arguments.get("model_confidence")
        actor = Actor(id=str(arguments.get("actor_id") or "mcp-agent"), type="mcp_tool")
        req = ToolRequest(
            tool=tool,
            tier=str(arguments.get("tier") or ""),
            args=arguments.get("arguments") if isinstance(arguments.get("arguments"), dict) else {},
            thought=str(arguments.get("thought") or ""),
            model_confidence=float(confidence) if isinstance(confidence, (int, float)) else None,
            idempotency_key=str(arguments.get("idempotency_key") or ""),
            approved=bool(arguments.get("approved")),
        )
        decision = self.gate.evaluate(
            actor,
            req,
            offered_token=str(arguments.get("prove_token") or ""),
            simulate=bool(arguments.get("simulate")),
        )
        return _tool_text(decision.to_dict(), is_error=False)


def _result(msg_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def _tool_text(payload: dict[str, Any], *, is_error: bool) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload, sort_keys=True)}],
        "isError": is_error,
    }


def _read_message(stdin: TextIO) -> dict[str, Any] | None:
    headers: dict[str, str] = {}
    while True:
        line = stdin.readline()
        if line == "":
            return None
        if line in ("\n", "\r\n"):
            break
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        headers[key.strip().lower()] = value.strip()
    try:
        n = int(headers.get("content-length", "0"))
    except ValueError:
        return None
    body = stdin.read(n)
    if not body:
        return None
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _write_message(stdout: TextIO, message: dict[str, Any]) -> None:
    body = json.dumps(message, separators=(",", ":"))
    stdout.write(f"Content-Length: {len(body.encode('utf-8'))}\r\n\r\n{body}")
    stdout.flush()


def serve(stdin: TextIO | None = None, stdout: TextIO | None = None, gate: AgentActionGate | None = None) -> None:
    """MCP stdio loop. Do not write banners to stdout or stderr — they break the client."""
    session = McpSession(gate)
    inn = stdin if stdin is not None else sys.stdin
    out = stdout if stdout is not None else sys.stdout
    while True:
        msg = _read_message(inn)
        if msg is None:
            return
        reply = session.handle(msg)
        if reply is not None:
            _write_message(out, reply)
