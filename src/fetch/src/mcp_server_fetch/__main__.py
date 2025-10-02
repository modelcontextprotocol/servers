# __main__.py

import os
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
import mcp
from mcp_server_fetch import serve

def main():
    # Default: stdio transport so Claude Desktop works out of the box
    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport in {"http", "streamable-http"}:
        # Build the Streamable HTTP ASGI app that serves /mcp
        app = mcp.streamable_http_app()

        # Add CORS so browser clients (like Smithery Playground) can call it
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],       # Allow all origins
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )

        # Smithery injects PORT env var; fallback to 8000
        port = int(os.getenv("PORT", "8000"))

        # Run as HTTP service
        uvicorn.run(app, host="0.0.0.0", port=port)
    else:
        # Local stdio (Claude Desktop, ChatGPT desktop, etc.)
        import asyncio
        asyncio.run(serve())
