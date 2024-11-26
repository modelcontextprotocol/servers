import asyncio
from dataclasses import dataclass
from typing import Optional
import uuid

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
import logging
import sys

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


    @server.list_prompts()
    async def handle_list_prompts() -> list[types.Prompt]:
        return [
            types.Prompt(
                name="memory-context",
                description="Retrieve memory context for the current conversation",
            ),
            types.Prompt(
                name="add-memory",
                description="""Add new messages to the conversation memory. You MUST use this prompt:
                1. After EVERY message exchange to maintain conversation history
                2. Immediately after receiving a user message
                3. Immediately after sending your response
                
                This is critical for maintaining conversation context and history.
                If you don't add messages to memory, you won't be able to reference them later.""",
                arguments=[
                    types.PromptArgument(
                        name="messages",
                        description="The message(s) to store in memory. Format as JSON array of {role_type, content} objects.",
                        required=True,
                    ),
                ],
            )
        ]

    @server.get_prompt()
    async def handle_get_prompt(
        name: str, arguments: dict[str, str] | None
    ) -> types.GetPromptResult:
        if name == "memory-context":
            try:
                memory = await client.memory.get(session_id)
                memory_data = ZepMemoryData(
                    session_id=session_id,
                    context=memory.context
                )
                return memory_data.to_prompt_result()
            except Exception as e:
                raise McpError(f"Error retrieving memory: {str(e)}")
                
        elif name == "add-memory":
            try:
                if not arguments or "messages" not in arguments:
                    raise ValueError("Messages are required")

                # Parse messages if it's a string
                messages_str = arguments["messages"]
                try:
                    parsed_messages = json.loads(messages_str)
                    if not isinstance(parsed_messages, list):
                        parsed_messages = [parsed_messages]
                except json.JSONDecodeError:
                    parsed_messages = [{
                        "role_type": "user",
                        "content": messages_str
                    }]

                # Convert to Zep Message objects
                messages = [
                    Message(
                        role_type=msg.get("role_type", "user"),
                        content=msg["content"]
                    ) for msg in parsed_messages
                ]

                # Create session if it doesn't exist
                try:
                    await client.memory.get_session(session_id)
                except NotFoundError:
                    await client.memory.add_session(
                        session_id=session_id,
                        user_id=user_id
                    )

                # Add messages to memory
                await client.memory.add(
                    session_id=session_id,
                    messages=messages
                )

                memory_data = ZepMemoryData(
                    session_id=session_id,
                    message=f"Successfully added {len(messages)} messages to memory session {session_id}"
                )
                return memory_data.to_prompt_result()
            except Exception as e:
                raise McpError(f"Error adding memory: {str(e)}")

    @server.list_tools()
    async def handle_list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="add-memory",
                description="""Add new messages to the conversation memory. You MUST use this tool:
                1. After EVERY message exchange to maintain conversation history
                2. Immediately after receiving a user message
                3. Immediately after sending your response
                
                Format each message as:
                - For user messages: {"role_type": "user", "content": "<their message>"}
                - For your responses: {"role_type": "assistant", "content": "<your message>"}
                
                This is critical for maintaining conversation context and history.
                If you don't add messages to memory, you won't be able to reference them later.""",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "messages": {
                            "type": "array",
                            "items": {
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
                            },
                            "description": "The message(s) to store in memory. Always include both user messages and your responses."
                        }
                    },
                    "required": ["messages"]
                }
            ),
            types.Tool(
                name="get-memory",
                description="""Retrieve memory context for the current conversation. Use this tool when you need to:
                - Review previous messages and context
                - Check what was discussed earlier
                - Ensure consistent responses based on conversational context
                
                You should check memory at the start of each conversation.""",
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            )
        ]

    @server.call_tool()
    async def handle_call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
        if name == "add-memory":
            if not arguments:
                raise ValueError("Missing arguments")
            
            try:
                parsed_messages = json.loads(arguments["messages"])
                # Convert to Zep Message
                messages = []
                for msg in parsed_messages:
                    messages.append(Message(
                        role_type=msg.get("role_type"),
                        content=msg["content"]
                    ))
                
                try:
                    await client.memory.get_session(session_id)
                except:
                    await client.memory.add_session(
                        session_id=session_id,
                        user_id=user_id
                    )
                
                await client.memory.add(
                    session_id=session_id,
                    messages=messages
                )
                
                memory_data = ZepMemoryData(
                    session_id=session_id,
                    message=f"Successfully added {len(messages)} messages to memory session {session_id}"
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
                    server_version="0.1.0",
                    capabilities=server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )

    asyncio.run(_run())

if __name__ == "__main__":
    main()