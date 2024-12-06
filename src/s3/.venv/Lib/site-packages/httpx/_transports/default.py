"""
Custom transports, with nicely configured defaults.

The following additional keyword arguments are currently supported by httpcore...

* uds: str
* local_address: str
* retries: int

Example usages...

# Disable HTTP/2 on a single specific domain.
mounts = {
    "all://": httpx.HTTPTransport(http2=True),
    "all://*example.org": httpx.HTTPTransport()
}

# Using advanced httpcore configuration, with connection retries.
transport = httpx.HTTPTransport(retries=1)
client = httpx.Client(transport=transport)

# Using advanced httpcore configuration, with unix domain sockets.
transport = httpx.HTTPTransport(uds="socket.uds")
client = httpx.Client(transport=transport)
"""

from __future__ import annotations

import contextlib
import typing
from types import TracebackType

if typing.TYPE_CHECKING:
    import ssl  # pragma: no cover

    import httpx  # pragma: no cover

from .._config import DEFAULT_LIMITS, Limits, Proxy, create_ssl_context
from .._exceptions import (
    ConnectError,
    ConnectTimeout,
    LocalProtocolError,
    NetworkError,
    PoolTimeout,
    ProtocolError,
    ProxyError,
    ReadError,
    ReadTimeout,
    RemoteProtocolError,
    TimeoutException,
    UnsupportedProtocol,
    WriteError,
    WriteTimeout,
)
from .._models import Request, Response
from .._types import AsyncByteStream, CertTypes, ProxyTypes, SyncByteStream
from .._urls import URL
from .base import AsyncBaseTransport, BaseTransport

T = typing.TypeVar("T", bound="HTTPTransport")
A = typing.TypeVar("A", bound="AsyncHTTPTransport")

SOCKET_OPTION = typing.Union[
    typing.Tuple[int, int, int],
    typing.Tuple[int, int, typing.Union[bytes, bytearray]],
    typing.Tuple[int, int, None, int],
]

__all__ = ["AsyncHTTPTransport", "HTTPTransport"]

HTTPCORE_EXC_MAP: dict[type[Exception], type[httpx.HTTPError]] = {}


def _load_httpcore_exceptions() -> dict[type[Exception], type[httpx.HTTPError]]:
    import httpcore

    return {
        httpcore.TimeoutException: TimeoutException,
        httpcore.ConnectTimeout: ConnectTimeout,
        httpcore.ReadTimeout: ReadTimeout,
        httpcore.WriteTimeout: WriteTimeout,
        httpcore.PoolTimeout: PoolTimeout,
        httpcore.NetworkError: NetworkError,
        httpcore.ConnectError: ConnectError,
        httpcore.ReadError: ReadError,
        httpcore.WriteError: WriteError,
        httpcore.ProxyError: ProxyError,
        httpcore.UnsupportedProtocol: UnsupportedProtocol,
        httpcore.ProtocolError: ProtocolError,
        httpcore.LocalProtocolError: LocalProtocolError,
        httpcore.RemoteProtocolError: RemoteProtocolError,
    }


@contextlib.contextmanager
def map_httpcore_exceptions() -> typing.Iterator[None]:
    global HTTPCORE_EXC_MAP
    if len(HTTPCORE_EXC_MAP) == 0:
        HTTPCORE_EXC_MAP = _load_httpcore_exceptions()
    try:
        yield
    except Exception as exc:
        mapped_exc = None

        for from_exc, to_exc in HTTPCORE_EXC_MAP.items():
            if not isinstance(exc, from_exc):
                continue
            # We want to map to the most specific exception we can find.
            # Eg if `exc` is an `httpcore.ReadTimeout`, we want to map to
            # `httpx.ReadTimeout`, not just `httpx.TimeoutException`.
            if mapped_exc is None or issubclass(to_exc, mapped_exc):
                mapped_exc = to_exc

        if mapped_exc is None:  # pragma: no cover
            raise

        message = str(exc)
        raise mapped_exc(message) from exc


class ResponseStream(SyncByteStream):
    def __init__(self, httpcore_stream: typing.Iterable[bytes]) -> None:
        self._httpcore_stream = httpcore_stream

    def __iter__(self) -> typing.Iterator[bytes]:
        with map_httpcore_exceptions():
            for part in self._httpcore_stream:
                yield part

    def close(self) -> None:
        if hasattr(self._httpcore_stream, "close"):
            self._httpcore_stream.close()


