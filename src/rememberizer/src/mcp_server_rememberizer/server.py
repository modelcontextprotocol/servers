import json
import logging
import os

import mcp.server.stdio
import mcp.types as types
from mcp.server import Server
from mcp_server_rememberizer.utils import (
    ACCOUNT_INFORMATION_PATH,
    AGENTIC_SEARCH_PATH,
    APP_NAME,
    LIST_DOCUMENTS_PATH,
    LIST_INTEGRATIONS_PATH,
    RETRIEVE_DOCUMENT_PATH,
    RETRIEVE_SLACK_PATH,
    SEARCH_PATH,
    APIClient,
    RememberizerTools,
    get_document_uri,
)
from pydantic import AnyUrl

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REMEMBERIZER_BASE_URL = "https://api.rememberizer.ai/api/v1/"
REMEMBERIZER_API_TOKEN = os.getenv("REMEMBERIZER_API_TOKEN")

if not REMEMBERIZER_API_TOKEN:
    raise ValueError("REMEMBERIZER_API_BASE environment variable required")
client = APIClient(base_url=REMEMBERIZER_BASE_URL, api_key=REMEMBERIZER_API_TOKEN)


async def serve() -> Server:
    server = Server(APP_NAME)

    @server.list_resources()
    async def list_resources() -> list[types.Resource]:
        data = await client.get(LIST_DOCUMENTS_PATH)
        return [
            types.Resource(
                uri=get_document_uri(document),
                name=document["name"],
                mimeType="text/json",
            )
            for document in data["results"]
        ]

    @server.read_resource()
    async def read_resource(uri: AnyUrl) -> str:
        path = None
        if uri.host == "document":
            path = RETRIEVE_DOCUMENT_PATH
        elif uri.host == "slack":
            path = RETRIEVE_SLACK_PATH
        if not path:
            raise ValueError(f"Unknown resource: {uri}")

        document_id = uri.path.lstrip("/")
        data = await client.get(path.format(id=document_id))

        return json.dumps(data, indent=2)

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name=RememberizerTools.ACCOUNT_INFORMATION.value,
                description="Get account information",
                inputSchema={
                    "type": "object",
                },
            ),
            types.Tool(
                name=RememberizerTools.SEARCH.value,
                description="Search for documents by semantic similarity",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "q": {
                            "type": "string",
                            "description": "Up to a 400-word sentence for which you wish to find "
                            "semantically similar chunks of knowledge.",
                        },
                        "n": {
                            "type": "integer",
                            "description": "Number of semantically similar chunks of text to return. Use 'n_results=3' for up to 5, and 'n_results=10' for more information. If you do not receive enough information, consider trying again with a larger 'n_results' value.",
                        },
                        "from": {
                            "type": "string",
                            "description": "Start date in ISO 8601 format with timezone (e.g., 2023-01-01T00:00:00Z). Use this to filter results from a specific date.",
                        },
                        "to": {
                            "type": "string",
                            "description": "End date in ISO 8601 format with timezone (e.g., 2024-01-01T00:00:00Z). Use this to filter results until a specific date.",
                        },
                    },
                    "required": ["q"],
                },
            ),
            types.Tool(
                name=RememberizerTools.AGENTIC_SEARCH.value,
                description="Search for documents by semantic similarity",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Up to a 400-word sentence for which you wish to find "
                            "semantically similar chunks of knowledge.",
                        },
                        "user_context": {
                            "type": "string",
                            "description": "The additional context for the query. You might need to summarize the conversation up to this point for better context-awared results.",
                        },
                        "n_chunks": {
                            "type": "integer",
                            "description": "Number of semantically similar chunks of text to return. Use 'n_results=3' for up to 5, and 'n_results=10' for more information. If you do not receive enough information, consider trying again with a larger 'n_results' value.",
                        },
                        "from": {
                            "type": "string",
                            "description": "Start date in ISO 8601 format with timezone (e.g., 2023-01-01T00:00:00Z). Use this to filter results from a specific date.",
                        },
                        "to": {
                            "type": "string",
                            "description": "End date in ISO 8601 format with timezone (e.g., 2024-01-01T00:00:00Z). Use this to filter results until a specific date.",
                        },
                    },
                    "required": ["query"],
                },
            ),
            types.Tool(
                name=RememberizerTools.LIST_INTEGRATIONS.value,
                description="List available data source integrations",
                inputSchema={
                    "type": "object",
                },
            ),
            types.Tool(
                name=RememberizerTools.LIST_DOCUMENTS.value,
                description="""Retrieves a paginated list of all documents in the system. 
Use this tool to browse through available documents and their metadata.

Examples:
- List first 100 documents: {"page": 1, "page_size": 100}
- Get next page: {"page": 2, "page_size": 100}
- Get maximum allowed documents: {"page": 1, "page_size": 1000}
""",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "page": {
                            "type": "integer",
                            "description": "Page number for pagination (starts at 1)",
                            "minimum": 1,
                            "default": 1,
                        },
                        "page_size": {
                            "type": "integer",
                            "description": "Number of documents per page (1-1000)",
                            "minimum": 1,
                            "maximum": 1000,
                            "default": 100,
                        },
                    },
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(
        name: str, arguments: dict
    ) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
        match name:
            case RememberizerTools.SEARCH.value:
                q = arguments["q"]
                n = arguments.get("n", 5)
                params = {"q": q, "n": n}
                data = await client.get(SEARCH_PATH, params=params)
                return [types.TextContent(type="text", text=str(data))]
            case RememberizerTools.AGENTIC_SEARCH.value:
                query = arguments["query"]
                n_chunks = arguments.get("n_chunks", 5)
                user_context = arguments.get("user_context", None)
                from_time = arguments.get("from", None)
                to_time = arguments.get("to", None)
                params = {
                    "query": query,
                    "n_chunks": n_chunks,
                    "user_context": user_context,
                    "from": from_time,
                    "to": to_time,
                }
                data = await client.post(AGENTIC_SEARCH_PATH, data=params)
            case RememberizerTools.LIST_INTEGRATIONS.value:
                data = await client.get(LIST_INTEGRATIONS_PATH)
                return [types.TextContent(type="text", text=str(data.get("data", [])))]
            case RememberizerTools.ACCOUNT_INFORMATION.value:
                data = await client.get(ACCOUNT_INFORMATION_PATH)
                return [types.TextContent(type="text", text=str(data))]
            case RememberizerTools.LIST_DOCUMENTS.value:
                page = arguments.get("page", 1)
                page_size = arguments.get("page_size", 100)
                params = {"page": page, "page_size": page_size}
                data = await client.get(LIST_DOCUMENTS_PATH, params=params)
                return [types.TextContent(type="text", text=str(data))]
            case _:
                raise ValueError(f"Unknown tool: {name}")

    return server


async def main():
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        server = await serve()
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )
