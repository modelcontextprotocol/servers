"""How the git server is reached: stdio (the default) or Streamable HTTP (#576).

`--transport streamable-http` serves the same server on one `/mcp` endpoint
through the SDK's Streamable HTTP app, which answers 2026-07-28 and 2025-era
clients alike. It listens on `HOST`:`PORT` from the environment, loopback:3001
by default: the same variables, defaults and loopback-first posture as the
TypeScript servers, and on loopback the SDK also turns on its DNS-rebinding
protection (Host and Origin checks).
"""

import os
from collections.abc import Mapping

from mcp.server.mcpserver import MCPServer

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


async def run(server: MCPServer, transport: str) -> None:
    """Serve `server` on `transport` until it is stopped."""
    if transport == "streamable-http":
        host, port = http_endpoint()
        await server.run_streamable_http_async(host=host, port=port)
    else:
        # Both eras (#4853): the SDK's dual-era loop lets the client's first
        # request decide. `initialize` gets the 2025-11-25 handshake;
        # `server/discover` or a request carrying a 2026-07-28 envelope gets
        # the modern, sessionless era, with its required result fields
        # (resultType, ttlMs, cacheScope) filled in by the SDK.
        await server.run_stdio_async()
