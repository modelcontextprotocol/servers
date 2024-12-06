import asyncio
import os
import random

from youtube_transcript_api import YouTubeTranscriptApi

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
from pydantic import AnyUrl
import mcp.server.stdio

# Store notes as a simple key-value dict to demonstrate state management
notes: dict[str, str] = {}

server = Server("notes")

@server.list_resources()
async def handle_list_resources() -> list[types.Resource]:
    """
    List available note resources.
    Each note is exposed as a resource with a custom note:// URI scheme.
    """
    return [
        types.Resource(
            uri=AnyUrl(f"note://internal/{name}"),
            name=f"Note: {name}",
            description=f"A simple note named {name}",
            mimeType="text/plain",
        )
        for name in notes
    ]

@server.read_resource()
async def handle_read_resource(uri: AnyUrl) -> str:
    """
    Read a specific note's content by its URI.
    The note name is extracted from the URI host component.
    """
    if uri.scheme != "note":
        raise ValueError(f"Unsupported URI scheme: {uri.scheme}")

    name = uri.path
    if name is not None:
        name = name.lstrip("/")
        return notes[name]
    raise ValueError(f"Note not found: {name}")

@server.list_prompts()
async def handle_list_prompts() -> list[types.Prompt]:
    """
    List available prompts.
    Each prompt can have optional arguments to customize its behavior.
    """
    return [
        types.Prompt(
            name="summarize-notes",
            description="Creates a summary of all notes",
            arguments=[
                types.PromptArgument(
                    name="style",
                    description="Style of the summary (brief/detailed)",
                    required=False,
                )
            ],
        )
    ]

