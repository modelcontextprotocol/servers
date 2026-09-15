"""
Exogram Authority Runtime MCP Server.
"""

import json
import os
from typing import cast

import httpx
from mcp.server.fastmcp import FastMCP

# Initialize the proxy server
mcp = FastMCP("Exogram Authority Runtime")

API_URL = os.getenv("EXOGRAM_API_URL", "https://api.exogram.ai")


def get_headers() -> dict[str, str]:
    token = os.getenv("EXOGRAM_BEARER_TOKEN")
    if not token:
        raise ValueError(
            "EXOGRAM_BEARER_TOKEN environment variable is missing. Check Claude Desktop config."
        )
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "Exogram-MCP-Claude-Desktop/1.0",
    }


# Local store for payload between evaluate->commit
# Maps token -> payload so commit can forward the exact same payload
_pending_payloads: dict[str, object] = {}


@mcp.tool()
def exogram_evaluate_action(
    action_type: str, namespace: str, agent_id: str, payload: str
) -> str:
    """
    Request cryptographic authorization to execute a state changing action.
    Must be called before writing to any database or external API.

    Args:
        action_type: The type of action being requested
        namespace: The namespace for the action
        agent_id: The ID of the agent requesting the action
        payload: The action payload, typically as a JSON string
    """
    url = f"{API_URL}/v2/evaluate"

    parsed_payload: object
    try:
        parsed_payload = json.loads(payload)
    except json.JSONDecodeError:
        parsed_payload = payload

    request_data = {
        "action_type": action_type,
        "namespace": namespace,
        "agent_id": agent_id,
        "payload": parsed_payload,
    }

    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=10.0) as client:
        try:
            response = client.post(url, json=request_data, headers=headers)

            if response.status_code == 200:
                data = cast(dict[str, object], response.json())
                token = cast(str, data.get("token"))
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
            return (
                f"STATUS: NETWORK FAILURE. Could not reach Exogram Authority Runtime: {str(e)}"
            )


