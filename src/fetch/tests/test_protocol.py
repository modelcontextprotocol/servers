"""Characterization tests that drive ``serve()`` through the MCP protocol.

Every test here runs the real server in-process (see ``harness.connect``) and
talks to it with an SDK ``ClientSession``, so what is asserted is what a client
receives on the wire. Results are compared as wire JSON
(``model_dump(by_alias=True, mode="json")``) where practical, so the
assertions survive an SDK migration that renames Python attributes.

HTTP is served by ``harness.FakeWeb``; nothing here touches the network.

Tests marked "Characterizes" pin current behavior that an open issue asks to
change. They are meant to be updated by the PR that fixes that issue, not
read as an endorsement of the behavior.
"""

from __future__ import annotations

import os
from importlib.metadata import version
from typing import Any

import httpx
import pytest
from mcp import ClientSession
from mcp.shared.exceptions import McpError
from mcp.types import INVALID_PARAMS, CallToolResult

from mcp_server_fetch.server import (
    DEFAULT_USER_AGENT_AUTONOMOUS,
    DEFAULT_USER_AGENT_MANUAL,
)

from .harness import FakeWeb, connect

PAGE = "https://example.com/page"
ROBOTS = "https://example.com/robots.txt"
ALPHABET = "abcdefghijklmnopqrstuvwxyz"
RAW_PREFIX_PLAIN = (
    "Content type text/plain cannot be simplified to markdown, "
    "but here is the raw content:\n"
)

ARTICLE_HTML = """<html><head><title>Test Page</title></head><body>
<article>
<h1>Hello World</h1>
<p>This is a <a href="https://example.com/x">link</a> in a test paragraph
with enough words to count as the main content of the page.</p>
<h2>Sub heading</h2>
<p>More text here.</p>
</article>
</body></html>"""


def wire(model: Any) -> dict[str, Any]:
    return model.model_dump(by_alias=True, mode="json", exclude_none=True)


def text_of(result: CallToolResult) -> str:
    data = wire(result)
    assert len(data["content"]) == 1
    assert data["content"][0]["type"] == "text"
    return data["content"][0]["text"]


def plain(body: str, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status, content=body.encode(), headers={"content-type": "text/plain"}
    )


def html(body: str) -> httpx.Response:
    return httpx.Response(
        200, content=body.encode(), headers={"content-type": "text/html"}
    )


async def call(session: ClientSession, arguments: dict[str, Any]) -> CallToolResult:
    return await session.call_tool("fetch", arguments)


# --------------------------------------------------------------------------
# Initialization
# --------------------------------------------------------------------------


async def test_initialize_advertises_tools_and_prompts(web: FakeWeb) -> None:
    async with connect() as (_, init):
        data = wire(init)
    assert data["serverInfo"]["name"] == "mcp-fetch"
    assert "tools" in data["capabilities"]
    assert "prompts" in data["capabilities"]
    assert "resources" not in data["capabilities"]


# KNOWN BUG #360: pins current (wrong) behavior; the fix changes this assertion.
async def test_server_version_is_the_sdk_version(web: FakeWeb) -> None:
    # Characterizes #360: serverInfo.version is the `mcp` SDK's version, not
    # this package's, because Server("mcp-fetch") is given no version.
    async with connect() as (_, init):
        data = wire(init)
    assert data["serverInfo"]["version"] == version("mcp")
    assert data["serverInfo"]["version"] != version("mcp-server-fetch")


# --------------------------------------------------------------------------
# tools/list
# --------------------------------------------------------------------------


async def test_list_tools_wire_shape(web: FakeWeb) -> None:
    async with connect() as (session, _):
        result = await session.list_tools()
    tools = wire(result)["tools"]
    assert [t["name"] for t in tools] == ["fetch"]
    tool = tools[0]
    assert tool["description"].startswith(
        "Fetches a URL from the internet and optionally extracts its contents as markdown."
    )
    assert "this tool now grants you internet access" in tool["description"]
    assert "outputSchema" not in tool
    assert tool["inputSchema"] == {
        "description": "Parameters for fetching a URL.",
        "properties": {
            "url": {
                "description": "URL to fetch",
                "format": "uri",
                "minLength": 1,
                "title": "Url",
                "type": "string",
            },
            # #1624: inclusive minimum/maximum, never exclusiveMinimum/
            # exclusiveMaximum, which some clients (Gemini) reject.
            "max_length": {
                "default": 5000,
                "description": "Maximum number of characters to return.",
                "maximum": 999999,
                "minimum": 1,
                "title": "Max Length",
                "type": "integer",
            },
            "start_index": {
                "default": 0,
                "description": "On return output starting at this character index, useful if a previous fetch was truncated and more context is required.",
                "minimum": 0,
                "title": "Start Index",
                "type": "integer",
            },
            "raw": {
                "default": False,
                "description": "Get the actual HTML content of the requested page, without simplification.",
                "title": "Raw",
                "type": "boolean",
            },
        },
        "required": ["url"],
        "title": "Fetch",
        "type": "object",
    }


