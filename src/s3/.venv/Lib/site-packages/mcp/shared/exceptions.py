from mcp.types import ErrorData


class McpError(Exception):
    """
    Exception type raised when an error arrives over an MCP connection.
    """

    error: ErrorData
