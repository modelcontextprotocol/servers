# Characterization tests for mcp-server-time, driven through the MCP protocol
# in-process (#4855).
#
# Each test runs the real `serve()` coroutine with `stdio_server` swapped for
# an in-memory stream pair, and talks to it with a real `ClientSession`. That
# exercises what a client actually sees: the SDK's input validation, its
# folding of handler exceptions into `isError` results, the advertised tool
# schemas and the initialize handshake. The pure helpers in `server.py` are
# covered directly in `test_server.py`.
#
# These tests pin CURRENT behavior on `mcp` 1.x, including behavior open issues
# want changed, so that the SDK v2 port (#4851) has a regression net and any
# intended change shows up as a failing assertion. Assertions compare wire JSON
# (`model_dump(by_alias=True, mode="json")`) rather than SDK attribute names
# wherever practical, so the snake_case renames in SDK v2 do not force a
# rewrite.
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
from mcp.shared.memory import create_client_server_memory_streams
from pydantic import BaseModel
from zoneinfo import ZoneInfoNotFoundError

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
    return model.model_dump(by_alias=True, mode="json", exclude_none=True)


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

        with patch("mcp_server_time.server.stdio_server", fake_stdio_server):
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


def handler_error(message: str) -> dict[str, Any]:
    """An exception raised in the server's handler, as the client receives it."""
    return error_result(f"Error processing mcp-server-time query: {message}")


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
    # Only tools are advertised; no resources, prompts or logging.
    assert init["capabilities"] == {"experimental": {}, "tools": {"listChanged": False}}
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


def expected_tools(local_tz: str) -> list[dict[str, Any]]:
    # Names and descriptions are pinned as they are today. #3201 and #2853
    # request changes to them; a fix will change this fixture.
    return [
        {
            "name": "get_current_time",
            "description": "Get current time in a specific timezone",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": (
                            "IANA timezone name (e.g., 'America/New_York', "
                            f"'Europe/London'). Use '{local_tz}' as local timezone "
                            "if no timezone provided by the user."
                        ),
                    }
                },
                "required": ["timezone"],
            },
            "annotations": READ_ONLY_ANNOTATIONS,
        },
        {
            "name": "convert_time",
            "description": "Convert time between timezones",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source_timezone": {
                        "type": "string",
                        "description": (
                            "Source IANA timezone name (e.g., 'America/New_York', "
                            f"'Europe/London'). Use '{local_tz}' as local timezone "
                            "if no source timezone provided by the user."
                        ),
                    },
                    "time": {
                        "type": "string",
                        "description": "Time to convert in 24-hour format (HH:MM)",
                    },
                    "target_timezone": {
                        "type": "string",
                        "description": (
                            "Target IANA timezone name (e.g., 'Asia/Tokyo', "
                            f"'America/San_Francisco'). Use '{local_tz}' as local "
                            "timezone if no target timezone provided by the user."
                        ),
                    },
                },
                "required": ["source_timezone", "time", "target_timezone"],
            },
            "annotations": READ_ONLY_ANNOTATIONS,
        },
    ]


async def test_list_tools_with_local_timezone_override() -> None:
    async with connected("Europe/Warsaw") as session:
        result = wire(await session.list_tools())
    # No title, outputSchema, icons or pagination cursor.
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


# KNOWN BUG #5001: an invalid --local-timezone crashes serve() with a traceback instead of a clean error; the fix changes this assertion.
async def test_invalid_local_timezone_fails_before_the_transport_opens() -> None:
    # An unknown `--local-timezone` raises out of `serve()` itself, before
    # stdio is opened: the process dies with a traceback instead of starting.
    def unexpected_stdio_server():
        raise AssertionError("stdio_server must not be reached")

    with patch("mcp_server_time.server.stdio_server", unexpected_stdio_server):
        with pytest.raises(ZoneInfoNotFoundError, match="Not/AZone"):
            await serve("Not/AZone")


# ---------------------------------------------------------------------------
# tools/call get_current_time
# ---------------------------------------------------------------------------


async def test_get_current_time_wire_result() -> None:
    async with connected() as session:
        with frozen_at("2024-01-01 12:00:00+00:00"):
            result = await call(session, "get_current_time", {"timezone": "UTC"})
    # Exactly one text block holding indented JSON; no structuredContent.
    assert result == {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "timezone": "UTC",
                        "datetime": "2024-01-01T12:00:00+00:00",
                        "day_of_week": "Monday",
                        "is_dst": False,
                    },
                    indent=2,
                ),
            }
        ],
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
    assert result == handler_error("Missing required argument: timezone")


