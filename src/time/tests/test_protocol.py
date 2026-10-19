# Protocol-level tests for mcp-server-time, driven through the MCP protocol
# in-process (#4855, #5174).
#
# Each test runs the real `serve()` coroutine with the SDK's `stdio_server`
# swapped for an in-memory stream pair, and talks to it with a real
# `ClientSession`. That exercises what a client actually sees: `MCPServer`'s
# argument validation, the `isError` results a tool's `ToolError` becomes,
# the JSON-RPC error for an unknown tool, the advertised tool schemas and the
# initialize handshake. The pure helpers in `server.py` are covered directly
# in `test_server.py`.
#
# Assertions compare wire JSON (`model_dump(by_alias=True, mode="json")`)
# rather than SDK attribute names wherever practical.
#
# Time is frozen with `frozen_at()`, which swaps the server module's
# `datetime` for a subclass whose `now()` returns a fixed instant. freezegun is
# not used here: its fake `now(tz)` drops `fold`, so during a fall-back hour it
# reports the first occurrence's offset for an instant in the second (it would
# claim 01:30 UTC on 2024-10-27 is 01:30+01:00 in London).

import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, tzinfo
from importlib.metadata import version
from typing import Any
from unittest.mock import patch

import anyio
import pytest
from mcp import ClientSession
from mcp.shared.exceptions import MCPError
from mcp.shared.memory import create_client_server_memory_streams
from mcp.shared.message import SessionMessage
from mcp.types import INVALID_PARAMS, JSONRPCRequest
from pydantic import BaseModel

from mcp_server_time.server import serve


@contextmanager
def frozen_at(instant: str) -> Iterator[None]:
    """Make `datetime.now()` inside the server return `instant`."""
    timestamp = datetime.fromisoformat(instant).timestamp()

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz: tzinfo | None = None):
            return cls.fromtimestamp(timestamp, tz)

    with patch("mcp_server_time.server.datetime", FrozenDatetime):
        yield


def wire(model: BaseModel) -> Any:
    """Serialize an SDK model the way it travels over the wire."""
    # exclude_unset: SDK v2 result models default fields the 2025-11-25 wire
    # does not carry (resultType, ttlMs, cacheScope), so only what the server
    # actually sent is compared.
    return model.model_dump(
        by_alias=True, mode="json", exclude_none=True, exclude_unset=True
    )


@asynccontextmanager
async def serving(
    local_timezone: str | None = "Europe/Warsaw",
) -> AsyncIterator[ClientSession]:
    """Run `serve()` over in-memory streams and yield a not-yet-initialized client."""
    async with create_client_server_memory_streams() as (
        client_streams,
        server_streams,
    ):

        @asynccontextmanager
        async def fake_stdio_server():
            yield server_streams

        with patch("mcp.server.mcpserver.server.stdio_server", fake_stdio_server):
            async with anyio.create_task_group() as tg:
                tg.start_soon(serve, local_timezone)
                async with ClientSession(*client_streams) as session:
                    yield session
                tg.cancel_scope.cancel()


@asynccontextmanager
async def connected(
    local_timezone: str | None = "Europe/Warsaw",
) -> AsyncIterator[ClientSession]:
    """Run `serve()` in-process and yield an initialized client."""
    async with serving(local_timezone) as session:
        await session.initialize()
        yield session


async def call(session: ClientSession, name: str, arguments: dict[str, Any]) -> Any:
    """Call a tool and return the wire form of its result."""
    return wire(await session.call_tool(name, arguments))


async def call_json(
    session: ClientSession, name: str, arguments: dict[str, Any]
) -> Any:
    """Call a tool that succeeds and return the JSON object in its text block."""
    result = await call(session, name, arguments)
    assert result["isError"] is False, result
    assert len(result["content"]) == 1
    assert result["content"][0]["type"] == "text"
    return json.loads(result["content"][0]["text"])


def error_result(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "isError": True}


def tool_error(tool: str, message: str) -> dict[str, Any]:
    """A `ToolError` the tool raised, as the client receives it."""
    return error_result(f"Error executing tool {tool}: {message}")