class HTTPTransport(BaseTransport):
    def __init__(
        self,
        verify: ssl.SSLContext | str | bool = True,
        cert: CertTypes | None = None,
        trust_env: bool = True,
        http1: bool = True,
        http2: bool = False,
        limits: Limits = DEFAULT_LIMITS,
        proxy: ProxyTypes | None = None,
        uds: str | None = None,
        local_address: str | None = None,
        retries: int = 0,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> None:
        import httpcore

        proxy = Proxy(url=proxy) if isinstance(proxy, (str, URL)) else proxy
        ssl_context = create_ssl_context(verify=verify, cert=cert, trust_env=trust_env)

        if proxy is None:
            self._pool = httpcore.ConnectionPool(
                ssl_context=ssl_context,
                max_connections=limits.max_connections,
                max_keepalive_connections=limits.max_keepalive_connections,
                keepalive_expiry=limits.keepalive_expiry,
                http1=http1,
                http2=http2,
                uds=uds,
                local_address=local_address,
                retries=retries,
                socket_options=socket_options,
            )
        elif proxy.url.scheme in ("http", "https"):
            self._pool = httpcore.HTTPProxy(
                proxy_url=httpcore.URL(
                    scheme=proxy.url.raw_scheme,
                    host=proxy.url.raw_host,
                    port=proxy.url.port,
                    target=proxy.url.raw_path,
                ),
                proxy_auth=proxy.raw_auth,
                proxy_headers=proxy.headers.raw,
                ssl_context=ssl_context,
                proxy_ssl_context=proxy.ssl_context,
                max_connections=limits.max_connections,
                max_keepalive_connections=limits.max_keepalive_connections,
                keepalive_expiry=limits.keepalive_expiry,
                http1=http1,
                http2=http2,
                socket_options=socket_options,
            )
        elif proxy.url.scheme in ("socks5", "socks5h"):
            try:
                import socksio  # noqa
            except ImportError:  # pragma: no cover
                raise ImportError(
                    "Using SOCKS proxy, but the 'socksio' package is not installed. "
                    "Make sure to install httpx using `pip install httpx[socks]`."
                ) from None

            self._pool = httpcore.SOCKSProxy(
                proxy_url=httpcore.URL(
                    scheme=proxy.url.raw_scheme,
                    host=proxy.url.raw_host,
                    port=proxy.url.port,
                    target=proxy.url.raw_path,
                ),
                proxy_auth=proxy.raw_auth,
                ssl_context=ssl_context,
                max_connections=limits.max_connections,
                max_keepalive_connections=limits.max_keepalive_connections,
                keepalive_expiry=limits.keepalive_expiry,
                http1=http1,
                http2=http2,
            )
        else:  # pragma: no cover
            raise ValueError(
                "Proxy protocol must be either 'http', 'https', 'socks5', or 'socks5h',"
                f" but got {proxy.url.scheme!r}."
            )

    def __enter__(self: T) -> T:  # Use generics for subclass support.
        self._pool.__enter__()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None = None,
        exc_value: BaseException | None = None,
        traceback: TracebackType | None = None,
    ) -> None:
        with map_httpcore_exceptions():
            self._pool.__exit__(exc_type, exc_value, traceback)

    def handle_request(
        self,
        request: Request,
    ) -> Response:
        assert isinstance(request.stream, SyncByteStream)
        import httpcore

        req = httpcore.Request(
            method=request.method,
            url=httpcore.URL(
                scheme=request.url.raw_scheme,
                host=request.url.raw_host,
                port=request.url.port,
                target=request.url.raw_path,
            ),
            headers=request.headers.raw,
            content=request.stream,
            extensions=request.extensions,
        )
        with map_httpcore_exceptions():
            resp = self._pool.handle_request(req)

        assert isinstance(resp.stream, typing.Iterable)

        return Response(
            status_code=resp.status,
            headers=resp.headers,
            stream=ResponseStream(resp.stream),
            extensions=resp.extensions,
        )

    def close(self) -> None:
        self._pool.close()


class AsyncResponseStream(AsyncByteStream):
    def __init__(self, httpcore_stream: typing.AsyncIterable[bytes]) -> None:
        self._httpcore_stream = httpcore_stream

    async def __aiter__(self) -> typing.AsyncIterator[bytes]:
        with map_httpcore_exceptions():
            async for part in self._httpcore_stream:
                yield part

    async def aclose(self) -> None:
        if hasattr(self._httpcore_stream, "aclose"):
            await self._httpcore_stream.aclose()


