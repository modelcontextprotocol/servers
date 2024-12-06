from __future__ import annotations

import os
import typing

from ._models import Headers
from ._types import CertTypes, HeaderTypes, TimeoutTypes
from ._urls import URL

if typing.TYPE_CHECKING:
    import ssl  # pragma: no cover

__all__ = ["Limits", "Proxy", "Timeout", "create_ssl_context"]


class UnsetType:
    pass  # pragma: no cover


UNSET = UnsetType()


def create_ssl_context(
    verify: ssl.SSLContext | str | bool = True,
    cert: CertTypes | None = None,
    trust_env: bool = True,
) -> ssl.SSLContext:
    import ssl
    import warnings

    import certifi

    if verify is True:
        if trust_env and os.environ.get("SSL_CERT_FILE"):  # pragma: nocover
            ctx = ssl.create_default_context(cafile=os.environ["SSL_CERT_FILE"])
        elif trust_env and os.environ.get("SSL_CERT_DIR"):  # pragma: nocover
            ctx = ssl.create_default_context(capath=os.environ["SSL_CERT_DIR"])
        else:
            # Default case...
            ctx = ssl.create_default_context(cafile=certifi.where())
    elif verify is False:
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        return ssl_context
    elif isinstance(verify, str):  # pragma: nocover
        message = (
            "`verify=<str>` is deprecated. "
            "Use `verify=ssl.create_default_context(cafile=...)` "
            "or `verify=ssl.create_default_context(capath=...)` instead."
        )
        warnings.warn(message, DeprecationWarning)
        if os.path.isdir(verify):
            return ssl.create_default_context(capath=verify)
        return ssl.create_default_context(cafile=verify)
    else:
        ctx = verify

    if cert:  # pragma: nocover
        message = (
            "`cert=...` is deprecated. Use `verify=<ssl_context>` instead,"
            "with `.load_cert_chain()` to configure the certificate chain."
        )
        warnings.warn(message, DeprecationWarning)
        if isinstance(cert, str):
            ctx.load_cert_chain(cert)
        else:
            ctx.load_cert_chain(*cert)

    return ctx


class Timeout:
    """
    Timeout configuration.

    **Usage**:

    Timeout(None)               # No timeouts.
    Timeout(5.0)                # 5s timeout on all operations.
    Timeout(None, connect=5.0)  # 5s timeout on connect, no other timeouts.
    Timeout(5.0, connect=10.0)  # 10s timeout on connect. 5s timeout elsewhere.
    Timeout(5.0, pool=None)     # No timeout on acquiring connection from pool.
                                # 5s timeout elsewhere.
    """

    def __init__(
        self,
        timeout: TimeoutTypes | UnsetType = UNSET,
        *,
        connect: None | float | UnsetType = UNSET,
        read: None | float | UnsetType = UNSET,
        write: None | float | UnsetType = UNSET,
        pool: None | float | UnsetType = UNSET,
    ) -> None:
        if isinstance(timeout, Timeout):
            # Passed as a single explicit Timeout.
            assert connect is UNSET
            assert read is UNSET
            assert write is UNSET
            assert pool is UNSET
            self.connect = timeout.connect  # type: typing.Optional[float]
            self.read = timeout.read  # type: typing.Optional[float]
            self.write = timeout.write  # type: typing.Optional[float]
            self.pool = timeout.pool  # type: typing.Optional[float]
        elif isinstance(timeout, tuple):
            # Passed as a tuple.
            self.connect = timeout[0]
            self.read = timeout[1]
            self.write = None if len(timeout) < 3 else timeout[2]
            self.pool = None if len(timeout) < 4 else timeout[3]
        elif not (
            isinstance(connect, UnsetType)
            or isinstance(read, UnsetType)
            or isinstance(write, UnsetType)
            or isinstance(pool, UnsetType)
        ):
            self.connect = connect
            self.read = read
            self.write = write
            self.pool = pool
        else:
            if isinstance(timeout, UnsetType):
                raise ValueError(
                    "httpx.Timeout must either include a default, or set all "
                    "four parameters explicitly."
                )
            self.connect = timeout if isinstance(connect, UnsetType) else connect
            self.read = timeout if isinstance(read, UnsetType) else read
            self.write = timeout if isinstance(write, UnsetType) else write
            self.pool = timeout if isinstance(pool, UnsetType) else pool

    def as_dict(self) -> dict[str, float | None]:
        return {
            "connect": self.connect,
            "read": self.read,
            "write": self.write,
            "pool": self.pool,
        }

    def __eq__(self, other: typing.Any) -> bool:
        return (
            isinstance(other, self.__class__)
            and self.connect == other.connect
            and self.read == other.read
            and self.write == other.write
            and self.pool == other.pool
        )

    def __repr__(self) -> str:
        class_name = self.__class__.__name__
        if len({self.connect, self.read, self.write, self.pool}) == 1:
            return f"{class_name}(timeout={self.connect})"
        return (
            f"{class_name}(connect={self.connect}, "
            f"read={self.read}, write={self.write}, pool={self.pool})"
        )