def assert_validation_error(result: dict[str, Any], tool: str, *needles: str) -> None:
    """An argument `MCPServer` rejected against the tool's signature.

    The text is pydantic's, so only its stable parts are pinned: the tool, the
    argument and the reason.
    """
    assert result["isError"] is True, result
    assert len(result["content"]) == 1
    text = result["content"][0]["text"]
    assert text.startswith(
        f"Error executing tool {tool}: 1 validation error for {tool}Arguments\n"
    ), text
    for needle in needles:
        assert needle in text, (needle, text)


# ---------------------------------------------------------------------------
# Initialize handshake
# ---------------------------------------------------------------------------


async def test_initialize_reports_server_info_and_capabilities() -> None:
    async with serving("UTC") as session:
        init = wire(await session.initialize())

    # #360: serverInfo.version is mcp-server-time's own version (from
    # pyproject.toml via the installed metadata), not the `mcp` SDK's.
    assert init["serverInfo"] == {
        "name": "mcp-time",
        "version": version("mcp-server-time"),
    }
    assert init["serverInfo"]["version"] != version("mcp")
    # MCPServer serves prompts/list and resources/list for every server, so
    # both are advertised even though this one registers neither (both lists
    # are empty). No logging. Nothing claims listChanged: the tools are fixed.
    assert init["capabilities"] == {
        "prompts": {"listChanged": False},
        "resources": {"subscribe": False, "listChanged": False},
        "tools": {"listChanged": False},
    }
    assert "instructions" not in init


# ---------------------------------------------------------------------------
# tools/list
# ---------------------------------------------------------------------------

READ_ONLY_ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}


TIME_RESULT_SCHEMA = {
    "type": "object",
    "title": "TimeResult",
    "properties": {
        "timezone": {"title": "Timezone", "type": "string"},
        "datetime": {"title": "Datetime", "type": "string"},
        "day_of_week": {"title": "Day Of Week", "type": "string"},
        "is_dst": {"title": "Is Dst", "type": "boolean"},
    },
    "required": ["timezone", "datetime", "day_of_week", "is_dst"],
}


def expected_tools(local_tz: str) -> list[dict[str, Any]]:
    # Names, descriptions, argument names, required sets and annotations are
    # the published interface and do not change with the move to MCPServer
    # (#5174). MCPServer adds a `title` to each input schema and property, and
    # an `outputSchema` derived from the result model.
    return [
        {
            "name": "get_current_time",
            "description": "Get current time in a specific timezone",
            "inputSchema": {
                "type": "object",
                "title": "get_current_timeArguments",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "title": "Timezone",
                        "description": (
                            "IANA timezone name (e.g., 'America/New_York', "
                            f"'Europe/London'). Use '{local_tz}' as local timezone "
                            "if no timezone provided by the user."
                        ),
                    }
                },
                "required": ["timezone"],
            },
            "outputSchema": TIME_RESULT_SCHEMA,
            "annotations": READ_ONLY_ANNOTATIONS,
        },
        {
            "name": "convert_time",
            "description": "Convert time between timezones",
            "inputSchema": {
                "type": "object",
                "title": "convert_timeArguments",
                "properties": {
                    "source_timezone": {
                        "type": "string",
                        "title": "Source Timezone",
                        "description": (
                            "Source IANA timezone name (e.g., 'America/New_York', "
                            f"'Europe/London'). Use '{local_tz}' as local timezone "
                            "if no source timezone provided by the user."
                        ),
                    },
                    "time": {
                        "type": "string",
                        "title": "Time",
                        "description": "Time to convert in 24-hour format (HH:MM)",
                    },
                    "target_timezone": {
                        "type": "string",
                        "title": "Target Timezone",
                        "description": (
                            "Target IANA timezone name (e.g., 'Asia/Tokyo', "
                            f"'America/San_Francisco'). Use '{local_tz}' as local "
                            "timezone if no target timezone provided by the user."
                        ),
                    },
                },
                "required": ["source_timezone", "time", "target_timezone"],
            },
            "outputSchema": {
                "type": "object",
                "title": "TimeConversionResult",
                "properties": {
                    "source": {"$ref": "#/$defs/TimeResult"},
                    "target": {"$ref": "#/$defs/TimeResult"},
                    "time_difference": {"title": "Time Difference", "type": "string"},
                },
                "required": ["source", "target", "time_difference"],
                "$defs": {"TimeResult": TIME_RESULT_SCHEMA},
            },
            "annotations": READ_ONLY_ANNOTATIONS,
        },
    ]


