from __future__ import annotations

import functools
import socket
import ssl
import sys
import typing

from .._exceptions import (
    ConnectError,
    ConnectTimeout,
    ExceptionMapping,
    ReadError,
    ReadTimeout,
    WriteError,
    WriteTimeout,
    map_exceptions,
)
from .._utils import is_socket_readable
from .base import SOCKET_OPTION, NetworkBackend, NetworkStream


class TLSinTLSStream(NetworkStream):  # pragma: no cover
    """
    Because the standard `SSLContext.wrap_socket` method does
    not work for `SSLSocket` objects, we need this class
    to implement TLS stream using an underlying `SSLObject`
    instance in order to support TLS on top of TLS.
    """

    # Defined in RFC 8449
    TLS_RECORD_SIZE = 16384

    def __init__(
        self,
        sock: socket.socket,
        ssl_context: ssl.SSLContext,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ):
        self._sock = sock
        self._incoming = ssl.MemoryBIO()
        self._outgoing = ssl.MemoryBIO()

        self.ssl_obj = ssl_context.wrap_bio(
            incoming=self._incoming,
            outgoing=self._outgoing,
            server_hostname=server_hostname,
        )

        self._sock.settimeout(timeout)
        self._perform_io(self.ssl_obj.do_handshake)

    def _perform_io(
        self,
        func: typing.Callable[..., typing.Any],
    ) -> typing.Any:
        ret = None

        while True:
            errno = None
            try:
                ret = func()
            except (ssl.SSLWantReadError, ssl.SSLWantWriteError) as e:
                errno = e.errno

            self._sock.sendall(self._outgoing.read())

            if errno == ssl.SSL_ERROR_WANT_READ:
                buf = self._sock.recv(self.TLS_RECORD_SIZE)

                if buf:
                    self._incoming.write(buf)
                else:
                    self._incoming.write_eof()
            if errno is None:
                return ret

    def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
        exc_map: ExceptionMapping = {socket.timeout: ReadTimeout, OSError: ReadError}
        with map_exceptions(exc_map):
            self._sock.settimeout(timeout)
            return typing.cast(
                bytes, self._perform_io(functools.partial(self.ssl_obj.read, max_bytes))
            )

    def write(self, buffer: bytes, timeout: float | None = None) -> None:
        exc_map: ExceptionMapping = {socket.timeout: WriteTimeout, OSError: WriteError}
        with map_exceptions(exc_map):
            self._sock.settimeout(timeout)
            while buffer:
                nsent = self._perform_io(functools.partial(self.ssl_obj.write, buffer))
                buffer = buffer[nsent:]

    def close(self) -> None:
        self._sock.close()

    def start_tls(
        self,
        ssl_context: ssl.SSLContext,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ) -> NetworkStream:
        raise NotImplementedError()

    def get_extra_info(self, info: str) -> typing.Any:
        if info == "ssl_object":
            return self.ssl_obj
        if info == "client_addr":
            return self._sock.getsockname()
        if info == "server_addr":
            return self._sock.getpeername()
        if info == "socket":
            return self._sock
        if info == "is_readable":
            return is_socket_readable(self._sock)
        return None


class SyncStream(NetworkStream):
    def __init__(self, sock: socket.socket) -> None:
        self._sock = sock

    def read(self, max_bytes: int, timeout: float | None = None) -> bytes:
        exc_map: ExceptionMapping = {socket.timeout: ReadTimeout, OSError: ReadError}
        with map_exceptions(exc_map):
            self._sock.settimeout(timeout)
            return self._sock.recv(max_bytes)

    def write(self, buffer: bytes, timeout: float | None = None) -> None:
        if not buffer:
            return

        exc_map: ExceptionMapping = {socket.timeout: WriteTimeout, OSError: WriteError}
        with map_exceptions(exc_map):
            while buffer:
                self._sock.settimeout(timeout)
                n = self._sock.send(buffer)
                buffer = buffer[n:]

    def close(self) -> None:
        self._sock.close()

    def start_tls(
        self,
        ssl_context: ssl.SSLContext,
        server_hostname: str | None = None,
        timeout: float | None = None,
    ) -> NetworkStream:
        exc_map: ExceptionMapping = {
            socket.timeout: ConnectTimeout,
            OSError: ConnectError,
        }
        with map_exceptions(exc_map):
            try:
                if isinstance(self._sock, ssl.SSLSocket):  # pragma: no cover
                    # If the underlying socket has already been upgraded
                    # to the TLS layer (i.e. is an instance of SSLSocket),
                    # we need some additional smarts to support TLS-in-TLS.
                    return TLSinTLSStream(
                        self._sock, ssl_context, server_hostname, timeout
                    )
                else:
                    self._sock.settimeout(timeout)
                    sock = ssl_context.wrap_socket(
                        self._sock, server_hostname=server_hostname
                    )
            except Exception as exc:  # pragma: nocover
                self.close()
                raise exc
        return SyncStream(sock)

    def get_extra_info(self, info: str) -> typing.Any:
        if info == "ssl_object" and isinstance(self._sock, ssl.SSLSocket):
            return self._sock._sslobj  # type: ignore
        if info == "client_addr":
            return self._sock.getsockname()
        if info == "server_addr":
            return self._sock.getpeername()
        if info == "socket":
            return self._sock
        if info == "is_readable":
            return is_socket_readable(self._sock)
        return None


class SyncBackend(NetworkBackend):
    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> NetworkStream:
        # Note that we automatically include `TCP_NODELAY`
        # in addition to any other custom socket options.
        if socket_options is None:
            socket_options = []  # pragma: no cover
        address = (host, port)
        source_address = None if local_address is None else (local_address, 0)
        exc_map: ExceptionMapping = {
            socket.timeout: ConnectTimeout,
            OSError: ConnectError,
        }

        with map_exceptions(exc_map):
            sock = socket.create_connection(
                address,
                timeout,
                source_address=source_address,
            )
            for option in socket_options:
                sock.setsockopt(*option)  # pragma: no cover
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        return SyncStream(sock)

    def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> NetworkStream:  # pragma: nocover
        if sys.platform == "win32":
            raise RuntimeError(
                "Attempted to connect to a UNIX socket on a Windows system."
            )
        if socket_options is None:
            socket_options = []

        exc_map: ExceptionMapping = {
            socket.timeout: ConnectTimeout,
            OSError: ConnectError,
        }
        with map_exceptions(exc_map):
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            for option in socket_options:
                sock.setsockopt(*option)
            sock.settimeout(timeout)
            sock.connect(path)
        return SyncStream(sock)
