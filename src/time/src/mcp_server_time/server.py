from datetime import datetime, timedelta
from importlib.metadata import version
from enum import Enum
import json
import sys
from typing import Any

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from tzlocal import get_localzone_name  # ← returns "Europe/Paris", etc.

import jsonschema
from mcp.server import Server, ServerRequestContext
from mcp.server.runner import serve_loop
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequestParams,
    CallToolResult,
    ContentBlock,
    ListToolsResult,
    PaginatedRequestParams,
    Tool,
    ToolAnnotations,
    TextContent,
    INVALID_PARAMS,
)
from mcp.shared.exceptions import MCPError

from pydantic import BaseModel

# The version this server reports in serverInfo, read from the installed
# distribution's metadata (pyproject.toml) so it cannot drift from the
# published version (#360). Without it the SDK reports its own `mcp` version.
SERVER_VERSION = version("mcp-server-time")


class TimeTools(str, Enum):
    GET_CURRENT_TIME = "get_current_time"
    CONVERT_TIME = "convert_time"


class TimeResult(BaseModel):
    timezone: str
    datetime: str
    day_of_week: str
    is_dst: bool


class TimeConversionResult(BaseModel):
    source: TimeResult
    target: TimeResult
    time_difference: str


class TimeConversionInput(BaseModel):
    source_tz: str
    time: str
    target_tz_list: list[str]


def get_local_tz(local_tz_override: str | None = None) -> ZoneInfo:
    if local_tz_override:
        return ZoneInfo(local_tz_override)

    # Get local timezone from datetime.now()
    local_tzname = get_localzone_name()
    if local_tzname is not None:
        return ZoneInfo(local_tzname)
    # Default to UTC if local timezone cannot be determined
    return ZoneInfo("UTC")


