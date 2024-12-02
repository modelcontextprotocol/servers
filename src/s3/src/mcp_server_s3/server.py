import json
import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from functools import lru_cache
from typing import Optional, Any
import magic
import boto3
import re

import textract
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource
from mcp.server import Server
from dateutil.parser import parse as parse_date
from collections.abc import Sequence

logger = logging.getLogger('s3_mcp_server')
logger.info("Starting S3 MCP Server")


class S3Tools(str, Enum):
    LIST_FILES = "list_files"
    GET_FILE_CONTENT = "get_file_content"
    ANALYZE_FILE = "analyze_file"
    SEARCH_FILE = "search_file"


class MCPServerError(Exception):
    pass


class FileProcessingError(MCPServerError):
    pass


class SearchError(MCPServerError):
    pass


class SearchType(Enum):
    EXACT = "exact"
    ANY = "any"
    ALL = "all"
    REGEX = "regex"


@dataclass
class SearchQuery:
    text: str
    search_type: SearchType
    case_sensitive: bool = False
    fields: list[str] = None


@dataclass
class FileFilter:
    field: str
    value: Any
    operator: str


@dataclass
class SearchResult:
    content: str
    file_key: str
    matched_terms: list[str]
    metadata: dict[str, Any]


class S3MCPServer:
    def __init__(self, bucket_name: str, prefix: str = ""):
        self.bucket_name = bucket_name
        self.prefix = prefix
        self.s3_client = boto3.client('s3')
        self.supported_mime_types = ['text/plain', 'application/pdf',
                                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx',
                                     'text/csv', 'application/json']
        self.max_file_size = 50 * 1024 * 1024

    @lru_cache(maxsize=1000)
    def get_file_content(self, key: str) -> Optional[dict[str, Any]]:
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=key
            )

            if response['ContentLength'] > self.max_file_size:
                raise FileProcessingError(f"File {key} exceeds size limit")

            content = response['Body'].read()
            mime_type = magic.from_buffer(content, mime=True)

            if mime_type not in self.supported_mime_types:
                raise FileProcessingError(f"Unsupported file type {mime_type}")

            try:
                text = textract.process(
                    content,
                    method='pdfminer' if mime_type == 'application/pdf' else None
                ).decode('utf-8')
            except Exception as e:
                raise FileProcessingError(f"Text extraction error for {key}: {str(e)}")

            metadata = self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=key
            )

            return {
                'content': text,
                'metadata': {
                    'last_modified': metadata['LastModified'].isoformat(),
                    'size': metadata['ContentLength'],
                    'type': mime_type,
                    'key': key
                }
            }
        except Exception as e:
            raise FileProcessingError(f"Error accessing {key}: {str(e)}")

    @lru_cache(maxsize=100)
    def list_files(self, prefix: Optional[str] = "") -> list[str]:
        try:
            prefix = prefix or self.prefix
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            return [obj['Key'] for obj in response.get('Contents', [])]
        except Exception as e:
            raise RuntimeError(f"Error listing files: {str(e)}")

    @staticmethod
    def _find_matches(
            content: str,
            query: SearchQuery
    ) -> list[str]:
        if not query.case_sensitive:
            content = content.lower()
            search_text = query.text.lower()
        else:
            search_text = query.text

        matches = []

        if query.search_type == SearchType.EXACT:
            if search_text in content:
                matches.append(search_text)

        elif query.search_type == SearchType.ANY:
            words = search_text.split()
            for word in words:
                if word in content:
                    matches.append(word)

        elif query.search_type == SearchType.ALL:
            words = search_text.split()
            if all(word in content for word in words):
                matches.extend(words)

        elif query.search_type == SearchType.REGEX:
            try:
                found = re.findall(search_text, content)
                matches.extend(found)
            except re.error:
                raise SearchError(f"Invalid regex pattern: {search_text}")
        return matches

    @staticmethod
    def _apply_filter(file_data: dict, filter_item: FileFilter) -> bool:
        field_value = file_data.get(filter_item.field)
        if field_value is None and 'metadata' in file_data:
            field_value = file_data['metadata'].get(filter_item.field)

        if field_value is None:
            return False

        if filter_item.operator == 'equals':
            return field_value == filter_item.value

        elif filter_item.operator == 'in':
            return field_value in filter_item.value

        elif filter_item.operator == 'between':
            if isinstance(field_value, (str, datetime)):
                date_value = parse_date(field_value) if isinstance(field_value, str) else field_value
                start_date = parse_date(filter_item.value[0])
                end_date = parse_date(filter_item.value[1])
                return start_date <= date_value <= end_date
            else:
                return filter_item.value[0] <= field_value <= filter_item.value[1]

        return False

    async def analyze_file(self, key: str) -> dict[str, Any]:
        try:
            file_data = self.get_file_content(key)
            if not file_data:
                return {}

            text = file_data['content']
            words = text.split()

            return {
                'metadata': file_data['metadata'],
                'mime_type': file_data['mime_type'],
                'size': file_data['size'],
                'last_modified': file_data['last_modified'],
                'stats': {
                    'word_count': len(words),
                    'char_count': len(text),
                    'average_word_length': sum(len(w) for w in words) / len(words) if words else 0,
                    'unique_words': len(set(words))
                }
            }
        except Exception as e:
            raise FileProcessingError(f"Error analyzing file {key}: {str(e)}")

    async def search_files(
            self,
            query: SearchQuery,
            filters: Optional[list[FileFilter]] = None,
            max_results: int = 10
    ) -> list[SearchResult]:
        try:
            results = []
            files = await self._get_filtered_files(filters)

            for file_key, file_data in files.items():
                matches = self._find_matches(
                    file_data['content'],
                    query
                )

                if matches:
                    results.append(SearchResult(
                        content=file_data['content'],
                        file_key=file_key,
                        matched_terms=list(set(matches)),
                        metadata={
                            **file_data['metadata'],
                            'file_type': file_data['mime_type'],
                            'size': file_data['size'],
                            'last_modified': file_data['last_modified']
                        }
                    ))

                if len(results) >= max_results:
                    break
            return results
        except Exception as e:
            raise SearchError(f"Error searching files: {str(e)}")

    async def _get_filtered_files(
            self,
            filters: Optional[list[FileFilter]]
    ) -> dict[str, dict]:
        files = {}
        for key in self.list_files():
            file_data = self.get_file_content(key)
            if not file_data:
                continue

            if filters:
                matches_all_filters = True
                for filter_item in filters:
                    if not self._apply_filter(file_data, filter_item):
                        matches_all_filters = False
                        break

                if not matches_all_filters:
                    continue

            files[key] = file_data

        return files


