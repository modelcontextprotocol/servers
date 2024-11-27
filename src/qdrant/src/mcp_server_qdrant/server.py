from typing import Optional

from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions

import click
import mcp.types as types
import asyncio
import mcp

from .qdrant import QdrantConnector


def serve(
    qdrant_url: str,
    qdrant_api_key: Optional[str],
    collection_name: str,
    fastembed_model_name: str,
) -> Server:
    """
    Instantiate the server and configure tools to store and find memories in Qdrant.
    :param qdrant_url: The URL of the Qdrant server.
    :param qdrant_api_key: The API key to use for the Qdrant server.
    :param collection_name: The name of the collection to use.
    :param fastembed_model_name: The name of the FastEmbed model to use.
    """
    server = Server("qdrant")

    qdrant = QdrantConnector(
        qdrant_url, qdrant_api_key, collection_name, fastembed_model_name
    )

    @server.list_tools()
    async def handle_list_tools() -> list[types.Tool]:
        """
        Return the list of tools that the server provides. By default, there are two
        tools: one to store memories and another to find them. Finding the memories is not
        implemented as a resource, as it requires a query to be passed and resources point
        to a very specific piece of data.
        """
        return [
            types.Tool(
                name="qdrant-store-memory",
                description=(
                    "Keep the memory for later use, when you are asked to remember something."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "information": {
                            "type": "string",
                        },
                    },
                    "required": ["information"],
                },
            ),
            types.Tool(
                name="qdrant-find-memories",
                description=(
                    "Look up memories in Qdrant. Use this tool when you need to: \n"
                    " - Find memories by their content \n"
                    " - Access memories for further analysis \n"
                    " - Get some personal information about the user"
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The query to search for in the memories",
                        },
                    },
                    "required": ["query"],
                },
            ),
        ]

    @server.call_tool()
    async def handle_tool_call(
        name: str, arguments: dict | None
    ) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
        if name not in ["qdrant-store-memory", "qdrant-find-memories"]:
            raise ValueError(f"Unknown tool: {name}")

        if name == "qdrant-store-memory":
            if not arguments or "information" not in arguments:
                raise ValueError("Missing required argument 'information'")
            information = arguments["information"]
            await qdrant.store_memory(information)
            return [types.TextContent(type="text", text=f"Remembered: {information}")]

        if name == "qdrant-find-memories":
            if not arguments or "query" not in arguments:
                raise ValueError("Missing required argument 'query'")
            query = arguments["query"]
            memories = await qdrant.find_memories(query)
            content = [
                types.TextContent(
                    type="text", text=f"Memories for the query '{query}'"
                ),
            ]
            for memory in memories:
                content.append(
                    types.TextContent(type="text", text=f"<memory>{memory}</memory>")
                )
            return content

    return server


@click.command()
@click.option(
    "--qdrant-url",
    envvar="QDRANT_URL",
    required=True,
    help="Qdrant URL",
)
@click.option(
    "--qdrant-api-key",
    envvar="QDRANT_API_KEY",
    required=False,
    help="Qdrant API key",
)
@click.option(
    "--collection-name",
    envvar="COLLECTION_NAME",
    required=True,
    help="Collection name",
)
@click.option(
    "--fastembed-model-name",
    envvar="FASTEMBED_MODEL_NAME",
    required=True,
    help="FastEmbed model name",
    default="sentence-transformers/all-MiniLM-L6-v2",
)
def main(
    qdrant_url: str,
    qdrant_api_key: str,
    collection_name: Optional[str],
    fastembed_model_name: str,
):
    async def _run():
        async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
            server = serve(
                qdrant_url,
                qdrant_api_key,
                collection_name,
                fastembed_model_name,
            )
            await server.run(
                read_stream,
                write_stream,
                InitializationOptions(
                    server_name="qdrant",
                    server_version="0.5.1",
                    capabilities=server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )

    asyncio.run(_run())
