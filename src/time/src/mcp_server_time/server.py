# The time MCP server: `get_current_time` and `convert_time` over IANA
# timezones, with the local timezone detected (or set with --local-timezone)
# and named in the tool descriptions so a model can default to it.
#
# Built on the MCP Python SDK's high-level `MCPServer` (#5174), which these
# reference servers use to show the SDK's recommended API. Each tool is a
# typed function: `MCPServer` derives its input schema from the parameters,
# validates arguments, and returns the pydantic result model as both
# `structuredContent` (with an `outputSchema`) and a JSON text block. A
# failure the tool anticipates raises `ToolError`, which the model reads as an
# `isError` result. An unknown tool name is a JSON-RPC `-32602` protocol error,
# as both spec revisions require (see `reject_unknown_tools`). `serve()` serves
# both protocol eras (#4853): a 2025-11-25 client through the initialize
# handshake, and a 2026-07-28 client sessionlessly. No tool reads the session
# or calls back to the client, so nothing differs between them.

from datetime import datetime, timedelta
from functools import cache
from importlib.metadata import version
from enum import Enum
import sys
from typing import Annotated, Any

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones
from tzlocal import get_localzone_name  # ← returns "Europe/Paris", etc.

from mcp.server.context import CallNext, HandlerResult, ServerRequestContext
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS, ToolAnnotations
from pydantic import BaseModel, Field

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
    later_occurrence: "LaterOccurrence | None" = Field(
        default=None,
        description=(
            "Set only when the source time occurs twice on this date because "
            "a clock change repeats it (a DST fall-back): the same conversion "
            "at its second occurrence. source and target are the first."
        ),
    )


class LaterOccurrence(BaseModel):
    """The second reading of an ambiguous source time (#5196)."""

    note: str
    source: TimeResult
    target: TimeResult
    time_difference: str


TimeConversionResult.model_rebuild()


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


@cache
def known_timezones() -> frozenset[str]:
    """The exact IANA keys this host's tz database holds, read once."""
    return frozenset(available_timezones())


def load_zoneinfo(timezone_name: str) -> ZoneInfo:
    """`ZoneInfo(timezone_name)`, accepting only an exact IANA key.

    zoneinfo looks a key up as a file path, so on a case-insensitive
    filesystem (macOS's APFS) `europe/warsaw` resolves to `Europe/Warsaw`
    while Linux rejects it (#5060). Checking the key against the database's
    own list makes every platform reject it. `ZoneInfo` runs first so a path
    or a directory keeps the error zoneinfo gives it.
    """
    zone = ZoneInfo(timezone_name)
    if timezone_name not in known_timezones():
        raise ZoneInfoNotFoundError(f"No time zone found with key {timezone_name}")
    return zone


def get_zoneinfo(timezone_name: str) -> ZoneInfo:
    """`load_zoneinfo`, failing with a `ToolError` the model can read."""
    try:
        return load_zoneinfo(timezone_name)
    except Exception as e:
        raise ToolError(f"Invalid timezone: {str(e)}") from e


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
            raise ToolError("Invalid time format. Expected HH:MM [24-hour format]")

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
            raise ToolError(
                f"Invalid time: {time_str} does not exist in {source_tz} on "
                f"{source_time.date().isoformat()} (skipped by a clock change)"
            )

        def convert(at: datetime) -> tuple[TimeResult, TimeResult, str]:
            """`at` as a source and target `TimeResult`, and their difference."""
            target_time = at.astimezone(target_timezone)
            source_offset = at.utcoffset() or timedelta()
            target_offset = target_time.utcoffset() or timedelta()
            hours_difference = (target_offset - source_offset).total_seconds() / 3600

            if hours_difference.is_integer():
                time_diff_str = f"{hours_difference:+.1f}h"
            else:
                # For fractional hours like Nepal's UTC+5:45
                time_diff_str = f"{hours_difference:+.2f}".rstrip("0").rstrip(".") + "h"

            return (
                TimeResult(
                    timezone=source_tz,
                    datetime=at.isoformat(timespec="seconds"),
                    day_of_week=at.strftime("%A"),
                    is_dst=bool(at.dst()),
                ),
                TimeResult(
                    timezone=target_tz,
                    datetime=target_time.isoformat(timespec="seconds"),
                    day_of_week=target_time.strftime("%A"),
                    is_dst=bool(target_time.dst()),
                ),
                time_diff_str,
            )

        source, target, time_difference = convert(source_time)

        # A wall-clock time a clock change repeats (e.g. 01:30 on a DST
        # fall-back day) has two instants. The datetime above is the first
        # (fold=0); fold=1 is the second, at a different UTC offset. Report
        # both rather than presenting the first as the only answer (#5196).
        later_occurrence = None
        later_time = source_time.replace(fold=1)
        if later_time.utcoffset() != source_time.utcoffset():
            later_source, later_target, later_difference = convert(later_time)
            later_occurrence = LaterOccurrence(
                note=(
                    f"{time_str} occurs twice in {source_tz} on "
                    f"{source_time.date().isoformat()} because a clock change "
                    f"repeats it: first at {source.datetime}, then at "
                    f"{later_source.datetime}. source and target are the first "
                    "occurrence; this is the second."
                ),
                source=later_source,
                target=later_target,
                time_difference=later_difference,
            )

        return TimeConversionResult(
            source=source,
            target=target,
            time_difference=time_difference,
            later_occurrence=later_occurrence,
        )


