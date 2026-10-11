from __future__ import annotations

from typing import Any

from mcp_server_action_gate.gate import AgentActionGate
from mcp_server_action_gate.schema import Actor, ToolRequest


def mcp_call_to_request(call: dict[str, Any], policy: dict[str, Any]) -> tuple[Actor, ToolRequest]:
    """Map an MCP tools/call JSON body onto a Gate/Prove request. No execution."""
    params = call.get("params") or call
    name = str(params.get("name") or params.get("tool") or "")
    arguments = params.get("arguments") or params.get("args") or {}
    if not isinstance(arguments, dict):
        arguments = {"_raw": arguments}
    actor = Actor(id=str(call.get("actor_id") or "mcp-agent"), type=str(call.get("actor_type") or "mcp_tool"))
    request = ToolRequest(
        tool=name,
        tier=str((policy.get("tool_tiers") or {}).get(name, "")),
        args=arguments,
        thought=str(call.get("thought") or ""),
        model_confidence=call.get("model_confidence"),
        idempotency_key=str(call.get("idempotency_key") or call.get("id") or ""),
        approved=bool(call.get("approved")),
        attack_technique=str(call.get("attack_technique") or ""),
    )
    return actor, request


def evaluate_mcp_call(gate: AgentActionGate, call: dict[str, Any], *, offered_token: str = "") -> dict[str, Any]:
    actor, request = mcp_call_to_request(call, gate.policy)
    return gate.evaluate(actor, request, offered_token=offered_token).to_dict()
