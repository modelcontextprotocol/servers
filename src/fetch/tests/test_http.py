# The Streamable HTTP transport (#576): `serve(transport="streamable-http")`
# run in-process on a free loopback port and driven by the SDK `Client` over
# real HTTP in both protocol eras, plus `main()`'s `--transport` flag and
# `http_endpoint()`'s reading of HOST and PORT.

import socket
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import partial
from typing import Any
from unittest.mock import AsyncMock, patch

import anyio
import pytest
from mcp import Client

import mcp_server_fetch
from mcp_server_fetch.server import serve
from mcp_server_fetch.transport import (
    DEFAULT_HOST,
    DEFAULT_PORT,
    LocalhostOriginMiddleware,
    http_endpoint,
    origin_allowed,
)

ERAS = [
    pytest.param("2026-07-28", "2026-07-28", id="2026-07-28"),
    pytest.param("legacy", "2025-11-25", id="2025-11-25"),
]


def free_port() -> int:
    """A loopback port nothing is listening on right now."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@asynccontextmanager
async def http_server(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[str]:
    """Run `serve()` over Streamable HTTP and yield its URL once it answers."""
    port = free_port()
    monkeypatch.setenv("HOST", "127.0.0.1")
    monkeypatch.setenv("PORT", str(port))
    async with anyio.create_task_group() as tg:
        tg.start_soon(partial(serve, transport="streamable-http"))
        with anyio.fail_after(10):
            while True:
                try:
                    await (await anyio.connect_tcp("127.0.0.1", port)).aclose()
                    break
                except OSError:
                    await anyio.sleep(0.05)
        yield f"http://127.0.0.1:{port}/mcp"
        tg.cancel_scope.cancel()


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_serves_each_era_over_streamable_http(
    monkeypatch: pytest.MonkeyPatch, mode: str, negotiated: str
) -> None:
    async with http_server(monkeypatch) as url, Client(url, mode=mode) as client:
        assert client.session.protocol_version == negotiated
        tools = await client.list_tools()
        assert [tool.name for tool in tools.tools] == ["fetch"]


def test_http_endpoint_defaults_to_loopback() -> None:
    assert http_endpoint({}) == (DEFAULT_HOST, DEFAULT_PORT)


def test_http_endpoint_reads_host_and_port() -> None:
    assert http_endpoint({"HOST": "0.0.0.0", "PORT": "8080"}) == ("0.0.0.0", 8080)


@pytest.mark.parametrize("port", ["abc", "-1", "65536", "1.5", "٣"])
def test_http_endpoint_refuses_a_bad_port(port: str) -> None:
    with pytest.raises(ValueError, match="Invalid PORT"):
        http_endpoint({"PORT": port})


@pytest.mark.parametrize(
    "argv,transport",
    [
        ([], "stdio"),
        (["--transport", "stdio"], "stdio"),
        (["--transport", "streamable-http"], "streamable-http"),
    ],
)
def test_main_passes_the_transport_to_serve(
    monkeypatch: pytest.MonkeyPatch, argv: list[str], transport: str
) -> None:
    monkeypatch.delenv("PORT", raising=False)
    serve_mock = AsyncMock()
    with (
        patch.object(mcp_server_fetch, "serve", serve_mock),
        patch.object(sys, "argv", ["mcp-server-fetch", *argv]),
    ):
        mcp_server_fetch.main()
    serve_mock.assert_awaited_once_with(None, False, None, False, None, True, transport)


@pytest.mark.parametrize(
    "argv", [["--transport", "sse"], ["--transport", "streamable-http"]]
)
def test_main_refuses_an_unknown_transport_or_a_bad_port(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    argv: list[str],
) -> None:
    monkeypatch.setenv("PORT", "not-a-port")
    serve_mock = AsyncMock()
    with (
        patch.object(mcp_server_fetch, "serve", serve_mock),
        patch.object(sys, "argv", ["mcp-server-fetch", *argv]),
        pytest.raises(SystemExit) as exit_info,
    ):
        mcp_server_fetch.main()
    assert exit_info.value.code == 2
    serve_mock.assert_not_awaited()
    assert "error:" in capsys.readouterr().err


@pytest.mark.parametrize(
    "origin,allowed",
    [
        (None, True),
        ("http://localhost:6274", True),
        ("http://127.0.0.1", True),
        ("http://[::1]:3000", True),
        ("https://evil.example", False),
        ("http://localhost.evil.example", False),
        ("http://[::1", False),
        ("null", False),
    ],
)
def test_origin_allowed(origin: str | None, allowed: bool) -> None:
    assert origin_allowed(origin) is allowed


async def test_middleware_refuses_a_foreign_origin_whatever_the_host() -> None:
    """The check does not depend on the bind address, so it holds under HOST=0.0.0.0."""
    reached: list[str] = []

    async def app(scope: Any, receive: Any, send: Any) -> None:
        reached.append(scope["type"])

    sent: list[Any] = []

    async def send(message: Any) -> None:
        sent.append(message)

    async def receive() -> Any:
        return {"type": "http.request", "body": b"", "more_body": False}

    middleware = LocalhostOriginMiddleware(app)
    foreign = {
        "type": "http",
        "method": "POST",
        "path": "/mcp",
        "headers": [
            (b"host", b"192.168.1.20:3001"),
            (b"origin", b"https://evil.example"),
        ],
    }
    await middleware(foreign, receive, send)
    assert reached == []
    assert sent[0]["status"] == 403

    local = {**foreign, "headers": [(b"origin", b"http://localhost:6274")]}
    await middleware(local, receive, send)
    await middleware({"type": "lifespan"}, receive, send)
    assert reached == ["http", "lifespan"]