async def test_list_tools_with_local_timezone_override() -> None:
    async with connected("Europe/Warsaw") as session:
        result = wire(await session.list_tools())
    # No tool title, icons or pagination cursor.
    assert result == {"tools": expected_tools("Europe/Warsaw")}


async def test_list_tools_uses_detected_local_timezone() -> None:
    with patch("mcp_server_time.server.get_localzone_name", return_value="Asia/Tokyo"):
        async with connected(None) as session:
            result = wire(await session.list_tools())
    assert result == {"tools": expected_tools("Asia/Tokyo")}


async def test_list_tools_falls_back_to_utc_when_local_timezone_unknown() -> None:
    with patch("mcp_server_time.server.get_localzone_name", return_value=None):
        async with connected(None) as session:
            result = wire(await session.list_tools())
    assert result == {"tools": expected_tools("UTC")}


async def test_empty_local_timezone_override_is_treated_as_absent() -> None:
    # `--local-timezone ""` is falsy, so detection runs instead.
    with patch(
        "mcp_server_time.server.get_localzone_name", return_value="Africa/Cairo"
    ):
        async with connected("") as session:
            result = wire(await session.list_tools())
    assert result == {"tools": expected_tools("Africa/Cairo")}


@pytest.mark.parametrize(
    "local_timezone",
    [
        "Not/AZone",  # unknown name: ZoneInfoNotFoundError
        "America",  # a tzdata directory, not a zone: OSError
        "../etc/passwd",  # outside TZPATH: ValueError
        "europe/warsaw",  # not the exact key, on any filesystem (#5060)
    ],
)
async def test_invalid_local_timezone_fails_before_the_transport_opens(
    local_timezone: str,
) -> None:
    # An invalid `--local-timezone` stops `serve()` before stdio is opened,
    # with a one-line message naming the value and a non-zero exit, rather
    # than a traceback (#5001). A `SystemExit` whose code is a string prints
    # that string to stderr and exits 1.
    def unexpected_stdio_server():
        raise AssertionError("stdio_server must not be reached")

    with patch("mcp.server.mcpserver.server.stdio_server", unexpected_stdio_server):
        with pytest.raises(SystemExit) as exit_info:
            await serve(local_timezone)
    assert exit_info.value.code == (
        f"Error: invalid --local-timezone {local_timezone!r}: "
        "not a known IANA timezone name"
    )


# ---------------------------------------------------------------------------
# tools/call get_current_time
# ---------------------------------------------------------------------------


async def test_get_current_time_wire_result() -> None:
    async with connected() as session:
        with frozen_at("2024-01-01 12:00:00+00:00"):
            result = await call(session, "get_current_time", {"timezone": "UTC"})
    # The result model as structuredContent, and the same object as indented
    # JSON in one text block for a client that does not read structured output.
    expected = {
        "timezone": "UTC",
        "datetime": "2024-01-01T12:00:00+00:00",
        "day_of_week": "Monday",
        "is_dst": False,
    }
    assert result == {
        "content": [{"type": "text", "text": json.dumps(expected, indent=2)}],
        "structuredContent": expected,
        "isError": False,
    }


