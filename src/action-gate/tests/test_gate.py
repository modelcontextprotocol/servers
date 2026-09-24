from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from mcp_server_action_gate.demo import demo
from mcp_server_action_gate.gate import AgentActionGate
from mcp_server_action_gate.ledger import ActionLedger
from mcp_server_action_gate.mcp import evaluate_mcp_call
from mcp_server_action_gate.schema import Actor, CONSULTATION, INSTANT_AUDIT, ToolRequest


class GateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = AgentActionGate(prove_token="demo-hitl", ledger=ActionLedger())

    def test_unattended_destructive_deny_ignores_model_confidence(self) -> None:
        decision = self.gate.evaluate(
            Actor(id="a1"),
            ToolRequest(
                tool="shell.exec",
                tier="destructive",
                thought="must run",
                model_confidence=0.99,
                approved=False,
            ),
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.mode, "deny")
        self.assertEqual(decision.reason, "unattended_high_tier_deny")
        self.assertTrue(decision.never_equate_intent_to_approval)
        self.assertFalse(decision.allow_auto_execute)

    def test_unattended_provision_and_decommission_deny(self) -> None:
        for tool, tier in (("iam.create_user", "provision"), ("vpc.delete", "decommission")):
            d = self.gate.evaluate(Actor(id="a1"), ToolRequest(tool=tool, tier=tier))
            self.assertEqual(d.reason, "unattended_high_tier_deny", tool)

    def test_hitl_prove_allows_high_tier(self) -> None:
        d = self.gate.evaluate(
            Actor(id="human"),
            ToolRequest(tool="vpc.delete", tier="decommission", approved=True),
            offered_token="demo-hitl",
        )
        self.assertTrue(d.allowed)
        self.assertEqual(d.mode, "allow")
        self.assertEqual(d.reason, "hitl_proved_high_tier")

    def test_wrong_token_still_deny(self) -> None:
        d = self.gate.evaluate(
            Actor(id="human"),
            ToolRequest(tool="vpc.delete", tier="decommission", approved=True),
            offered_token="nope",
        )
        self.assertFalse(d.allowed)
        self.assertEqual(d.reason, "unattended_high_tier_deny")

    def test_approved_without_token_deny(self) -> None:
        d = self.gate.evaluate(
            Actor(id="human"),
            ToolRequest(tool="shell.exec", tier="destructive", approved=True),
        )
        self.assertEqual(d.reason, "unattended_high_tier_deny")

    def test_write_defaults_to_simulate(self) -> None:
        d = self.gate.evaluate(Actor(id="a1"), ToolRequest(tool="ticket.create", tier="write"))
        self.assertFalse(d.allowed)
        self.assertEqual(d.mode, "simulate")

    def test_read_allowlisted(self) -> None:
        d = self.gate.evaluate(Actor(id="a1"), ToolRequest(tool="get_identity", tier="read"))
        self.assertTrue(d.allowed)
        self.assertEqual(d.mode, "allow")

    def test_unknown_tool_deny(self) -> None:
        d = self.gate.evaluate(Actor(id="a1"), ToolRequest(tool="mystery.exploit", tier="read"))
        self.assertEqual(d.reason, "unknown_tool_deny")

    def test_replay_deny(self) -> None:
        req = ToolRequest(tool="get_identity", tier="read", idempotency_key="k1")
        first = self.gate.evaluate(Actor(id="a1"), req)
        second = self.gate.evaluate(Actor(id="a1"), req)
        self.assertTrue(first.allowed)
        self.assertEqual(second.reason, "replay_detected")

    def test_kill_switch_overrides_prove(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            kill = Path(tmp) / "KILL"
            kill.write_text("1", encoding="utf-8")
            gate = AgentActionGate(prove_token="demo-hitl", ledger=ActionLedger(), kill_path=kill)
            d = gate.evaluate(
                Actor(id="human"),
                ToolRequest(tool="vpc.delete", tier="decommission", approved=True),
                offered_token="demo-hitl",
            )
            self.assertEqual(d.reason, "kill_switch_engaged")
            self.assertTrue(d.kill_switch)

    def test_simulate_high_tier_no_side_effects(self) -> None:
        d = self.gate.evaluate(
            Actor(id="a1"),
            ToolRequest(tool="shell.exec", tier="destructive"),
            simulate=True,
        )
        self.assertFalse(d.allowed)
        self.assertEqual(d.mode, "simulate")

    def test_cta_on_envelope(self) -> None:
        d = self.gate.evaluate(Actor(id="a1"), ToolRequest(tool="shell.exec", tier="destructive"))
        self.assertEqual(d.instant_audit, INSTANT_AUDIT)
        self.assertEqual(d.consultation, CONSULTATION)


class LedgerTests(unittest.TestCase):
    def test_hash_chain(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ledger.jsonl"
            ledger = ActionLedger(path)
            gate = AgentActionGate(prove_token="demo-hitl", ledger=ledger)
            gate.evaluate(Actor(id="a1"), ToolRequest(tool="get_identity", tier="read"))
            gate.evaluate(Actor(id="a1"), ToolRequest(tool="shell.exec", tier="destructive"))
            self.assertTrue(ledger.verify_chain())
            self.assertEqual(ledger.denied_high_tier(), 1)
            reloaded = ActionLedger(path)
            self.assertTrue(reloaded.verify_chain())
            self.assertEqual(len(reloaded.entries), 2)


class DemoTests(unittest.TestCase):
    def test_demo_fixtures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = demo(Path(tmp) / "ledger.jsonl")
        self.assertTrue(out["ledger_chain_ok"])
        reasons = {r["fixture"]: r["reason"] for r in out["results"]}
        self.assertEqual(reasons["t1059_unattended_shell.json"], "unattended_high_tier_deny")
        self.assertEqual(reasons["t1562_impair_defenses.json"], "unattended_high_tier_deny")
        self.assertEqual(reasons["t1078_read_identity.json"], "read_allowlisted")
        self.assertEqual(reasons["write_ticket_simulate.json"], "default_simulate_write_gate_prove")
        self.assertEqual(reasons["proved_decommission.json"], "hitl_proved_high_tier")
        self.assertGreater(out["cost_avoidance"]["estimated_total_avoidance_usd"], 0)

    def test_mcp_stub_denies_unattended_shell(self) -> None:
        gate = AgentActionGate(prove_token="demo-hitl", ledger=ActionLedger())
        out = evaluate_mcp_call(
            gate,
            {"params": {"name": "shell.exec", "arguments": {"note": "no payload"}}, "thought": "do it"},
        )
        self.assertEqual(out["reason"], "unattended_high_tier_deny")


if __name__ == "__main__":
    unittest.main()
