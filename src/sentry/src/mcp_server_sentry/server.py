import asyncio
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Final, Literal, TypeAlias

import click
import httpx
import mcp.types as types
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp.shared.exceptions import McpError
import mcp.server.stdio

from .constants import MISSING_AUTH_TOKEN_MESSAGE, SENTRY_API_BASE
from .utils import create_stacktrace, log_response

logger = logging.getLogger(__name__)

# Define output format and view type enums
class OutputFormat(str, Enum):
    PLAIN = "plain"
    MARKDOWN = "markdown"

class ViewType(str, Enum):
    SUMMARY = "summary"
    DETAILED = "detailed"

@dataclass
class BaseSentryData:
    def _format_dict_to_markdown_table(self, data: dict[str, str], title: str | None = None) -> str:
        """Format a dictionary into a markdown table"""
        result = ""
        if title:
            result += f"### {title}\n\n"
            
        result += "| Key | Value |\n|-----|--------|\n"
        for key, value in data.items():
            result += f"| {key} | {value} |\n"
            
        return result
        
    def _format_dict_to_text(self, data: dict[str, str], title: str | None = None) -> str:
        """Format a dictionary into plain text"""
        result = ""
        if title:
            result += f"{title}:\n"
            
        for key, value in data.items():
            result += f"  {key}: {value}\n"
            
        return result
        
    def to_tool_result(
        self,
        format: OutputFormat = OutputFormat.MARKDOWN,
        view: ViewType = ViewType.DETAILED
    ) -> list[types.TextContent]:
        """Convert the data to a tool result format"""
        content = self.to_markdown(view) if format == OutputFormat.MARKDOWN else self.to_text(view)
        return [types.TextContent(type="text", text=content)]

@dataclass
class SentryTraceData(BaseSentryData):
    trace_id: str
    transaction: str
    project_id: str
    timestamp: str
    duration: float
    status: str
    spans: list[dict]
    tags: dict
    # New fields with defaults for backward compatibility
    environment: str = None
    release: str = None
    user: dict = None
    measurements: dict = None
    transaction_op: str = None
    sdk: dict = None
    platform: str = None
    contexts: dict = None
    
    def get_brief_summary(self) -> str:
        summary = [
            f"🔍 Performance Trace: {self.transaction}",
            f"Duration: {self.duration:.2f}ms ({self.status})",
            f"Project: {self.project_id}",
        ]
        
        if self.environment:
            summary.append(f"Environment: {self.environment}")
        if self.release:
            summary.append(f"Release: {self.release}")
            
        # Add span statistics
        span_ops = {}
        for span in self.spans:
            op = span.get('op', 'unknown')
            span_ops[op] = span_ops.get(op, 0) + 1
            
        if span_ops:
            summary.append(f"Spans: {len(self.spans)} operations tracked")
            summary.append("Span Operations:")
            for op, count in sorted(span_ops.items()):
                summary.append(f"  • {op}: {count} spans")
                
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        basic_info = {
            "ID": self.trace_id,
            "Transaction": self.transaction,
            "Operation": self.transaction_op or "unknown",
            "Project": self.project_id,
            "Environment": self.environment or "unknown",
            "Duration": f"{self.duration:.2f}ms",
            "Status": self.status,
            "Span Count": len(self.spans)
        }
        
        if self.release:
            basic_info["Release"] = self.release
        if self.platform:
            basic_info["Platform"] = self.platform
            
        return self._format_dict_to_markdown_table(basic_info, "Trace Summary")

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        basic_info = {
            "ID": self.trace_id,
            "Transaction": self.transaction,
            "Operation": self.transaction_op or "unknown",
            "Project": self.project_id,
            "Environment": self.environment or "unknown",
            "Duration": f"{self.duration:.2f}ms",
            "Status": self.status,
            "Timestamp": self.timestamp
        }
        
        if self.release:
            basic_info["Release"] = self.release
        if self.platform:
            basic_info["Platform"] = self.platform
            
        result = self._format_dict_to_markdown_table(basic_info, "Sentry Performance Trace")
        
        if view == ViewType.DETAILED:
            # Add span operations statistics
            if self.spans:
                span_ops = {}
                for span in self.spans:
                    op = span.get('op', 'unknown')
                    span_ops[op] = span_ops.get(op, 0) + 1
                    
                if span_ops:
                    result += "\n### Span Operations\n\n"
                    result += "| Operation | Count |\n|-----------|-------|\n"
                    for op, count in sorted(span_ops.items()):
                        result += f"| {op} | {count} |\n"
            
            # Add transaction waterfall
            if self.spans:
                result += "\n### Transaction Waterfall\n\n"
                result += "| Operation | Description | Duration | Status | Start Time | Parent |\n"
                result += "|-----------|-------------|----------|--------|------------|--------|\n"
                
                # Create a map of span IDs to spans for parent lookup
                span_map = {span.get('span_id', span.get('spanId', '')): span for span in self.spans 
                           if 'span_id' in span or 'spanId' in span}
                
                for span in self.spans:
                    op = span.get('op', 'unknown')
                    desc = span.get('description', 'N/A')
                    duration = f"{span.get('duration', 0):.2f}" if isinstance(span.get('duration'), (int, float)) else span.get('duration', 0)
                    status = span.get('status', 'unknown')
                    
                    # Handle different timestamp field formats
                    start_time = span.get('start_timestamp', span.get('startTimestamp', 'N/A'))
                    if isinstance(start_time, (int, float)):
                        from datetime import datetime
                        start_time = datetime.fromtimestamp(start_time).strftime('%H:%M:%S.%f')[:-3]
                    
                    # Get parent information if available
                    parent_info = "None"
                    parent_span_id = span.get('parent_span_id', span.get('parentSpanId', ''))
                    if parent_span_id and parent_span_id in span_map:
                        parent = span_map[parent_span_id]
                        parent_op = parent.get('op', 'unknown')
                        parent_desc = parent.get('description', 'N/A')
                        parent_info = f"{parent_op}: {parent_desc}"
                        
                    result += f"| {op} | {desc} | {duration}ms | {status} | {start_time} | {parent_info} |\n"
            
            # Add user context if available
            if self.user:
                result += "\n### User Context\n\n"
                user_info = {}
                for key, value in self.user.items():
                    if key != 'data' or not isinstance(value, dict):
                        user_info[key] = str(value)
                    elif key == 'data' and isinstance(value, dict):
                        for data_key, data_value in value.items():
                            user_info[f"data.{data_key}"] = str(data_value)
                result += self._format_dict_to_markdown_table(user_info, "User Information")
                
            # Add measurements if available
            if self.measurements:
                result += "\n### Performance Measurements\n\n"
                result += "| Measurement | Value | Unit |\n|-------------|-------|------|\n"
                for name, data in self.measurements.items():
                    if isinstance(data, dict):
                        value = data.get('value', 'N/A')
                        unit = data.get('unit', '')
                        result += f"| {name} | {value} | {unit} |\n"
                    else:
                        result += f"| {name} | {data} | |\n"
                    
            # Add SDK information if available
            if self.sdk:
                result += "\n### SDK Information\n\n"
                sdk_info = {}
                for key, value in self.sdk.items():
                    if not isinstance(value, (dict, list)):
                        sdk_info[key] = str(value)
                result += self._format_dict_to_markdown_table(sdk_info, "SDK Details")
                
            # Add tags if available
            if self.tags:
                if isinstance(self.tags, dict):
                    tag_table = {}
                    for key, value in self.tags.items():
                        tag_table[key] = str(value)
                    result += "\n" + self._format_dict_to_markdown_table(tag_table, "Tags")
                elif isinstance(self.tags, list):
                    result += "\n### Tags\n\n"
                    result += "| Key | Value |\n|-----|-------|\n"
                    for tag in self.tags:
                        if isinstance(tag, dict) and 'key' in tag and 'value' in tag:
                            result += f"| {tag['key']} | {tag['value']} |\n"
                        elif isinstance(tag, dict):
                            for k, v in tag.items():
                                result += f"| {k} | {v} |\n"
                
            # Add contexts if available
            if self.contexts:
                result += "\n### Additional Contexts\n\n"
                for context_name, context_data in self.contexts.items():
                    if isinstance(context_data, dict):
                        result += f"#### {context_name.capitalize()}\n\n"
                        context_table = {}
                        for key, value in context_data.items():
                            if not isinstance(value, (dict, list)):
                                context_table[key] = str(value)
                            elif isinstance(value, dict):
                                for subkey, subvalue in value.items():
                                    if not isinstance(subvalue, (dict, list)):
                                        context_table[f"{key}.{subkey}"] = str(subvalue)
                        result += self._format_dict_to_markdown_table(context_table)
                        result += "\n"
                    
        return result
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        result = f"Sentry Performance Trace: {self.transaction}\n"
        result += f"ID: {self.trace_id}\n"
        result += f"Project ID: {self.project_id}\n"
        result += f"Duration: {self.duration:.2f}ms\n"
        result += f"Status: {self.status}\n"
        result += f"Timestamp: {self.timestamp}\n"
        
        if self.environment:
            result += f"Environment: {self.environment}\n"
        if self.release:
            result += f"Release: {self.release}\n"
        if self.platform:
            result += f"Platform: {self.platform}\n"
        if self.transaction_op:
            result += f"Operation: {self.transaction_op}\n"
        
        if view == ViewType.DETAILED:
            if self.spans:
                result += f"\nSpans: {len(self.spans)}\n"
                # Group spans by operation
                span_ops = {}
                for span in self.spans:
                    op = span.get('op', 'unknown')
                    span_ops[op] = span_ops.get(op, 0) + 1
                
                result += "Span Operations:\n"
                for op, count in sorted(span_ops.items()):
                    result += f"  {op}: {count} spans\n"
                
                result += "\nTransaction Waterfall:\n"
                for span in sorted(self.spans, key=lambda x: float(x.get('start_timestamp', x.get('startTimestamp', 0)))):
                    op = span.get('op', 'unknown')
                    desc = span.get('description', 'N/A')
                    duration = span.get('duration', 0)
                    result += f"  {op}: {desc} - {duration}ms\n"
            
            if self.user:
                result += "\nUser Context:\n"
                for key, value in self.user.items():
                    result += f"  {key}: {value}\n"
                    
            if self.measurements:
                result += "\nPerformance Measurements:\n"
                for name, data in self.measurements.items():
                    if isinstance(data, dict):
                        value = data.get('value', 'N/A')
                        unit = data.get('unit', '')
                        result += f"  {name}: {value} {unit}\n"
                    else:
                        result += f"  {name}: {data}\n"
                        
            if self.tags and (isinstance(self.tags, dict) or isinstance(self.tags, list)):
                result += "\nTags:\n"
                if isinstance(self.tags, dict):
                    for key, value in self.tags.items():
                        result += f"  {key}: {value}\n"
                else:
                    for tag in self.tags:
                        if isinstance(tag, dict) and 'key' in tag and 'value' in tag:
                            result += f"  {tag['key']}: {tag['value']}\n"
                        
        return result

