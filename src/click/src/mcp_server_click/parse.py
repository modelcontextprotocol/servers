from typing import Any, Dict, List, Optional, Type
from pydantic import BaseModel, Field, create_model
from enum import Enum
from mcp_server_click.example import cli


def create_type_annotation(param) -> tuple[Type, Any]:
    """Create a pydantic type annotation from a Click parameter"""
    base_type: Type

    if hasattr(param, "type"):
        if str(param.type) == "INT":
            base_type = int
        elif str(param.type) == "STRING":
            base_type = str
        else:
            base_type = str
    elif hasattr(param, "is_flag") and param.is_flag:
        base_type = bool
    elif hasattr(param, "choices") and param.choices:
        # Create dynamic enum
        enum_name = f"{param.name.title()}Choices"
        base_type = Enum(enum_name, {str(c): str(c) for c in param.choices})
    else:
        base_type = str

    # Handle multiple values (nargs=-1)
    if hasattr(param, "nargs") and param.nargs < 0:
        return List[base_type], ... if param.required else param.default

    return base_type, ... if param.required else param.default


def create_field_description(param) -> Optional[str]:
    """Get field description from Click parameter"""
    if hasattr(param, "help"):
        return param.help
    if hasattr(param, "metavar"):
        return f"Parameter: {param.metavar}"
    return None


def create_command_model(command, parent="") -> Type[BaseModel]:
    """Create a pydantic model for a Click command"""
    fields: Dict[str, tuple[Type, Any]] = {}

    if hasattr(command, "params"):
        for param in command.params:
            field_type, field_default = create_type_annotation(param)
            description = create_field_description(param)

            if description:
                fields[param.name] = (
                    field_type,
                    Field(default=field_default, description=description),
                )
            else:
                fields[param.name] = (field_type, field_default)

    cmd_name = f"{parent}_{command.name}".strip("_").replace(" ", "_").title()
    model = create_model(cmd_name, __doc__=command.help, **fields)
    return model


class ClickCommand(BaseModel):
    """Represents a Click command with its model and metadata"""

    name: str
    description: Optional[str] = None
    model: Type[BaseModel]
    is_group: bool = False
    subcommands: dict[str, "ClickCommand"] = Field(default_factory=dict)


def traverse_commands(command, parent="") -> ClickCommand:
    """Traverse Click command tree and build Pydantic models.

    Returns:
        ClickCommand object containing command info and nested subcommands.
    """
    cmd_name = f"{parent} {command.name}".strip()

    # Create model for current command
    model = create_command_model(command, parent)

    click_command = ClickCommand(
        name=cmd_name,
        description=command.help,
        model=model,
        is_group=hasattr(command, "commands"),
    )

    # Traverse subcommands
    if click_command.is_group:
        for subcmd_name, subcmd in command.commands.items():
            click_command.subcommands[subcmd_name] = traverse_commands(subcmd, cmd_name)

    return click_command


def get_command_schema(click_command: ClickCommand) -> dict:
    """Get JSON schema for a command and all its subcommands"""
    result = {
        "title": click_command.name,
        "type": "object",
        "description": click_command.description,
        "modelSchema": (
            click_command.model.model_json_schema()
            if click_command.model.model_fields
            else None
        ),
        "isGroup": click_command.is_group,
        "subcommands": {},
    }

    for name, subcmd in click_command.subcommands.items():
        result["subcommands"][name] = get_command_schema(subcmd)

    return result


def get_tool_name(command: ClickCommand, parent="") -> str:
    """Get the standardized tool name for a command"""
    # For commands like 'cli db', strip the parent part ('cli') if present
    cmd_name = command.name
    if parent:
        for part in parent.split("-"):
            if cmd_name.startswith(part + " "):
                cmd_name = cmd_name[len(part) :].strip()

    # Join with parent if needed
    full_name = f"{parent}-{cmd_name}" if parent else cmd_name
    return full_name.replace(" ", "-")


def print_command_tree(command: ClickCommand, indent: int = 0, parent=""):
    """Print command tree in a readable format"""
    prefix = "  " * indent
    tool_name = get_tool_name(command, parent)
    print(f"{prefix}{tool_name}")

    if command.model.model_fields:
        schema = command.model.model_json_schema()
        print(f"{prefix}Schema: {schema}")

    for subcmd in command.subcommands.values():
        print_command_tree(subcmd, indent + 1, tool_name)


if __name__ == "__main__":
    command_tree = traverse_commands(cli)
    print("Command Tree:")
    print_command_tree(command_tree)
