"""How the fetch server is reached: stdio (the default) or Streamable HTTP (#576).

`--transport streamable-http` serves the same server on one `/mcp` endpoint
through the SDK's Streamable HTTP app, which answers 2026-07-28 and 2025-era
clients alike. It listens on `HOST`:`PORT` from the environment, loopback:3001
by default: the same variables, defaults and loopback-first posture as the
TypeScript servers.

A browser page may reach it only from a localhost Origin, whatever `HOST` is,
as with the TypeScript servers' `localhostOriginValidation`. The SDK's own
DNS-rebinding protection checks Origin only when it binds loopback, and its
Host check cannot name the addresses of an interface `HOST` widens to, so the
Origin check is this module's middleware; on loopback the SDK's Host and
Origin checks still run behind it.
"""

import os
from collections.abc import Mapping
from urllib.parse import urlsplit

import uvicorn
from mcp.server.mcpserver import MCPServer
from starlette.datastructures import Headers
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

TRANSPORTS = ("stdio", "streamable-http")
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 3001


def http_endpoint(env: Mapping[str, str] = os.environ) -> tuple[str, int]:
    """The host and port to listen on: `HOST` and `PORT`, else the defaults."""
    host = env.get("HOST") or DEFAULT_HOST
    raw = env.get("PORT")
    if not raw:
        return host, DEFAULT_PORT
    if not raw.isascii() or not raw.isdigit() or int(raw) > 65535:
        raise ValueError(
            f"Invalid PORT {raw!r}: expected a whole number from 0 to 65535"
        )
    return host, int(raw)


LOCALHOST_NAMES = ("localhost", "127.0.0.1", "::1")


def origin_allowed(origin: str | None) -> bool:
    """Whether a request with this Origin may proceed: none (a non-browser
    client), or one whose host is localhost, 127.0.0.1 or [::1]."""
    if origin is None:
        return True
    try:
        hostname = urlsplit(origin).hostname
    except ValueError:
        return False
    return hostname in LOCALHOST_NAMES


class LocalhostOriginMiddleware:
    """Answer an HTTP request from any other Origin with 403 before `app` sees it."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not origin_allowed(
            Headers(scope=scope).get("origin")
        ):
            response = PlainTextResponse("Invalid Origin header", status_code=403)
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


async def run(server: MCPServer, transport: str) -> None:
    """Serve `server` on `transport` until it is stopped."""
    if transport == "streamable-http":
        host, port = http_endpoint()
        app = LocalhostOriginMiddleware(server.streamable_http_app(host=host))
        config = uvicorn.Config(app, host=host, port=port)
        await uvicorn.Server(config).serve()
    else:
        # Both eras (#4853): the SDK's dual-era loop lets the client's first
        # request decide. `initialize` gets the 2025-11-25 handshake;
        # `server/discover` or a request carrying a 2026-07-28 envelope gets
        # the modern, sessionless era, with its required result fields
        # (resultType, ttlMs, cacheScope) filled in by the SDK.
        await server.run_stdio_async()
