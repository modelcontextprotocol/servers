# Pins the fetch server's direct connections to addresses the private-address
# guard approved (#5557). The guard in server.py is a request hook: it resolves
# the URL's host and refuses a non-public address. httpx then opened the
# connection by resolving the same name a second time, so a name whose DNS
# answer changed between the two lookups (DNS rebinding) passed the check with
# a public address and connected to a private one.
#
# The fix is to make the lookup that picks the address the one that is
# checked. httpcore opens every TCP connection through a network backend's
# `connect_tcp(host, port)`. `PinnedBackend` stands in front of the real
# backend there: it resolves the host itself, hands every address to the
# guard, and then connects to those addresses by IP literal, so nothing below
# it resolves a name again. Nothing above it changes: httpcore still derives
# the `Host` header, the TLS SNI name and the certificate's expected name from
# the URL's host, not from what `connect_tcp` was given.
#
# Only the client's direct transport is pinned. A request that goes through a
# proxy connects to the proxy, which may well be on loopback and which resolves
# the destination on its side, so the proxy transports are left as httpx built
# them and the request hook stays the (best-effort) check for that case.
#
# httpx has no public way to give its default transport a network backend
# while it still reads the proxy environment variables (passing `transport=`
# turns those off), so `pin_direct_connections` replaces the client's default
# transport after construction, and fails loudly if httpx's internals are not
# the shape it expects, rather than leave connections unpinned.

import asyncio
import socket
from collections.abc import Awaitable, Callable, Iterable, Sequence
from typing import Any, cast

import anyio
import httpcore
import httpx

# How long a connection attempt gets before the next address is tried
# alongside it (RFC 8305's "Connection Attempt Delay"), so one unresponsive
# address does not hold up a host that has a working one. The name-based
# connect this replaces raced a host's addresses the same way.
CONNECTION_ATTEMPT_DELAY = 0.25

# httpx's own defaults for its connection pool (`httpx.Limits()`), which the
# pinned transport keeps.
_MAX_CONNECTIONS = 100
_MAX_KEEPALIVE_CONNECTIONS = 20
_KEEPALIVE_EXPIRY = 5.0

Resolver = Callable[[str], Awaitable[Sequence[str]]]
# Raises to refuse a host given every address it resolved to.
Vetter = Callable[[str, Sequence[str]], None]


async def _close(streams: list[httpcore.AsyncNetworkStream]) -> None:
    """Close and forget every stream in ``streams``, even while cancelled."""
    with anyio.CancelScope(shield=True):
        while streams:
            await streams.pop().aclose()