# --------------------------------------------------------------------------
# tools/call: arguments and validation
# --------------------------------------------------------------------------


async def test_call_with_only_url_applies_defaults(web: FakeWeb) -> None:
    # #2035: only `url` is required; max_length, start_index and raw default.
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, plain("hello"))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result) == {
        "content": [
            {"type": "text", "text": f"{RAW_PREFIX_PLAIN}Contents of {PAGE}:\nhello"}
        ],
        "isError": False,
    }


@pytest.mark.parametrize(
    ("arguments", "offending"),
    [
        ({}, "'url'"),
        ({"url": ""}, "''"),
        ({"url": 5}, "5"),
        # #1624: the bounds are minimum 1 and maximum 999999, so the rejected
        # values are the same as under the old exclusive 0 and 1000000.
        ({"url": PAGE, "max_length": 0}, "0"),
        ({"url": PAGE, "max_length": 1000000}, "1000000"),
        ({"url": PAGE, "start_index": -1}, "-1"),
        ({"url": PAGE, "raw": "yes"}, "'yes'"),
    ],
)
async def test_schema_violations_are_rejected_by_the_sdk(
    web: FakeWeb, arguments: dict[str, Any], offending: str
) -> None:
    # The SDK validates against inputSchema before the handler runs. The rest
    # of the message is jsonschema's wording, which varies by version.
    async with connect() as (session, _):
        result = await call(session, arguments)
    assert wire(result)["isError"] is True
    text = text_of(result)
    assert text.startswith("Input validation error: ")
    assert offending in text
    assert web.requests == []


@pytest.mark.parametrize("max_length", [1, 999999])
async def test_max_length_bounds_are_inclusive(web: FakeWeb, max_length: int) -> None:
    # #1624: the edges of the inclusive range pass both the SDK's schema check
    # and Fetch's own validation, and the page is fetched.
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, plain("hello"))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE, "max_length": max_length})
    assert wire(result)["isError"] is False
    assert web.urls() == [ROBOTS, PAGE]


@pytest.mark.parametrize("url", ["not a url", "example.com/page", "http://"])
async def test_invalid_url_is_rejected_by_pydantic(web: FakeWeb, url: str) -> None:
    # jsonschema does not check `format: uri`, so these reach Fetch(**arguments)
    # and its ValidationError (a ValueError) becomes an isError result.
    async with connect() as (session, _):
        result = await call(session, {"url": url})
    assert wire(result)["isError"] is True
    text = text_of(result)
    assert "1 validation error for Fetch" in text
    assert "url" in text
    assert web.requests == []


# KNOWN BUG #4988: call_tool ignores the tool name and runs fetch for any name; the fix changes this assertion.
async def test_call_tool_never_checks_the_tool_name(web: FakeWeb) -> None:
    # Characterizes call_tool ignoring `name`: an unknown tool name is not
    # rejected, the SDK skips schema validation for it (the tool is not
    # listed), and the URL is fetched as if `fetch` had been called.
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, plain("fetched anyway"))
    async with connect() as (session, _):
        result = await session.call_tool("nope", {"url": PAGE})
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("fetched anyway")
    assert web.urls() == [ROBOTS, PAGE]


# KNOWN BUG #4988: call_tool ignores the tool name and runs fetch for any name; the fix changes this assertion.
async def test_unknown_tool_name_still_validates_through_pydantic(
    web: FakeWeb,
) -> None:
    async with connect() as (session, _):
        result = await session.call_tool("nope", {})
    assert wire(result)["isError"] is True
    assert "url" in text_of(result)
    assert "Field required" in text_of(result)


# --------------------------------------------------------------------------
# tools/call: robots.txt
# --------------------------------------------------------------------------


@pytest.mark.parametrize("status", [404, 410, 400, 499])
async def test_robots_4xx_other_than_401_403_allows_fetch(
    web: FakeWeb, status: int
) -> None:
    web.add(ROBOTS, plain("User-agent: *\nDisallow: /", status=status))
    web.add(PAGE, plain("ok"))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("ok")


