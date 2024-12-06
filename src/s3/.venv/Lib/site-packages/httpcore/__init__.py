from ._api import request, stream
from ._async import (
    AsyncConnectionInterface,
    AsyncConnectionPool,
    AsyncHTTP2Connection,
    AsyncHTTP11Connection,
    AsyncHTTPConnection,
    AsyncHTTPProxy,
    AsyncSOCKSProxy,
)
from ._backends.base import (
    SOCKET_OPTION,
    AsyncNetworkBackend,
    AsyncNetworkStream,
    NetworkBackend,
    NetworkStream,
)
from ._backends.mock import AsyncMockBackend, AsyncMockStream, MockBackend, MockStream
from ._backends.sync import SyncBackend
from ._exceptions import (
    ConnectError,
    ConnectionNotAvailable,
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
from ._models import URL, Origin, Proxy, Request, Response
from ._ssl import default_ssl_context
from ._sync import (
    ConnectionInterface,
    ConnectionPool,
    HTTP2Connection,
    HTTP11Connection,
    HTTPConnection,
    HTTPProxy,
    SOCKSProxy,
)

# The 'httpcore.AnyIOBackend' class is conditional on 'anyio' being installed.
try:
    from ._backends.anyio import AnyIOBackend
except ImportError:  # pragma: nocover

    class AnyIOBackend:  # type: ignore
        def __init__(self, *args, **kwargs):  # type: ignore
            msg = (
                "Attempted to use 'httpcore.AnyIOBackend' but 'anyio' is not installed."
            )
            raise RuntimeError(msg)


# The 'httpcore.TrioBackend' class is conditional on 'trio' being installed.
try:
    from ._backends.trio import TrioBackend
except ImportError:  # pragma: nocover

    class TrioBackend:  # type: ignore
        def __init__(self, *args, **kwargs):  # type: ignore
            msg = "Attempted to use 'httpcore.TrioBackend' but 'trio' is not installed."
            raise RuntimeError(msg)


__all__ = [
    # top-level requests
    "request",
    "stream",
    # models
    "Origin",
    "URL",
    "Request",
    "Response",
    "Proxy",
    # async
    "AsyncHTTPConnection",
    "AsyncConnectionPool",
    "AsyncHTTPProxy",
    "AsyncHTTP11Connection",
    "AsyncHTTP2Connection",
    "AsyncConnectionInterface",
    "AsyncSOCKSProxy",
    # sync
    "HTTPConnection",
    "ConnectionPool",
    "HTTPProxy",
    "HTTP11Connection",
    "HTTP2Connection",
    "ConnectionInterface",
    "SOCKSProxy",
    # network backends, implementations
    "SyncBackend",
    "AnyIOBackend",
    "TrioBackend",
    # network backends, mock implementations
    "AsyncMockBackend",
    "AsyncMockStream",
    "MockBackend",
    "MockStream",
    # network backends, interface
    "AsyncNetworkStream",
    "AsyncNetworkBackend",
    "NetworkStream",
    "NetworkBackend",
    # util
    "default_ssl_context",
    "SOCKET_OPTION",
    # exceptions
    "ConnectionNotAvailable",
    "ProxyError",
    "ProtocolError",
    "LocalProtocolError",
    "RemoteProtocolError",
    "UnsupportedProtocol",
    "TimeoutException",
    "PoolTimeout",
    "ConnectTimeout",
    "ReadTimeout",
    "WriteTimeout",
    "NetworkError",
    "ConnectError",
    "ReadError",
    "WriteError",
]

__version__ = "1.0.7"


__locals = locals()
for __name in __all__:
    if not __name.startswith("__"):
        setattr(__locals[__name], "__module__", "httpcore")  # noqa
