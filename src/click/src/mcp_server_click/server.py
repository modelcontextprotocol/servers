import importlib
import sys
from typing import Any, Optional

from mcp.shared.exceptions import McpError
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    TextContent,
    Tool,
    INVALID_PARAMS,
)

from mcp_server_click.parse import traverse_commands, ClickCommand


def import_click_cli(cli_path: str) -> Any:
    """Import Click CLI object from module path."""
    module_path, cli_name = cli_path.split(":")
    module = importlib.import_module(module_path)
    return getattr(module, cli_name)


class ClickToolMapping:
    """Maintains mapping between tool names and Click commands"""

    def __init__(self):
        self.tool_to_command: dict[str, ClickCommand] = {}
        self.command_to_tool: dict[str, str] = {}

    def add_mapping(self, tool_name: str, command: ClickCommand):
        """Add mapping between tool name and command"""
        self.tool_to_command[tool_name] = command
        self.command_to_tool[command.name] = tool_name

    def get_command(self, tool_name: str) -> Optional[ClickCommand]:
        """Get command for a tool name"""
        return self.tool_to_command.get(tool_name)

    def get_tool_name(self, command_name: str) -> Optional[str]:
        """Get tool name for a command"""
        return self.command_to_tool.get(command_name)


async def serve(
    click_cli: str,
) -> None:
    server = Server("mcp-click")

    # Import the Click CLI and build command tree
    cli = import_click_cli(click_cli)
    command_tree = traverse_commands(cli)

    # Create tool mapping
    tool_mapping = ClickToolMapping()

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        tools = []

        def add_command_tool(cmd: ClickCommand, parent_path=""):
            # For commands like 'cli db', strip the parent part ('cli') if present
            cmd_name = cmd.name
            if parent_path:
                for part in parent_path.split("-"):
                    if cmd_name.startswith(part + " "):
                        cmd_name = cmd_name[len(part) :].strip()

            # Join with parent if needed
            tool_name = f"{parent_path}-{cmd_name}" if parent_path else cmd_name
            tool_name = tool_name.replace(" ", "-")

            if cmd.model.model_fields:  # Only add tools for commands with parameters
                tool_mapping.add_mapping(tool_name, cmd)
                tools.append(
                    Tool(
                        name=tool_name,
                        description=cmd.description or "",
                        inputSchema=cmd.model.model_json_schema(),
                    )
                )

            for subcmd in cmd.subcommands.values():
                add_command_tool(subcmd, tool_name)

        add_command_tool(command_tree)
        print("Tools:", tools, file=sys.stderr)
        return tools

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        # Look up command directly in our mapping
        command = tool_mapping.get_command(name)
        if not command:
            raise McpError(INVALID_PARAMS, f"Unknown command: {name}")

        # Validate and parse arguments using the command's model
        try:
            parsed_args = command.model(**arguments)
        except Exception as e:
            raise McpError(INVALID_PARAMS, f"Invalid arguments: {str(e)}")

        # Convert to Click command format
        click_args = []

        # Split command path into parts for Click
        cmd_path = command.name.split()
        click_args.extend(cmd_path[1:])  # Skip the root command name

        # Add parameter arguments
        for field_name, field in parsed_args.model_fields.items():
            value = getattr(parsed_args, field_name)
            if isinstance(value, list):
                click_args.extend(str(v) for v in value)
            elif isinstance(value, bool) and value:
                click_args.append(f"--{field_name}")
            elif isinstance(value, bool):
                click_args.append(f"--no-{field_name}")
            elif value is not None:
                click_args.extend([f"--{field_name}", str(value)])

        # Run Click command
        result = cli.main(args=click_args, standalone_mode=False)
        return [
            TextContent(
                type="text",
                text=str(result) if result else "Command completed successfully",
            )
        ]

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)