@pytest.mark.parametrize("status", [401, 403])
async def test_robots_401_403_blocks_fetch(web: FakeWeb, status: int) -> None:
    web.add(ROBOTS, plain("", status=status))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result) == {
        "content": [
            {
                "type": "text",
                "text": f"When fetching robots.txt ({ROBOTS}), received status {status} "
                "so assuming that autonomous fetching is not allowed, the user can "
                "try manually fetching by using the fetch prompt",
            }
        ],
        "isError": True,
    }
    assert web.urls() == [ROBOTS]


async def test_robots_connection_failure_blocks_fetch(web: FakeWeb) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    web.add(ROBOTS, refuse)
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result) == {
        "content": [
            {
                "type": "text",
                "text": f"Failed to fetch robots.txt {ROBOTS} due to a connection issue",
            }
        ],
        "isError": True,
    }
    assert web.urls() == [ROBOTS]


async def test_robots_disallow_blocks_fetch(web: FakeWeb) -> None:
    robots = "User-agent: *\nDisallow: /"
    web.add(ROBOTS, plain(robots))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is True
    assert text_of(result) == (
        f"The sites robots.txt ({ROBOTS}), specifies that autonomous fetching of this page is not allowed, "
        f"<useragent>{DEFAULT_USER_AGENT_AUTONOMOUS}</useragent>\n"
        f"<url>{PAGE}</url>"
        f"<robots>\n{robots}\n</robots>\n"
        "The assistant must let the user know that it failed to view the page. "
        "The assistant may provide further guidance based on the above information.\n"
        "The assistant can tell the user that they can try manually fetching the page "
        "by using the fetch prompt within their UI."
    )
    assert web.urls() == [ROBOTS]


async def test_robots_allow_then_fetches_page(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("User-agent: *\nDisallow: /private"))
    web.add(PAGE, plain("public"))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is False
    assert web.urls() == [ROBOTS, PAGE]
    for request in web.requests:
        assert request.headers["user-agent"] == DEFAULT_USER_AGENT_AUTONOMOUS


async def test_robots_comment_lines_are_ignored(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("# User-agent: *\n# Disallow: /\nUser-agent: *\nAllow: /"))
    web.add(PAGE, plain("ok"))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is False


async def test_robots_5xx_body_is_parsed_as_rules(web: FakeWeb) -> None:
    # Only 4xx short-circuits; a 5xx response body is still parsed as rules.
    web.add(ROBOTS, plain("User-agent: *\nDisallow: /", status=503))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is True
    assert "specifies that autonomous fetching of this page is not allowed" in (
        text_of(result)
    )


async def test_robots_redirect_is_followed(web: FakeWeb) -> None:
    web.add(
        ROBOTS,
        httpx.Response(301, headers={"location": "https://www.example.com/robots.txt"}),
    )
    web.add("https://www.example.com/robots.txt", plain("User-agent: *\nDisallow: /"))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is True
    assert web.urls() == [ROBOTS, "https://www.example.com/robots.txt"]


async def test_robots_rules_match_the_custom_user_agent(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("User-agent: MyBot\nDisallow: /\n\nUser-agent: *\nAllow: /"))
    async with connect(custom_user_agent="MyBot") as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is True
    assert "<useragent>MyBot</useragent>" in text_of(result)
    assert web.requests[0].headers["user-agent"] == "MyBot"


async def test_ignore_robots_txt_skips_the_check(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("User-agent: *\nDisallow: /"))
    web.add(PAGE, plain("ok"))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is False
    assert web.urls() == [PAGE]


# --------------------------------------------------------------------------
# tools/call: fetching and content handling
# --------------------------------------------------------------------------


@pytest.mark.usefixtures("node_readability")
async def test_html_is_extracted_to_markdown(web: FakeWeb) -> None:
    web.add(PAGE, html(ARTICLE_HTML))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is False
    text = text_of(result)
    assert text.startswith(f"Contents of {PAGE}:\n")
    assert "[link](https://example.com/x)" in text
    assert "## Sub heading" in text
    assert "<article>" not in text


@pytest.mark.usefixtures("node_readability")
async def test_html_without_content_type_is_sniffed(web: FakeWeb) -> None:
    web.add(PAGE, httpx.Response(200, content=ARTICLE_HTML.encode()))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    text = text_of(result)
    assert text.startswith(f"Contents of {PAGE}:\n")
    assert "[link](https://example.com/x)" in text