@dataclass
class SentryReplayData(BaseSentryData):
    replay_id: str
    project_id: str
    timestamp: str
    duration: int
    environment: str
    urls: list[str]
    error_ids: list[str]
    browser_name: str
    browser_version: str
    device_name: str
    device_family: str
    os_name: str
    os_version: str
    user_name: str | None
    user_email: str | None
    activity_count: int
    dead_clicks: int
    rage_clicks: int
    error_count: int
    
    def get_brief_summary(self) -> str:
        # Calculate problematic actions percentage
        total_problematic = self.dead_clicks + self.rage_clicks
        problem_percentage = (total_problematic / self.activity_count * 100) if self.activity_count > 0 else 0
        
        user_info = f"Anonymous user" if not self.user_name else f"User: {self.user_name}"
        if self.user_email:
            user_info += f" ({self.user_email})"
            
        duration_sec = self.duration / 1000  # Convert ms to seconds
        
        summary = [
            f"📺 Session Replay #{self.replay_id}",
            f"Session: {user_info} in {self.environment}",
            f"Duration: {duration_sec:.1f} seconds with {self.activity_count} user actions",
            f"Issues: {self.error_count} errors detected",
            f"User Frustration: {total_problematic} problematic actions ({problem_percentage:.1f}% of total)",
            f"  • {self.dead_clicks} dead clicks",
            f"  • {self.rage_clicks} rage clicks",
            f"Technical Context: {self.browser_name} {self.browser_version} on {self.os_name} {self.os_version}",
            f"Device: {self.device_name} ({self.device_family})"
        ]
        
        if self.urls:
            urls_summary = ", ".join(self.urls[:3])  # Show first 3 URLs
            if len(self.urls) > 3:
                urls_summary += f" and {len(self.urls)-3} more"
            summary.append(f"Pages: {urls_summary}")
            
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        basic_info = {
            "ID": self.replay_id,
            "Environment": self.environment,
            "Duration": f"{self.duration}ms",
            "Total Activity": self.activity_count,
            "Error Count": self.error_count,
            "Browser": f"{self.browser_name} {self.browser_version}",
            "Device": f"{self.device_name} ({self.os_name} {self.os_version})",
            "URLs Visited": len(self.urls)
        }
        return self._format_dict_to_markdown_table(basic_info, "Replay Summary")

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        basic_info = {
            "ID": self.replay_id,
            "Project": self.project_id,
            "Environment": self.environment,
            "Duration": f"{self.duration}ms",
            "Timestamp": self.timestamp,
            "URLs": ", ".join(self.urls),
            "Errors": len(self.error_ids)
        }
        
        result = self._format_dict_to_markdown_table(basic_info, "Sentry Replay Details")
        
        if view == ViewType.DETAILED:
            device_info = {
                "Browser": f"{self.browser_name} {self.browser_version}",
                "Device": f"{self.device_name} ({self.device_family})",
                "OS": f"{self.os_name} {self.os_version}"
            }
            result += "\n" + self._format_dict_to_markdown_table(device_info, "Device Information")
            
            user_info = {
                "Name": self.user_name or "Anonymous",
                "Email": self.user_email or "N/A"
            }
            result += "\n" + self._format_dict_to_markdown_table(user_info, "User Information")
            
            activity_info = {
                "Total Activity": self.activity_count,
                "Dead Clicks": self.dead_clicks,
                "Rage Clicks": self.rage_clicks,
                "Errors": self.error_count
            }
            result += "\n" + self._format_dict_to_markdown_table(activity_info, "Activity Metrics")
            
        return result
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        basic_info = {
            "ID": self.replay_id,
            "Project": self.project_id,
            "Environment": self.environment,
            "Duration": f"{self.duration}ms",
            "Timestamp": self.timestamp,
            "URLs": ", ".join(self.urls),
            "Errors": len(self.error_ids)
        }
        
        result = self._format_dict_to_text(basic_info, "Sentry Replay Details")
        
        if view == ViewType.DETAILED:
            device_info = {
                "Browser": f"{self.browser_name} {self.browser_version}",
                "Device": f"{self.device_name} ({self.device_family})",
                "OS": f"{self.os_name} {self.os_version}"
            }
            result += "\n" + self._format_dict_to_text(device_info, "Device Information")
            
            user_info = {
                "Name": self.user_name or "Anonymous",
                "Email": self.user_email or "N/A"
            }
            result += "\n" + self._format_dict_to_text(user_info, "User Information")
            
            activity_info = {
                "Total Activity": self.activity_count,
                "Dead Clicks": self.dead_clicks,
                "Rage Clicks": self.rage_clicks,
                "Errors": self.error_count
            }
            result += "\n" + self._format_dict_to_text(activity_info, "Activity Metrics")
            
        return result

@dataclass
class SentryReleaseData(BaseSentryData):
    version: str
    url: str
    projects: list[str]
    dateCreated: str
    
    def get_brief_summary(self) -> str:
        summary = [
            f"📦 Release: {self.version}",
            f"Created: {self.dateCreated}",
            f"Projects: {', '.join(self.projects)}",
            f"Details: {self.url}"
        ]
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        data = {
            "Version": self.version,
            "URL": self.url,
            "Projects": ", ".join(self.projects),
            "Date Created": self.dateCreated
        }
        return self._format_dict_to_markdown_table(data, "Release Summary")

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        data = {
            "Version": self.version,
            "URL": self.url,
            "Projects": ", ".join(self.projects),
            "Date Created": self.dateCreated
        }
        return self._format_dict_to_markdown_table(data, "Sentry Release")
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        data = {
            "Version": self.version,
            "URL": self.url,
            "Projects": ", ".join(self.projects),
            "Date Created": self.dateCreated
        }
        return self._format_dict_to_text(data, "Sentry Release")

@dataclass
class SentryIssueData(BaseSentryData):
    title: str
    issue_id: str
    status: str
    level: str
    first_seen: str
    last_seen: str
    count: int
    stacktrace: str
    # New fields
    culprit: str
    platform: str | None
    project_name: str | None
    project_slug: str | None
    priority: str | None
    user_count: int
    tags: list[dict]
    stats: dict

    def to_text(self) -> str:
        # Format tags as a string
        tags_text = "\n".join([
            f"  {tag['key']}: {tag['name']} ({tag['totalValues']} values)"
            for tag in self.tags
        ]) if self.tags else "  No tags"

        return f"""
Sentry Issue: {self.title}
Issue ID: {self.issue_id}
Project: {self.project_name or 'Unknown'} ({self.project_slug or 'Unknown'})
Status: {self.status}
Level: {self.level}
Priority: {self.priority or 'Not set'}
Platform: {self.platform or 'Unknown'}
Culprit: {self.culprit}

First Seen: {self.first_seen}
Last Seen: {self.last_seen}
Event Count: {self.count}
Affected Users: {self.user_count}

Tags:
{tags_text}

Stacktrace:
{self.stacktrace}
        """
    
    def get_brief_summary(self) -> str:
        frequency = "ongoing" if self.status == "unresolved" else "resolved"
        time_span = ""
        if self.first_seen and self.last_seen:
            from datetime import datetime
            try:
                first = datetime.fromisoformat(self.first_seen.replace('Z', '+00:00'))
                last = datetime.fromisoformat(self.last_seen.replace('Z', '+00:00'))
                duration = last - first
                if duration.days > 0:
                    time_span = f" over {duration.days} days"
            except ValueError:
                pass
        
        summary = [
            f"❌ Issue: {self.title}",
            f"Impact: {self.level.upper()} level issue, {frequency} with {self.count} occurrences{time_span}",
            f"Status: {self.status}",
            f"Timeline: First seen {self.first_seen}",
            f"          Last seen {self.last_seen}",
            f"Reference: Issue #{self.issue_id}"
        ]
        if self.stacktrace:
            summary.append("Stacktrace is available for detailed debugging")
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        basic_info = {
            "Title": self.title,
            "Issue ID": self.issue_id,
            "Status": self.status,
            "Level": self.level,
            "First Seen": self.first_seen,
            "Last Seen": self.last_seen,
            "Event Count": self.count
        }
        return self._format_dict_to_markdown_table(basic_info, "Issue Summary")

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        basic_info = {
            "Title": self.title,
            "Issue ID": self.issue_id,
            "Status": self.status,
            "Level": self.level,
            "First Seen": self.first_seen,
            "Last Seen": self.last_seen,
            "Event Count": self.count
        }
        
        result = self._format_dict_to_markdown_table(basic_info, "Sentry Issue")
        
        if view == ViewType.DETAILED and self.stacktrace:
            result += f"\n### Stacktrace\n```\n{self.stacktrace}\n```"
            
        return result
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        basic_info = {
            "Title": self.title,
            "Issue ID": self.issue_id,
            "Status": self.status,
            "Level": self.level,
            "First Seen": self.first_seen,
            "Last Seen": self.last_seen,
            "Event Count": self.count
        }
        
        result = self._format_dict_to_text(basic_info, "Sentry Issue")
        
        if view == ViewType.DETAILED and self.stacktrace:
            result += f"\nStacktrace:\n{self.stacktrace}"
            
        return result
    
    def to_prompt_result(self) -> types.GetPromptResult:
        return types.GetPromptResult(
            description=f"Sentry Issue: {self.title}",
            messages=[
                types.PromptMessage(
                    role="user", content=types.TextContent(type="text", text=self.to_markdown())
                )
            ],
        )

