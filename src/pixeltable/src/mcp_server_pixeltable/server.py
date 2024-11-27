import asyncio
import logging
import sys

import click
import mcp
import mcp.types as types
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions

from .pixeltable import PixeltableConnector

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def serve() -> Server:
    server = Server("pixeltable-server")
    pixeltable = PixeltableConnector()

    @server.list_tools()
    async def handle_list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="store-memory",
                description="Store information for later retrieval and reference",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "description": "The information to store"}
                    },
                    "required": ["text"]
                }
            ),
            types.Tool(
                name="search-memories",
                description="Search stored memories using semantic similarity",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The search query"},
                        "limit": {"type": "integer", "description": "Maximum results", "default": 5}
                    },
                    "required": ["query"]
                }
            )
        ]

    @server.call_tool()
    async def handle_tool_call(name: str, arguments: dict | None) -> list[types.TextContent]:
        try:
            if arguments is None:
                raise ValueError("No arguments provided")

            if name == "store-memory":
                await pixeltable.store_memory(arguments["text"])
                return [types.TextContent(type="text", text=f"Successfully stored: {arguments['text']}")]

            if name == "search-memories":
                memories = await pixeltable.find_memories(arguments["query"], arguments.get("limit", 5))
                if not memories:
                    return [types.TextContent(type="text", text=f"No memories found for query: {arguments['query']}")]
                return [
                    types.TextContent(type="text", text=f"Found {len(memories)} relevant memories:"),
                    *[types.TextContent(type="text", text=f"- {memory}") for memory in memories]
                ]

            raise ValueError(f"Unknown tool: {name}")

        except Exception as e:
            logger.error(f"Tool call failed: {str(e)}")
            return [types.TextContent(type="text", text=f"Error: {str(e)}")]

    return server

@click.command()
def main():
    try:
        async def _run():
            async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
                server = serve()
                await server.run(
                    read_stream, write_stream,
                    InitializationOptions(
                        server_name="pixeltable-server",
                        server_version="0.1.0",
                        capabilities=server.get_capabilities(
                            notification_options=NotificationOptions(),
                            experimental_capabilities={}
                        )
                    )
                )
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.exception("Server failed with error")
        sys.exit(1)

if __name__ == "__main__":
    main()