@pytest.mark.usefixtures("node_readability")
async def test_html_tag_in_body_overrides_content_type(web: FakeWeb) -> None:
    web.add(
        PAGE,
        httpx.Response(
            200,
            content=ARTICLE_HTML.encode(),
            headers={"content-type": "application/octet-stream"},
        ),
    )
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    text = text_of(result)
    assert text.startswith(f"Contents of {PAGE}:\n")
    assert "[link](https://example.com/x)" in text


@pytest.mark.usefixtures("node_readability")
async def test_html_that_cannot_be_simplified(web: FakeWeb) -> None:
    web.add(PAGE, html("<html><body></body></html>"))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result) == {
        "content": [
            {
                "type": "text",
                "text": f"Contents of {PAGE}:\n<error>Page failed to be simplified from HTML</error>",
            }
        ],
        "isError": False,
    }


@pytest.mark.usefixtures("python_readability")
async def test_html_without_node_falls_back_to_pure_python(web: FakeWeb) -> None:
    # Without Node, readabilipy's pure-Python extractor is used: headings
    # survive but link targets are dropped.
    web.add(PAGE, html(ARTICLE_HTML))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    text = text_of(result)
    assert "## Sub heading" in text
    assert "This is a link in a test paragraph" in text
    assert "https://example.com/x" not in text


# KNOWN BUG #4989: an empty page without Node reports "No more content available" at start_index 0 instead of a simplification failure; the fix changes this assertion.
@pytest.mark.usefixtures("python_readability")
async def test_empty_html_without_node_reads_as_no_more_content(web: FakeWeb) -> None:
    # The pure-Python extractor never returns empty content, so the
    # "failed to be simplified" message is not reached; the page converts to
    # an empty string and the pagination check reports it as exhausted.
    web.add(PAGE, html("<html><body></body></html>"))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    assert text_of(result) == (
        f"Contents of {PAGE}:\n<error>No more content available.</error>"
    )


async def test_raw_returns_html_unsimplified(web: FakeWeb) -> None:
    web.add(PAGE, html(ARTICLE_HTML))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE, "raw": True})
    assert text_of(result) == (
        "Content type text/html cannot be simplified to markdown, but here is the raw content:\n"
        f"Contents of {PAGE}:\n{ARTICLE_HTML}"
    )


async def test_non_html_is_returned_raw_with_prefix(web: FakeWeb) -> None:
    body = '{"key": "value"}'
    web.add(
        PAGE,
        httpx.Response(
            200, content=body.encode(), headers={"content-type": "application/json"}
        ),
    )
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    assert text_of(result) == (
        "Content type application/json cannot be simplified to markdown, but here is the raw content:\n"
        f"Contents of {PAGE}:\n{body}"
    )


@pytest.mark.parametrize("status", [400, 404, 500, 503])
async def test_http_error_status(web: FakeWeb, status: int) -> None:
    web.add(PAGE, plain("nope", status=status))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result) == {
        "content": [
            {"type": "text", "text": f"Failed to fetch {PAGE} - status code {status}"}
        ],
        "isError": True,
    }


async def test_connection_error(web: FakeWeb) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    web.add(PAGE, refuse)
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result) == {
        "content": [
            {
                "type": "text",
                "text": f"Failed to fetch {PAGE}: ConnectError('connection refused')",
            }
        ],
        "isError": True,
    }


async def test_url_is_normalized_by_pydantic(web: FakeWeb) -> None:
    # AnyUrl normalizes the URL (here, adds a trailing slash to a bare host),
    # and the normalized form is what is fetched and echoed back.
    web.add("https://example.com/", plain("root"))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(session, {"url": "https://example.com"})
    assert (
        text_of(result) == f"{RAW_PREFIX_PLAIN}Contents of https://example.com/:\nroot"
    )
    assert web.urls() == ["https://example.com/"]


