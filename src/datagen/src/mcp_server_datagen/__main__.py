"""Main entry point for the data generation server."""

import asyncio
from mcp_server_datagen.server import serve

if __name__ == "__main__":
    asyncio.run(serve())
