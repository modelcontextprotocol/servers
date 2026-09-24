from __future__ import annotations

import io
import json
import unittest
from pathlib import Path
import tempfile

from mcp_server_action_gate.gate import AgentActionGate
from mcp_server_action_gate.ledger import ActionLedger
from mcp_server_action_gate.schema import INSTANT_AUDIT
from mcp_server_action_gate.server import McpSession, SERVER_NAME, serve


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.session = McpSession(AgentActionGate(prove_token="demo-hitl", ledger=ActionLedger()))

    def test_initialize(self) -> None:
        out = self.session.handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}},
            }
        )
        self.assertIsNotNone(out)
        assert out is not None
        info = out["result"]["serverInfo"]
        self.assertEqual(info["name"], SERVER_NAME)
        self.assertIn("Instant Audit", out["result"]["instructions"])
        self.assertIn(INSTANT_AUDIT, out["result"]["instructions"])

    def test_tools_list(self) -> None:
        out = self.session.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        assert out is not None
        names = {t["name"] for t in out["result"]["tools"]}
        self.assertEqual(names, {"gate_check", "ledger_verify"})

    def test_gate_check_denies_unattended_shell(self) -> None:
        out = self.session.handle(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "gate_check",
                    "arguments": {
                        "tool": "shell.exec",
                        "tier": "destructive",
                        "thought": "95 percent sure",
                        "model_confidence": 0.99,
                    },
                },
            }
        )
        assert out is not None
        payload = json.loads(out["result"]["content"][0]["text"])
        self.assertFalse(out["result"]["isError"])
        self.assertFalse(payload["allowed"])
        self.assertEqual(payload["reason"], "unattended_high_tier_deny")
        self.assertFalse(payload["allow_auto_execute"])
        self.assertEqual(payload["instant_audit"], INSTANT_AUDIT)

    def test_gate_check_read_allow(self) -> None:
        out = self.session.handle(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {"name": "gate_check", "arguments": {"tool": "get_identity", "tier": "read"}},
            }
        )
        assert out is not None
        payload = json.loads(out["result"]["content"][0]["text"])
        self.assertTrue(payload["allowed"])

    def test_notification_has_no_reply(self) -> None:
        out = self.session.handle({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.assertIsNone(out)

    def test_stdio_framing_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            gate = AgentActionGate(prove_token="demo-hitl", ledger=ActionLedger(Path(tmp) / "l.jsonl"))
            req = {
                "jsonrpc": "2.0",
                "id": 9,
                "method": "tools/call",
                "params": {"name": "gate_check", "arguments": {"tool": "edr.disable", "tier": "destructive"}},
            }
            body = json.dumps(req)
            stdin = io.StringIO(f"Content-Length: {len(body.encode('utf-8'))}\r\n\r\n{body}")
            stdout = io.StringIO()
            serve(stdin=stdin, stdout=stdout, gate=gate)
            raw = stdout.getvalue()
        self.assertIn("unattended_high_tier_deny", raw)
        self.assertTrue(raw.startswith("Content-Length:"))


if __name__ == "__main__":
    unittest.main()