# --------------------------------------------------------------------------
# tools/call: pagination
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("start_index", "max_length", "expected"),
    [
        # Truncated: there is more, so the continuation hint is appended.
        (
            0,
            10,
            "abcdefghij\n\n<error>Content truncated. Call the fetch tool with a "
            "start_index of 10 to get more content.</error>",
        ),
        (
            10,
            10,
            "klmnopqrst\n\n<error>Content truncated. Call the fetch tool with a "
            "start_index of 20 to get more content.</error>",
        ),
        # A window that ends exactly at the end: full length, nothing remains.
        (16, 10, "qrstuvwxyz"),
        # A window that runs past the end: short slice, no hint.
        (20, 10, "uvwxyz"),
        # The whole thing fits.
        (0, 5000, ALPHABET),
        # At or past the end.
        (26, 10, "<error>No more content available.</error>"),
        (1000, 10, "<error>No more content available.</error>"),
    ],
)
async def test_pagination(
    web: FakeWeb, start_index: int, max_length: int, expected: str
) -> None:
    web.add(PAGE, plain(ALPHABET))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await call(
            session,
            {"url": PAGE, "start_index": start_index, "max_length": max_length},
        )
    assert wire(result) == {
        "content": [
            {
                "type": "text",
                "text": f"{RAW_PREFIX_PLAIN}Contents of {PAGE}:\n{expected}",
            }
        ],
        "isError": False,
    }


async def test_pagination_walks_the_whole_document(web: FakeWeb) -> None:
    web.add(PAGE, plain(ALPHABET))
    pieces: list[str] = []
    async with connect(ignore_robots_txt=True) as (session, _):
        start = 0
        # Four pages plus the exhaustion call. Bounded, so a regression that
        # ignores start_index fails here instead of looping forever.
        for _ in range(5):
            text = text_of(
                await call(
                    session, {"url": PAGE, "start_index": start, "max_length": 7}
                )
            )
            body = text.split(f"Contents of {PAGE}:\n", 1)[1]
            if body == "<error>No more content available.</error>":
                break
            chunk = body.split("\n\n<error>", 1)[0]
            pieces.append(chunk)
            start += len(chunk)
        else:
            pytest.fail(f"pagination did not reach the end; pages so far: {pieces}")
    assert "".join(pieces) == ALPHABET
    assert pieces == ["abcdefg", "hijklmn", "opqrstu", "vwxyz"]


# --------------------------------------------------------------------------
# tools/call: transport behavior pinned for open issues
# --------------------------------------------------------------------------


# KNOWN BUG #4838: pins current (wrong) behavior; the fix changes this assertion.
async def test_redirect_to_private_address_is_followed(web: FakeWeb) -> None:
    # Characterizes #4838: redirects are followed with no private-IP guard, so
    # a public URL can bounce the server to a link-local metadata address.
    metadata = "http://169.254.169.254/latest/meta-data/"
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, httpx.Response(302, headers={"location": metadata}))
    web.add(metadata, plain("instance-secret"))
    async with connect() as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result)["isError"] is False
    assert text_of(result) == f"{RAW_PREFIX_PLAIN}Contents of {PAGE}:\ninstance-secret"
    # robots.txt is only consulted for the original host, never the target.
    assert web.urls() == [ROBOTS, PAGE, metadata]


async def test_timeouts_are_hard_coded(web: FakeWeb) -> None:
    # Characterizes #4448: the page fetch uses a fixed 30s timeout and the
    # robots.txt fetch uses httpx's 5s default; neither is configurable.
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, plain("ok"))
    async with connect() as (session, _):
        await call(session, {"url": PAGE})
    robots_request, page_request = web.requests
    assert robots_request.extensions["timeout"] == {
        "connect": 5.0,
        "read": 5.0,
        "write": 5.0,
        "pool": 5.0,
    }
    assert page_request.extensions["timeout"] == {
        "connect": 30,
        "read": 30,
        "write": 30,
        "pool": 30,
    }


async def test_proxy_url_is_passed_to_every_client(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, plain("ok"))
    proxy = "http://proxy.example.com:8080"
    async with connect(proxy_url=proxy) as (session, _):
        result = await call(session, {"url": PAGE})
        await session.get_prompt("fetch", {"url": PAGE})
    assert wire(result)["isError"] is False
    assert web.client_kwargs == [{"proxy": proxy}, {"proxy": proxy}, {"proxy": proxy}]


async def test_no_proxy_by_default(web: FakeWeb) -> None:
    web.add(PAGE, plain("ok"))
    async with connect(ignore_robots_txt=True) as (session, _):
        await call(session, {"url": PAGE})
    assert web.client_kwargs == [{"proxy": None}]


