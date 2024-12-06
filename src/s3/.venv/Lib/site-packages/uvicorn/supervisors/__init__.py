from __future__ import annotations

from typing import TYPE_CHECKING

from uvicorn.supervisors.basereload import BaseReload
from uvicorn.supervisors.multiprocess import Multiprocess

if TYPE_CHECKING:
    ChangeReload: type[BaseReload]
else:
    try:
        from uvicorn.supervisors.watchfilesreload import (
            WatchFilesReload as ChangeReload,
        )
    except ImportError:  # pragma: no cover
        try:
            from uvicorn.supervisors.watchgodreload import (
                WatchGodReload as ChangeReload,
            )
        except ImportError:
            from uvicorn.supervisors.statreload import StatReload as ChangeReload

__all__ = ["Multiprocess", "ChangeReload"]
