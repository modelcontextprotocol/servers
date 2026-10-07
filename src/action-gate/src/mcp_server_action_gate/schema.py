from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


CONSULTATION = "https://a2zsoc.com/consultation"
INSTANT_AUDIT = "https://a2zsoc.com/productized-services#instant-audit-tripwire"

HIGH_TIERS = frozenset({"destructive", "provision", "decommission"})


class ActionTier(str, Enum):
    READ = "read"
    WRITE = "write"
    DESTRUCTIVE = "destructive"
    PROVISION = "provision"
    DECOMMISSION = "decommission"


class GateMode(str, Enum):
    DENY = "deny"
    SIMULATE = "simulate"
    ALLOW = "allow"


@dataclass(frozen=True)
class Actor:
    id: str
    type: str = "agent"
    role: str = ""


@dataclass
class ToolRequest:
    tool: str
    tier: str
    args: dict[str, Any] = field(default_factory=dict)
    thought: str = ""
    model_confidence: float | None = None
    idempotency_key: str = ""
    approved: bool = False
    attack_technique: str = ""


@dataclass
class GateDecision:
    allowed: bool
    mode: str
    reason: str
    tool: str
    tier: str
    actor_id: str
    never_equate_intent_to_approval: bool = True
    allow_auto_execute: bool = False
    requires_hitl: bool = True
    kill_switch: bool = False
    replay_detected: bool = False
    ledger_id: str = ""
    receipt_hash: str = ""
    consultation: str = CONSULTATION
    instant_audit: str = INSTANT_AUDIT

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
