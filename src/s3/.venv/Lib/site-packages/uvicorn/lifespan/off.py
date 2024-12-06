from __future__ import annotations

from typing import Any

from uvicorn import Config


class LifespanOff:
    def __init__(self, config: Config) -> None:
        self.should_exit = False
        self.state: dict[str, Any] = {}

    async def startup(self) -> None:
        pass

    async def shutdown(self) -> None:
        pass