class Limits:
    """
    Configuration for limits to various client behaviors.

    **Parameters:**

    * **max_connections** - The maximum number of concurrent connections that may be
            established.
    * **max_keepalive_connections** - Allow the connection pool to maintain
            keep-alive connections below this point. Should be less than or equal
            to `max_connections`.
    * **keepalive_expiry** - Time limit on idle keep-alive connections in seconds.
    """

    def __init__(
        self,
        *,
        max_connections: int | None = None,
        max_keepalive_connections: int | None = None,
        keepalive_expiry: float | None = 5.0,
    ) -> None:
        self.max_connections = max_connections
        self.max_keepalive_connections = max_keepalive_connections
        self.keepalive_expiry = keepalive_expiry

    def __eq__(self, other: typing.Any) -> bool:
        return (
            isinstance(other, self.__class__)
            and self.max_connections == other.max_connections
            and self.max_keepalive_connections == other.max_keepalive_connections
            and self.keepalive_expiry == other.keepalive_expiry
        )

    def __repr__(self) -> str:
        class_name = self.__class__.__name__
        return (
            f"{class_name}(max_connections={self.max_connections}, "
            f"max_keepalive_connections={self.max_keepalive_connections}, "
            f"keepalive_expiry={self.keepalive_expiry})"
        )


class Proxy:
    def __init__(
        self,
        url: URL | str,
        *,
        ssl_context: ssl.SSLContext | None = None,
        auth: tuple[str, str] | None = None,
        headers: HeaderTypes | None = None,
    ) -> None:
        url = URL(url)
        headers = Headers(headers)

        if url.scheme not in ("http", "https", "socks5", "socks5h"):
            raise ValueError(f"Unknown scheme for proxy URL {url!r}")

        if url.username or url.password:
            # Remove any auth credentials from the URL.
            auth = (url.username, url.password)
            url = url.copy_with(username=None, password=None)

        self.url = url
        self.auth = auth
        self.headers = headers
        self.ssl_context = ssl_context

    @property
    def raw_auth(self) -> tuple[bytes, bytes] | None:
        # The proxy authentication as raw bytes.
        return (
            None
            if self.auth is None
            else (self.auth[0].encode("utf-8"), self.auth[1].encode("utf-8"))
        )

    def __repr__(self) -> str:
        # The authentication is represented with the password component masked.
        auth = (self.auth[0], "********") if self.auth else None

        # Build a nice concise representation.
        url_str = f"{str(self.url)!r}"
        auth_str = f", auth={auth!r}" if auth else ""
        headers_str = f", headers={dict(self.headers)!r}" if self.headers else ""
        return f"Proxy({url_str}{auth_str}{headers_str})"


DEFAULT_TIMEOUT_CONFIG = Timeout(timeout=5.0)
DEFAULT_LIMITS = Limits(max_connections=100, max_keepalive_connections=20)
DEFAULT_MAX_REDIRECTS = 20
