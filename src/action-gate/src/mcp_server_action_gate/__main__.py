from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from mcp_server_action_gate.cost import estimate_cost_avoidance
    from mcp_server_action_gate.demo import demo, load_case, run_case
    from mcp_server_action_gate.gate import AgentActionGate, kill_switch_engaged
    from mcp_server_action_gate.ledger import ActionLedger
    from mcp_server_action_gate.schema import CONSULTATION, INSTANT_AUDIT
except ImportError:
    from aag.cost import estimate_cost_avoidance
    from aag.demo import demo, load_case, run_case
    from aag.gate import AgentActionGate, kill_switch_engaged
    from aag.ledger import ActionLedger
    from aag.schema import CONSULTATION, INSTANT_AUDIT


def _print(payload: object) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))
    print(f"\nInstant Audit $499: {INSTANT_AUDIT}", file=sys.stderr)
    print(f"Consultation: {CONSULTATION}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mcp-server-action-gate", description="Agent Action Gate — Gate/Prove for MCP and agent tools")
    parser.add_argument("--ledger", default="artifacts/action_ledger.jsonl")
    parser.add_argument("--prove-token", default="")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("demo", help="Run ATT&CK-tagged fixtures")
    chk = sub.add_parser("check", help="Evaluate one fixture or MCP JSON file")
    chk.add_argument("path")
    chk.add_argument("--simulate", action="store_true")
    sub.add_parser("bench", help="Print illustrative cost-avoidance sketch")
    sub.add_parser("serve", help="MCP stdio server (Gate/Prove tools, never executes)")

    args = parser.parse_args(argv)
    ledger = ActionLedger(Path(args.ledger))
    token = args.prove_token

    if args.cmd == "serve":
        try:
            from mcp_server_action_gate.server import serve
        except ImportError:
            from aag.server import serve

        serve(gate=AgentActionGate(ledger=ledger, prove_token=token))
        return 0

    if args.cmd == "demo":
        if Path(args.ledger).exists():
            Path(args.ledger).unlink()
        out = demo(Path(args.ledger), prove_token=token or "demo-hitl")
        _print(out)
        return 0 if out.get("ledger_chain_ok") else 1

    if args.cmd == "check":
        case = load_case(Path(args.path))
        if args.simulate:
            case["simulate"] = True
        gate = AgentActionGate(ledger=ledger, prove_token=token)
        _print(run_case(gate, case, offered_token=str(case.get("offered_token") or token)))
        return 0

    if args.cmd == "bench":
        sketch = estimate_cost_avoidance(
            unattended_high_tier_denied=2,
            write_simulated=1,
            fde_minutes_saved=45.0,
        ).to_dict()
        sketch["kill_switch"] = kill_switch_engaged()
        sketch["instant_audit"] = INSTANT_AUDIT
        sketch["consultation"] = CONSULTATION
        _print(sketch)
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
