"""Shared harness for the fetch server tests (conftest.py re-exports the fixtures).

Two pieces:

- ``connect(...)`` runs the real ``serve()`` in-process and yields an
  initialized ``ClientSession`` linked to it over in-memory streams, so tests
  go through the SDK's validation and error mapping exactly as a client would.
- ``web`` replaces ``httpx.AsyncClient`` with one backed by an
  ``httpx.MockTransport``, so no test touches the network. It records every
  request and the keyword arguments each client was constructed with.
"""

from __future__ import annotations

import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Union

import anyio
import httpx
import pytest
import readabilipy.simple_json
from mcp import ClientSession
from mcp.shared.memory import create_client_server_memory_streams
from mcp.types import InitializeResult

import mcp_server_fetch.server as server_module

Responder = Union[httpx.Response, Callable[[httpx.Request], httpx.Response]]


@dataclass
class FakeWeb:
    """A router of URL -> response used as the transport of every AsyncClient."""

    routes: dict[str, Responder] = field(default_factory=dict)
    requests: list[httpx.Request] = field(default_factory=list)
    client_kwargs: list[dict[str, Any]] = field(default_factory=list)

    def add(self, url: str, response: Responder) -> None:
        self.routes[url] = response

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        responder = self.routes.get(str(request.url))
        if responder is None:
            return httpx.Response(404, content=b"no route in FakeWeb")
        if isinstance(responder, httpx.Response):
            return responder
        return responder(request)

    def urls(self) -> list[str]:
        return [str(r.url) for r in self.requests]


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch) -> FakeWeb:
    fake = FakeWeb()
    real_async_client = httpx.AsyncClient

    def factory(**kwargs: Any) -> httpx.AsyncClient:
        fake.client_kwargs.append(dict(kwargs))
        # A proxy would mount a real proxy transport in front of ours, so it is
        # recorded above and dropped here. Passing a transport also stops httpx
        # from picking up HTTP(S)_PROXY from the environment.
        kwargs.pop("proxy", None)
        return real_async_client(transport=httpx.MockTransport(fake.handle), **kwargs)

    # server.py imports AsyncClient from httpx inside each function, so
    # patching the attribute on the httpx module is what it picks up.
    monkeypatch.setattr(httpx, "AsyncClient", factory)
    return fake


@asynccontextmanager
async def connect(
    **serve_kwargs: Any,
) -> AsyncIterator[tuple[ClientSession, InitializeResult]]:
    """Run ``serve(**serve_kwargs)`` in-process and yield a connected client."""
    async with create_client_server_memory_streams() as (
        client_streams,
        server_streams,
    ):

        @asynccontextmanager
        async def fake_stdio_server() -> AsyncIterator[Any]:
            yield server_streams

        original = server_module.stdio_server
        server_module.stdio_server = fake_stdio_server  # type: ignore[assignment]
        try:
            async with anyio.create_task_group() as tg:
                tg.start_soon(lambda: server_module.serve(**serve_kwargs))
                async with ClientSession(*client_streams) as session:
                    init = await session.initialize()
                    yield session, init
                tg.cancel_scope.cancel()
        finally:
            server_module.stdio_server = original


@pytest.fixture
def node_readability() -> None:
    """Require the Readability.js path that readabilipy takes when Node is on PATH.

    readabilipy silently falls back to a pure-Python extractor without Node,
    and the two produce different Markdown, so each HTML test names the mode
    it pins. Node is a prerequisite of this repository's gate, so a missing
    Node fails the test rather than skipping it.
    """
    if not readabilipy.simple_json.have_node():
        pytest.fail("Node.js >= 10 must be on PATH for the Readability.js path")


@pytest.fixture
def python_readability(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force readabilipy's pure-Python fallback, as on a machine without Node."""
    monkeypatch.setattr(readabilipy.simple_json, "have_node", lambda: False)


@pytest.fixture(autouse=True)
def private_tempdir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Give each test its own ``tempfile.gettempdir()``.

    readabilipy's Readability.js path writes its input and output to fixed
    names (``full.html``, ``article.json``) in the shared temp directory, so
    two test runs at once (parallel gate runs in separate worktrees, say) read
    each other's pages.
    """
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
