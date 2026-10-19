"""Both protocol eras, driven through a real ``mcp`` 2.x ``Client`` (#4853).

serve() answers a 2025-11-25 client through the initialize handshake and a
2026-07-28 client sessionlessly, the client's first request deciding which.
Each test here pins the client's ``mode`` explicitly (never "auto" alone), so a
test names the era it covers and cannot pass by falling back to the other one.
The client talks to the real ``serve()`` over in-memory streams, the same
JSON-RPC path stdio takes, rather than the SDK's in-process shortcut, which
would bypass serve() and its era dispatch. ``web`` (harness.py) keeps every
request off the network.

The legacy-era characterization tests in test_protocol.py stay as the
backward-compatibility net; this file adds what differs by era and shows that
the rest does not.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import patch

import anyio
import httpx
import pytest
from mcp import Client
from mcp.client._transport import TransportStreams
from mcp.shared.exceptions import MCPError
from mcp.shared.memory import create_client_server_memory_streams
from mcp.types import (
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    CallToolResult,
    TextContent,
)

from mcp_server_fetch.server import serve

from .harness import FakeWeb

PAGE = "https://example.com/page"
MODERN = "2026-07-28"
LEGACY = "2025-11-25"
# Each `mode` a test pins, with the protocol version it must negotiate.
ERAS = [
    pytest.param(MODERN, MODERN, id=MODERN),
    pytest.param("legacy", LEGACY, id=LEGACY),
]


@asynccontextmanager
async def connect(mode: str, **serve_kwargs: Any) -> AsyncIterator[Client]:
    """Run ``serve(**serve_kwargs)`` in-process and yield a ``Client`` in ``mode``."""
    async with create_client_server_memory_streams() as (
        client_streams,
        server_streams,
    ):

        @asynccontextmanager
        async def fake_stdio_server() -> AsyncIterator[Any]:
            yield server_streams

        @asynccontextmanager
        async def transport() -> AsyncIterator[TransportStreams]:
            yield client_streams

        with patch("mcp.server.mcpserver.server.stdio_server", fake_stdio_server):
            async with anyio.create_task_group() as tg:
                tg.start_soon(lambda: serve(**serve_kwargs))
                async with Client(transport(), mode=mode) as client:
                    yield client
                tg.cancel_scope.cancel()


def plain(body: str) -> httpx.Response:
    return httpx.Response(
        200, content=body.encode(), headers={"content-type": "text/plain"}
    )


def text_of(result: CallToolResult) -> str:
    """The text of a result holding one text block."""
    assert len(result.content) == 1
    block = result.content[0]
    assert isinstance(block, TextContent)
    return block.text


def wire_list(items: Any) -> list[dict[str, Any]]:
    return [i.model_dump(by_alias=True, mode="json", exclude_none=True) for i in items]


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_each_era_is_negotiated(web: FakeWeb, mode: str, negotiated: str) -> None:
    async with connect(mode) as client:
        assert client.session.protocol_version == negotiated


async def test_auto_mode_discovers_the_2026_07_28_era(web: FakeWeb) -> None:
    # An auto client probes server/discover first and only falls back to the
    # handshake on a server that refuses it; this server no longer does.
    async with connect("auto") as client:
        assert client.session.protocol_version == MODERN


async def test_tools_and_prompts_lists_are_the_same_in_both_eras(
    web: FakeWeb,
) -> None:
    # Same tools and prompts, same schemas, same order, in either era.
    async with connect(MODERN) as client:
        modern_tools = wire_list((await client.list_tools()).tools)
        modern_prompts = wire_list((await client.list_prompts()).prompts)
    async with connect("legacy") as client:
        legacy_tools = wire_list((await client.list_tools()).tools)
        legacy_prompts = wire_list((await client.list_prompts()).prompts)
    assert [t["name"] for t in modern_tools] == ["fetch"]
    assert [p["name"] for p in modern_prompts] == ["fetch"]
    assert modern_tools == legacy_tools
    assert modern_prompts == legacy_prompts


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_tool_call_succeeds_in_each_era(
    web: FakeWeb, mode: str, negotiated: str
) -> None:
    web.add(PAGE, plain("hello from both eras"))
    async with connect(mode) as client:
        result = await client.call_tool("fetch", {"url": PAGE})
    assert result.is_error is False
    assert result.result_type == "complete"
    assert text_of(result).endswith(f"Contents of {PAGE}:\nhello from both eras")


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_prompt_succeeds_in_each_era(
    web: FakeWeb, mode: str, negotiated: str
) -> None:
    web.add(PAGE, plain("prompted"))
    async with connect(mode) as client:
        result = await client.get_prompt("fetch", {"url": PAGE})
    assert result.description == "Fetch a URL and extract its contents as markdown"
    content = result.messages[0].content
    assert isinstance(content, TextContent)
    assert content.text.endswith("prompted")


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_tool_failure_is_an_is_error_result_in_each_era(
    web: FakeWeb, mode: str, negotiated: str
) -> None:
    # Arguments that fail the tool's schema are the model's to correct, so
    # MCPServer returns them as an isError result.
    async with connect(mode) as client:
        missing = await client.call_tool("fetch", {})
    assert missing.is_error is True
    assert text_of(missing).startswith(
        "Error executing tool fetch: 1 validation error for fetchArguments\nurl\n"
    )


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_unknown_tool_is_a_json_rpc_error_in_each_era(
    web: FakeWeb, mode: str, negotiated: str
) -> None:
    # Both spec revisions make an unknown tool a protocol error, -32602
    # (#5174), not an isError result.
    async with connect(mode) as client:
        with pytest.raises(MCPError) as unknown:
            await client.call_tool("no_such_tool", {})
    assert unknown.value.error.code == INVALID_PARAMS
    assert unknown.value.error.message == "Unknown tool: no_such_tool"


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_prompt_failure_is_a_json_rpc_error_in_each_era(
    web: FakeWeb, mode: str, negotiated: str
) -> None:
    # An unknown prompt, or a prompt call without its `url`, reaches the
    # client as a JSON-RPC -32602 error rather than a result.
    async with connect(mode) as client:
        with pytest.raises(MCPError) as unknown_prompt:
            await client.get_prompt("no_such_prompt", {"url": PAGE})
        with pytest.raises(MCPError) as no_url:
            await client.get_prompt("fetch", {})
    assert unknown_prompt.value.error.code == INVALID_PARAMS
    assert unknown_prompt.value.error.message == "Unknown prompt: no_such_prompt"
    assert no_url.value.error.code == INVALID_PARAMS
    assert no_url.value.error.message == "URL is required"


async def test_ping_is_served_only_in_the_legacy_era(web: FakeWeb) -> None:
    # ping is removed in 2026-07-28; the legacy era keeps answering it.
    async with connect("legacy") as client:
        await client.session.send_ping()
    async with connect(MODERN) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.session.send_ping()
    assert excinfo.value.error.code == METHOD_NOT_FOUND
