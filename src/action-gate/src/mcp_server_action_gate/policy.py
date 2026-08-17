from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
PACKAGED = Path(__file__).resolve().parent / "policy.default.json"
DEFAULT_POLICY_PATH = PACKAGED if PACKAGED.exists() else ROOT / "fixtures" / "policy.default.json"


def load_policy(path: Path | None = None) -> dict[str, Any]:
    target = path or DEFAULT_POLICY_PATH
    data = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("policy must be a JSON object")
    data.setdefault("allowed_tools", [])
    data.setdefault("denied_tools", [])
    data.setdefault("tool_tiers", {})
    return data


def resolve_tier(policy: dict[str, Any], tool: str, explicit_tier: str = "") -> str:
    mapped = str(policy.get("tool_tiers", {}).get(tool, "")).strip()
    if explicit_tier:
        return explicit_tier
    if mapped:
        return mapped
    return ""
