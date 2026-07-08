# pyright: reportUnknownParameterType=false
from typing import Any
import os
import httpx
import json
from mcp.server.fastmcp import FastMCP

# Initialize the proxy server
mcp = FastMCP("Exogram Authority Runtime")

API_URL = os.getenv("EXOGRAM_API_URL", "https://api.exogram.ai")

def get_headers() -> dict:
    token = os.getenv("EXOGRAM_BEARER_TOKEN")
    if not token:
        raise ValueError("EXOGRAM_BEARER_TOKEN environment variable is missing. Check Claude Desktop config.")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "Exogram-MCP-Claude-Desktop/1.0"
    }

# Local store for payload between evaluate→commit
# Maps token → payload so commit can forward the exact same payload
_pending_payloads: dict[str, Any] = {}


@mcp.tool()
def exogram_evaluate_action(action_type: str, namespace: str, agent_id: str, payload: str) -> str:
    """
    Request cryptographic authorization to execute a state changing action.
    Must be called before writing to any database or external API.
    """
    url = f"{API_URL}/v2/evaluate"
    
    try:
        parsed_payload = json.loads(payload) if isinstance(payload, str) else payload
    except json.JSONDecodeError:
        parsed_payload = payload

    request_data = {
        "action_type": action_type,
        "namespace": namespace,
        "agent_id": agent_id,
        "payload": parsed_payload
    }

    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=10.0) as client:
        try:
            response = client.post(url, json=request_data, headers=headers)
            
            if response.status_code == 200:
                token = response.json().get("token")
                # Store the payload so commit can forward it
                _pending_payloads[token] = parsed_payload
                return f"STATUS: ALLOWED. Execution Token Issued: {token}"
            elif response.status_code == 403:
                return f"STATUS: BLOCKED. Policy violation: {response.text}"
            elif response.status_code == 429:
                return f"STATUS: RATE LIMITED. {response.text}"
            else:
                return f"STATUS: ERROR. Code {response.status_code}: {response.text}"
                
        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Exogram Authority Runtime: {str(e)}"


@mcp.tool()
def exogram_commit_action(token: str, status: str) -> str:
    """
    Commit a previously authorized action to the immutable audit ledger.
    Must be called immediately after the action is executed.
    """
    url = f"{API_URL}/v2/commit"
    
    # Retrieve the original payload that was evaluated
    payload = _pending_payloads.pop(token, {})
    
    request_data = {
        "token": token,
        "status": status,
        "payload": payload
    }

    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=10.0) as client:
        try:
            response = client.post(url, json=request_data, headers=headers)
            
            if response.status_code in [200, 409]:
                return f"STATUS: COMMITTED. Audit log updated. Server Response: {response.text}"
            else:
                return f"STATUS: COMMIT ERROR. Code {response.status_code}: {response.text}"
                
        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Exogram Authority Runtime: {str(e)}"


@mcp.tool()
def exogram_store_record(content: str, source: str = "mcp-claude", namespace: str = "default") -> str:
    """
    Store a fact or record in Exogram's encrypted trust vault.
    This persists the content to the ledger with encryption, PII scrubbing,
    vector embedding, and conflict detection.
    
    Use this to save important facts, user preferences, or any information
    that should be retained across sessions.
    
    Args:
        content: The fact or record to store (e.g. "User prefers dark mode")
        source: Where this came from. Use "mcp-claude" for Claude Desktop entries.
        namespace: Logical grouping (default: "default")
    """
    url = f"{API_URL}/v2/vault/store"
    
    request_data = {
        "content": content,
        "source": source,
        "source_llm": "anthropic",
        "namespace": namespace,
    }

    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.post(url, json=request_data, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                memory_id = data.get("memory_id", "unknown")
                conflicts = data.get("conflicts_detected", 0)
                result = f"STATUS: STORED. Record ID: {memory_id}"
                if conflicts > 0:
                    result += f" | {conflicts} conflict(s) detected"
                return result
            elif response.status_code == 429:
                return f"STATUS: RATE LIMITED. {response.text}"
            elif response.status_code == 401:
                return f"STATUS: AUTH FAILED. Bearer token may be expired. Re-run the MCP installer."
            else:
                return f"STATUS: STORE ERROR. Code {response.status_code}: {response.text}"
                
        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Exogram Vault: {str(e)}"


@mcp.tool()
def exogram_search_records(query: str, top_k: int = 5) -> str:
    """
    Search through stored ledger records using semantic similarity.
    Returns the most relevant records matching the query.
    
    Args:
        query: What to search for (e.g. "user's favorite color")
        top_k: Number of results to return (1-20, default 5)
    """
    url = f"{API_URL}/v2/vault/search"
    
    request_data = {
        "query": query,
        "top_k": min(max(top_k, 1), 20),
    }

    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.post(url, json=request_data, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                if not results:
                    return "No matching records found."
                
                lines = [f"Found {len(results)} matching records:"]
                for i, r in enumerate(results, 1):
                    content = r.get("content", r.get("claim", "Unknown"))
                    score = r.get("score", r.get("similarity", 0))
                    lines.append(f"  {i}. [{score:.2f}] {content}")
                return "\n".join(lines)
            else:
                return f"STATUS: SEARCH ERROR. Code {response.status_code}: {response.text}"
                
        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Exogram Vault: {str(e)}"


if __name__ == "__main__":
    mcp.run()
