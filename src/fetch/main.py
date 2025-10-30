"""MCP Agent Cloud entrypoint for the Fetch MCP server."""

from mcp_agent.app import MCPApp

# The MCPApp reads settings from mcp_agent.config.yaml in this directory.
# Deployment tooling requires defining the application object at module import.
app = MCPApp(
    name="fetch-server",
    description="Expose the fetch MCP server via MCP Agent Cloud.",
)

