import json
import logging
import os
from urllib.parse import quote

import mcp.server.stdio
import mcp.types as types
from mcp.server import Server
from mcp_server_rememberizer.utils import (
    ACCOUNT_INFORMATION_PATH,
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

REMEMBERIZER_API_TOKEN = os.getenv("REMEMBERIZER_API_TOKEN")
REMEMBERIZER_BASE_URL = os.getenv("REMEMBERIZER_BASE_URL")

if not REMEMBERIZER_API_TOKEN or not REMEMBERIZER_BASE_URL:
    raise ValueError(
        "REMEMBERIZER_API_BASE or REMEMBERIZER_API_TOKEN environment variable required"
    )
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
        return json.dumps(data.get("content", {}), indent=2)

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
                            "description": "Number of similar documents to return.",
                        },
                    },
                    "required": ["q"],
                },
            ),
            types.Tool(
                name=RememberizerTools.LIST_INTEGRATIONS.value,
                description="List available data source integrations",
                inputSchema={
                    "type": "object",
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
                data = await client.get(f"{SEARCH_PATH}?q={quote(q)}")
                return [types.TextContent(type="text", text=str(data))]
            case RememberizerTools.LIST_INTEGRATIONS.value:
                data = await client.get(f"{LIST_INTEGRATIONS_PATH}")
                return [types.TextContent(type="text", text=str(data.get("data", [])))]
            case RememberizerTools.ACCOUNT_INFORMATION.value:
                data = await client.get(ACCOUNT_INFORMATION_PATH)
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
