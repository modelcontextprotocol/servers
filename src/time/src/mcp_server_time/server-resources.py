# server.py

from datetime import datetime
from typing import Dict, Any, Tuple, Optional
import pytz
from tzlocal import get_localzone
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Resource, ResourceTemplate, ListResourcesResult, ListResourceTemplatesResult
from pydantic import AnyUrl
import json


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

    def parse_time_str(self, time_str: str) -> Tuple[int, int]:
        """Parse time string in format HH:MM"""
        try:
            hour, minute = map(int, time_str.split(":"))
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError
            return hour, minute
        except:
            raise ValueError("Invalid time format. Expected HH:MM (24-hour format)")

    def get_timezone(self, tz_name: str) -> pytz.timezone:
        """Get timezone object, handling 'local' keyword"""
        if tz_name.lower() == 'local':
            return self.local_tz
        try:
            return pytz.timezone(tz_name)
        except pytz.exceptions.UnknownTimeZoneError:
            raise ValueError(f"Unknown timezone: {tz_name}")

    def convert_time(self, source_tz: str, time_str: str, target_tz: str) -> Dict[str, Any]:
        """Convert time between timezones"""
        source_timezone = self.get_timezone(source_tz)
        target_timezone = self.get_timezone(target_tz)
        
        hour, minute = self.parse_time_str(time_str)
        
        now = datetime.now(source_timezone)
        source_time = source_timezone.localize(
            datetime(now.year, now.month, now.day, hour, minute)
        )
        
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

    async def handle_uri(self, uri: str) -> str:
        """Main URI handler that routes to appropriate method"""
        try:
            if uri == "time://query":
                result = self.get_current_time()
            elif uri.startswith("time://query/"):
                timezone_name = uri.replace("time://query/", "")
                result = self.get_current_time(timezone_name)
            elif uri.startswith("time://convert/"):
                path = uri.replace("time://convert/", "")
                source_parts = path.split("/to/")
                if len(source_parts) != 2:
                    raise ValueError("Invalid conversion URI format")
                
                source_info, target_tz = source_parts
                source_parts = source_info.split("/")
                if len(source_parts) != 2:
                    raise ValueError("Invalid source time format")
                
                source_tz, time_str = source_parts
                result = self.convert_time(source_tz, time_str, target_tz)
            else:
                raise ValueError(f"Unsupported URI format: {uri}")
                
            return json.dumps(result)
            
        except Exception as e:
            raise ValueError(f"Error processing time query: {str(e)}")


async def serve(local_timezone: Optional[str] = None) -> None:
    server = Server("mcp-time")
    time_server = TimeServer(local_timezone)

    @server.list_resources()
    async def list_resources() -> list[Resource]:
        current_tz = str(time_server.local_tz)

        return [
            Resource(
                uri=AnyUrl("time://query"),
                name="Local Time Query",
                description=f"Get current time in your local timezone ({current_tz})",
                mimeType="application/json"
            )
        ]
            # resourceTemplates=[
            #     ResourceTemplate(
            #         uriTemplate="time://query/{timezone}",
            #         name="Timezone Time Query",
            #         description="Get current time in a specific timezone",
            #         mimeType="application/json"
            #     ),
            #     ResourceTemplate(
            #         uriTemplate="time://convert/{source_timezone}/{hour}:{minute}/to/{target_timezone}",
            #         name="Timezone Conversion",
            #         description="Convert specific time between timezones (use 'local' for local timezone)",
            #         mimeType="application/json"
            #     )
            # ]

    # @server.list_resources()
    # async def list_resource_templates() -> list[ResourceTemplate]:
    #     return [
    #         ResourceTemplate(
    #             uriTemplate="time://query/{timezone}",
    #             name="Timezone Time Query",
    #             description="Get current time in a specific timezone",
    #             mimeType="application/json"
    #         ),
    #         ResourceTemplate(
    #             uriTemplate="time://convert/{source_timezone}/{hour}:{minute}/to/{target_timezone}",
    #             name="Timezone Conversion",
    #             description="Convert specific time between timezones (use 'local' for local timezone)",
    #             mimeType="application/json"
    #         )
    #     ]

    @server.read_resource()
    async def read_resource(uri: AnyUrl) -> str:
        return await time_server.handle_uri(str(uri))

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options)