@pytest.mark.parametrize(
    "arguments,expected",
    [
        # Rejected by the SDK's input validation against inputSchema, before
        # the handler runs.
        ({}, error_result("Input validation error: 'timezone' is a required property")),
        (
            {"timezone": 5},
            error_result("Input validation error: 5 is not of type 'string'"),
        ),
        (
            {"timezone": None},
            error_result("Input validation error: None is not of type 'string'"),
        ),
        # Raised by the handler and folded into an error result by the SDK.
        ({"timezone": ""}, handler_error("Missing required argument: timezone")),
        (
            {"timezone": "Invalid/Timezone"},
            handler_error(
                "Invalid timezone: 'No time zone found with key Invalid/Timezone'"
            ),
        ),
        (
            {"timezone": "europe/warsaw"},
            handler_error(
                "Invalid timezone: 'No time zone found with key europe/warsaw'"
            ),
        ),
        (
            {"timezone": "../etc/passwd"},
            handler_error(
                "Invalid timezone: ZoneInfo keys must refer to subdirectories of TZPATH, got: ../etc/passwd"
            ),
        ),
        (
            {"timezone": "/etc/localtime"},
            handler_error(
                "Invalid timezone: ZoneInfo keys may not be absolute paths, got: /etc/localtime"
            ),
        ),
    ],
)
async def test_get_current_time_errors(
    arguments: dict[str, Any], expected: dict[str, Any]
) -> None:
    async with connected() as session:
        result = await call(session, "get_current_time", arguments)
    assert result == expected


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
    assert result == {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
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
                    },
                    indent=2,
                ),
            }
        ],
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
    assert result == handler_error(
        "Invalid time: 02:30 does not exist in America/New_York on 2024-03-10 "
        "(skipped by a clock change)"
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


# KNOWN BUG #5003: an empty source_timezone surfaces zoneinfo's raw message, unlike get_current_time's "Missing required argument"; the fix changes this assertion.
@pytest.mark.parametrize(
    "arguments,expected",
    [
        # Rejected by the SDK's input validation, before the handler runs. A
        # missing key never reaches the handler's own "Missing required
        # arguments" check, which is why that branch is marked unreachable.
        (
            {"source_timezone": "UTC", "time": "12:00"},
            error_result(
                "Input validation error: 'target_timezone' is a required property"
            ),
        ),
        (
            {"time": "12:00", "target_timezone": "UTC"},
            error_result(
                "Input validation error: 'source_timezone' is a required property"
            ),
        ),
        (
            {"source_timezone": "UTC", "time": 1200, "target_timezone": "UTC"},
            error_result("Input validation error: 1200 is not of type 'string'"),
        ),
        # Raised by the handler.
        (
            {"source_timezone": "Bad/Zone", "time": "12:00", "target_timezone": "UTC"},
            handler_error("Invalid timezone: 'No time zone found with key Bad/Zone'"),
        ),
        (
            {"source_timezone": "UTC", "time": "12:00", "target_timezone": "Bad/Zone"},
            handler_error("Invalid timezone: 'No time zone found with key Bad/Zone'"),
        ),
        # Unlike get_current_time, an empty timezone is not special-cased and
        # surfaces zoneinfo's own message.
        (
            {"source_timezone": "", "time": "12:00", "target_timezone": "UTC"},
            handler_error(
                "Invalid timezone: ZoneInfo keys must be normalized relative paths, got: "
            ),
        ),
    ],
)
async def test_convert_time_argument_errors(
    arguments: dict[str, Any], expected: dict[str, Any]
) -> None:
    async with connected() as session:
        result = await call(session, "convert_time", arguments)
    assert result == expected


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
    assert result == handler_error(
        "Invalid time format. Expected HH:MM [24-hour format]"
    )


async def test_convert_time_checks_timezones_before_the_time_string() -> None:
    async with connected() as session:
        result = await call(
            session,
            "convert_time",
            {"source_timezone": "UTC", "time": "nope", "target_timezone": "Bad/Zone"},
        )
    assert result == handler_error(
        "Invalid timezone: 'No time zone found with key Bad/Zone'"
    )


# ---------------------------------------------------------------------------
# Unknown tools
# ---------------------------------------------------------------------------


async def test_unknown_tool_is_an_error_result_not_a_protocol_error() -> None:
    # The SDK skips validation for an unlisted tool (and logs a warning), then
    # the handler's fallthrough raises, which the SDK folds into `isError`.
    async with connected() as session:
        result = await call(session, "no_such_tool", {"timezone": "UTC"})
    assert result == handler_error("Unknown tool: no_such_tool")


async def test_session_survives_errors() -> None:
    # A failed call does not take the server down.
    async with connected() as session:
        await call(session, "no_such_tool", {})
        await call(session, "get_current_time", {"timezone": "Bad/Zone"})
        result = await call(session, "get_current_time", {"timezone": "UTC"})
    assert result["isError"] is False