@pytest.mark.parametrize(
    "instant,timezone,expected_datetime,day_of_week,is_dst",
    [
        # Northern hemisphere, winter and summer.
        (
            "2024-01-01 12:00:00+00:00",
            "Europe/Warsaw",
            "2024-01-01T13:00:00+01:00",
            "Monday",
            False,
        ),
        (
            "2024-07-01 12:00:00+00:00",
            "Europe/Warsaw",
            "2024-07-01T14:00:00+02:00",
            "Monday",
            True,
        ),
        (
            "2024-01-01 12:00:00+00:00",
            "America/New_York",
            "2024-01-01T07:00:00-05:00",
            "Monday",
            False,
        ),
        # Southern hemisphere: DST in January.
        (
            "2024-01-01 12:00:00+00:00",
            "Australia/Sydney",
            "2024-01-01T23:00:00+11:00",
            "Monday",
            True,
        ),
        (
            "2024-07-01 12:00:00+00:00",
            "Australia/Sydney",
            "2024-07-01T22:00:00+10:00",
            "Monday",
            False,
        ),
        # US spring-forward: the last second of EST, then the first of EDT.
        (
            "2024-03-10 06:59:59+00:00",
            "America/New_York",
            "2024-03-10T01:59:59-05:00",
            "Sunday",
            False,
        ),
        (
            "2024-03-10 07:00:00+00:00",
            "America/New_York",
            "2024-03-10T03:00:00-04:00",
            "Sunday",
            True,
        ),
        # UK fall-back: 01:00 local happens twice, once in BST then in GMT.
        (
            "2024-10-27 00:30:00+00:00",
            "Europe/London",
            "2024-10-27T01:30:00+01:00",
            "Sunday",
            True,
        ),
        (
            "2024-10-27 01:30:00+00:00",
            "Europe/London",
            "2024-10-27T01:30:00+00:00",
            "Sunday",
            False,
        ),
        # Half-hour DST shift and a 45-minute standard offset.
        (
            "2024-01-01 12:00:00+00:00",
            "Australia/Lord_Howe",
            "2024-01-01T23:00:00+11:00",
            "Monday",
            True,
        ),
        (
            "2024-01-01 12:00:00+00:00",
            "Asia/Kathmandu",
            "2024-01-01T17:45:00+05:45",
            "Monday",
            False,
        ),
        # Date line: already the next day.
        (
            "2024-01-01 12:00:00+00:00",
            "Pacific/Kiritimati",
            "2024-01-02T02:00:00+14:00",
            "Tuesday",
            False,
        ),
        # Behind UTC: still the previous day.
        (
            "2024-01-01 05:00:00+00:00",
            "Pacific/Pago_Pago",
            "2023-12-31T18:00:00-11:00",
            "Sunday",
            False,
        ),
        # Non-region keys that ZoneInfo also accepts.
        (
            "2024-07-01 12:00:00+00:00",
            "UTC",
            "2024-07-01T12:00:00+00:00",
            "Monday",
            False,
        ),
        (
            "2024-07-01 12:00:00+00:00",
            "Etc/GMT+5",
            "2024-07-01T07:00:00-05:00",
            "Monday",
            False,
        ),
        (
            "2024-07-01 12:00:00+00:00",
            "EST5EDT",
            "2024-07-01T08:00:00-04:00",
            "Monday",
            True,
        ),
    ],
)
async def test_get_current_time_across_zones_and_dst(
    instant: str,
    timezone: str,
    expected_datetime: str,
    day_of_week: str,
    is_dst: bool,
) -> None:
    async with connected() as session:
        with frozen_at(instant):
            result = await call_json(
                session, "get_current_time", {"timezone": timezone}
            )
    assert result == {
        "timezone": timezone,
        "datetime": expected_datetime,
        "day_of_week": day_of_week,
        "is_dst": is_dst,
    }


async def test_get_current_time_echoes_the_requested_name_not_a_canonical_one() -> None:
    # Aliases resolve, but the reply echoes what the client sent.
    async with connected() as session:
        with frozen_at("2024-01-01 12:00:00+00:00"):
            result = await call_json(
                session, "get_current_time", {"timezone": "US/Eastern"}
            )
    assert result["timezone"] == "US/Eastern"
    assert result["datetime"] == "2024-01-01T07:00:00-05:00"


async def test_get_current_time_ignores_extra_arguments() -> None:
    async with connected() as session:
        with frozen_at("2024-01-01 12:00:00+00:00"):
            result = await call_json(
                session, "get_current_time", {"timezone": "UTC", "extra": 1}
            )
    assert result["datetime"] == "2024-01-01T12:00:00+00:00"


async def test_get_current_time_does_not_default_to_the_local_timezone() -> None:
    # The local timezone only appears in the schema descriptions; the server
    # never substitutes it for an empty argument.
    async with connected("Europe/Warsaw") as session:
        result = await call(session, "get_current_time", {"timezone": ""})
    assert result == tool_error(
        "get_current_time", "Missing required argument: timezone"
    )