class AsyncHTTPTransport(AsyncBaseTransport):
    def __init__(
        self,
        verify: ssl.SSLContext | str | bool = True,
        cert: CertTypes | None = None,
        trust_env: bool = True,
        http1: bool = True,
        http2: bool = False,
        limits: Limits = DEFAULT_LIMITS,
        proxy: ProxyTypes | None = None,
        uds: str | None = None,
        local_address: str | None = None,
        retries: int = 0,
        socket_options: typing.Iterable[SOCKET_OPTION] | None = None,
    ) -> None:
        import httpcore

        proxy = Proxy(url=proxy) if isinstance(proxy, (str, URL)) else proxy
        ssl_context = create_ssl_context(verify=verify, cert=cert, trust_env=trust_env)

        if proxy is None:
            self._pool = httpcore.AsyncConnectionPool(
                ssl_context=ssl_context,
                max_connections=limits.max_connections,
                max_keepalive_connections=limits.max_keepalive_connections,
                keepalive_expiry=limits.keepalive_expiry,
                http1=http1,
                http2=http2,
                uds=uds,
                local_address=local_address,
                retries=retries,
                socket_options=socket_options,
            )
        elif proxy.url.scheme in ("http", "https"):
            self._pool = httpcore.AsyncHTTPProxy(
                proxy_url=httpcore.URL(
                    scheme=proxy.url.raw_scheme,
                    host=proxy.url.raw_host,
                    port=proxy.url.port,
                    target=proxy.url.raw_path,
                ),
                proxy_auth=proxy.raw_auth,
                proxy_headers=proxy.headers.raw,
                proxy_ssl_context=proxy.ssl_context,
                ssl_context=ssl_context,
                max_connections=limits.max_connections,
                max_keepalive_connections=limits.max_keepalive_connections,
                keepalive_expiry=limits.keepalive_expiry,
                http1=http1,
                http2=http2,
                socket_options=socket_options,
            )
        elif proxy.url.scheme in ("socks5", "socks5h"):
            try:
                import socksio  # noqa
            except ImportError:  # pragma: no cover
                raise ImportError(
                    "Using SOCKS proxy, but the 'socksio' package is not installed. "
                    "Make sure to install httpx using `pip install httpx[socks]`."
                ) from None

            self._pool = httpcore.AsyncSOCKSProxy(
                proxy_url=httpcore.URL(
                    scheme=proxy.url.raw_scheme,
                    host=proxy.url.raw_host,
                    port=proxy.url.port,
                    target=proxy.url.raw_path,
                ),
                proxy_auth=proxy.raw_auth,
                ssl_context=ssl_context,
                max_connections=limits.max_connections,
                max_keepalive_connections=limits.max_keepalive_connections,
                keepalive_expiry=limits.keepalive_expiry,
                http1=http1,
                http2=http2,
            )
        else:  # pragma: no cover
            raise ValueError(
                "Proxy protocol must be either 'http', 'https', 'socks5', or 'socks5h',"
                " but got {proxy.url.scheme!r}."
            )

    async def __aenter__(self: A) -> A:  # Use generics for subclass support.
        await self._pool.__aenter__()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None = None,
        exc_value: BaseException | None = None,
        traceback: TracebackType | None = None,
    ) -> None:
        with map_httpcore_exceptions():
            await self._pool.__aexit__(exc_type, exc_value, traceback)

    async def handle_async_request(
        self,
        request: Request,
    ) -> Response:
        assert isinstance(request.stream, AsyncByteStream)
        import httpcore

        req = httpcore.Request(
            method=request.method,
            url=httpcore.URL(
                scheme=request.url.raw_scheme,
                host=request.url.raw_host,
                port=request.url.port,
                target=request.url.raw_path,
            ),
            headers=request.headers.raw,
            content=request.stream,
            extensions=request.extensions,
        )
        with map_httpcore_exceptions():
            resp = await self._pool.handle_async_request(req)

        assert isinstance(resp.stream, typing.AsyncIterable)

        return Response(
            status_code=resp.status,
            headers=resp.headers,
            stream=AsyncResponseStream(resp.stream),
            extensions=resp.extensions,
        )

    async def aclose(self) -> None:
        await self._pool.aclose()
