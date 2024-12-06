from __future__ import annotations

import typing

from .._synchronization import current_async_library
from .base import SOCKET_OPTION, AsyncNetworkBackend, AsyncNetworkStream


class AutoBackend(AsyncNetworkBackend):
    async def _init_backend(self) -> None:
        if not (hasattr(self, "_backend")):
            backend = current_async_library()
            if backend == "trio":
                from .trio import TrioBackend

                self._backend: AsyncNetworkBackend = TrioBackend()
            else:
                from .anyio import AnyIOBackend

                self._backend = AnyIOBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> AsyncNetworkStream:
        await self._init_backend()
        return await self._backend.connect_tcp(
            host,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> AsyncNetworkStream:  # pragma: nocover
        await self._init_backend()
        return await self._backend.connect_unix_socket(
            path, timeout=timeout, socket_options=socket_options
        )

    async def sleep(self, seconds: float) -> None:  # pragma: nocover
        await self._init_backend()
        return await self._backend.sleep(seconds)