@pytest.mark.parametrize(
    "arguments,needles",
    [
        # Rejected by MCPServer against the tool's signature, before it runs.
        ({}, ["timezone\n  Field required [type=missing"]),
        ({"timezone": 5}, ["timezone\n  Input should be a valid string"]),
        ({"timezone": None}, ["timezone\n  Input should be a valid string"]),
    ],
)
async def test_get_current_time_argument_validation(
    arguments: dict[str, Any], needles: list[str]
) -> None:
    async with connected() as session:
        result = await call(session, "get_current_time", arguments)
    assert_validation_error(result, "get_current_time", *needles)


@pytest.mark.parametrize(
    "arguments,message",
    [
        # Raised by the tool as a ToolError.
        ({"timezone": ""}, "Missing required argument: timezone"),
        (
            {"timezone": "Invalid/Timezone"},
            "Invalid timezone: 'No time zone found with key Invalid/Timezone'",
        ),
        (
            {"timezone": "europe/warsaw"},
            "Invalid timezone: 'No time zone found with key europe/warsaw'",
        ),
        (
            {"timezone": "../etc/passwd"},
            "Invalid timezone: ZoneInfo keys must refer to subdirectories of TZPATH, got: ../etc/passwd",
        ),
        (
            {"timezone": "/etc/localtime"},
            "Invalid timezone: ZoneInfo keys may not be absolute paths, got: /etc/localtime",
        ),
    ],
)
async def test_get_current_time_errors(arguments: dict[str, Any], message: str) -> None:
    async with connected() as session:
        result = await call(session, "get_current_time", arguments)
    assert result == tool_error("get_current_time", message)


# ---------------------------------------------------------------------------
# tools/call convert_time
# ---------------------------------------------------------------------------


async def test_convert_time_wire_result() -> None:
    async with connected() as session:
        with frozen_at("2024-01-01 00:00:00+00:00"):
            result = await call(
                session,
                "convert_time",
                {
                    "source_timezone": "Europe/Warsaw",
                    "time": "12:00",
                    "target_timezone": "Asia/Tokyo",
                },
            )
    expected = {
        "source": {
            "timezone": "Europe/Warsaw",
            "datetime": "2024-01-01T12:00:00+01:00",
            "day_of_week": "Monday",
            "is_dst": False,
        },
        "target": {
            "timezone": "Asia/Tokyo",
            "datetime": "2024-01-01T20:00:00+09:00",
            "day_of_week": "Monday",
            "is_dst": False,
        },
        "time_difference": "+8.0h",
    }
    assert result == {
        "content": [{"type": "text", "text": json.dumps(expected, indent=2)}],
        "structuredContent": expected,
        "isError": False,
    }