# KNOWN BUG #767, #1401: pins current (wrong) behavior; the fix changes this assertion.
@pytest.mark.parametrize("ignore_robots_txt", [False, True])
async def test_bad_proxy_config_surfaces_as_bare_text(ignore_robots_txt: bool) -> None:
    # Characterizes #767 and #1401: a bad proxy URL makes httpx.AsyncClient()
    # raise at construction, outside the `except HTTPError`, so the client gets
    # httpx's bare exception text with no mention of fetch or the proxy flag.
    # No `web` fixture: the real AsyncClient fails before any request is made.
    async with connect(
        proxy_url="ftp://proxy.example.com", ignore_robots_txt=ignore_robots_txt
    ) as (session, _):
        result = await call(session, {"url": PAGE})
    assert wire(result) == {
        "content": [
            {
                "type": "text",
                "text": "Unknown scheme for proxy URL URL('ftp://proxy.example.com')",
            }
        ],
        "isError": True,
    }


# --------------------------------------------------------------------------
# prompts
# --------------------------------------------------------------------------


async def test_list_prompts_wire_shape(web: FakeWeb) -> None:
    async with connect() as (session, _):
        result = await session.list_prompts()
    assert wire(result) == {
        "prompts": [
            {
                "name": "fetch",
                "description": "Fetch a URL and extract its contents as markdown",
                "arguments": [
                    {"name": "url", "description": "URL to fetch", "required": True}
                ],
            }
        ]
    }


async def test_get_prompt_fetches_with_manual_agent_and_no_robots(
    web: FakeWeb,
) -> None:
    web.add(ROBOTS, plain("User-agent: *\nDisallow: /"))
    web.add(PAGE, plain("prompt body"))
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    assert wire(result) == {
        "description": f"Contents of {PAGE}",
        "messages": [
            {
                "role": "user",
                "content": {"type": "text", "text": f"{RAW_PREFIX_PLAIN}prompt body"},
            }
        ],
    }
    # The prompt is the manual path: robots.txt is never consulted.
    assert web.urls() == [PAGE]
    assert web.requests[0].headers["user-agent"] == DEFAULT_USER_AGENT_MANUAL


@pytest.mark.usefixtures("node_readability")
async def test_get_prompt_extracts_markdown(web: FakeWeb) -> None:
    web.add(PAGE, html(ARTICLE_HTML))
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    message = wire(result)["messages"][0]["content"]["text"]
    assert "[link](https://example.com/x)" in message


async def test_get_prompt_uses_custom_user_agent(web: FakeWeb) -> None:
    web.add(PAGE, plain("ok"))
    async with connect(custom_user_agent="MyBot") as (session, _):
        await session.get_prompt("fetch", {"url": PAGE})
    assert web.requests[0].headers["user-agent"] == "MyBot"


async def test_get_prompt_fetch_failure_is_a_prompt_message(web: FakeWeb) -> None:
    # A failed fetch is returned as a normal prompt result, not an error.
    web.add(PAGE, plain("gone", status=404))
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    assert wire(result) == {
        "description": f"Failed to fetch {PAGE}",
        "messages": [
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": f"Failed to fetch {PAGE} - status code 404",
                },
            }
        ],
    }


@pytest.mark.parametrize("arguments", [None, {}, {"other": "x"}])
async def test_get_prompt_without_url_is_a_jsonrpc_error(
    web: FakeWeb, arguments: dict[str, str] | None
) -> None:
    async with connect() as (session, _):
        with pytest.raises(McpError) as excinfo:
            await session.get_prompt("fetch", arguments)
    assert wire(excinfo.value.error) == {
        "code": INVALID_PARAMS,
        "message": "URL is required",
    }
    assert web.requests == []


# KNOWN BUG #4988: get_prompt ignores the prompt name and serves fetch for any name; the fix changes this assertion.
async def test_get_prompt_never_checks_the_prompt_name(web: FakeWeb) -> None:
    # Like call_tool, get_prompt ignores `name`.
    web.add(PAGE, plain("ok"))
    async with connect() as (session, _):
        result = await session.get_prompt("nope", {"url": PAGE})
    assert wire(result)["description"] == f"Contents of {PAGE}"


async def test_get_prompt_does_not_validate_the_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The prompt passes the raw string to httpx; an unusable URL comes back as
    # a "Failed to fetch" prompt message rather than a validation error.
    # No `web` fixture: the real transport rejects the URL before any I/O.
    # Proxy variables are cleared so the real client cannot pick up one from
    # the environment (a socks:// proxy would fail on the missing socksio).
    for name in list(os.environ):
        if name.lower() in ("http_proxy", "https_proxy", "all_proxy"):
            monkeypatch.delenv(name)
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": "not a url"})
    data = wire(result)
    assert data["description"] == "Failed to fetch not a url"
    assert data["messages"][0]["content"]["text"].startswith(
        "Failed to fetch not a url: UnsupportedProtocol("
    )
