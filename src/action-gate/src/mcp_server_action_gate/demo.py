from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:
    from mcp_server_action_gate.cost import estimate_cost_avoidance
    from mcp_server_action_gate.gate import AgentActionGate
    from mcp_server_action_gate.ledger import ActionLedger
    from mcp_server_action_gate.mcp import evaluate_mcp_call
    from mcp_server_action_gate.schema import Actor, CONSULTATION, INSTANT_AUDIT, ToolRequest
except ImportError:
    from aag.cost import estimate_cost_avoidance
    from aag.gate import AgentActionGate
    from aag.ledger import ActionLedger
    from aag.mcp import evaluate_mcp_call
    from aag.schema import Actor, CONSULTATION, INSTANT_AUDIT, ToolRequest

def _find_fixtures() -> Path:
    p1 = Path(__file__).resolve().parent.parent / "fixtures"
    if p1.exists():
        return p1
    p2 = Path(__file__).resolve().parents[2] / "fixtures"
    if p2.exists():
        return p2
    return p1

FIXTURES = _find_fixtures()


def load_case(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def request_from_case(case: dict[str, Any]) -> tuple[Actor, ToolRequest]:
    actor_raw = case.get("actor") or {}
    req = case.get("request") or {}
    actor = Actor(
        id=str(actor_raw.get("id") or "agent-1"),
        type=str(actor_raw.get("type") or "agent"),
        role=str(actor_raw.get("role") or ""),
    )
    request = ToolRequest(
        tool=str(req.get("tool") or ""),
        tier=str(req.get("tier") or ""),
        args=req.get("args") if isinstance(req.get("args"), dict) else {},
        thought=str(req.get("thought") or ""),
        model_confidence=req.get("model_confidence"),
        idempotency_key=str(req.get("idempotency_key") or ""),
        approved=bool(req.get("approved")),
        attack_technique=str(req.get("attack_technique") or ""),
    )
    return actor, request


def run_case(gate: AgentActionGate, case: dict[str, Any], *, offered_token: str = "") -> dict[str, Any]:
    if case.get("mcp"):
        return evaluate_mcp_call(gate, case["mcp"], offered_token=offered_token or str(case.get("offered_token") or ""))
    actor, request = request_from_case(case)
    return gate.evaluate(
        actor,
        request,
        offered_token=offered_token or str(case.get("offered_token") or ""),
        simulate=bool(case.get("simulate")),
    ).to_dict()


def demo(ledger_path: Path | None = None, *, prove_token: str = "demo-hitl") -> dict[str, Any]:
    ledger = ActionLedger(ledger_path)
    gate = AgentActionGate(ledger=ledger, prove_token=prove_token)
    names = [
        "t1059_unattended_shell.json",
        "t1078_read_identity.json",
        "t1562_impair_defenses.json",
        "write_ticket_simulate.json",
        "proved_decommission.json",
    ]
    results = []
    for name in names:
        case = load_case(FIXTURES / name)
        results.append({"fixture": name, **run_case(gate, case, offered_token=str(case.get("offered_token") or ""))})
    denied = sum(1 for r in results if r.get("reason") == "unattended_high_tier_denied" or r.get("reason") == "unattended_high_tier_deny")
    simulated = sum(1 for r in results if r.get("mode") == "simulate")
    cost = estimate_cost_avoidance(
        unattended_high_tier_denied=denied,
        write_simulated=simulated,
        fde_minutes_saved=45.0,
    )
    return {
        "results": results,
        "ledger_chain_ok": ledger.verify_chain(),
        "cost_avoidance": cost.to_dict(),
        "instant_audit": INSTANT_AUDIT,
        "consultation": CONSULTATION,
    }
