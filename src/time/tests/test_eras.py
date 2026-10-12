# Both protocol eras, driven through a real `mcp` 2.x `Client` (#4853).
#
# serve() answers a 2025-11-25 client through the initialize handshake and a
# 2026-07-28 client sessionlessly, the client's first request deciding which.
# Each test here pins the client's `mode` explicitly (never "auto" alone), so
# a test names the era it covers and cannot pass by falling back to the other
# one. The client talks to the real `serve()` over in-memory streams, the same
# JSON-RPC path stdio takes, rather than the SDK's in-process shortcut, which
# would bypass serve() and its era dispatch.
#
# The legacy-era characterization tests in test_protocol.py stay as the
# backward-compatibility net; this file adds what differs by era and shows
# that the rest does not.

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import patch

import anyio
import pytest
from mcp import Client
from mcp.client._transport import TransportStreams
from mcp.shared.exceptions import MCPError
from mcp.shared.memory import create_client_server_memory_streams
from mcp.types import METHOD_NOT_FOUND, CallToolResult, TextContent

from mcp_server_time.server import serve

MODERN = "2026-07-28"
LEGACY = "2025-11-25"
# Each `mode` a test pins, with the protocol version it must negotiate.
ERAS = [
    pytest.param(MODERN, MODERN, id=MODERN),
    pytest.param("legacy", LEGACY, id=LEGACY),
]


@asynccontextmanager
async def connect(
    mode: str, local_timezone: str | None = "UTC"
) -> AsyncIterator[Client]:
    """Run `serve(local_timezone)` in-process and yield a `Client` in `mode`."""
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

        with patch("mcp_server_time.server.stdio_server", fake_stdio_server):
            async with anyio.create_task_group() as tg:
                tg.start_soon(serve, local_timezone)
                async with Client(transport(), mode=mode) as client:
                    yield client
                tg.cancel_scope.cancel()


def text_of(result: CallToolResult) -> str:
    """The text of a result holding one text block."""
    assert len(result.content) == 1
    block = result.content[0]
    assert isinstance(block, TextContent)
    return block.text


def tool_wire(client_tools: Any) -> list[dict[str, Any]]:
    return [
        t.model_dump(by_alias=True, mode="json", exclude_none=True)
        for t in client_tools
    ]


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_each_era_is_negotiated(mode: str, negotiated: str) -> None:
    async with connect(mode) as client:
        assert client.session.protocol_version == negotiated


async def test_auto_mode_discovers_the_2026_07_28_era() -> None:
    # An auto client probes server/discover first and only falls back to the
    # handshake on a server that refuses it; this server no longer does.
    async with connect("auto") as client:
        assert client.session.protocol_version == MODERN


async def test_tools_list_is_the_same_in_both_eras() -> None:
    # Same tools, same schemas, same deterministic order, in either era and on
    # every call.
    async with connect(MODERN) as client:
        modern = tool_wire((await client.list_tools()).tools)
        again = tool_wire((await client.list_tools()).tools)
    async with connect("legacy") as client:
        legacy = tool_wire((await client.list_tools()).tools)
    assert [t["name"] for t in modern] == ["get_current_time", "convert_time"]
    assert modern == again == legacy


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_tool_call_succeeds_in_each_era(mode: str, negotiated: str) -> None:
    # Etc/GMT-5 is UTC+5 all year, so the result does not depend on the date.
    async with connect(mode) as client:
        result = await client.call_tool(
            "convert_time",
            {"source_timezone": "UTC", "time": "12:00", "target_timezone": "Etc/GMT-5"},
        )
    assert result.is_error is False
    assert result.result_type == "complete"
    data = json.loads(text_of(result))
    assert data["target"]["datetime"].endswith("T17:00:00+05:00")
    assert data["time_difference"] == "+5.0h"


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_tool_failure_is_an_is_error_result_in_each_era(
    mode: str, negotiated: str
) -> None:
    async with connect(mode) as client:
        bad_zone = await client.call_tool(
            "get_current_time", {"timezone": "Nope/Nowhere"}
        )
        unknown = await client.call_tool("no_such_tool", {})
    assert bad_zone.is_error is True
    assert "Invalid timezone" in text_of(bad_zone)
    assert unknown.is_error is True
    assert text_of(unknown) == (
        "Error processing mcp-server-time query: Unknown tool: no_such_tool"
    )


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_unsupported_method_is_a_json_rpc_error_in_each_era(
    mode: str, negotiated: str
) -> None:
    # The server declares no resources, so resources/list is a protocol error
    # (an MCPError on the client), not an isError result.
    async with connect(mode) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.list_resources()
    assert excinfo.value.error.code == METHOD_NOT_FOUND


async def test_ping_is_served_only_in_the_legacy_era() -> None:
    # ping is removed in 2026-07-28; the legacy era keeps answering it.
    async with connect("legacy") as client:
        await client.session.send_ping()
    async with connect(MODERN) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.session.send_ping()
    assert excinfo.value.error.code == METHOD_NOT_FOUND