@dataclass
class SentryEventData(BaseSentryData):
    event_id: str
    issue_id: str
    project_id: str
    timestamp: str
    title: str
    message: str
    level: str
    platform: str
    stacktrace: str | None
    tags: list[dict]
    contexts: dict
    
    def get_brief_summary(self) -> str:
        """Get a multi-line summary of the key data points"""
        summary = [
            f"🔍 Event: {self.title}",
            f"Level: {self.level.upper()} on {self.platform}",
            f"Time: {self.timestamp}",
            f"Project: {self.project_id}, Issue: {self.issue_id}"
        ]
        
        # Add tag summary if available
        important_tags = []
        for tag in self.tags:
            key = tag.get('key', '').lower()
            if key in ['environment', 'release', 'user', 'transaction']:
                important_tags.append(f"{key}: {tag.get('value', 'unknown')}")
        
        if important_tags:
            summary.append("Tags:")
            summary.extend(f"  • {tag}" for tag in important_tags)
            
        if self.stacktrace:
            summary.append("Full stacktrace available")
            
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        """Get a markdown table summary of the main data"""
        basic_info = {
            "Event ID": self.event_id,
            "Issue ID": self.issue_id,
            "Project": self.project_id,
            "Title": self.title,
            "Level": self.level,
            "Platform": self.platform,
            "Timestamp": self.timestamp
        }
        return self._format_dict_to_markdown_table(basic_info, "Event Summary")

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full markdown format"""
        basic_info = {
            "Event ID": self.event_id,
            "Issue ID": self.issue_id,
            "Project": self.project_id,
            "Title": self.title,
            "Message": self.message,
            "Level": self.level,
            "Platform": self.platform,
            "Timestamp": self.timestamp
        }
        
        result = self._format_dict_to_markdown_table(basic_info, "Sentry Event Details")
        
        if view == ViewType.DETAILED:
            if self.tags:
                result += "\n### Tags\n\n"
                result += "| Key | Value |\n|-----|--------|\n"
                for tag in self.tags:
                    result += f"| {tag['key']} | {tag['value']} |\n"
            
            if self.stacktrace:
                result += f"\n### Stacktrace\n```\n{self.stacktrace}\n```"
                
        return result
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full text format"""
        basic_info = {
            "Event ID": self.event_id,
            "Issue ID": self.issue_id,
            "Project": self.project_id,
            "Title": self.title,
            "Message": self.message,
            "Level": self.level,
            "Platform": self.platform,
            "Timestamp": self.timestamp
        }
        
        result = self._format_dict_to_text(basic_info, "Sentry Event Details")
        
        if view == ViewType.DETAILED:
            if self.tags:
                result += "\nTags:\n"
                for tag in self.tags:
                    result += f"  {tag['key']}: {tag['value']}\n"
            
            if self.stacktrace:
                result += f"\nStacktrace:\n{self.stacktrace}"
                
        return result

@dataclass
class SentryEventListData(BaseSentryData):
    """Class to represent a list of Sentry events"""
    events: list[dict]
    organization_slug: str
    project_slug: str
    
    def get_brief_summary(self) -> str:
        """Get a multi-line summary of the events list"""
        summary = [
            f"📋 Event List for {self.organization_slug}/{self.project_slug}",
            f"Total Events: {len(self.events)}"
        ]
        
        # Add summary of event types and levels
        levels = {}
        platforms = {}
        for event in self.events:
            level = event.get('level', 'unknown')
            platform = event.get('platform', 'unknown')
            levels[level] = levels.get(level, 0) + 1
            platforms[platform] = platforms.get(platform, 0) + 1
            
        if levels:
            summary.append("\nEvent Levels:")
            for level, count in levels.items():
                summary.append(f"  • {level.upper()}: {count}")
                
        if platforms:
            summary.append("\nPlatforms:")
            for platform, count in platforms.items():
                summary.append(f"  • {platform}: {count}")
                
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        """Get a markdown table summary of the events"""
        result = f"### Events for {self.organization_slug}/{self.project_slug}\n\n"
        result += "| Event ID | Title | Level | Platform | Timestamp |\n"
        result += "|----------|--------|--------|-----------|------------|\n"
        
        for event in self.events:
            result += (
                f"| {event.get('eventID', 'N/A')} "
                f"| {event.get('title', 'N/A')} "
                f"| {event.get('level', 'N/A').upper()} "
                f"| {event.get('platform', 'N/A')} "
                f"| {event.get('dateCreated', 'N/A')} |\n"
            )
            
        return result

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full markdown format"""
        result = self.get_brief_summary()
        result += "\n\n" + self.get_table_summary()
        
        if view == ViewType.DETAILED:
            result += "\n\n### Detailed Event Information\n\n"
            for event in self.events:
                result += f"#### Event {event.get('eventID', 'N/A')}\n\n"
                event_info = {
                    "Title": event.get('title', 'N/A'),
                    "Message": event.get('message', 'N/A'),
                    "Level": event.get('level', 'N/A').upper(),
                    "Platform": event.get('platform', 'N/A'),
                    "Location": event.get('location', 'N/A'),
                    "Culprit": event.get('culprit', 'N/A'),
                    "Project ID": event.get('projectID', 'N/A'),
                    "Group ID": event.get('groupID', 'N/A'),
                    "Timestamp": event.get('dateCreated', 'N/A')
                }
                result += self._format_dict_to_markdown_table(event_info)
                
                # Add tags if available
                if event.get('tags'):
                    result += "\nTags:\n"
                    for tag in event['tags']:
                        result += f"- {tag['key']}: {tag['value']}\n"
                result += "\n---\n\n"
                
        return result
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full text format"""
        result = self.get_brief_summary()
        result += "\n\nEvents:\n"
        
        for event in self.events:
            result += f"\nEvent {event.get('eventID', 'N/A')}:\n"
            result += f"  Title: {event.get('title', 'N/A')}\n"
            result += f"  Level: {event.get('level', 'N/A').upper()}\n"
            result += f"  Platform: {event.get('platform', 'N/A')}\n"
            result += f"  Timestamp: {event.get('dateCreated', 'N/A')}\n"
            
            if view == ViewType.DETAILED:
                result += f"  Message: {event.get('message', 'N/A')}\n"
                result += f"  Location: {event.get('location', 'N/A')}\n"
                result += f"  Culprit: {event.get('culprit', 'N/A')}\n"
                result += f"  Project ID: {event.get('projectID', 'N/A')}\n"
                result += f"  Group ID: {event.get('groupID', 'N/A')}\n"
                
                if event.get('tags'):
                    result += "  Tags:\n"
                    for tag in event['tags']:
                        result += f"    {tag['key']}: {tag['value']}\n"
                        
        return result

@dataclass
class SentryIssueListData(BaseSentryData):
    """Class to represent a list of Sentry issues"""
    issues: list[dict]
    organization_slug: str
    project_slug: str
    
    def get_brief_summary(self) -> str:
        """Get a multi-line summary of the issues list"""
        # Count issues by status and level
        status_counts = {}
        level_counts = {}
        total_events = 0
        
        for issue in self.issues:
            status = issue.get('status', 'unknown')
            level = issue.get('level', 'unknown')
            count = int(issue.get('count', 0))
            
            status_counts[status] = status_counts.get(status, 0) + 1
            level_counts[level] = level_counts.get(level, 0) + 1
            total_events += count
        
        summary = [
            f"📊 Issues for {self.organization_slug}/{self.project_slug}",
            f"Total Issues: {len(self.issues)}",
            f"Total Events: {total_events}"
        ]
        
        if status_counts:
            summary.append("\nStatus Distribution:")
            for status, count in status_counts.items():
                summary.append(f"  • {status}: {count}")
                
        if level_counts:
            summary.append("\nLevel Distribution:")
            for level, count in level_counts.items():
                summary.append(f"  • {level.upper()}: {count}")
                
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        """Get a markdown table summary of the issues"""
        result = f"### Issues for {self.organization_slug}/{self.project_slug}\n\n"
        result += "| Issue ID | Title | Status | Level | Events | First Seen | Last Seen |\n"
        result += "|----------|--------|--------|--------|---------|------------|------------|\n"
        
        for issue in self.issues:
            # Extract the numeric ID from the permalink or use the raw ID
            issue_id = issue.get('id', 'N/A')
            if 'permalink' in issue:
                try:
                    issue_id = issue['permalink'].rstrip('/').split('/')[-1]
                except (IndexError, AttributeError):
                    pass
            
            result += (
                f"| {issue_id} "
                f"| {issue.get('title', issue.get('metadata', {}).get('title', 'N/A'))} "
                f"| {issue.get('status', 'N/A')} "
                f"| {issue.get('level', 'N/A').upper()} "
                f"| {issue.get('count', 'N/A')} "
                f"| {issue.get('firstSeen', 'N/A')} "
                f"| {issue.get('lastSeen', 'N/A')} |\n"
            )
            
        return result

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full markdown format"""
        result = self.get_brief_summary()
        result += "\n\n" + self.get_table_summary()
        
        if view == ViewType.DETAILED:
            result += "\n\n### Detailed Issue Information\n\n"
            for issue in self.issues:
                issue_id = issue.get('id', 'N/A')
                if 'permalink' in issue:
                    try:
                        issue_id = issue['permalink'].rstrip('/').split('/')[-1]
                    except (IndexError, AttributeError):
                        pass
                        
                result += f"#### Issue {issue_id}\n\n"
                
                issue_info = {
                    "Title": issue.get('title', issue.get('metadata', {}).get('title', 'N/A')),
                    "Status": issue.get('status', 'N/A'),
                    "Level": issue.get('level', 'N/A').upper(),
                    "Events": issue.get('count', 'N/A'),
                    "First Seen": issue.get('firstSeen', 'N/A'),
                    "Last Seen": issue.get('lastSeen', 'N/A'),
                    "Culprit": issue.get('culprit', 'N/A'),
                    "Short ID": issue.get('shortId', 'N/A'),
                    "User Count": issue.get('userCount', 'N/A'),
                    "Comment Count": issue.get('numComments', 'N/A'),
                    "Permalink": issue.get('permalink', 'N/A')
                }
                result += self._format_dict_to_markdown_table(issue_info)
                
                # Add project info if available
                if project := issue.get('project'):
                    result += "\nProject Information:\n"
                    result += f"- Name: {project.get('name', 'N/A')}\n"
                    result += f"- Slug: {project.get('slug', 'N/A')}\n"
                    result += f"- ID: {project.get('id', 'N/A')}\n"
                
                result += "\n---\n\n"
                
        return result
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full text format"""
        result = self.get_brief_summary()
        result += "\n\nIssues:\n"
        
        for issue in self.issues:
            issue_id = issue.get('id', 'N/A')
            if 'permalink' in issue:
                try:
                    issue_id = issue['permalink'].rstrip('/').split('/')[-1]
                except (IndexError, AttributeError):
                    pass
                    
            result += f"\nIssue {issue_id}:\n"
            result += f"  Title: {issue.get('title', issue.get('metadata', {}).get('title', 'N/A'))}\n"
            result += f"  Status: {issue.get('status', 'N/A')}\n"
            result += f"  Level: {issue.get('level', 'N/A').upper()}\n"
            result += f"  Events: {issue.get('count', 'N/A')}\n"
            result += f"  First Seen: {issue.get('firstSeen', 'N/A')}\n"
            result += f"  Last Seen: {issue.get('lastSeen', 'N/A')}\n"
            
            if view == ViewType.DETAILED:
                result += f"  Culprit: {issue.get('culprit', 'N/A')}\n"
                result += f"  Short ID: {issue.get('shortId', 'N/A')}\n"
                result += f"  User Count: {issue.get('userCount', 'N/A')}\n"
                result += f"  Comment Count: {issue.get('numComments', 'N/A')}\n"
                result += f"  Permalink: {issue.get('permalink', 'N/A')}\n"
                
                if project := issue.get('project'):
                    result += "  Project:\n"
                    result += f"    Name: {project.get('name', 'N/A')}\n"
                    result += f"    Slug: {project.get('slug', 'N/A')}\n"
                    result += f"    ID: {project.get('id', 'N/A')}\n"
                    
        return result

