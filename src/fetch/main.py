"""
Minimal MCPApp wrapper to expose ONLY the Fetch MCP server over SSE,
following the mcp-agent cloud example structure.
"""

import asyncio
import os

from mcp.server.fastmcp import FastMCP
from mcp_agent.app import MCPApp
from mcp_agent.server.app_server import create_mcp_server_for_app
from mcp_agent.core.context import Context as AppContext
from typing import Optional

# Minimal FastMCP server descriptor
mcp = FastMCP(
    name="fetch-server",
    instructions="Fetch MCP server hosted via mcp-agent SSE.",
)

# Minimal MCPApp required by the cloud bundler
app = MCPApp(
    name="fetch-server",
    description="Expose the Fetch MCP server over SSE.",
    mcp=mcp,
)


@app.tool(name="fetch")
async def fetch_proxy(
    url: str,
    max_length: int = 5000,
    start_index: int = 0,
    raw: bool = False,
    app_ctx: Optional[AppContext] = None,
) -> str:
    """Proxy to the child Fetch MCP server's `fetch` tool.

    Mirrors the parameters of mcp-server-fetch so clients can call `fetch`
    directly on this app's SSE endpoint.
    """
    context = app_ctx or app.context
    # Connect to the configured child server named "fetch"
    agent = await context.get_agent(server_names=["fetch"])  # obtains a connected Agent
    async with agent:
        result = await agent.call_tool(
            name="fetch",
            arguments={
                "url": url,
                "max_length": max_length,
                "start_index": start_index,
                "raw": raw,
            },
        )
        # result is a ToolResult; return text content if present
        # Fallback to JSON dump if other content types are returned
        for c in result.content:
            if getattr(c, "type", None) == "text" and hasattr(c, "text"):
                return c.text
        return str(result.model_dump())


async def main() -> None:
    async with app.run() as agent_app:
        server = create_mcp_server_for_app(agent_app)
        # Allow overriding bind address in local dev
        host = os.environ.get("HOST", "0.0.0.0")
        port = int(os.environ.get("PORT", "8000"))
        server.settings.host = host
        server.settings.port = port
        await server.run_sse_async()


if __name__ == "__main__":
    asyncio.run(main())
