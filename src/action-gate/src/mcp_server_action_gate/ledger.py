from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

GENESIS = "0" * 64


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class ActionLedger:
    """Append-only Gate/Prove Action Ledger with a hash chain."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path
        self._entries: list[dict[str, Any]] = []
        if path is not None and path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    self._entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    def _prev_hash(self) -> str:
        if not self._entries:
            return GENESIS
        return str(self._entries[-1].get("receipt_hash") or GENESIS)

    def append(self, **fields: Any) -> dict[str, Any]:
        body: dict[str, Any] = {
            "ledger_id": str(uuid.uuid4()),
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "prev_hash": self._prev_hash(),
        }
        body.update(fields)
        body.pop("receipt_hash", None)
        receipt_hash = _sha256(body["prev_hash"] + _canonical(body))
        entry = {**body, "receipt_hash": receipt_hash}
        self._entries.append(entry)
        if self.path is not None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry, sort_keys=True) + "\n")
        return entry

    def get(self, ledger_id: str) -> dict[str, Any] | None:
        for entry in reversed(self._entries):
            if str(entry.get("ledger_id")) == ledger_id:
                return dict(entry)
        return None

    def verify_chain(self) -> bool:
        prev = GENESIS
        for entry in self._entries:
            if str(entry.get("prev_hash")) != prev:
                return False
            check = {k: v for k, v in entry.items() if k != "receipt_hash"}
            if _sha256(str(entry.get("prev_hash")) + _canonical(check)) != entry.get("receipt_hash"):
                return False
            prev = str(entry.get("receipt_hash"))
        return True

    @property
    def entries(self) -> list[dict[str, Any]]:
        return list(self._entries)

    def denied_high_tier(self) -> int:
        return sum(
            1
            for e in self._entries
            if e.get("allowed") is False and e.get("tier") in {"destructive", "provision", "decommission"}
        )