@mcp.tool()
def exogram_commit_action(token: str, status: str) -> str:
    """
    Commit a previously authorized action to the immutable audit ledger.
    Must be called immediately after the action is executed.

    Args:
        token: The execution token issued by exogram_evaluate_action
        status: The execution status (e.g., 'success', 'failure')
    """
    url = f"{API_URL}/v2/commit"

    # Retrieve the original payload that was evaluated
    payload = _pending_payloads.pop(token, {})

    request_data = {
        "token": token,
        "status": status,
        "payload": payload,
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
            return (
                f"STATUS: NETWORK FAILURE. Could not reach Exogram Authority Runtime: {str(e)}"
            )


@mcp.tool()
def exogram_store_record(
    content: str, source: str = "mcp-claude", namespace: str = "default"
) -> str:
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
                data = cast(dict[str, object], response.json())
                memory_id = data.get("memory_id", "unknown")
                conflicts = cast(int, data.get("conflicts_detected", 0))
                result = f"STATUS: STORED. Record ID: {memory_id}"
                if conflicts > 0:
                    result += f" | {conflicts} conflict(s) detected"
                return result
            elif response.status_code == 429:
                return f"STATUS: RATE LIMITED. {response.text}"
            elif response.status_code == 401:
                return "STATUS: AUTH FAILED. Bearer token may be expired. Re-run the MCP installer."
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
                data = cast(dict[str, object], response.json())
                results = cast(list[dict[str, object]], data.get("results", []))
                if not results:
                    return "No matching records found."

                lines = [f"Found {len(results)} matching records:"]
                for i, r in enumerate(results, 1):
                    content = r.get("content", r.get("claim", "Unknown"))
                    score = cast(float, r.get("score", r.get("similarity", 0.0)))
                    lines.append(f"  {i}. [{score:.2f}] {content}")
                return "\n".join(lines)
            else:
                return f"STATUS: SEARCH ERROR. Code {response.status_code}: {response.text}"

        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Exogram Vault: {str(e)}"


@mcp.tool()
def search_vault(query: str, top_k: int = 5) -> str:
    """
    Semantic and keyword search across stored personal records, facts, and memories.

    Args:
        query: What to search for in your private memory vault
        top_k: Number of results to return (1-20, default 5)
    """
    return exogram_search_records(query=query, top_k=top_k)


@mcp.tool()
def store_memory(content: str, namespace: str = "default") -> str:
    """
    Anchor a new fact, code convention, or personal memory to your encrypted vault.

    Args:
        content: The fact or note to store
        namespace: Logical grouping (default: 'default')
    """
    return exogram_store_record(content=content, source="mcp-client", namespace=namespace)


@mcp.tool()
def get_neural_cluster(entity_name: str) -> str:
    """
    Look up an entity in Exogram's Layer 2 Knowledge Graph.
    Returns connected entities and directional relationships.

    Args:
        entity_name: Name of the entity to query (e.g. 'Next.js', 'Richard Ewing', 'SQLite WAL')
    """
    url = f"{API_URL}/api/knowledge-graph"
    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.get(url, headers=headers)
            if response.status_code == 200:
                data = cast(dict[str, object], response.json())
                nodes = cast(list[dict[str, object]], data.get("nodes", []))
                links = cast(list[dict[str, object]], data.get("links", data.get("edges", [])))

                matched = [
                    n
                    for n in nodes
                    if entity_name.lower() in str(n.get("name", n.get("id", ""))).lower()
                ]
                if not matched:
                    return f"No neural cluster found matching '{entity_name}'."

                target_id = matched[0].get("id", matched[0].get("name"))
                target_name = matched[0].get("name", target_id)

                connected = []
                for link in links:
                    src = link.get("source")
                    dst = link.get("target")
                    lbl = link.get("label", link.get("relationship", "connected to"))
                    if src == target_id:
                        connected.append(f"  -> [{lbl}] -> {dst}")
                    elif dst == target_id:
                        connected.append(f"  <- [{lbl}] <- {src}")

                lines = [f"Neural cluster for '{target_name}':"]
                lines.extend(connected if connected else ["  (No connected relationships mapped yet)"])
                return "\n".join(lines)
            else:
                return f"STATUS: NEURAL LOOKUP ERROR. Code {response.status_code}: {response.text}"
        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Exogram Knowledge Graph: {str(e)}"


@mcp.tool()
def list_entities(limit: int = 25) -> str:
    """
    Retrieve active entities and topics in the personal knowledge network.

    Args:
        limit: Maximum number of entities to return (default 25)
    """
    url = f"{API_URL}/api/knowledge-graph"
    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.get(url, headers=headers)
            if response.status_code == 200:
                data = cast(dict[str, object], response.json())
                nodes = cast(list[dict[str, object]], data.get("nodes", []))
                if not nodes:
                    return "No entities mapped in the knowledge graph yet."

                lines = [f"Mapped Entities in Exogram Knowledge Graph (Top {min(limit, len(nodes))}):"]
                for i, node in enumerate(nodes[:limit], 1):
                    name = node.get("name", node.get("id", "Unknown"))
                    category = node.get("category", node.get("type", "concept"))
                    lines.append(f"  {i}. {name} ({category})")
                return "\n".join(lines)
            else:
                return f"STATUS: GRAPH ERROR. Code {response.status_code}: {response.text}"
        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Exogram Knowledge Graph: {str(e)}"


@mcp.tool()
def verify_audit_trail() -> str:
    """
    Verify the cryptographic SHA-256 hash chain integrity of the ledger.
    Detects any altered payloads, broken links, or manual database modifications.
    """
    url = f"{API_URL}/v2/verify"
    try:
        headers = get_headers()
    except ValueError as e:
        return f"STATUS: CONFIG ERROR. {str(e)}"

    with httpx.Client(timeout=15.0) as client:
        try:
            response = client.get(url, headers=headers)
            if response.status_code == 200:
                data = cast(dict[str, object], response.json())
                valid = data.get("valid", True)
                entries = data.get("total_entries", data.get("entries_count", 0))
                head = data.get("head_hash", "GENESIS")
                status = "CRYPTOGRAPHICALLY VALID" if valid else "TAMPERING DETECTED"
                return f"STATUS: {status}. Total Entries: {entries} | Head Hash: {head}"
            else:
                return f"STATUS: VERIFICATION ERROR. Code {response.status_code}: {response.text}"
        except Exception as e:
            return f"STATUS: NETWORK FAILURE. Could not reach Verification Engine: {str(e)}"


if __name__ == "__main__":
    mcp.run()

