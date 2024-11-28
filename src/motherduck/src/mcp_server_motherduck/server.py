import asyncio

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
from pydantic import AnyUrl
import mcp.server.stdio
import os
import duckdb

PROMPT_TEMPLATE = """
"""

server = Server("mcp-server-motherduck")

conn = duckdb.connect()

@server.list_resources()
async def handle_list_resources() -> list[types.Resource]:
    """
    List available note resources.
    Each note is exposed as a resource with a custom note:// URI scheme.
    """
    return []

@server.read_resource()
async def handle_read_resource(uri: AnyUrl) -> str:
    """
    Read a specific note's content by its URI.
    The note name is extracted from the URI host component.
    """
    raise ValueError(f"Unsupported URI scheme: {uri.scheme}")

@server.list_prompts()
async def handle_list_prompts() -> list[types.Prompt]:
    """
    List available prompts.
    Each prompt can have optional arguments to customize its behavior.
    """
    return [
        types.Prompt(
            name="duckdb-motherduck-initial-prompt",
            description="A prompt to initialize a connection to duckdb or motherduck and start working with it",
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
    if name != "duckdb-motherduck-initial-prompt":
        raise ValueError(f"Unknown prompt: {name}")

    return types.GetPromptResult(
        description=f"Initial prompt for interacting with DuckDB/MotherDuck",
        messages=[
            types.PromptMessage(
                role="user",
                content=types.TextContent(type="text", text=PROMPT_TEMPLATE),
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
            name="initialize-connection",
            description="Create a connection to either a local DuckDB or MotherDuck and retrieve available databases",
            inputSchema={
                "type": "object",
                "properties": {
                    "type": {"type": "string", "description": "Type of the database, either 'DuckDB' or 'MotherDuck'"},
                },
                "required": ["type"],
            },
        ),
        types.Tool(
            name="read-schemas",
            description="Get table schemas from a specific DuckDB/MotherDuck database",
            inputSchema={
                "type": "object",
                "properties": {
                    "type": {"database_name": "string", "description": "name of the database"},
                },
                "required": ["database_name"],
            },
        ),
        types.Tool(
            name="execute-query",
            description="Execute a query on the MotherDuck (DuckDB) database",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "SQL query to execute"},
                },
                "required": ["query"],
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
    global conn
    if name == "initialize-connection":
        type = arguments["type"].strip().upper()
        if not type in ['DUCKDB', 'MOTHERDUCK']:
            raise ValueError("Only 'DuckDB' or 'MotherDuck' are supported")
        if type == 'MOTHERDUCK' and not os.getenv('motherduck_token'):
            raise ValueError("Please set the `motherduck_token` environment variable.")
        if type == 'MOTHERDUCK':
            conn = duckdb.connect('md:')
        elif type == 'DUCKDB':
            conn = duckdb.connect()
        databases = conn.execute("""select string_agg(database_name, ',\n')
                                    from duckdb_databases() where database_name 
                                    not in ('system', 'temp')""").fetchone()[0]
        response = f'Connection to {type} successfully established. Here are the available databases: \n{databases}'
        return [types.TextContent(type="text", text=response)]
    if name == "read-schemas":
        database = arguments["database_name"]
        tables = conn.execute(f"""
                    SELECT string_agg(regexp_replace(sql, 'CREATE TABLE ', 'CREATE TABLE '||database_name||'.'), '\n\n') as sql 
                    FROM duckdb_tables()
                    WHERE database_name = '{database}'""").fetchone()[0]
        views = conn.execute(f"""
                    SELECT string_agg(regexp_replace(sql, 'CREATE TABLE ', 'CREATE TABLE '||database_name||'.'), '\n\n') as sql 
                    FROM duckdb_views()
                    where schema_name not in ('information_schema', 'pg_catalog', 'localmemdb')
                    and view_name not in ('duckdb_columns','duckdb_constraints','duckdb_databases','duckdb_indexes','duckdb_schemas','duckdb_tables','duckdb_types','duckdb_views','pragma_database_list','sqlite_master','sqlite_schema','sqlite_temp_master','sqlite_temp_schema')
                    and database_name = '{database}'
                    """).fetchone()[0]
        results = f"Here are all tables: \n{tables} \n\n Here are all views: {views}"
        return [types.TextContent(type="text", text=str(results))]
    if name == "execute-query":
        try:
            results = conn.execute(arguments["query"]).fetchall()
        except Exception as e:
            raise ValueError('Error querying the database:'+str(e))
        return [types.TextContent(type="text", text=str(results))]


async def main():
    # Run the server using stdin/stdout streams
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="motherduck",
                server_version="0.2.2",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )
