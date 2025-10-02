import os
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
import mcp
from mcp_server_fetch.server import serve
import asyncio

def main():
    transport = os.getenv("MCP_TRANSPORT", "stdio")

    if transport in {"http", "streamable-http"}:
        app = mcp.streamable_http_app()
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        port = int(os.getenv("PORT", "8000"))
        uvicorn.run(app, host="0.0.0.0", port=port)
    else:
        asyncio.run(serve())