@pytest.mark.parametrize(
    "instant,source,time,target,source_dt,target_dt,target_dst,difference",
    [
        # Whole-hour differences carry one decimal place.
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/London",
            "12:00",
            "Europe/Warsaw",
            "2024-01-01T12:00:00+00:00",
            "2024-01-01T13:00:00+01:00",
            False,
            "+1.0h",
        ),
        (
            "2024-01-01 00:00:00+00:00",
            "UTC",
            "12:00",
            "UTC",
            "2024-01-01T12:00:00+00:00",
            "2024-01-01T12:00:00+00:00",
            False,
            "+0.0h",
        ),
        # Fractional differences are trimmed: +5.75h, +5.5h, -4.75h.
        (
            "2024-01-01 00:00:00+00:00",
            "UTC",
            "12:00",
            "Asia/Kathmandu",
            "2024-01-01T12:00:00+00:00",
            "2024-01-01T17:45:00+05:45",
            False,
            "+5.75h",
        ),
        (
            "2024-01-01 00:00:00+00:00",
            "UTC",
            "12:00",
            "Asia/Kolkata",
            "2024-01-01T12:00:00+00:00",
            "2024-01-01T17:30:00+05:30",
            False,
            "+5.5h",
        ),
        (
            "2024-01-01 00:00:00+00:00",
            "Asia/Kathmandu",
            "12:00",
            "Europe/Warsaw",
            "2024-01-01T12:00:00+05:45",
            "2024-01-01T07:15:00+01:00",
            False,
            "-4.75h",
        ),
        # The week Europe has left DST and the US has not.
        (
            "2024-10-28 00:00:00+00:00",
            "Europe/Warsaw",
            "12:00",
            "America/New_York",
            "2024-10-28T12:00:00+01:00",
            "2024-10-28T07:00:00-04:00",
            True,
            "-5.0h",
        ),
        # Crossing the date line moves the day forward.
        (
            "2024-01-01 00:00:00+00:00",
            "Europe/Warsaw",
            "23:00",
            "Pacific/Kiritimati",
            "2024-01-01T23:00:00+01:00",
            "2024-01-02T12:00:00+14:00",
            False,
            "+13.0h",
        ),
        # And backwards.
        (
            "2024-01-01 00:00:00+00:00",
            "UTC",
            "05:00",
            "Pacific/Pago_Pago",
            "2024-01-01T05:00:00+00:00",
            "2023-12-31T18:00:00-11:00",
            False,
            "-11.0h",
        ),
        # Single-digit hour and minute are accepted by strptime's %H:%M.
        (
            "2024-01-01 00:00:00+00:00",
            "UTC",
            "9:5",
            "UTC",
            "2024-01-01T09:05:00+00:00",
            "2024-01-01T09:05:00+00:00",
            False,
            "+0.0h",
        ),
        (
            "2024-01-01 00:00:00+00:00",
            "UTC",
            "00:00",
            "UTC",
            "2024-01-01T00:00:00+00:00",
            "2024-01-01T00:00:00+00:00",
            False,
            "+0.0h",
        ),
        (
            "2024-01-01 00:00:00+00:00",
            "UTC",
            "23:59",
            "UTC",
            "2024-01-01T23:59:00+00:00",
            "2024-01-01T23:59:00+00:00",
            False,
            "+0.0h",
        ),
    ],
)
async def test_convert_time_offsets(
    instant: str,
    source: str,
    time: str,
    target: str,
    source_dt: str,
    target_dt: str,
    target_dst: bool,
    difference: str,
) -> None:
    async with connected() as session:
        with frozen_at(instant):
            result = await call_json(
                session,
                "convert_time",
                {"source_timezone": source, "time": time, "target_timezone": target},
            )
    assert result["source"]["timezone"] == source
    assert result["source"]["datetime"] == source_dt
    assert result["target"]["timezone"] == target
    assert result["target"]["datetime"] == target_dt
    assert result["target"]["is_dst"] is target_dst
    assert result["time_difference"] == difference


async def test_convert_time_anchors_to_today_in_the_source_timezone() -> None:
    # The date is "now" in the SOURCE timezone, not in UTC or the local zone.
    # At 2024-01-01 20:00 UTC it is already Jan 2 in Tokyo.
    async with connected() as session:
        with frozen_at("2024-01-01 20:00:00+00:00"):
            result = await call_json(
                session,
                "convert_time",
                {
                    "source_timezone": "Asia/Tokyo",
                    "time": "09:00",
                    "target_timezone": "UTC",
                },
            )
    assert result["source"]["datetime"] == "2024-01-02T09:00:00+09:00"
    assert result["source"]["day_of_week"] == "Tuesday"
    assert result["target"]["datetime"] == "2024-01-02T00:00:00+00:00"


async def test_convert_time_into_a_nonexistent_local_time() -> None:
    # 02:30 on 2024-03-10 does not exist in New York (clocks jump 02:00 ->
    # 03:00), so the conversion is rejected rather than reporting a
    # wall-clock time that never happened (#5002).
    async with connected() as session:
        with frozen_at("2024-03-10 12:00:00+00:00"):
            result = await call(
                session,
                "convert_time",
                {
                    "source_timezone": "America/New_York",
                    "time": "02:30",
                    "target_timezone": "UTC",
                },
            )
    assert result == tool_error(
        "convert_time",
        "Invalid time: 02:30 does not exist in America/New_York on 2024-03-10 "
        "(skipped by a clock change)",
    )