@dataclass
class SentryProjectListData(BaseSentryData):
    """Class to represent a list of Sentry projects"""
    projects: list[dict]
    
    def get_brief_summary(self) -> str:
        """Get a multi-line summary of the projects list"""
        # Count projects by status and platform
        status_counts = {}
        org_counts = {}
        
        for project in self.projects:
            status = project.get('status', 'unknown')
            org_slug = project.get('organization', {}).get('slug', 'unknown')
            
            status_counts[status] = status_counts.get(status, 0) + 1
            org_counts[org_slug] = org_counts.get(org_slug, 0) + 1
        
        summary = [
            "🏗️ Sentry Projects",
            f"Total Projects: {len(self.projects)}"
        ]
        
        if status_counts:
            summary.append("\nStatus Distribution:")
            for status, count in status_counts.items():
                summary.append(f"  • {status}: {count}")
                
        if org_counts:
            summary.append("\nOrganization Distribution:")
            for org, count in org_counts.items():
                summary.append(f"  • {org}: {count}")
                
        return "\n".join(summary)

    def get_table_summary(self) -> str:
        """Get a markdown table summary of the projects"""
        result = "### Sentry Projects\n\n"
        result += "| Project ID | Name | Slug | Organization | Status | Platform | Created |\n"
        result += "|------------|------|------|--------------|--------|----------|----------|\n"
        
        for project in self.projects:
            org = project.get('organization', {})
            result += (
                f"| {project.get('id', 'N/A')} "
                f"| {project.get('name', 'N/A')} "
                f"| {project.get('slug', 'N/A')} "
                f"| {org.get('slug', 'N/A')} "
                f"| {project.get('status', 'N/A')} "
                f"| {project.get('platform', 'N/A') or 'not set'} "
                f"| {project.get('dateCreated', 'N/A')} |\n"
            )
            
        return result

    def to_markdown(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full markdown format"""
        result = self.get_brief_summary()
        result += "\n\n" + self.get_table_summary()
        
        if view == ViewType.DETAILED:
            result += "\n\n### Detailed Project Information\n\n"
            for project in self.projects:
                result += f"#### {project.get('name', 'Unknown Project')} ({project.get('slug', 'N/A')})\n\n"
                
                project_info = {
                    "ID": project.get('id', 'N/A'),
                    "Name": project.get('name', 'N/A'),
                    "Slug": project.get('slug', 'N/A'),
                    "Status": project.get('status', 'N/A'),
                    "Platform": project.get('platform', 'not set'),
                    "Created": project.get('dateCreated', 'N/A'),
                    "First Event": project.get('firstEvent', 'none'),
                    "Is Public": str(project.get('isPublic', False)),
                    "Is Bookmarked": str(project.get('isBookmarked', False)),
                    "Is Member": str(project.get('isMember', False))
                }
                result += self._format_dict_to_markdown_table(project_info)
                
                # Add organization info
                if org := project.get('organization'):
                    org_info = {
                        "Name": org.get('name', 'N/A'),
                        "Slug": org.get('slug', 'N/A'),
                        "ID": org.get('id', 'N/A'),
                        "Status": org.get('status', {}).get('name', 'N/A'),
                        "2FA Required": str(org.get('require2FA', False))
                    }
                    result += "\nOrganization Information:\n"
                    result += self._format_dict_to_markdown_table(org_info)
                
                # Add features if available
                if features := project.get('features'):
                    result += "\nEnabled Features:\n"
                    for feature in features:
                        result += f"- {feature}\n"
                
                result += "\n---\n\n"
                
        return result
    
    def to_text(self, view: ViewType = ViewType.DETAILED) -> str:
        """Convert the data to full text format"""
        result = self.get_brief_summary()
        result += "\n\nProjects:\n"
        
        for project in self.projects:
            result += f"\n{project.get('name', 'Unknown Project')} ({project.get('slug', 'N/A')}):\n"
            result += f"  ID: {project.get('id', 'N/A')}\n"
            result += f"  Status: {project.get('status', 'N/A')}\n"
            result += f"  Platform: {project.get('platform', 'not set')}\n"
            result += f"  Created: {project.get('dateCreated', 'N/A')}\n"
            
            if view == ViewType.DETAILED:
                result += f"  First Event: {project.get('firstEvent', 'none')}\n"
                result += f"  Is Public: {project.get('isPublic', False)}\n"
                result += f"  Is Bookmarked: {project.get('isBookmarked', False)}\n"
                result += f"  Is Member: {project.get('isMember', False)}\n"
                
                if org := project.get('organization'):
                    result += "  Organization:\n"
                    result += f"    Name: {org.get('name', 'N/A')}\n"
                    result += f"    Slug: {org.get('slug', 'N/A')}\n"
                    result += f"    ID: {org.get('id', 'N/A')}\n"
                    result += f"    Status: {org.get('status', {}).get('name', 'N/A')}\n"
                    result += f"    2FA Required: {org.get('require2FA', False)}\n"
                
                if features := project.get('features'):
                    result += "  Features:\n"
                    for feature in features:
                        result += f"    - {feature}\n"
                    
        return result


class SentryError(Exception):
    pass


PathType: TypeAlias = Literal["issues", "replays"]

class SentryUrlType(str, Enum):
    ISSUES = "issues"
    REPLAYS = "replays"

@dataclass(frozen=True)
class ParsedSentryUrl:
    org_slug: str
    item_id: str
    url_type: SentryUrlType
    
    @property
    def api_path(self) -> str:
        return f"{self.url_type}/{self.item_id}"

SENTRY_DOMAIN: Final = "sentry.io"

# Initialize the server and HTTP client
server = Server("sentry")
http_client: httpx.AsyncClient | None = None
auth_token: str | None = None

async def serve(token: str) -> Server:
    """Initialize and return the server with the given auth token."""
    global http_client, auth_token
    
    if not token:
        raise McpError(MISSING_AUTH_TOKEN_MESSAGE)
    
    auth_token = token
    http_client = httpx.AsyncClient(
        base_url=SENTRY_API_BASE,
        timeout=30.0,
        follow_redirects=True
    )
    
    return server

def parse_sentry_url(url: str, expected_type: PathType) -> ParsedSentryUrl:
    """
    Parses and validates a Sentry URL.
    
    Args:
        url: Full Sentry URL (e.g., https://org-name.sentry.io/issues/123456)
        expected_type: Expected URL type ('issues' or 'replays')
        
    Returns:
        ParsedSentryUrl containing validated components
        
    Raises:
        SentryError: If URL format is invalid or doesn't match expected type
    """
    try:
        logger.debug(f"Parsing URL: {url} with expected type: {expected_type}")
        # Parse URL using urlparse
        parsed = urlparse(url)
        logger.debug(f"Parsed URL - scheme: {parsed.scheme}, netloc: {parsed.netloc}, path: {parsed.path}, query: {parsed.query}")
        
        # Validate scheme
        if parsed.scheme not in ("http", "https"):
            raise SentryError("Invalid URL scheme. Must be http or https")
        
        # Validate and extract organization slug
        if not parsed.netloc or not parsed.netloc.endswith(f".{SENTRY_DOMAIN}"):
            raise SentryError(f"Invalid Sentry URL. Must end with .{SENTRY_DOMAIN}")
        
        # Extract org slug from hostname, preserving any hyphens
        org_slug = parsed.netloc.split('.')[0]
        logger.debug(f"Extracted org_slug: {org_slug}")
        if not org_slug:
            raise SentryError("Missing organization slug in hostname")
        
        # Clean and validate path
        # Remove leading and trailing slashes before splitting
        clean_path = parsed.path.strip('/')
        path_parts = [p for p in clean_path.split('/') if p]
        logger.debug(f"Path parts after cleaning: {path_parts}")
        
        if not path_parts:
            raise SentryError("Missing path components")
        
        url_type = SentryUrlType(expected_type)
        logger.debug(f"URL type: {url_type}")
        
        if len(path_parts) < 2 or path_parts[0] != url_type:
            raise SentryError(f"Invalid {url_type} URL format. Expected: /{url_type}/{{id}}")
        # Always clean the item_id of any query parameters or trailing slashes
        item_id = path_parts[1].split('?')[0].rstrip('/')
            
        logger.debug(f"Extracted item_id: {item_id}")
        
        # Validate extracted components
        if not _is_valid_org_slug(org_slug):
            raise SentryError(f"Invalid organization slug format: {org_slug}")
        
        if not _is_valid_item_id(item_id, url_type):
            raise SentryError(f"Invalid {url_type} ID format: {item_id}")
        
        result = ParsedSentryUrl(
            org_slug=org_slug,
            item_id=item_id,
            url_type=url_type
        )
        logger.debug(f"Successfully parsed URL into: {result}")
        return result
        
    except ValueError as e:
        logger.error(f"ValueError while parsing URL '{url}': {str(e)}")
        raise SentryError(f"Invalid URL format: {str(e)}")
    except Exception as e:
        logger.error(f"Error parsing Sentry URL '{url}': {str(e)}")
        raise SentryError(f"Failed to parse Sentry URL: {str(e)}")

def _is_valid_org_slug(slug: str) -> bool:
    """
    Validates organization slug format.
    Must be alphanumeric with hyphens, 1-64 chars
    """
    import re
    if not slug or len(slug) > 64:
        return False
    # Allow alphanumeric with hyphen separators, must start and end with alphanumeric
    return bool(re.match(r'^[a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]$', slug))

def _is_valid_item_id(item_id: str, url_type: SentryUrlType) -> bool:
    """
    Validates item ID format based on type.
    - Issues: numeric only
    - Replays: hex string, 32-64 chars
    """
    if not item_id:
        return False
        
    if url_type == SentryUrlType.ISSUES:
        return item_id.isdigit()
        
    # For replays, expect UUID-like hex string
    import re
    return bool(re.match(r'^[a-fA-F0-9]{32,64}$', item_id))


def extract_issue_id(issue_id_or_url: str) -> tuple[str, str]:
    """
    Extracts the Sentry issue ID and organization slug from either a full URL, org_slug:issue_id format, or standalone ID.
    
    Args:
        issue_id_or_url: Full URL, "org_slug:issue_id" format, or just ID
        
    Returns:
        Tuple of (org_slug, issue_id), where org_slug may be None if not provided in standalone ID format
    """
    if not issue_id_or_url:
        raise SentryError("Missing issue_id_or_url argument")

    # Handle URL format
    if issue_id_or_url.startswith(("http://", "https://")):
        parsed = parse_sentry_url(issue_id_or_url, "issues")
        return parsed.org_slug, parsed.item_id
    
    # Handle org_slug:issue_id format
    elif ":" in issue_id_or_url:
        try:
            parts = issue_id_or_url.split(":", 1)  # Split on first colon only
            if len(parts) != 2:
                raise ValueError("Invalid format - must contain exactly one colon separator")
                
            org_slug, issue_id = parts
            org_slug = org_slug.strip()
            issue_id = issue_id.strip()
            
            # Validate components
            if not _is_valid_org_slug(org_slug):
                raise SentryError(f"Invalid organization slug format: {org_slug}")
            if not issue_id.isdigit():
                raise SentryError("Invalid Sentry issue ID. Must be a numeric value.")
                
            return org_slug, issue_id
        except ValueError as e:
            raise SentryError(
                f"Invalid issue ID format: {str(e)}. Must be either a URL, 'org_slug:issue_id', or just the issue ID"
            )
    
    # Handle standalone ID format
    else:
        issue_id = issue_id_or_url.strip()
        if not issue_id.isdigit():
            raise SentryError("Invalid Sentry issue ID. Must be a numeric value.")
        
        # In this case, we'll need to look up the org slug elsewhere
        return None, issue_id


def extract_replay_id(replay_id_or_url: str) -> tuple[str, str]:
    """
    Extracts the Sentry replay ID and org slug from either a full URL or standalone IDs.
    
    Args:
        replay_id_or_url: Either a full Sentry replay URL or "org_slug:replay_id" format
        
    Returns:
        Tuple of (org_slug, replay_id)
        
    Raises:
        SentryError: If format is invalid
    """
    if not replay_id_or_url:
        raise SentryError("Missing replay_id_or_url argument")

    if replay_id_or_url.startswith(("http://", "https://")):
        parsed = parse_sentry_url(replay_id_or_url, "replays")
        return parsed.org_slug, parsed.item_id
    else:
        # Expect format: org_slug:replay_id
        try:
            parts = replay_id_or_url.split(":", 1)  # Split on first colon only
            if len(parts) != 2:
                raise ValueError("Invalid format - must contain exactly one colon separator")
                
            org_slug, replay_id = parts
            org_slug = org_slug.strip()
            replay_id = replay_id.strip()
            
            # Validate components
            if not _is_valid_org_slug(org_slug):
                raise SentryError(f"Invalid organization slug format: {org_slug}")
            if not _is_valid_item_id(replay_id, SentryUrlType.REPLAYS):
                raise SentryError(f"Invalid replay ID format: {replay_id}")
                
            return org_slug, replay_id
        except ValueError as e:
            raise SentryError(
                f"Invalid replay ID format: {str(e)}. Must be either a URL or 'org_slug:replay_id'"
            )


def extract_trace_id(trace_id_or_url: str) -> tuple[str, str]:
    """
    Extracts the Sentry trace ID and organization slug from either a full URL or standalone IDs.
    
    Args:
        trace_id_or_url: Either a full Sentry trace URL or "org_slug:trace_id" format
        
    Returns:
        Tuple of (org_slug, trace_id)
        
    Raises:
        SentryError: If format is invalid
    """
    if not trace_id_or_url:
        raise SentryError("Missing trace_id_or_url argument")

    if trace_id_or_url.startswith(("http://", "https://")):
        parsed = parse_sentry_url(trace_id_or_url, "traces")
        return parsed.org_slug, parsed.item_id
    else:
        # Expect format: org_slug:trace_id
        try:
            org_slug, trace_id = trace_id_or_url.split(":")
        except ValueError:
            raise SentryError(
                "Invalid trace ID format. Must be either a URL or 'org_slug:trace_id'"
            )
        return org_slug, trace_id


def create_stacktrace(latest_event: dict) -> str:
    """
    Creates a formatted stacktrace string from the latest Sentry event.

    This function extracts exception information and stacktrace details from the
    provided event dictionary, formatting them into a human-readable string.
    It handles multiple exceptions and includes file, line number, and function
    information for each frame in the stacktrace.

    Args:
        latest_event (dict): A dictionary containing the latest Sentry event data.

    Returns:
        str: A formatted string containing the stacktrace information,
             or "No stacktrace found" if no relevant data is present.
    """
    stacktraces = []
    for entry in latest_event.get("entries", []):
        if entry["type"] != "exception":
            continue

        exception_data = entry["data"]["values"]
        for exception in exception_data:
            exception_type = exception.get("type", "Unknown")
            exception_value = exception.get("value", "")
            stacktrace = exception.get("stacktrace")

            stacktrace_text = f"Exception: {exception_type}: {exception_value}\n\n"
            if stacktrace:
                stacktrace_text += "Stacktrace:\n"
                for frame in stacktrace.get("frames", []):
                    filename = frame.get("filename", "Unknown")
                    lineno = frame.get("lineNo", "?")
                    function = frame.get("function", "Unknown")

                    stacktrace_text += f"{filename}:{lineno} in {function}\n"

                    if "context" in frame:
                        context = frame["context"]
                        for ctx_line in context:
                            stacktrace_text += f"    {ctx_line[1]}\n"

                    stacktrace_text += "\n"

            stacktraces.append(stacktrace_text)

    return "\n".join(stacktraces) if stacktraces else "No stacktrace found"


async def handle_get_trace(
    http_client: httpx.AsyncClient,
    auth_token: str,
    trace_id_or_url: str
) -> SentryTraceData:
    """
    Retrieves trace data from Sentry.
    
    Args:
        http_client: The HTTP client to use
        auth_token: Sentry authentication token
        trace_id_or_url: Either a full Sentry trace URL or "org_slug:trace_id" format
        
    Returns:
        SentryTraceData object containing the trace information
    """
    try:
        # Get org_slug and trace_id, preserving any hyphens in org_slug
        org_slug, trace_id = extract_trace_id(trace_id_or_url)
        logger.debug(f"[Trace] Using organization slug: {org_slug} for trace ID: {trace_id}")
        
        # Use the correct API endpoint for traces
        api_url = f"organizations/{org_slug}/events-trace/{trace_id}/"
        logger.debug(f"[Trace] Making request to: {SENTRY_API_BASE}{api_url}")
        
        # Fetch the trace data using the organization endpoint
        response = await http_client.get(
            api_url,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            params={
                "detailed": "1"  # Request detailed information
            }
        )
        
        # Log full response details
        log_response(response, "[Trace]")
        
        if response.status_code == 401:
            logger.error("[Trace] Authentication failed with 401 status code")
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
        elif response.status_code == 404:
            logger.error("[Trace] Resource not found with 404 status code")
            raise McpError("Trace not found. It may have been deleted or you may not have permission to access it.")
            
        response.raise_for_status()
        trace_data = response.json()
        
        if not trace_data:
            logger.error("[Trace] Received empty response from Sentry API")
            raise McpError("Received empty response from Sentry API")
            
        logger.debug(f"[Trace] Successfully parsed trace data with keys: {list(trace_data.keys())}")
        
        # Extract the transactions from the trace data
        # Different endpoints may have different structures
        transactions = None
        if "transactions" in trace_data:
            transactions = trace_data["transactions"]
        elif "data" in trace_data:
            transactions = trace_data["data"]
        else:
            # Search for transaction data at various possible locations
            for key, value in trace_data.items():
                if isinstance(value, list) and value and isinstance(value[0], dict):
                    if any(k in value[0] for k in ["transaction", "name", "spans"]):
                        transactions = value
                        break
        
        if not transactions:
            logger.error("[Trace] Could not identify transaction data in response")
            raise McpError("No transaction data found in trace response")
            
        if not isinstance(transactions, list):
            logger.error(f"[Trace] Expected list of transactions, got {type(transactions)}")
            raise McpError("Unexpected data format: transactions should be a list")
            
        logger.debug(f"[Trace] Found {len(transactions)} transactions in trace data")
        
        if not transactions:
            raise McpError("No transactions found in trace data")
            
        # Get the root transaction (usually the first one)
        root_transaction = transactions[0]
        
        # Calculate total duration from all transactions
        total_duration = 0
        for transaction in transactions:
            # Try different possible timestamp field names
            start_field = next((f for f in ["start_timestamp", "startTimestamp"] if f in transaction), None)
            end_field = next((f for f in ["timestamp", "endTimestamp"] if f in transaction), None)
            
            if start_field and end_field:
                try:
                    start = float(transaction[start_field])
                    end = float(transaction[end_field])
                    total_duration += (end - start) * 1000  # Convert to milliseconds
                except (ValueError, TypeError):
                    logger.warning(f"[Trace] Could not calculate duration from timestamps: {start_field}={transaction.get(start_field)}, {end_field}={transaction.get(end_field)}")
            elif "duration" in transaction:
                try:
                    duration = float(transaction["duration"])
                    total_duration += duration
                except (ValueError, TypeError):
                    logger.warning(f"[Trace] Could not parse duration value: {transaction.get('duration')}")
        
        # If we still don't have a duration, use a fallback
        if total_duration <= 0:
            total_duration = float(root_transaction.get("duration", 0))
            logger.debug(f"[Trace] Using fallback duration: {total_duration}")
        
        # Collect all spans from all transactions and maintain hierarchy
        all_spans = []
        span_map = {}  # Map span IDs to their spans for parent lookup
        
        for transaction in transactions:
            # Handle different field name possibilities for spans
            spans = []
            if "spans" in transaction:
                spans = transaction["spans"]
            
            # Get transaction name with fallbacks
            transaction_name = transaction.get("transaction", 
                               transaction.get("name", 
                               transaction.get("description", "unknown")))
            
            # Get transaction operation type with fallbacks
            transaction_op = transaction.get("op", 
                            transaction.get("transaction_op", "unknown"))
            
            # First pass: collect spans and build map for lookups
            for span in spans:
                # Handle different field name possibilities for span ID
                span_id = span.get("span_id", span.get("spanId", ""))
                if span_id:
                    # Add transaction context to the span
                    span["transaction"] = transaction_name
                    span["transaction_op"] = transaction_op
                    span_map[span_id] = span
            
            # Second pass: establish parent-child relationships
            for span in spans:
                # Handle different field name possibilities for parent span ID
                parent_id = span.get("parent_span_id", span.get("parentSpanId", ""))
                if parent_id and parent_id in span_map:
                    parent = span_map[parent_id]
                    span["parent_op"] = parent.get("op", "unknown")
                    span["parent_description"] = parent.get("description", "unknown")
            
            all_spans.extend(spans)
        
        # Sort spans chronologically by start timestamp
        # Handle different field name possibilities for start timestamp
        all_spans.sort(key=lambda x: float(x.get("start_timestamp", 
                                         x.get("startTimestamp", 0))))
        
        # Extract additional fields from root transaction with fallbacks
        project_id = str(root_transaction.get("project_id", 
                       root_transaction.get("projectId", "")))
        
        timestamp = root_transaction.get("timestamp", 
                   root_transaction.get("start_timestamp", 
                   root_transaction.get("startTimestamp", "")))
        
        status = root_transaction.get("status", 
                root_transaction.get("transaction_status", 
                root_transaction.get("transaction.status", "unknown")))
        
        tags = root_transaction.get("tags", {})
        
        environment = root_transaction.get("environment", 
                     root_transaction.get("tags", {}).get("environment"))
        
        release = root_transaction.get("release", 
                 root_transaction.get("tags", {}).get("release"))
        
        user = root_transaction.get("user")
        
        measurements = root_transaction.get("measurements")
        
        sdk = root_transaction.get("sdk", {})
        
        platform = root_transaction.get("platform")
        
        contexts = root_transaction.get("contexts", {})
        
        # Create SentryTraceData object with trace information
        trace_obj = SentryTraceData(
            trace_id=trace_id,
            transaction=transaction_name,
            project_id=project_id,
            timestamp=timestamp,
            duration=total_duration,
            status=status,
            spans=all_spans,
            tags=tags,
            environment=environment,
            release=release,
            user=user,
            measurements=measurements,
            transaction_op=transaction_op,
            sdk=sdk,
            platform=platform,
            contexts=contexts
        )
        
        logger.debug("[Trace] Successfully created SentryTraceData object")
        return trace_obj
        
    except SentryError as e:
        logger.error(f"[Trace] SentryError occurred: {str(e)}")
        raise McpError(str(e))
    except httpx.HTTPStatusError as e:
        logger.error(f"[Trace] HTTP error occurred: {str(e)}")
        raise McpError(f"Error fetching Sentry trace: {str(e)}")
    except Exception as e:
        logger.error(f"[Trace] Unexpected error occurred: {str(e)}")
        raise McpError(f"An error occurred: {str(e)}")


async def handle_get_replay(
    http_client: httpx.AsyncClient,
    auth_token: str,
    replay_id_or_url: str
) -> SentryReplayData:
    """
    Retrieves replay data from Sentry.
    
    Args:
        http_client: The HTTP client to use
        auth_token: Sentry authentication token
        replay_id_or_url: Either a full Sentry replay URL or "org_slug:replay_id" format
        
    Returns:
        SentryReplayData object containing the replay information
    """
    try:
        # Get org_slug and replay_id, preserving any hyphens in org_slug
        org_slug, replay_id = extract_replay_id(replay_id_or_url)
        logger.debug(f"[Replay] Using organization slug: {org_slug} for replay ID: {replay_id}")
        
        # Construct API URL
        api_url = f"organizations/{org_slug}/replays/{replay_id}/"
        logger.debug(f"[Replay] Making request to: {SENTRY_API_BASE}{api_url}")
        
        # Use the correct API endpoint format for replays
        response = await http_client.get(
            api_url,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            params={"detailed": "1"}
        )
        
        # Log full response details
        log_response(response, "[Replay]")
        
        if response.status_code == 401:
            logger.error("[Replay] Authentication failed with 401 status code")
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
        elif response.status_code == 404:
            logger.error("[Replay] Resource not found with 404 status code")
            raise McpError("Replay not found. It may have been deleted or you may not have permission to access it.")
            
        response.raise_for_status()
        response_data = response.json()
        
        if not response_data:
            logger.error("[Replay] Received empty response from Sentry API")
            raise McpError("Received empty response from Sentry API")
            
        # Extract the nested data
        if "data" not in response_data:
            logger.error("[Replay] Response missing 'data' key")
            raise McpError("Unexpected API response format: missing 'data' key")
            
        replay_data = response_data["data"]
        logger.debug(f"[Replay] Successfully parsed replay data with keys: {list(replay_data.keys())}")
        
        # Create SentryReplayData object
        replay_obj = SentryReplayData(
            replay_id=replay_id,
            project_id=replay_data.get("project_id", ""),
            timestamp=replay_data.get("started_at", ""),
            duration=replay_data.get("duration", 0),
            environment=replay_data.get("environment", "unknown"),
            urls=replay_data.get("urls", []),
            error_ids=replay_data.get("error_ids", []),
            # Browser info
            browser_name=replay_data.get("browser", {}).get("name", "Unknown"),
            browser_version=replay_data.get("browser", {}).get("version", "Unknown"),
            # Device info
            device_name=replay_data.get("device", {}).get("name", "Unknown"),
            device_family=replay_data.get("device", {}).get("family", "Unknown"),
            os_name=replay_data.get("os", {}).get("name", "Unknown"),
            os_version=replay_data.get("os", {}).get("version", "Unknown"),
            # User info
            user_name=replay_data.get("user", {}).get("display_name"),
            user_email=replay_data.get("user", {}).get("email"),
            # Activity counts
            activity_count=replay_data.get("activity", 0),
            dead_clicks=replay_data.get("count_dead_clicks", 0),
            rage_clicks=replay_data.get("count_rage_clicks", 0),
            error_count=replay_data.get("count_errors", 0)
        )
        
        logger.debug("[Replay] Successfully created SentryReplayData object")
        return replay_obj
        
    except SentryError as e:
        logger.error(f"[Replay] SentryError occurred: {str(e)}")
        raise McpError(str(e))
    except httpx.HTTPStatusError as e:
        logger.error(f"[Replay] HTTP error occurred: {str(e)}")
        raise McpError(f"Error fetching Sentry replay: {str(e)}")
    except Exception as e:
        logger.error(f"[Replay] Unexpected error occurred: {str(e)}")
        raise McpError(f"An error occurred: {str(e)}")


async def handle_create_release(
    http_client: httpx.AsyncClient,
    auth_token: str,
    version: str,
    projects: list[str],
    org_slug: str,
    refs: list[dict] | None = None,
) -> SentryReleaseData:
    """
    Creates a new release in Sentry.
    
    Args:
        http_client: The HTTP client to use
        auth_token: Sentry authentication token
        version: The version identifier for the release
        projects: List of project slugs to associate the release with
        org_slug: The organization slug where the release should be created
        refs: Optional list of repository references
        
    Returns:
        SentryReleaseData object containing the created release information
    """
    try:
        logger.debug(f"Creating release version {version} for organization {org_slug}")
        
        payload = {
            "version": version,
            "projects": projects,
        }
        
        if refs:
            payload["refs"] = refs
            
        response = await http_client.post(
            f"organizations/{org_slug}/releases/",
            headers={"Authorization": f"Bearer {auth_token}"},
            json=payload
        )
        
        if response.status_code == 401:
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
            
        response.raise_for_status()
        release_data = response.json()
        
        return SentryReleaseData(
            version=release_data["version"],
            url=release_data.get("url", ""),
            projects=release_data["projects"],
            dateCreated=release_data["dateCreated"]
        )
        
    except httpx.HTTPStatusError as e:
        raise McpError(f"Error creating Sentry release: {str(e)}")
    except Exception as e:
        raise McpError(f"An error occurred: {str(e)}")


async def handle_sentry_issue(
    http_client: httpx.AsyncClient, auth_token: str, issue_id_or_url: str
) -> SentryIssueData:
    try:
        issue_id = extract_issue_id(issue_id_or_url)

        # First get the organization slug by listing organizations
        orgs_response = await http_client.get(
            "organizations/",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        if orgs_response.status_code == 401:
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
            
        orgs_response.raise_for_status()
        orgs_data = orgs_response.json()
        
        if not orgs_data:
            raise McpError("No organizations found for this auth token")
            
        org_slug = orgs_data[0]["slug"]  # Use first available org

        # Get issue details using org context
        response = await http_client.get(
            f"organizations/{org_slug}/issues/{issue_id}/",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        if response.status_code == 401:
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
        elif response.status_code == 404:
            raise McpError("Issue not found. It may have been deleted or you may not have permission to access it.")
            
        response.raise_for_status()
        issue_data = response.json()

        # Get issue hashes for stacktrace
        hashes_response = await http_client.get(
            f"issues/{issue_id}/hashes/",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        hashes_response.raise_for_status()
        hashes = hashes_response.json()

        stacktrace = "No stacktrace available"
        if hashes:
            latest_event = hashes[0]["latestEvent"]
            stacktrace = create_stacktrace(latest_event)

        return SentryIssueData(
            title=issue_data["title"],
            issue_id=issue_id,
            status=issue_data["status"],
            level=issue_data["level"],
            first_seen=issue_data["firstSeen"],
            last_seen=issue_data["lastSeen"],
            count=int(issue_data["count"]),
            stacktrace=stacktrace,
            # New fields
            culprit=issue_data.get("culprit", "Unknown"),
            platform=issue_data.get("platform"),
            project_name=issue_data.get("project", {}).get("name"),
            project_slug=issue_data.get("project", {}).get("slug"),
            priority=issue_data.get("priority"),
            user_count=issue_data.get("userCount", 0),
            tags=issue_data.get("tags", []),
            stats=issue_data.get("stats", {})
        )

    except SentryError as e:
        raise McpError(str(e))
    except httpx.HTTPStatusError as e:
        raise McpError(f"Error fetching Sentry issue: {str(e)}")
    except Exception as e:
        raise McpError(f"An error occurred: {str(e)}")


async def handle_get_event(
    http_client: httpx.AsyncClient,
    auth_token: str,
    issue_id_or_url: str,
    event_id: str
) -> SentryEventData:
    """
    Retrieves a specific event from a Sentry issue.
    
    Args:
        http_client: The HTTP client to use
        auth_token: Sentry authentication token
        issue_id_or_url: Either a full Sentry issue URL or "org_slug:issue_id" format
        event_id: The specific event ID to retrieve
        
    Returns:
        SentryEventData object containing the event information
    """
    try:
        # Extract the org_slug and issue_id, preserving any hyphens in org_slug
        if issue_id_or_url.startswith(("http://", "https://")):
            parsed = parse_sentry_url(issue_id_or_url, "issues")
            org_slug = parsed.org_slug
            issue_id = parsed.item_id
            logger.debug(f"[Event] Extracted from URL - org_slug: {org_slug}, issue_id: {issue_id}")
        else:
            # Expect format: org_slug:issue_id
            try:
                org_slug, issue_id = issue_id_or_url.split(":")
                logger.debug(f"[Event] Parsed from string - org_slug: {org_slug}, issue_id: {issue_id}")
            except ValueError:
                logger.error(f"[Event] Failed to parse issue_id_or_url: {issue_id_or_url}")
                raise SentryError(
                    "Invalid issue ID format. Must be either a URL or 'org_slug:issue_id'"
                )
                
        logger.debug(f"[Event] Using organization slug: {org_slug} for issue ID: {issue_id} and event ID: {event_id}")
        
        # Construct API URL
        api_url = f"organizations/{org_slug}/issues/{issue_id}/events/{event_id}/"
        logger.debug(f"[Event] Making request to: {SENTRY_API_BASE}{api_url}")
        
        # Get the event data
        response = await http_client.get(
            api_url,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            }
        )
        
        # Log full response details
        log_response(response, "[Event]")
        
        if response.status_code == 401:
            logger.error("[Event] Authentication failed with 401 status code")
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
        elif response.status_code == 404:
            logger.error("[Event] Resource not found with 404 status code")
            raise McpError("Event not found. It may have been deleted or you may not have permission to access it.")
            
        response.raise_for_status()
        event_data = response.json()
        
        if not event_data:
            logger.error("[Event] Received empty response from Sentry API")
            raise McpError("Received empty response from Sentry API")
            
        logger.debug(f"[Event] Successfully parsed event data with keys: {list(event_data.keys())}")
        
        # Extract stacktrace if available
        stacktrace = None
        for entry in event_data.get("entries", []):
            if entry["type"] == "exception":
                logger.debug("[Event] Found exception entry, extracting stacktrace")
                stacktrace = create_stacktrace({"entries": [entry]})
                break
        
        if not stacktrace:
            logger.debug("[Event] No stacktrace found in event data")
        
        # Create SentryEventData object
        event_obj = SentryEventData(
            event_id=event_data["eventID"],
            issue_id=event_data["groupID"],
            project_id=event_data.get("projectID", ""),
            timestamp=event_data["dateCreated"],
            title=event_data.get("title", ""),
            message=event_data.get("message", ""),
            level=event_data.get("level", "error"),
            platform=event_data.get("platform", "unknown"),
            stacktrace=stacktrace,
            tags=event_data.get("tags", []),
            contexts=event_data.get("contexts", {})
        )
        
        logger.debug("[Event] Successfully created SentryEventData object")
        return event_obj
        
    except SentryError as e:
        logger.error(f"[Event] SentryError occurred: {str(e)}")
        raise McpError(str(e))
    except httpx.HTTPStatusError as e:
        logger.error(f"[Event] HTTP error occurred: {str(e)}")
        raise McpError(f"Error fetching Sentry event: {str(e)}")
    except Exception as e:
        logger.error(f"[Event] Unexpected error occurred: {str(e)}")
        raise McpError(f"An error occurred: {str(e)}")


async def handle_list_events(
    http_client: httpx.AsyncClient,
    auth_token: str,
    organization_slug: str,
    project_slug: str
) -> SentryEventListData:
    """
    Lists error events from a specific Sentry project.
    
    Args:
        http_client: The HTTP client to use
        auth_token: Sentry authentication token
        organization_slug: The organization slug
        project_slug: The project slug
        
    Returns:
        SentryEventListData object containing the list of events
    """
    try:
        logger.debug(f"[Events] Listing events for org: {organization_slug}, project: {project_slug}")
        
        # Construct API URL
        api_url = f"projects/{organization_slug}/{project_slug}/events/"
        logger.debug(f"[Events] Making request to: {SENTRY_API_BASE}{api_url}")
        
        # Make the API request
        response = await http_client.get(
            api_url,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            }
        )
        
        # Log full response details
        log_response(response, "[Events]")
        
        if response.status_code == 401:
            logger.error("[Events] Authentication failed with 401 status code")
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
        elif response.status_code == 404:
            logger.error("[Events] Resource not found with 404 status code")
            raise McpError("Project not found. It may have been deleted or you may not have permission to access it.")
            
        response.raise_for_status()
        events_data = response.json()
        
        if not isinstance(events_data, list):
            logger.error(f"[Events] Unexpected response format: {type(events_data)}")
            raise McpError("Unexpected API response format: expected a list of events")
            
        logger.debug(f"[Events] Successfully retrieved {len(events_data)} events")
        
        # Create SentryEventListData object
        events_obj = SentryEventListData(
            events=events_data,
            organization_slug=organization_slug,
            project_slug=project_slug
        )
        
        logger.debug("[Events] Successfully created SentryEventListData object")
        return events_obj
        
    except httpx.HTTPStatusError as e:
        logger.error(f"[Events] HTTP error occurred: {str(e)}")
        raise McpError(f"Error fetching Sentry events: {str(e)}")
    except Exception as e:
        logger.error(f"[Events] Unexpected error occurred: {str(e)}")
        raise McpError(f"An error occurred: {str(e)}")

async def handle_list_issues(
    http_client: httpx.AsyncClient,
    auth_token: str,
    organization_slug: str,
    project_slug: str
) -> SentryIssueListData:
    """
    Lists issues from a specific Sentry project.
    
    Args:
        http_client: The HTTP client to use
        auth_token: Sentry authentication token
        organization_slug: The organization slug
        project_slug: The project slug
        
    Returns:
        SentryIssueListData object containing the list of issues
    """
    try:
        logger.debug(f"[Issues] Listing issues for org: {organization_slug}, project: {project_slug}")
        
        # Construct API URL
        api_url = f"projects/{organization_slug}/{project_slug}/issues/"
        logger.debug(f"[Issues] Making request to: {SENTRY_API_BASE}{api_url}")
        
        # Make the API request
        response = await http_client.get(
            api_url,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            }
        )
        
        # Log full response details
        log_response(response, "[Issues]")
        
        if response.status_code == 401:
            logger.error("[Issues] Authentication failed with 401 status code")
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
        elif response.status_code == 404:
            logger.error("[Issues] Resource not found with 404 status code")
            raise McpError("Project not found. It may have been deleted or you may not have permission to access it.")
            
        response.raise_for_status()
        issues_data = response.json()
        
        if not isinstance(issues_data, list):
            logger.error(f"[Issues] Unexpected response format: {type(issues_data)}")
            raise McpError("Unexpected API response format: expected a list of issues")
            
        logger.debug(f"[Issues] Successfully retrieved {len(issues_data)} issues")
        
        # Create SentryIssueListData object
        issues_obj = SentryIssueListData(
            issues=issues_data,
            organization_slug=organization_slug,
            project_slug=project_slug
        )
        
        logger.debug("[Issues] Successfully created SentryIssueListData object")
        return issues_obj
        
    except httpx.HTTPStatusError as e:
        logger.error(f"[Issues] HTTP error occurred: {str(e)}")
        raise McpError(f"Error fetching Sentry issues: {str(e)}")
    except Exception as e:
        logger.error(f"[Issues] Unexpected error occurred: {str(e)}")
        raise McpError(f"An error occurred: {str(e)}")

async def handle_list_projects(
    http_client: httpx.AsyncClient,
    auth_token: str
) -> SentryProjectListData:
    """
    Lists all accessible Sentry projects.
    
    Args:
        http_client: The HTTP client to use
        auth_token: Sentry authentication token
        
    Returns:
        SentryProjectListData object containing the list of projects
    """
    try:
        logger.debug("[Projects] Listing all accessible projects")
        
        # Make the API request
        response = await http_client.get(
            "projects/",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            }
        )
        
        # Log full response details
        log_response(response, "[Projects]")
        
        if response.status_code == 401:
            logger.error("[Projects] Authentication failed with 401 status code")
            raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
            
        response.raise_for_status()
        projects_data = response.json()
        
        if not isinstance(projects_data, list):
            logger.error(f"[Projects] Unexpected response format: {type(projects_data)}")
            raise McpError("Unexpected API response format: expected a list of projects")
            
        logger.debug(f"[Projects] Successfully retrieved {len(projects_data)} projects")
        
        # Create SentryProjectListData object
        projects_obj = SentryProjectListData(
            projects=projects_data
        )
        
        logger.debug("[Projects] Successfully created SentryProjectListData object")
        return projects_obj
        
    except httpx.HTTPStatusError as e:
        logger.error(f"[Projects] HTTP error occurred: {str(e)}")
        raise McpError(f"Error fetching Sentry projects: {str(e)}")
    except Exception as e:
        logger.error(f"[Projects] Unexpected error occurred: {str(e)}")
        raise McpError(f"An error occurred: {str(e)}")

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="get_sentry_issue",
            description="""Retrieve and analyze a Sentry issue. Accepts either:
            1. A full Sentry issue URL (e.g., https://org-name.sentry.io/issues/123456)
            2. Just the issue ID (e.g., 123456)""",
            inputSchema={
                "type": "object",
                "properties": {
                    "issue_id_or_url": {
                        "type": "string",
                        "description": "Either a full Sentry issue URL or just the numeric issue ID"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["plain", "markdown"],
                        "description": "Output format (default: markdown)"
                    },
                    "view": {
                        "type": "string",
                        "enum": ["summary", "detailed"],
                        "description": "View type (default: detailed)"
                    }
                },
                "required": ["issue_id_or_url"]
            }
        ),
        types.Tool(
            name="create_release",
            description="""Create a new release in Sentry. Use this tool when you need to:
            - Create a new release for deployment tracking
            - Associate commits with a release
            - Track release adoption and stability
            - Monitor release health metrics""",
            inputSchema={
                "type": "object",
                "properties": {
                    "version": {
                        "type": "string",
                        "description": "Unique identifier for the release (e.g. commit hash, version number)"
                    },
                    "projects": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": "List of project slugs to associate the release with"
                    },
                    "refs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "repository": {"type": "string"},
                                "commit": {"type": "string"},
                                "previousCommit": {"type": "string"}
                            }
                        },
                        "description": "Optional list of repository references"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["plain", "markdown"],
                        "description": "Output format (default: markdown)"
                    },
                    "view": {
                        "type": "string",
                        "enum": ["summary", "detailed"],
                        "description": "View type (default: detailed)"
                    }
                },
                "required": ["version", "projects"]
            }
        ),
        types.Tool(
            name="get_replay",
            description="""Retrieve and analyze a Sentry session replay. Accepts either:
            1. A full Sentry replay URL (e.g., https://org-name.sentry.io/replays/abc123)
            2. Organization slug and replay ID in format: 'org-slug:replay-id'""",
            inputSchema={
                "type": "object",
                "properties": {
                    "replay_id_or_url": {
                        "type": "string",
                        "description": "Either a full Sentry replay URL or 'org-slug:replay-id' format"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["plain", "markdown"],
                        "description": "Output format (default: markdown)"
                    },
                    "view": {
                        "type": "string",
                        "enum": ["summary", "detailed"],
                        "description": "View type (default: detailed)"
                    }
                },
                "required": ["replay_id_or_url"]
            }
        ),
        types.Tool(
            name="get_sentry_event",
            description="""Retrieve and analyze a specific Sentry event from an issue. Requires:
            1. Issue ID or URL (e.g., https://org-name.sentry.io/issues/123456 or just 123456)
            2. Event ID (e.g., ab29e1067f214acb8ce89f3a03be25e8)""",
            inputSchema={
                "type": "object",
                "properties": {
                    "issue_id_or_url": {
                        "type": "string",
                        "description": "Either a full Sentry issue URL or just the numeric issue ID"
                    },
                    "event_id": {
                        "type": "string",
                        "description": "The specific event ID to retrieve"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["plain", "markdown"],
                        "description": "Output format (default: markdown)"
                    },
                    "view": {
                        "type": "string",
                        "enum": ["summary", "detailed"],
                        "description": "View type (default: detailed)"
                    }
                },
                "required": ["issue_id_or_url", "event_id"]
            }
        ),
        types.Tool(
            name="list_events",
            description="""List error events from a specific Sentry project. This tool helps you:
            - View recent error events across your project
            - Monitor error frequency and patterns
            - Analyze error distributions by level and platform
            - Track error occurrence timestamps""",
            inputSchema={
                "type": "object",
                "properties": {
                    "organization_slug": {
                        "type": "string",
                        "description": "The slug of the organization the project belongs to"
                    },
                    "project_slug": {
                        "type": "string",
                        "description": "The slug of the project to list events from"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["plain", "markdown"],
                        "description": "Output format (default: markdown)"
                    },
                    "view": {
                        "type": "string",
                        "enum": ["summary", "detailed"],
                        "description": "View type (default: detailed)"
                    }
                },
                "required": ["organization_slug", "project_slug"]
            }
        ),
        types.Tool(
            name="list_issues",
            description="""List issues from a specific Sentry project. This tool helps you:
            - View all issues in your project
            - Monitor issue status and severity
            - Track issue frequency and timing
            - Get issue IDs for use with other tools
            
            The output is formatted as a markdown table by default, making it easy to:
            1. Copy issue IDs for use with other tools
            2. Sort and filter issues
            3. Share issue summaries""",
            inputSchema={
                "type": "object",
                "properties": {
                    "organization_slug": {
                        "type": "string",
                        "description": "The slug of the organization the project belongs to"
                    },
                    "project_slug": {
                        "type": "string",
                        "description": "The slug of the project to list issues from"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["plain", "markdown"],
                        "description": "Output format (default: markdown)"
                    },
                    "view": {
                        "type": "string",
                        "enum": ["summary", "detailed"],
                        "description": "View type (default: detailed)"
                    }
                },
                "required": ["organization_slug", "project_slug"]
            }
        ),
        types.Tool(
            name="list_projects",
            description="""List all accessible Sentry projects. This tool helps you:
            - View all projects you have access to
            - Get project slugs and IDs for use with other tools
            - Monitor project status and settings
            - View project features and organization details
            
            The output is formatted as a markdown table by default, making it easy to:
            1. Copy project slugs and IDs for use with other tools
            2. Sort and filter projects
            3. Share project summaries""",
            inputSchema={
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["plain", "markdown"],
                        "description": "Output format (default: markdown)"
                    },
                    "view": {
                        "type": "string",
                        "enum": ["summary", "detailed"],
                        "description": "View type (default: detailed)"
                    }
                }
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent]:
    if not arguments:
        raise ValueError("Missing arguments")
        
    # Extract common formatting options
    format_str = arguments.get("format", "markdown")
    view_str = arguments.get("view", "detailed")  # Default to detailed view
    
    format_type = OutputFormat(format_str)
    view_type = ViewType(view_str)
    
    # Helper function to get data based on tool name
    async def get_data():
        if name == "list_projects":
            return await handle_list_projects(http_client, auth_token)
        elif name == "list_issues":
            if "organization_slug" not in arguments or "project_slug" not in arguments:
                raise ValueError("Missing required arguments: organization_slug and project_slug")
            return await handle_list_issues(
                http_client,
                auth_token,
                arguments["organization_slug"],
                arguments["project_slug"]
            )
        elif name == "list_events":
            if "organization_slug" not in arguments or "project_slug" not in arguments:
                raise ValueError("Missing required arguments: organization_slug and project_slug")
            return await handle_list_events(
                http_client,
                auth_token,
                arguments["organization_slug"],
                arguments["project_slug"]
            )
        elif name == "get_sentry_issue":
            if "issue_id_or_url" not in arguments:
                raise ValueError("Missing issue_id_or_url argument")
            return await handle_sentry_issue(http_client, auth_token, arguments["issue_id_or_url"])
        elif name == "create_release":
            if "version" not in arguments or "projects" not in arguments:
                raise ValueError("Missing required arguments: version and projects")
            if "org_slug" not in arguments:
                # Try to get the first organization's slug
                orgs_response = await http_client.get(
                    "organizations/",
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                
                if orgs_response.status_code == 401:
                    raise McpError("Error: Unauthorized. Please check your MCP_SENTRY_AUTH_TOKEN token.")
                    
                orgs_response.raise_for_status()
                orgs_data = orgs_response.json()
                
                if not orgs_data:
                    raise McpError("No organizations found for this auth token. Please provide org_slug explicitly.")
                    
                org_slug = orgs_data[0]["slug"]
                logger.debug(f"Using default organization slug: {org_slug}")
            else:
                org_slug = arguments["org_slug"]
                
            return await handle_create_release(
                http_client,
                auth_token,
                arguments["version"],
                arguments["projects"],
                org_slug,
                arguments.get("refs")
            )
        elif name == "get_replay":
            if "replay_id_or_url" not in arguments:
                raise ValueError("Missing replay_id_or_url argument")
            return await handle_get_replay(http_client, auth_token, arguments["replay_id_or_url"])
        elif name == "get_sentry_event":
            if "issue_id_or_url" not in arguments or "event_id" not in arguments:
                raise ValueError("Missing required arguments: issue_id_or_url and event_id")
            return await handle_get_event(
                http_client,
                auth_token,
                arguments["issue_id_or_url"],
                arguments["event_id"]
            )
        raise ValueError(f"Unknown tool: {name}")
    
    try:
        # Get the data
        data = await get_data()
        
        # Return the formatted result
        return data.to_tool_result(format=format_type, view=view_type)
    except (ValueError, McpError) as e:
        # Re-raise expected errors
        raise
    except Exception as e:
        # Log unexpected errors and convert to a more user-friendly message
        logger.error(f"Unexpected error in handle_call_tool for {name}: {str(e)}", exc_info=True)
        raise McpError(f"An unexpected error occurred while using the {name} tool: {str(e)}")

@click.command()
@click.option(
    "--auth-token",
    envvar="SENTRY_TOKEN",
    required=True,
    help="Sentry authentication token",
)
def main(auth_token: str):
    async def _run():
        async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
            server = await serve(auth_token)
            await server.run(
                read_stream,
                write_stream,
                InitializationOptions(
                    server_name="sentry",
                    server_version="0.4.1",
                    capabilities=server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )

    asyncio.run(_run())