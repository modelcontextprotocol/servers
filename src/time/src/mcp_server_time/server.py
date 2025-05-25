from datetime import datetime, timedelta
from enum import Enum
import json
from typing import Sequence

from zoneinfo import ZoneInfo
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource, ErrorData
from mcp.shared.exceptions import McpError

from pydantic import BaseModel


class TimeTools(str, Enum):
    GET_CURRENT_TIME = "get_current_time"
    CONVERT_TIME = "convert_time"
    CALCULATE_DATE = "calculate_date"
    GET_DAY_OF_WEEK = "get_day_of_week"


class TimeResult(BaseModel):
    timezone: str
    datetime: str
    is_dst: bool


class TimeConversionResult(BaseModel):
    source: TimeResult
    target: TimeResult
    time_difference: str


class TimeConversionInput(BaseModel):
    source_tz: str
    time: str
    target_tz_list: list[str]


class DateCalculationResult(BaseModel):
    input_date: str
    days_added: int
    result_date: str
    day_of_week: str
    calculation_details: str


class DayOfWeekResult(BaseModel):
    date: str
    day_of_week: str
    day_number: int  # 0=Monday, 6=Sunday


def get_local_tz(local_tz_override: str | None = None) -> ZoneInfo:
    if local_tz_override:
        return ZoneInfo(local_tz_override)

    # Get local timezone from datetime.now()
    tzinfo = datetime.now().astimezone(tz=None).tzinfo
    if tzinfo is not None:
        return ZoneInfo(str(tzinfo))
    raise McpError(ErrorData(code=-32000, message="Could not determine local timezone - tzinfo is None"))


def get_zoneinfo(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except Exception as e:
        raise McpError(ErrorData(code=-32602, message=f"Invalid timezone: {str(e)}"))


class TimeServer:
    def get_current_time(self, timezone_name: str) -> TimeResult:
        """Get current time in specified timezone"""
        timezone = get_zoneinfo(timezone_name)
        current_time = datetime.now(timezone)

        return TimeResult(
            timezone=timezone_name,
            datetime=current_time.isoformat(timespec="seconds"),
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
                is_dst=bool(source_time.dst()),
            ),
            target=TimeResult(
                timezone=target_tz,
                datetime=target_time.isoformat(timespec="seconds"),
                is_dst=bool(target_time.dst()),
            ),
            time_difference=time_diff_str,
        )

    def calculate_date(self, date_str: str, days: int, timezone_name: str) -> DateCalculationResult:
        """Calculate a new date by adding or subtracting days from a given date"""
        timezone = get_zoneinfo(timezone_name)
        
        # Parse the date string - support multiple formats
        date_formats = [
            "%Y-%m-%d",
            "%B %d, %Y",  # May 25, 2025
            "%b %d, %Y",  # May 25, 2025 (abbreviated)
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%Y/%m/%d",
        ]
        
        parsed_date = None
        for fmt in date_formats:
            try:
                parsed_date = datetime.strptime(date_str, fmt)
                break
            except ValueError:
                continue
        
        if parsed_date is None:
            raise ValueError(f"Could not parse date '{date_str}'. Supported formats: YYYY-MM-DD, Month DD, YYYY, MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD")
        
        # Apply timezone to the date
        localized_date = parsed_date.replace(tzinfo=timezone)
        
        # Add days
        result_date = localized_date + timedelta(days=days)
        
        # Get day of week
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        day_of_week = day_names[result_date.weekday()]
        
        # Format calculation details
        if days >= 0:
            calc_details = f"Added {days} days to {localized_date.strftime('%B %d, %Y')}"
        else:
            calc_details = f"Subtracted {abs(days)} days from {localized_date.strftime('%B %d, %Y')}"
        
        return DateCalculationResult(
            input_date=localized_date.strftime("%B %d, %Y"),
            days_added=days,
            result_date=result_date.strftime("%B %d, %Y"),
            day_of_week=day_of_week,
            calculation_details=calc_details
        )

    def get_day_of_week(self, date_str: str) -> DayOfWeekResult:
        """Get the day of week for a given date"""
        # Parse the date string - support multiple formats
        date_formats = [
            "%Y-%m-%d",
            "%B %d, %Y",  # May 25, 2025
            "%b %d, %Y",  # May 25, 2025 (abbreviated)
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%Y/%m/%d",
        ]
        
        parsed_date = None
        for fmt in date_formats:
            try:
                parsed_date = datetime.strptime(date_str, fmt)
                break
            except ValueError:
                continue
        
        if parsed_date is None:
            raise ValueError(f"Could not parse date '{date_str}'. Supported formats: YYYY-MM-DD, Month DD, YYYY, MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD")
        
        # Get day of week
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        weekday = parsed_date.weekday()
        
        return DayOfWeekResult(
            date=parsed_date.strftime("%B %d, %Y"),
            day_of_week=day_names[weekday],
            day_number=weekday
        )


async def serve(local_timezone: str | None = None) -> None:
    server = Server("mcp-time")
    time_server = TimeServer()
    local_tz = str(get_local_tz(local_timezone))

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available time tools."""
        return [
            Tool(
                name=TimeTools.GET_CURRENT_TIME.value,
                description="Get current time in a specific timezones",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "timezone": {
                            "type": "string",
                            "description": f"IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Use '{local_tz}' as local timezone if no timezone provided by the user.",
                        }
                    },
                    "required": ["timezone"],
                },
            ),
            Tool(
                name=TimeTools.CONVERT_TIME.value,
                description="Convert time between timezones",
                inputSchema={
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
            ),
            Tool(
                name=TimeTools.CALCULATE_DATE.value,
                description="Calculate a date by adding or subtracting days from a given date",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date in various formats (e.g., '2025-05-25', 'May 25, 2025', '05/25/2025')",
                        },
                        "days": {
                            "type": "integer",
                            "description": "Number of days to add (positive) or subtract (negative)",
                        },
                        "timezone": {
                            "type": "string",
                            "description": f"IANA timezone name for the date calculation. Use '{local_tz}' as local timezone if not provided.",
                        },
                    },
                    "required": ["date", "days", "timezone"],
                },
            ),
            Tool(
                name=TimeTools.GET_DAY_OF_WEEK.value,
                description="Get the day of the week for a given date",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date in various formats (e.g., '2025-05-25', 'May 25, 2025', '05/25/2025')",
                        },
                    },
                    "required": ["date"],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(
        name: str, arguments: dict
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
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
                        raise ValueError("Missing required arguments")

                    result = time_server.convert_time(
                        arguments["source_timezone"],
                        arguments["time"],
                        arguments["target_timezone"],
                    )
                    
                case TimeTools.CALCULATE_DATE.value:
                    if not all(
                        k in arguments
                        for k in ["date", "days", "timezone"]
                    ):
                        raise ValueError("Missing required arguments")
                    
                    result = time_server.calculate_date(
                        arguments["date"],
                        arguments["days"],
                        arguments["timezone"],
                    )
                    
                case TimeTools.GET_DAY_OF_WEEK.value:
                    if "date" not in arguments:
                        raise ValueError("Missing required argument: date")
                    
                    result = time_server.get_day_of_week(arguments["date"])
                    
                case _:
                    raise ValueError(f"Unknown tool: {name}")

            return [
                TextContent(type="text", text=json.dumps(result.model_dump(), indent=2))
            ]

        except Exception as e:
            raise ValueError(f"Error processing mcp-server-time query: {str(e)}")

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options)