@server.get_prompt()
async def handle_get_prompt(
    name: str, arguments: dict[str, str] | None
) -> types.GetPromptResult:
    """
    Generate a prompt by combining arguments with server state.
    The prompt includes all current notes and can be customized via arguments.
    """
    if name != "summarize-notes":
        raise ValueError(f"Unknown prompt: {name}")

    style = (arguments or {}).get("style", "brief")
    detail_prompt = " Give extensive details." if style == "detailed" else ""

    return types.GetPromptResult(
        description="Summarize the current notes",
        messages=[
            types.PromptMessage(
                role="user",
                content=types.TextContent(
                    type="text",
                    text=f"Here are the current notes to summarize:{detail_prompt}\n\n"
                    + "\n".join(
                        f"- {name}: {content}"
                        for name, content in notes.items()
                    ),
                ),
            )
        ],
    )

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """
    List available tools.
    Each tool specifies its arguments using JSON Schema validation.
    """
    return [
        types.Tool(
            name="add-note",
            description="Add a new note",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["name", "content"],
            },
        ),
        types.Tool(
            name="randomize-note",
            description="Create a randomized version of an existing note",
            inputSchema={
                "type": "object",
                "properties": {
                    "note_name": {"type": "string"},
                    "randomization_type": {
                        "type": "string",
                        "enum": ["shuffle", "reverse", "uppercase", "lowercase"]
                    },
                },
                "required": ["note_name", "randomization_type"],
            },
        ),
        types.Tool(
            name="word-count",
            description="Count the number of words in a note",
            inputSchema={
                "type": "object",
                "properties": {
                    "note_name": {"type": "string"},
                },
                "required": ["note_name"],
            },
        ),
        types.Tool(
            name="tag-note",
            description="Add tags to an existing note",
            inputSchema={
                "type": "object",
                "properties": {
                    "note_name": {"type": "string"},
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                },
                "required": ["note_name", "tags"],
            },
        ),
        types.Tool(
            name="get-youtube-transcript",
            description="Fetch transcript for a YouTube video",
            inputSchema={
                "type": "object",
                "properties": {
                    "video_id": {"type": "string"},
                    "language": {
                        "type": "string", 
                        "description": "Optional language code (e.g., 'en')"
                    }
                },
                "required": ["video_id"],
            },
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """
    Handle tool execution requests.
    Tools can modify server state and notify clients of changes.
    """
    if name == "add-note":
        if not arguments:
            raise ValueError("Missing arguments")

        note_name = arguments.get("name")
        content = arguments.get("content")

        if not note_name or not content:
            raise ValueError("Missing name or content")

        # Update server state
        notes[note_name] = content

        # Notify clients that resources have changed
        await server.request_context.session.send_resource_list_changed()

        return [
            types.TextContent(
                type="text",
                text=f"Added note '{note_name}' with content: {content}",
            )
        ]
    
    elif name == "randomize-note":
        if not arguments:
            raise ValueError("Missing arguments")
        
        note_name = arguments.get("note_name")
        randomization_type = arguments.get("randomization_type")

        if not note_name or note_name not in notes:
            raise ValueError(f"Note '{note_name}' not found")

        content = notes[note_name]
        randomized_content = content

        if randomization_type == "shuffle":
            words = content.split()
            random.shuffle(words)
            randomized_content = " ".join(words)
        elif randomization_type == "reverse":
            randomized_content = content[::-1]
        elif randomization_type == "uppercase":
            randomized_content = content.upper()
        elif randomization_type == "lowercase":
            randomized_content = content.lower()
        
        # Create a new note with randomized content
        randomized_note_name = f"{note_name}_randomized_{randomization_type}"
        notes[randomized_note_name] = randomized_content

        return [
            types.TextContent(
                type="text",
                text=f"Randomized note '{note_name}' using {randomization_type}. New note: {randomized_note_name}"
            )
        ]
    
    elif name == "word-count":
        if not arguments:
            raise ValueError("Missing arguments")
        
        note_name = arguments.get("note_name")

        if not note_name or note_name not in notes:
            raise ValueError(f"Note '{note_name}' not found")

        content = notes[note_name]
        word_count = len(content.split())

        return [
            types.TextContent(
                type="text",
                text=f"Word count for note '{note_name}': {word_count} words"
            )
        ]
    
    elif name == "tag-note":
        if not arguments:
            raise ValueError("Missing arguments")
        
        note_name = arguments.get("note_name")
        tags = arguments.get("tags", [])

        if not note_name or note_name not in notes:
            raise ValueError(f"Note '{note_name}' not found")

        # Store tags as a separate metadata (in this simple implementation, we'll append to the note)
        notes[note_name] = f"[TAGS: {', '.join(tags)}]\n{notes[note_name]}"

        return [
            types.TextContent(
                type="text",
                text=f"Added tags {tags} to note '{note_name}'"
            )
        ]
    
    elif name == "get-youtube-transcript":
        if not arguments:
            raise ValueError("Missing arguments")
        
        video_id = arguments.get("video_id")
        language = arguments.get("language", None)

        if not video_id:
            raise ValueError("Video ID is required")

        try:
            # Fetch the transcript
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # If language is specified, try to get that specific transcript
            if language:
                transcript = transcript_list.find_transcript([language])
            else:
                # Otherwise, get the generated transcript
                transcript = transcript_list.find_generated_transcript(['en'])
            
            # Extract the transcript text
            transcript_text = " ".join([entry['text'] for entry in transcript.fetch()])

            # Add the transcript as a note for persistence
            note_name = f"transcript_{video_id}"
            notes[note_name] = transcript_text

            return [
                types.TextContent(
                    type="text",
                    text=f"Transcript fetched for video {video_id}. Saved as note '{note_name}'. First 500 characters: {transcript_text[:500]}..."
                )
            ]
        except Exception as e:
            return [
                types.TextContent(
                    type="text",
                    text=f"Error fetching transcript: {str(e)}"
                )
            ]

async def main():
    # Run the server using stdin/stdout streams
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="notes",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

# If running the script directly
if __name__ == "__main__":
    asyncio.run(main())