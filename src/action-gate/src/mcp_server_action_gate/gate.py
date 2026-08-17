from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Any

try:
    from mcp_server_action_gate.ledger import ActionLedger
    from mcp_server_action_gate.policy import load_policy, resolve_tier
    from mcp_server_action_gate.schema import HIGH_TIERS, Actor, GateDecision, GateMode, ToolRequest
except ImportError:
    from aag.ledger import ActionLedger
    from aag.policy import load_policy, resolve_tier
    from aag.schema import HIGH_TIERS, Actor, GateDecision, GateMode, ToolRequest


def kill_switch_engaged(kill_path: Path | None = None) -> bool:
    flag = os.environ.get("AAG_KILL_SWITCH", "").strip().lower()
    if flag in {"1", "true", "yes", "on"}:
        return True
    path = kill_path or Path(os.environ.get("AAG_KILL_SWITCH_FILE", "artifacts/KILL"))
    return path.exists()


class AgentActionGate:
    """
    Gate/Prove runtime for agent and MCP tool calls.

    Hard rules:
    - never treat agent intent / model confidence as approval
    - unattended destructive / provision / decommission is DENY
    - kill-switch denies everything
    - unknown tools deny by default
    - default write path is SIMULATE (no side effects)
    """

    def __init__(
        self,
        *,
        policy: dict[str, Any] | None = None,
        ledger: ActionLedger | None = None,
        prove_token: str | None = None,
        kill_path: Path | None = None,
    ) -> None:
        self.policy = policy if policy is not None else load_policy()
        self.ledger = ledger if ledger is not None else ActionLedger()
        self.prove_token = prove_token if prove_token is not None else os.environ.get("AAG_PROVE_TOKEN", "")
        self.kill_path = kill_path
        self._replay: set[str] = set()

    def _proved(self, request: ToolRequest, offered_token: str) -> bool:
        expected = self.prove_token or ""
        offered = offered_token or ""
        if not expected or not offered or not request.approved:
            return False
        if len(expected) != len(offered):
            return False
        return hmac.compare_digest(expected, offered)

    def evaluate(
        self,
        actor: Actor,
        request: ToolRequest,
        *,
        offered_token: str = "",
        simulate: bool = False,
    ) -> GateDecision:
        tool = request.tool
        tier = resolve_tier(self.policy, tool, request.tier)
        kill = kill_switch_engaged(self.kill_path)
        allowed_tools = list(self.policy.get("allowed_tools") or [])
        denied_tools = list(self.policy.get("denied_tools") or [])

        def finish(
            *,
            allowed: bool,
            mode: GateMode,
            reason: str,
            replay: bool = False,
        ) -> GateDecision:
            decision = GateDecision(
                allowed=allowed,
                mode=mode.value,
                reason=reason,
                tool=tool,
                tier=tier or "unknown",
                actor_id=actor.id,
                never_equate_intent_to_approval=True,
                allow_auto_execute=allowed and mode is GateMode.ALLOW,
                requires_hitl=tier in HIGH_TIERS or mode is not GateMode.ALLOW,
                kill_switch=kill,
                replay_detected=replay,
            )
            row = self.ledger.append(
                actor_id=actor.id,
                actor_type=actor.type,
                tool=tool,
                tier=decision.tier,
                allowed=decision.allowed,
                mode=decision.mode,
                reason=decision.reason,
                attack_technique=request.attack_technique,
                thought_present=bool(request.thought),
                model_confidence=request.model_confidence,
                never_equate_intent_to_approval=True,
            )
            decision.ledger_id = str(row["ledger_id"])
            decision.receipt_hash = str(row["receipt_hash"])
            return decision

        if kill:
            return finish(allowed=False, mode=GateMode.DENY, reason="kill_switch_engaged")

        if request.idempotency_key:
            if request.idempotency_key in self._replay:
                return finish(allowed=False, mode=GateMode.DENY, reason="replay_detected", replay=True)
            self._replay.add(request.idempotency_key)

        if tool in denied_tools:
            return finish(allowed=False, mode=GateMode.DENY, reason="tool_explicitly_denied")

        if tool not in allowed_tools and tool not in (self.policy.get("tool_tiers") or {}):
            return finish(allowed=False, mode=GateMode.DENY, reason="unknown_tool_deny")

        if not tier:
            return finish(allowed=False, mode=GateMode.DENY, reason="unknown_tier_deny")

        proved = self._proved(request, offered_token)

        # Intent / model score are never an approval signal.
        _ = request.thought
        _ = request.model_confidence

        if tier in HIGH_TIERS:
            if proved:
                return finish(allowed=True, mode=GateMode.ALLOW, reason="hitl_proved_high_tier")
            if simulate:
                return finish(
                    allowed=False,
                    mode=GateMode.SIMULATE,
                    reason="simulate_high_tier_no_side_effects",
                )
            return finish(allowed=False, mode=GateMode.DENY, reason="unattended_high_tier_deny")

        if tier == "write":
            if proved:
                return finish(allowed=True, mode=GateMode.ALLOW, reason="hitl_proved_write")
            return finish(allowed=False, mode=GateMode.SIMULATE, reason="default_simulate_write_gate_prove")

        if allowed_tools and tool not in allowed_tools:
            return finish(allowed=False, mode=GateMode.DENY, reason="tool_not_in_allowlist")

        return finish(allowed=True, mode=GateMode.ALLOW, reason="read_allowlisted")
