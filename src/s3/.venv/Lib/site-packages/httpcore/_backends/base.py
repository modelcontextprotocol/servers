from __future__ import annotations

import ssl
import time
import typing

SOCKET_OPTION = typing.Union[
    typing.Tuple[int, int, int],
    typing.Tuple[int, int, typing.Union[bytes, bytearray]],
    typing.Tuple[int, int, None, int],
]


class NetworkStream:
    def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
        raise NotImplementedError()  # pragma: nocover

    def write(self, buffer: bytes, timeout: float | None = None) -> None:
        raise NotImplementedError()  # pragma: nocover

    def close(self) -> None:
        raise NotImplementedError()  # pragma: nocover

    def start_tls(
        self,
        ssl_context: ssl.SSLContext,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ) -> NetworkStream:
        raise NotImplementedError()  # pragma: nocover

    def get_extra_info(self, info: str) -> typing.Any:
        return None  # pragma: nocover


class NetworkBackend:
    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> NetworkStream:
        raise NotImplementedError()  # pragma: nocover

    def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> NetworkStream:
        raise NotImplementedError()  # pragma: nocover

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)  # pragma: nocover


class AsyncNetworkStream:
    async def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
        raise NotImplementedError()  # pragma: nocover

    async def write(self, buffer: bytes, timeout: float | None = None) -> None:
        raise NotImplementedError()  # pragma: nocover

    async def aclose(self) -> None:
        raise NotImplementedError()  # pragma: nocover

    async def start_tls(
        self,
        ssl_context: ssl.SSLContext,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ) -> AsyncNetworkStream:
        raise NotImplementedError()  # pragma: nocover

    def get_extra_info(self, info: str) -> typing.Any:
        return None  # pragma: nocover


class AsyncNetworkBackend:
    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> AsyncNetworkStream:
        raise NotImplementedError()  # pragma: nocover

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> AsyncNetworkStream:
        raise NotImplementedError()  # pragma: nocover

    async def sleep(self, seconds: float) -> None:
        raise NotImplementedError()  # pragma: nocover