def get_zoneinfo(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except Exception as e:
        raise MCPError(code=INVALID_PARAMS, message=f"Invalid timezone: {str(e)}")


class TimeServer:
    def get_current_time(self, timezone_name: str) -> TimeResult:
        """Get current time in specified timezone"""
        timezone = get_zoneinfo(timezone_name)
        current_time = datetime.now(timezone)

        return TimeResult(
            timezone=timezone_name,
            datetime=current_time.isoformat(timespec="seconds"),
            day_of_week=current_time.strftime("%A"),
            is_dst=bool(current_time.dst()),
        )

    def convert_time(
        self, source_tz: str, time_str: str, target_tz: str
    ) -> TimeConversionResult:
        """Convert time between timezones"""
        source_timezone = get_zoneinfo(source_tz)
        target_timezone = get_zoneinfo(target_tz)

        try:
            parsed_time = datetime.strptime(time_str, "%H:%M").time()
        except ValueError:
            raise ValueError("Invalid time format. Expected HH:MM [24-hour format]")

        now = datetime.now(source_timezone)
        source_time = datetime(
            now.year,
            now.month,
            now.day,
            parsed_time.hour,
            parsed_time.minute,
            tzinfo=source_timezone,
        )

        # A wall-clock time skipped by a clock change (e.g. 02:30 on a DST
        # spring-forward day) does not survive a round trip through UTC.
        round_trip = datetime.fromtimestamp(source_time.timestamp(), source_timezone)
        if round_trip.replace(tzinfo=None) != source_time.replace(tzinfo=None):
            raise ValueError(
                f"Invalid time: {time_str} does not exist in {source_tz} on "
                f"{source_time.date().isoformat()} (skipped by a clock change)"
            )

        target_time = source_time.astimezone(target_timezone)
        source_offset = source_time.utcoffset() or timedelta()
        target_offset = target_time.utcoffset() or timedelta()
        hours_difference = (target_offset - source_offset).total_seconds() / 3600

        if hours_difference.is_integer():
            time_diff_str = f"{hours_difference:+.1f}h"
        else:
            # For fractional hours like Nepal's UTC+5:45
            time_diff_str = f"{hours_difference:+.2f}".rstrip("0").rstrip(".") + "h"

        return TimeConversionResult(
            source=TimeResult(
                timezone=source_tz,
                datetime=source_time.isoformat(timespec="seconds"),
                day_of_week=source_time.strftime("%A"),
                is_dst=bool(source_time.dst()),
            ),
            target=TimeResult(
                timezone=target_tz,
                datetime=target_time.isoformat(timespec="seconds"),
                day_of_week=target_time.strftime("%A"),
                is_dst=bool(target_time.dst()),
            ),
            time_difference=time_diff_str,
        )


def tool_error(message: str) -> CallToolResult:
    """A tool call that failed, as an `isError` result the model can read."""
    return CallToolResult(
        content=[TextContent(type="text", text=message)], is_error=True
    )


async def serve(local_timezone: str | None = None) -> None:
    time_server = TimeServer()
    if local_timezone:
        # Fail before the transport opens, with one line naming the bad value
        # rather than a traceback. zoneinfo raises a different type per kind of
        # bad key (unknown name, a tzdata directory, a path, a null byte), and
        # its messages can carry a filesystem path, so none of them is shown.
        try:
            ZoneInfo(local_timezone)
        except (ZoneInfoNotFoundError, ValueError, OSError):
            sys.exit(
                f"Error: invalid --local-timezone {local_timezone!r}: "
                "not a known IANA timezone name"
            )
    local_tz = str(get_local_tz(local_timezone))

    tools = [
        Tool(
            name=TimeTools.GET_CURRENT_TIME.value,
            description="Get current time in a specific timezone",
            input_schema={
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": f"IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Use '{local_tz}' as local timezone if no timezone provided by the user.",
                    }
                },
                "required": ["timezone"],
            },
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=TimeTools.CONVERT_TIME.value,
            description="Convert time between timezones",
            input_schema={
                "type": "object",
                "properties": {
                    "source_timezone": {
                        "type": "string",
                        "description": f"Source IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Use '{local_tz}' as local timezone if no source timezone provided by the user.",
                    },
                    "time": {
                        "type": "string",
                        "description": "Time to convert in 24-hour format (HH:MM)",
                    },
                    "target_timezone": {
                        "type": "string",
                        "description": f"Target IANA timezone name (e.g., 'Asia/Tokyo', 'America/San_Francisco'). Use '{local_tz}' as local timezone if no target timezone provided by the user.",
                    },
                },
                "required": ["source_timezone", "time", "target_timezone"],
            },
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
    ]
    schemas = {tool.name: tool.input_schema for tool in tools}

    async def list_tools(
        ctx: ServerRequestContext, params: PaginatedRequestParams | None
    ) -> ListToolsResult:
        """List available time tools."""
        return ListToolsResult(tools=tools)

    def run_tool(name: str, arguments: dict[str, Any]) -> list[ContentBlock]:
        """Handle tool calls for time queries."""
        try:
            match name:
                case TimeTools.GET_CURRENT_TIME.value:
                    timezone = arguments.get("timezone")
                    if not timezone:
                        raise ValueError("Missing required argument: timezone")

                    result = time_server.get_current_time(timezone)

                case TimeTools.CONVERT_TIME.value:
                    if not all(
                        k in arguments
                        for k in ["source_timezone", "time", "target_timezone"]
                    ):
                        raise ValueError(  # pragma: no cover  # unreachable: call_tool rejects a missing key against inputSchema first
                            "Missing required arguments"
                        )
                    for key in ["source_timezone", "target_timezone"]:
                        if not arguments[key]:
                            raise ValueError(f"Missing required argument: {key}")

                    result = time_server.convert_time(
                        arguments["source_timezone"],
                        arguments["time"],
                        arguments["target_timezone"],
                    )
                case _:
                    raise ValueError(f"Unknown tool: {name}")

            return [
                TextContent(type="text", text=json.dumps(result.model_dump(), indent=2))
            ]

        except Exception as e:
            raise ValueError(f"Error processing mcp-server-time query: {str(e)}")

    async def call_tool(
        ctx: ServerRequestContext, params: CallToolRequestParams
    ) -> CallToolResult:
        # SDK v2's low-level server neither validates arguments nor turns a
        # handler exception into an isError result, both of which SDK v1 did.
        # Both are done here, with v1's messages, so the wire is unchanged.
        arguments = params.arguments or {}
        schema = schemas.get(params.name)
        if schema is not None:
            try:
                jsonschema.validate(instance=arguments, schema=schema)
            except jsonschema.ValidationError as e:
                return tool_error(f"Input validation error: {e.message}")
        try:
            return CallToolResult(content=run_tool(params.name, arguments))
        except Exception as e:
            return tool_error(str(e))

    server = Server(
        "mcp-time",
        version=SERVER_VERSION,
        on_list_tools=list_tools,
        on_call_tool=call_tool,
    )
    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        # Legacy era only. Server.run() would also serve 2026-07-28 (its
        # dual-era loop answers server/discover and per-request envelopes);
        # adopting that era is #4853, so this port (#4851) serves the
        # handshake loop alone and keeps the wire unchanged.
        async with server.lifespan(server) as lifespan_state:
            await serve_loop(
                server,
                read_stream,
                write_stream,
                lifespan_state=lifespan_state,
                init_options=options,
            )