async def test_convert_time_at_an_ambiguous_local_time() -> None:
    # 01:30 on 2024-11-03 happens twice in New York. fold=0 picks the first
    # occurrence, still on EDT.
    async with connected() as session:
        with frozen_at("2024-11-03 12:00:00+00:00"):
            result = await call_json(
                session,
                "convert_time",
                {
                    "source_timezone": "America/New_York",
                    "time": "01:30",
                    "target_timezone": "UTC",
                },
            )
    assert result["source"] == {
        "timezone": "America/New_York",
        "datetime": "2024-11-03T01:30:00-04:00",
        "day_of_week": "Sunday",
        "is_dst": True,
    }
    assert result["target"]["datetime"] == "2024-11-03T05:30:00+00:00"
    assert result["time_difference"] == "+4.0h"


async def test_convert_time_difference_uses_offsets_at_the_converted_instant() -> None:
    # On Europe's fall-back day, 00:30 London is still BST and 12:00 is GMT,
    # so the same pair of zones reports different differences.
    async with connected() as session:
        with frozen_at("2024-10-27 12:00:00+00:00"):
            early = await call_json(
                session,
                "convert_time",
                {
                    "source_timezone": "Europe/London",
                    "time": "00:30",
                    "target_timezone": "America/New_York",
                },
            )
            late = await call_json(
                session,
                "convert_time",
                {
                    "source_timezone": "Europe/London",
                    "time": "12:00",
                    "target_timezone": "America/New_York",
                },
            )
    assert early["source"]["is_dst"] is True
    assert early["time_difference"] == "-5.0h"
    assert late["source"]["is_dst"] is False
    assert late["time_difference"] == "-4.0h"


async def test_convert_time_ignores_extra_arguments() -> None:
    async with connected() as session:
        with frozen_at("2024-01-01 00:00:00+00:00"):
            result = await call_json(
                session,
                "convert_time",
                {
                    "source_timezone": "UTC",
                    "time": "12:00",
                    "target_timezone": "UTC",
                    "target_tz_list": ["Asia/Tokyo"],
                },
            )
    assert result["target"]["timezone"] == "UTC"


@pytest.mark.parametrize(
    "arguments,needles",
    [
        # Rejected by MCPServer against the tool's signature, before it runs.
        (
            {"source_timezone": "UTC", "time": "12:00"},
            ["target_timezone\n  Field required [type=missing"],
        ),
        (
            {"time": "12:00", "target_timezone": "UTC"},
            ["source_timezone\n  Field required [type=missing"],
        ),
        (
            {"source_timezone": "UTC", "time": 1200, "target_timezone": "UTC"},
            ["time\n  Input should be a valid string"],
        ),
    ],
)
async def test_convert_time_argument_validation(
    arguments: dict[str, Any], needles: list[str]
) -> None:
    async with connected() as session:
        result = await call(session, "convert_time", arguments)
    assert_validation_error(result, "convert_time", *needles)


@pytest.mark.parametrize(
    "arguments,message",
    [
        # Raised by the tool as a ToolError.
        (
            {"source_timezone": "Bad/Zone", "time": "12:00", "target_timezone": "UTC"},
            "Invalid timezone: 'No time zone found with key Bad/Zone'",
        ),
        (
            {"source_timezone": "UTC", "time": "12:00", "target_timezone": "Bad/Zone"},
            "Invalid timezone: 'No time zone found with key Bad/Zone'",
        ),
        # Like get_current_time, an empty timezone is reported as a missing
        # argument rather than as zoneinfo's own message.
        (
            {"source_timezone": "", "time": "12:00", "target_timezone": "UTC"},
            "Missing required argument: source_timezone",
        ),
        (
            {"source_timezone": "UTC", "time": "12:00", "target_timezone": ""},
            "Missing required argument: target_timezone",
        ),
    ],
)
async def test_convert_time_argument_errors(
    arguments: dict[str, Any], message: str
) -> None:
    async with connected() as session:
        result = await call(session, "convert_time", arguments)
    assert result == tool_error("convert_time", message)


