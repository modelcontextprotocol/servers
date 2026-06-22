import asyncio
import json
import sys

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from .compress import compress, DEFAULT_RATIO

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

app = Server("mcp-server-pith")


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="compress",
            description=(
                "Compress a verbose inter-agent payload using PITH (Zipf density scoring "
                "validated by Benford's Law). Removes filler sentences while preserving all "
                "code blocks, JSON, URLs, file paths, and numbers. Typical savings: 30-60%. "
                "Use before passing large tool results or reasoning traces to the next agent."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "payload": {
                        "type": "string",
                        "description": "The text to compress.",
                    },
                    "ratio": {
                        "type": "number",
                        "description": (
                            "Fraction of sentences to keep (0.1-1.0). "
                            "0.6=default, 0.8=conservative, 0.4=aggressive, 0.3=maximum."
                        ),
                        "default": DEFAULT_RATIO,
                    },
                },
                "required": ["payload"],
            },
        ),
        Tool(
            name="compress_with_metadata",
            description=(
                "Compress a payload with PITH and return full JSON metadata including "
                "token counts, Benford MAD values, and compression ratio. "
                "Use for programmatic pipelines or when you need to inspect compression quality."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "payload": {
                        "type": "string",
                        "description": "The text to compress.",
                    },
                    "ratio": {
                        "type": "number",
                        "description": (
                            "Fraction of sentences to keep (0.1-1.0). "
                            "0.6=default, 0.8=conservative, 0.4=aggressive, 0.3=maximum."
                        ),
                        "default": DEFAULT_RATIO,
                    },
                },
                "required": ["payload"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    payload = arguments.get("payload", "").strip()
    if not payload:
        return [TextContent(type="text", text="Error: empty payload")]

    ratio = float(arguments.get("ratio", DEFAULT_RATIO))
    if not 0.1 <= ratio <= 1.0:
        return [TextContent(type="text", text="Error: ratio must be between 0.1 and 1.0")]

    compressed_text, meta = compress(payload, target_ratio=ratio)

    if name == "compress":
        benford_icon = "✓" if meta.get("benford_ok", True) else "⚠"
        action = meta.get("action", "compressed")
        saved = meta.get("saved_pct", 0)
        b_mad = meta.get("compressed_benford_mad", meta.get("benford_mad", 0))
        header = f"[PITH | {benford_icon} | -{saved:.0f}% tokens | benford:{b_mad:.1f}% | {action}]"
        return [TextContent(type="text", text=f"{header}\n{compressed_text}")]

    if name == "compress_with_metadata":
        result = json.dumps({"compressed": compressed_text, "meta": meta}, indent=2,
                            ensure_ascii=False)
        return [TextContent(type="text", text=result)]

    return [TextContent(type="text", text=f"Unknown tool: {name}")]


async def serve() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


def main() -> None:
    asyncio.run(serve())