READ_ONLY = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)


def require(name: str, value: str) -> None:
    """Report an empty timezone as missing, rather than as zoneinfo's own error."""
    if not value:
        raise ToolError(f"Missing required argument: {name}")


def reject_unknown_tools(server: MCPServer) -> None:
    """Answer a call to an unknown tool with JSON-RPC `-32602`.

    Both spec revisions (2025-11-25 and 2026-07-28, server/tools "Error
    Handling") make an unknown tool a protocol error, but `MCPServer` still
    answers it with an `isError` result (python-sdk#3659). This middleware
    rejects the name before `MCPServer` looks it up. Remove it once
    `MCPServer` does this itself.
    """

    async def middleware(
        ctx: ServerRequestContext[Any, Any], call_next: CallNext
    ) -> HandlerResult:
        if ctx.method == "tools/call" and ctx.params is not None:
            name = ctx.params.get("name")
            if isinstance(name, str) and name not in {
                tool.name for tool in await server.list_tools()
            }:
                raise MCPError(code=INVALID_PARAMS, message=f"Unknown tool: {name}")
        return await call_next(ctx)

    server.middleware.append(middleware)


def create_server(local_tz: str) -> MCPServer:
    """The time server, with `local_tz` named in its tools' argument descriptions."""
    time_server = TimeServer()
    # The tools are fixed at startup, so there is no list change to listen
    # for: `subscriptions=False` leaves 2026-07-28's `subscriptions/listen`
    # unserved, and the server does not claim `listChanged` in either era.
    server = MCPServer("mcp-time", version=SERVER_VERSION, subscriptions=False)
    reject_unknown_tools(server)

    @server.tool(
        name=TimeTools.GET_CURRENT_TIME.value,
        description="Get current time in a specific timezone",
        annotations=READ_ONLY,
    )
    def get_current_time(
        timezone: Annotated[
            str,
            Field(
                description=f"IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Optional: defaults to the server's local timezone, '{local_tz}', when omitted."
            ),
        ] = local_tz,
    ) -> TimeResult:
        require("timezone", timezone)
        return time_server.get_current_time(timezone)

    @server.tool(
        name=TimeTools.CONVERT_TIME.value,
        description="Convert time between timezones",
        annotations=READ_ONLY,
    )
    def convert_time(
        # Keyword-only, so the required `time` can keep its place between the
        # two optional timezones and the schema keeps its property order.
        *,
        source_timezone: Annotated[
            str,
            Field(
                description=f"Source IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Optional: defaults to the server's local timezone, '{local_tz}', when omitted."
            ),
        ] = local_tz,
        time: Annotated[
            str, Field(description="Time to convert in 24-hour format (HH:MM)")
        ],
        target_timezone: Annotated[
            str,
            Field(
                description=f"Target IANA timezone name (e.g., 'Asia/Tokyo', 'America/San_Francisco'). Optional: defaults to the server's local timezone, '{local_tz}', when omitted."
            ),
        ] = local_tz,
    ) -> TimeConversionResult:
        require("source_timezone", source_timezone)
        require("target_timezone", target_timezone)
        return time_server.convert_time(source_timezone, time, target_timezone)

    return server


async def serve(local_timezone: str | None = None) -> None:
    if local_timezone:
        # Fail before the transport opens, with one line naming the bad value
        # rather than a traceback. zoneinfo raises a different type per kind of
        # bad key (unknown name, a tzdata directory, a path, a null byte), and
        # its messages can carry a filesystem path, so none of them is shown.
        try:
            load_zoneinfo(local_timezone)
        except (ZoneInfoNotFoundError, ValueError, OSError):
            sys.exit(
                f"Error: invalid --local-timezone {local_timezone!r}: "
                "not a known IANA timezone name"
            )
    server = create_server(str(get_local_tz(local_timezone)))
    # Both eras (#4853): the SDK's dual-era loop lets the client's first
    # request decide. `initialize` gets the 2025-11-25 handshake;
    # `server/discover` or a request carrying a 2026-07-28 envelope gets the
    # modern, sessionless era, with its required result fields (resultType,
    # ttlMs, cacheScope) filled in by the SDK.
    await server.run_stdio_async()
