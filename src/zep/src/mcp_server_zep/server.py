import asyncio
from dataclasses import dataclass
from typing import Optional

import click
import mcp.types as types
import mcp.server.stdio
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
from mcp.shared.exceptions import McpError
from zep_cloud.client import AsyncZep
from zep_cloud.types import Message
from zep_cloud.errors import NotFoundError
import json

MISSING_API_KEY_MESSAGE = (
    """Zep API key not found. Please specify your Zep API key."""
)

USER_ID = "claude_user"
SESSION_ID = "claude_session"

@dataclass
class ZepMemoryData:
    session_id: str
    context: Optional[str] = None
    message: Optional[str] = None

    def to_text(self) -> str:
        if self.message:
            return self.message
        return f"""
Memory Context for Session {self.session_id}:
{self.context}
        """

    def to_prompt_result(self) -> types.GetPromptResult:
        return types.GetPromptResult(
            description=f"Memory Context for Session: {self.session_id}",
            messages=[
                types.PromptMessage(
                    role="user", 
                    content=types.TextContent(type="text", text=self.to_text())
                )
            ],
        )

    def to_tool_result(self) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
        return [types.TextContent(type="text", text=self.to_text())]

class ZepError(Exception):
    pass

async def serve(api_key: str) -> Server:
    if not api_key:
        raise ValueError(MISSING_API_KEY_MESSAGE)
    
    server = Server("zep")
    client = AsyncZep(api_key=api_key)
    user_id = USER_ID
    session_id = SESSION_ID

    @server.list_tools()
    async def handle_list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="add-memory",
                description="""Add a single message to the conversation memory. Follow this exact workflow:
                1. When you receive a user message, IMMEDIATELY call this tool with the user's message
                2. Call get-memory to retrieve context
                3. Generate your response
                4. Call this tool again with your response
                
                Format the message as:
                - For user messages: {"role_type": "user", "content": "<their message>"}
                - For your responses: {"role_type": "assistant", "content": "<your message>"}""",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "role_type": {
                            "type": "string",
                            "enum": ["system", "assistant", "user", "function", "tool"],
                            "description": "The role of the message sender (required)"
                        },
                        "content": {
                            "type": "string",
                            "description": "The exact message content"
                        }
                    },
                    "required": ["role_type", "content"]
                }
            ),
            types.Tool(
                name="get-memory",
                description="""Retrieve conversation memory and context. 
                You MUST call this tool:
                1. AFTER saving the user's message with add-memory
                2. BEFORE generating your response
                
                This ensures you have full context before responding.""",
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            ),
        ]

    @server.call_tool()
    async def handle_call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
        if name == "add-memory":
            if not arguments:
                raise ValueError("Missing arguments")
            
            try:
                message = Message(
                    role_type=arguments["role_type"],
                    content=arguments["content"]
                )
                
                try:
                    await client.memory.get_session(session_id)
                except NotFoundError:
                    await client.memory.add_session(
                        session_id=session_id,
                        user_id=user_id
                    )
                
                await client.memory.add(
                    session_id=session_id,
                    messages=[message]  # Still passed as a list, but always single message
                )
                
                memory_data = ZepMemoryData(
                    session_id=session_id,
                    message=f"Successfully added message to memory session {session_id}"
                )
                return memory_data.to_tool_result()
            except Exception as e:
                raise McpError(f"Error adding memory: {str(e)}")


        elif name == "get-memory":
            try:
                memory = await client.memory.get(session_id)
                memory_data = ZepMemoryData(
                    session_id=session_id,
                    context=memory.context
                )
                return memory_data.to_tool_result()
            except Exception as e:
                raise McpError(f"Error retrieving memory: {str(e)}")
        
        raise ValueError(f"Unknown tool: {name}")

    return server

@click.command()
@click.option(
    "--api-key",
    envvar="ZEP_API_KEY",
    required=True,
    help="Zep API key",
)
def main(api_key: str):
    async def _run():
        async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
            server = await serve(api_key)
            await server.run(
                read_stream,
                write_stream,
                InitializationOptions(
                    server_name="zep",
                    server_version="0.5.1",
                    capabilities=server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )

    asyncio.run(_run())

if __name__ == "__main__":
    main()