import json
import anyio
import mcp.types as types
from mcp.server import Server
from mcp.shared.exceptions import ErrorData, McpError
from mcp_server_googlesearch.client import CustomGoogleSearchClient


def create_app(google_search_client: CustomGoogleSearchClient):
    app = Server("google-search")

    @app.list_prompts()
    async def list_prompts() -> list[types.Prompt]:
        return [
            types.Prompt(
                name="google_search",
                description="Perform a Google search and retrieve structured results including URLs, titles, snippets, and links for each search result",
            )
        ]

    @app.call_tool()
    async def call_tool(
        name: str, arguments: dict
    ) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
        if name != "google_search":
            raise McpError(
                ErrorData(code=types.INVALID_PARAMS, message=f"Unknown tool: {name}")
            )
        # Search Google
        results_metadata = await google_search_client.search(**arguments)
        # Format results as text content
        if results_metadata is None:
            results = []
        else:
            results = [result.model_dump() for result in results_metadata]
        return [
            types.TextContent(type="text", text=json.dumps(results, ensure_ascii=True))
        ]

    @app.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="google_search",
                description="Search Google and get result URLs",
                inputSchema={
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query string",
                        },
                        "num": {
                            "type": "integer",
                            "description": "Number of search results to return",
                            "default": None,
                        },  # Number of search results to return
                        "start": {
                            "type": "integer",
                            "description": "The index of the first result to return",
                            "default": None,
                        },  # The index of the first result to return
                        "gl": {
                            "type": "string",
                            "description": "Geolocation of the search, two-letter country code.",
                            "default": None,
                        },  # Geolocation of the search
                        "hl": {
                            "type": "string",
                            "description": "Interface language (host language), IETF BCP 47 language code.",
                            "default": None,
                        },  # Interface language (host language)
                        "cr": {
                            "type": "string",
                            "description": "Country restrict to narrow search, two-letter country code.",
                            "default": None,
                        },  # Country restrict to narrow search
                        "dateRestrict": {
                            "type": "string",
                            "description": "Restricts results to URLs based on date. Formats: d[days], w[weeks], m[months], y[years], or ISO 8601 date.",
                            "default": None,
                        },  # Restricts results to URLs based on date
                        "exactTerms": {
                            "type": "string",
                            "description": "Identifies a phrase that all documents must contain",
                            "default": None,
                        },  # Identifies a phrase that all documents must contain
                        "excludeTerms": {
                            "type": "string",
                            "description": "Identifies a word or phrase that should not appear in any documents",
                            "default": None,
                        },  # Identifies a word or phrase that should not appear in any documents
                        "fileType": {
                            "type": "string",
                            "description": "Returns only results of specified filetype",
                            "default": None,
                        },  # Returns only results of specified filetype
                        "filter": {
                            "type": "string",
                            "description": "Controls turning on or off the duplicate content filter. 0 - off, 1 - on.",
                            "default": None,
                        },  # Controls turning on or off the duplicate content filter
                        "googlehost": {
                            "type": "string",
                            "description": "The Google domain to use to search (e.g., google.com, google.de).",
                            "default": None,
                        },  # The Google domain to use to search
                        "highRange": {
                            "type": "string",
                            "description": "Specifies the ending value for a range search",
                            "default": None,
                        },  # Specifies the ending value for a range search
                        "linkSite": {
                            "type": "string",
                            "description": "Specifies that all search results should contain a link to a particular URL",
                            "default": None,
                        },  # Specifies that all search results should contain a link to a particular URL
                        "lowRange": {
                            "type": "string",
                            "description": "Specifies the starting value for a range search",
                            "default": None,
                        },  # Specifies the starting value for a range search
                        "lr": {
                            "type": "string",
                            "description": "The language restriction for the search, IETF BCP 47 language code.",
                            "default": None,
                        },  # The language restriction for the search
                        "orTerms": {
                            "type": "string",
                            "description": "Provides additional search terms to check for in a document",
                            "default": None,
                        },  # Provides additional search terms to check for in a document
                        "relatedSite": {
                            "type": "string",
                            "description": "Specifies that all search results should be pages that are related to the specified URL",
                            "default": None,
                        },  # Specifies that all search results should be pages that are related to the specified URL
                        "safe": {
                            "type": "string",
                            "description": "Search safety level",
                            "default": "active",
                            "enum": ["active", "off"],
                        },  # Search safety level
                        "siteSearch": {
                            "type": "string",
                            "description": "Specifies a given site which should always be included or excluded from results",
                            "default": None,
                        },  # Specifies a given site which should always be included or excluded from results
                        "siteSearchFilter": {
                            "type": "string",
                            "description": "Controls whether to include or exclude results from siteSearch. e - exclude, i - include.",
                            "default": None,
                        },  # Controls whether to include or exclude results from the site named in the siteSearch parameter
                        "sort": {
                            "type": "string",
                            "description": "The sort expression to use to sort results. e.g., 'date'.",
                            "default": None,
                        },  # The sort expression to use to sort the results
                    },
                },
            )
        ]

    return app


def run_stdio_server(google_search_client: CustomGoogleSearchClient) -> None:
    """Run the server using stdio transport."""
    from mcp.server.stdio import stdio_server

    async def arun():
        async with stdio_server() as streams:
            app = create_app(google_search_client)
            await app.run(streams[0], streams[1], app.create_initialization_options())

    anyio.run(arun())


# async def run_sse_server(app: Server, host: str, port: int) -> None:
def run_sse_server(
    google_search_client: CustomGoogleSearchClient, host: str, port: int
) -> None:
    """Run the server using SSE transport."""
    import uvicorn
    from mcp.server.sse import SseServerTransport
    from starlette.applications import Starlette
    from starlette.routing import Mount, Route

    app = create_app(google_search_client)

    sse = SseServerTransport("/messages/")

    async def handle_sse(request):
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await app.run(streams[0], streams[1], app.create_initialization_options())

    starlette_app = Starlette(
        debug=True,
        routes=[
            Route("/sse", endpoint=handle_sse),
            Mount("/messages/", app=sse.handle_post_message),
        ],
    )
    uvicorn.run(starlette_app, host=host, port=port)
