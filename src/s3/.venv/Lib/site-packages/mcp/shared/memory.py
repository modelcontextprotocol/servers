"""
In-memory transports
"""

from contextlib import asynccontextmanager
from datetime import timedelta
from typing import AsyncGenerator

import anyio
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream

from mcp.client.session import ClientSession
from mcp.server import Server
from mcp.types import JSONRPCMessage

MessageStream = tuple[
    MemoryObjectReceiveStream[JSONRPCMessage | Exception],
    MemoryObjectSendStream[JSONRPCMessage],
]


@asynccontextmanager
async def create_client_server_memory_streams() -> (
    AsyncGenerator[tuple[MessageStream, MessageStream], None]
):
    """
    Creates a pair of bidirectional memory streams for client-server communication.

    Returns:
        A tuple of (client_streams, server_streams) where each is a tuple of
        (read_stream, write_stream)
    """
    # Create streams for both directions
    server_to_client_send, server_to_client_receive = anyio.create_memory_object_stream[
        JSONRPCMessage | Exception
    ](1)
    client_to_server_send, client_to_server_receive = anyio.create_memory_object_stream[
        JSONRPCMessage | Exception
    ](1)

    client_streams = (server_to_client_receive, client_to_server_send)
    server_streams = (client_to_server_receive, server_to_client_send)

    async with (
        server_to_client_receive,
        client_to_server_send,
        client_to_server_receive,
        server_to_client_send,
    ):
        yield client_streams, server_streams


@asynccontextmanager
async def create_connected_server_and_client_session(
    server: Server,
    read_timeout_seconds: timedelta | None = None,
    raise_exceptions: bool = False,
) -> AsyncGenerator[ClientSession, None]:
    """Creates a ClientSession that is connected to a running MCP server."""
    async with create_client_server_memory_streams() as (
        client_streams,
        server_streams,
    ):
        client_read, client_write = client_streams
        server_read, server_write = server_streams

        # Create a cancel scope for the server task
        async with anyio.create_task_group() as tg:
            tg.start_soon(
                lambda: server.run(
                    server_read,
                    server_write,
                    server.create_initialization_options(),
                    raise_exceptions=raise_exceptions,
                )
            )

            try:
                async with ClientSession(
                    read_stream=client_read,
                    write_stream=client_write,
                    read_timeout_seconds=read_timeout_seconds,
                ) as client_session:
                    await client_session.initialize()
                    yield client_session
            finally:
                tg.cancel_scope.cancel()