class PinnedBackend(httpcore.AsyncNetworkBackend):
    """A network backend that connects only to addresses it resolved and vetted.

    ``resolve`` turns a host into its addresses and ``vet`` raises when any of
    them is refused; ``inner`` (the anyio backend by default) then opens the
    socket to an address, never to the name.
    """

    def __init__(
        self,
        resolve: Resolver,
        vet: Vetter,
        inner: httpcore.AsyncNetworkBackend | None = None,
    ) -> None:
        self._resolve = resolve
        self._vet = vet
        # The cast: httpcore also declares a placeholder `AnyIOBackend` for an
        # install without anyio, which is the declaration a type checker sees.
        # httpx requires anyio, so the real backend is what this builds.
        self._inner = (
            cast(httpcore.AsyncNetworkBackend, httpcore.AnyIOBackend())
            if inner is None
            else inner
        )

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        # The connect timeout covers the lookup too, as it does for a
        # name-based connect: the attempts below get what the lookup left.
        loop = asyncio.get_running_loop()
        started = loop.time()
        try:
            resolved = await asyncio.wait_for(self._resolve(host), timeout)
        except socket.gaierror as e:
            # What the inner backend reports for a name it cannot resolve.
            raise httpcore.ConnectError(str(e)) from e
        except TimeoutError as e:
            raise httpcore.ConnectTimeout(f"Timed out resolving {host}") from e
        # getaddrinfo lists an address once per socket type.
        addresses = list(dict.fromkeys(resolved))
        self._vet(host, addresses)

        waiting = list(addresses)
        attempts: set[asyncio.Task[httpcore.AsyncNetworkStream]] = set()
        failures: list[Exception] = []
        # Every stream an attempt produced is owned here until one is
        # returned: `winner` is the one to hand over, `spare` the rest.
        winner: httpcore.AsyncNetworkStream | None = None
        spare: list[httpcore.AsyncNetworkStream] = []
        try:
            try:
                while winner is None and (waiting or attempts):
                    if waiting:
                        # Each attempt gets what is left of the one connect
                        # timeout, so trying several addresses does not
                        # extend it.
                        left = (
                            None
                            if timeout is None
                            else timeout - (loop.time() - started)
                        )
                        attempts.add(
                            loop.create_task(
                                self._inner.connect_tcp(
                                    waiting.pop(0),
                                    port,
                                    timeout=left,
                                    local_address=local_address,
                                    socket_options=socket_options,
                                )
                            )
                        )
                    # Wake on the first attempt to finish, or to start the
                    # next address once this one has had its head start.
                    done, attempts = await asyncio.wait(
                        attempts,
                        timeout=CONNECTION_ATTEMPT_DELAY if waiting else None,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for attempt in done:
                        error = attempt.exception()
                        if isinstance(error, Exception):
                            failures.append(error)
                        elif winner is None:
                            winner = attempt.result()
                        else:
                            spare.append(attempt.result())
            finally:
                # Attempts still running lost the race, or the caller gave
                # up. Shielded, so a caller's timeout (an anyio cancel scope,
                # which cancels every await inside it) cannot cut the
                # teardown short.
                with anyio.CancelScope(shield=True):
                    for attempt in attempts:
                        attempt.cancel()
                    for outcome in await asyncio.gather(
                        *attempts, return_exceptions=True
                    ):
                        if isinstance(outcome, httpcore.AsyncNetworkStream):
                            spare.append(outcome)
                    await _close(spare)
        except BaseException:
            # The winner was never handed over (the caller was cancelled
            # during the teardown, say), so it is closed here with the rest.
            if winner is not None:
                spare.append(winner)
            await _close(spare)
            raise
        if winner is not None:
            return winner
        # Every address failed: report the first, as a single connect would.
        if failures:
            raise failures[0]
        raise httpcore.ConnectError(f"{host} has no addresses")

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        # A Unix socket has no name to resolve. The server never asks for one.
        return await self._inner.connect_unix_socket(
            path, timeout=timeout, socket_options=socket_options
        )

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


class PinnedTransport(httpx.AsyncHTTPTransport):
    """httpx's HTTP transport with its connections opened by ``backend``.

    Everything else is httpx's default transport: certificate verification
    against the URL's host with the default trust store (``SSL_CERT_FILE`` and
    ``SSL_CERT_DIR`` honored), HTTP/1.1, and the default pool limits.
    """

    def __init__(self, backend: httpcore.AsyncNetworkBackend) -> None:
        ssl_context = httpx.create_ssl_context()
        super().__init__(verify=ssl_context)
        # `AsyncHTTPTransport` takes no network backend, so its pool is
        # rebuilt with one; httpcore's pool takes it as a public argument.
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl_context,
            max_connections=_MAX_CONNECTIONS,
            max_keepalive_connections=_MAX_KEEPALIVE_CONNECTIONS,
            keepalive_expiry=_KEEPALIVE_EXPIRY,
            network_backend=backend,
        )


def pin_direct_connections(
    client: httpx.AsyncClient, resolve: Resolver, vet: Vetter
) -> None:
    """Make ``client``'s direct connections go only to vetted addresses.

    Replaces the client's default transport, the one used for every request
    no proxy applies to, with a `PinnedTransport`. Proxy transports are left
    alone (see the top of this file). Raises ``TypeError`` when the client
    is not built the way this relies on, so a future httpx cannot silently
    drop the pinning.
    """
    if not isinstance(getattr(client, "_transport", None), httpx.AsyncHTTPTransport):
        raise TypeError(
            "Cannot pin connections to the checked addresses: this version of "
            "httpx does not expose its default transport as expected"
        )
    client._transport = PinnedTransport(PinnedBackend(resolve, vet))
