from datetime import datetime
import json
from typing import Dict, Any, Optional, Sequence

import pytz
from tzlocal import get_localzone
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource


class TimeServer:
    def __init__(self, local_tz_override: Optional[str] = None):
        self.local_tz = pytz.timezone(local_tz_override) if local_tz_override else get_localzone()

    def get_current_time(self, timezone_name: str | None = None) -> Dict[str, Any]:
        """Get current time in specified timezone or local timezone if none specified"""
        timezone = pytz.timezone(timezone_name) if timezone_name else self.local_tz
        current_time = datetime.now(timezone)
        
        return {
            "timezone": timezone_name or str(self.local_tz),
            "time": current_time.strftime("%H:%M %Z"),
            "date": current_time.strftime("%Y-%m-%d"),
            "full_datetime": current_time.strftime("%Y-%m-%d %H:%M:%S %Z"),
            "is_dst": bool(current_time.dst())
        }

    def convert_time(self, source_tz: str, time_str: str, target_tz: str) -> Dict[str, Any]:
        """Convert time between timezones"""
        try:
            source_timezone = pytz.timezone(source_tz)
            target_timezone = pytz.timezone(target_tz)
            
            # Parse time
            hour, minute = map(int, time_str.split(":"))
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError
        except pytz.exceptions.UnknownTimeZoneError as e:
            raise ValueError(f"Unknown timezone: {str(e)}")
        except:
            raise ValueError("Invalid time format. Expected HH:MM (24-hour format)")
        
        # Create time in source timezone
        now = datetime.now(source_timezone)
        source_time = source_timezone.localize(
            datetime(now.year, now.month, now.day, hour, minute)
        )
        
        # Convert to target timezone
        target_time = source_time.astimezone(target_timezone)
        date_changed = source_time.date() != target_time.date()
        
        return {
            "source": {
                "timezone": str(source_timezone),
                "time": source_time.strftime("%H:%M %Z"),
                "date": source_time.strftime("%Y-%m-%d"),
                "full_datetime": source_time.strftime("%Y-%m-%d %H:%M:%S %Z")
            },
            "target": {
                "timezone": str(target_timezone),
                "time": target_time.strftime("%H:%M %Z"),
                "date": target_time.strftime("%Y-%m-%d"),
                "full_datetime": target_time.strftime("%Y-%m-%d %H:%M:%S %Z")
            },
            "time_difference": f"{(target_time.utcoffset() - source_time.utcoffset()).total_seconds() / 3600:+.1f}h",
            "date_changed": date_changed,
            "day_relation": "next day" if date_changed and target_time.date() > source_time.date() else "previous day" if date_changed else "same day"
        }


async def serve(local_timezone: Optional[str] = None) -> None:
    server = Server("mcp-time")
    time_server = TimeServer(local_timezone)
    local_tz = str(time_server.local_tz)

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available time tools."""
        return [
            Tool(
                name="get_current_time",
                description=f"Get current time in a specific timezone (current system timezone is {local_tz})",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "timezone": {
                            "type": "string",
                            "description": "IANA timezone name (e.g., 'America/New_York', 'Europe/London', etc). If not provided, uses system timezone"
                        }
                    }
                }
            ),
            Tool(
                name="convert_time",
                description=f"Convert time between timezones using IANA timezone names (system timezone is {local_tz}, can be used as source or target)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source_timezone": {
                            "type": "string",
                            "description": f"Source IANA timezone name (e.g., '{local_tz}', 'America/New_York')"
                        },
                        "time": {
                            "type": "string",
                            "description": "Time in 24-hour format (HH:MM)"
                        },
                        "target_timezone": {
                            "type": "string",
                            "description": f"Target IANA timezone name (e.g., '{local_tz}', 'Asia/Tokyo')"
                        }
                    },
                    "required": ["source_timezone", "time", "target_timezone"]
                }
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """Handle tool calls for time queries."""
        try:
            if name == "get_current_time":
                timezone = arguments.get("timezone")
                result = time_server.get_current_time(timezone)
            elif name == "convert_time":
                if not all(k in arguments for k in ["source_timezone", "time", "target_timezone"]):
                    raise ValueError("Missing required arguments")
                    
                result = time_server.convert_time(
                    arguments["source_timezone"],
                    arguments["time"],
                    arguments["target_timezone"]
                )
            else:
                raise ValueError(f"Unknown tool: {name}")

            return [TextContent(type="text", text=json.dumps(result, indent=2))]
            
        except Exception as e:
            raise ValueError(f"Error processing time query: {str(e)}")

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options)
