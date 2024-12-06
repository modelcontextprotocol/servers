from contextlib import contextmanager
from dataclasses import dataclass, field

from pydantic import BaseModel

from mcp.shared.context import RequestContext
from mcp.shared.session import BaseSession
from mcp.types import ProgressToken


class Progress(BaseModel):
    progress: float
    total: float | None


@dataclass
class ProgressContext:
    session: BaseSession
    progress_token: ProgressToken
    total: float | None
    current: float = field(default=0.0, init=False)

    async def progress(self, amount: float) -> None:
        self.current += amount

        await self.session.send_progress_notification(
            self.progress_token, self.current, total=self.total
        )


@contextmanager
def progress(ctx: RequestContext, total: float | None = None):
    if ctx.meta is None or ctx.meta.progressToken is None:
        raise ValueError("No progress token provided")

    progress_ctx = ProgressContext(ctx.session, ctx.meta.progressToken, total)
    try:
        yield progress_ctx
    finally:
        pass