@pytest.mark.parametrize(
    "time",
    ["25:00", "12:60", "24:00", "", "noon", "12", "12:00:00", "12:00 PM", "-1:00"],
)
async def test_convert_time_rejects_bad_time_strings(time: str) -> None:
    async with connected() as session:
        result = await call(
            session,
            "convert_time",
            {"source_timezone": "UTC", "time": time, "target_timezone": "UTC"},
        )
    assert result == tool_error(
        "convert_time", "Invalid time format. Expected HH:MM [24-hour format]"
    )


async def test_convert_time_checks_timezones_before_the_time_string() -> None:
    async with connected() as session:
        result = await call(
            session,
            "convert_time",
            {"source_timezone": "UTC", "time": "nope", "target_timezone": "Bad/Zone"},
        )
    assert result == tool_error(
        "convert_time", "Invalid timezone: 'No time zone found with key Bad/Zone'"
    )


# ---------------------------------------------------------------------------
# Unknown tools
# ---------------------------------------------------------------------------


async def test_unknown_tool_is_a_protocol_error() -> None:
    # Both spec revisions make an unknown tool a JSON-RPC -32602 error, not an
    # isError result (#5174). Era by era coverage is in test_eras.py.
    async with connected() as session:
        with pytest.raises(MCPError) as excinfo:
            await session.call_tool("no_such_tool", {"timezone": "UTC"})
    assert excinfo.value.error.code == INVALID_PARAMS
    assert excinfo.value.error.message == "Unknown tool: no_such_tool"


async def test_session_survives_errors() -> None:
    # A failed call does not take the server down.
    async with connected() as session:
        with pytest.raises(MCPError):
            await session.call_tool("no_such_tool", {})
        await call(session, "get_current_time", {"timezone": "Bad/Zone"})
        result = await call(session, "get_current_time", {"timezone": "UTC"})
    assert result["isError"] is False


# ---------------------------------------------------------------------------
# Protocol era
# ---------------------------------------------------------------------------


async def test_server_discover_answers_the_2026_07_28_era() -> None:
    # #4853: serve() serves the 2026-07-28 era beside the 2025-11-25 handshake.
    # A `server/discover` carrying the per-request `_meta` envelope opens it.
    # Asserted on the raw JSON-RPC response, so the fields the 2026-07-28
    # spec requires on a result (resultType, ttlMs, cacheScope) are pinned as
    # the server sends them, not as a client model would default them. Era by
    # era behavior through a real client is in test_eras.py.
    #
    # Replaces #4851's test_modern_era_is_not_served, which pinned this request
    # being refused with -32601 "Method not found" until this issue landed.
    discover = JSONRPCRequest(
        jsonrpc="2.0",
        id=1,
        method="server/discover",
        params={
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": {"name": "test", "version": "0"},
                "io.modelcontextprotocol/clientCapabilities": {},
            }
        },
    )
    response: SessionMessage | Exception | None = None
    async with create_client_server_memory_streams() as (
        (client_read, client_write),
        server_streams,
    ):

        @asynccontextmanager
        async def fake_stdio_server() -> AsyncIterator[Any]:
            yield server_streams

        with patch("mcp.server.mcpserver.server.stdio_server", fake_stdio_server):
            async with anyio.create_task_group() as tg:
                tg.start_soon(serve, "UTC")
                await client_write.send(SessionMessage(discover))
                with anyio.fail_after(5):
                    response = await client_read.receive()
                tg.cancel_scope.cancel()

    assert isinstance(response, SessionMessage)
    assert response.message.model_dump(by_alias=True, exclude_none=True) == {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
            # The same capabilities as the 2025-11-25 handshake; with
            # subscriptions/listen unserved, none claims listChanged.
            "capabilities": {
                "prompts": {"listChanged": False},
                "resources": {"subscribe": False, "listChanged": False},
                "tools": {"listChanged": False},
            },
            "supportedVersions": ["2026-07-28"],
            "resultType": "complete",
            "ttlMs": 0,
            "cacheScope": "private",
            "_meta": {
                "io.modelcontextprotocol/serverInfo": {
                    "name": "mcp-time",
                    "version": version("mcp-server-time"),
                }
            },
        },
    }