async def main(bucket_name: str, prefix: str = ""):
    logger.info(f"Starting S3 MCP Server with bucket name: {bucket_name}")
    server = Server("s3-mcp-server")
    s3_server = S3MCPServer(bucket_name, prefix)
    logger.debug("Registering handlers")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available s3 tools."""
        return [
            Tool(
                name="list_files",
                description="List files in S3 bucket and prefix",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "bucket_name": {"type": "string", "description": "Name of the S3 bucket"},
                        "prefix": {"type": "string", "description": "Prefix to filter files"}
                    },
                    "required": ["bucket_name"],
                },
            ),
            Tool(
                name="get_file_content",
                description="Get the content of a file in S3",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "Key of the file in S3"},
                    },
                    "required": ["key"],
                },
            ),
            Tool(
                name="analyze_file",
                description="Analyze the content of a file in S3",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "Key of the file in S3"},
                    },
                    "required": ["key"],
                },
            ),
            Tool(
                name="search_file",
                description="Search for text in files in S3",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string", "description": "Text to search"},
                                "search_type": {
                                    "type": "string",
                                    "enum": ["exact", "any", "all", "regex"],
                                    "description": "Search type"
                                },
                                "case_sensitive": {"type": "boolean", "description": "Case sensitive search"},
                                "fields": {"type": "array", "items": {"type": "string"},
                                           "description": "Fields to search"}
                            },
                            "required": ["text", "search_type"]
                        },
                        "filters": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "field": {"type": "string", "description": "Field to filter"},
                                    "value": {"type": "string", "description": "Value to filter"},
                                    "operator": {"type": "string", "enum": ["equals", "in", "between"],
                                                 "description": "Filter operator"}
                                },
                                "required": ["field", "value", "operator"]
                            },
                            "description": "Filters to apply"
                        },
                        "max_results": {"type": "integer", "description": "Maximum number of results"}
                    },
                    "required": ["query"],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any] | None) -> Sequence[
        TextContent | ImageContent | EmbeddedResource]:
        """Call a tool."""
        try:
            match name:
                case S3Tools.LIST_FILES.value:
                    s3_bucket_name = arguments.get('bucket_name')
                    if not s3_bucket_name:
                        raise ValueError("Missing required argument: bucket_name")
                    results = s3_server.list_files(arguments.get('prefix'))
                    return [TextContent(type="text", text=str(results))]

                case S3Tools.GET_FILE_CONTENT.value:
                    if not arguments.get('key'):
                        raise ValueError("Missing required argument: key")
                    results = s3_server.get_file_content(arguments['key'])
                    return [TextContent(type="text", text=json.dumps(results, indent=2))]
                case S3Tools.ANALYZE_FILE.value:
                    if not arguments.get('key'):
                        raise ValueError("Missing required argument: key")
                    results = await s3_server.analyze_file(arguments['key'])
                    return [TextContent(type="text", text=json.dumps(results, indent=2))]
                case S3Tools.SEARCH_FILE.value:
                    query = arguments.get('query')
                    if not query:
                        raise ValueError("Missing required argument: query")
                    query = SearchQuery(**query)
                    filters = arguments.get('filters')
                    if filters:
                        filters = [FileFilter(**f) for f in filters]
                    max_results = arguments.get('max_results', 10)
                    results = await s3_server.search_files(query, filters, max_results)
                    return [TextContent(type="text", text=str(results))]
        except Exception as e:
            raise MCPServerError(str(e))

    from mcp.server.stdio import stdio_server
    async with stdio_server() as (read_stream, write_stream):
        logger.info("Server running with stdio transport")
        options = server.create_initialization_options()
        await server.run(
            read_stream,
            write_stream,
            options
        )
