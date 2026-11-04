"""Protocol-level tests for asking for native markdown (#5198).

A fetch used to send httpx's default ``Accept: */*``, so a site that can serve
markdown through content negotiation sent HTML to be simplified, and a
``text/markdown`` response was labeled as content that "cannot be simplified
to markdown" behind the raw-content prefix. Now a non-raw fetch prefers
``text/markdown`` (HTML next, anything else last), and a markdown response is
returned as-is with no prefix. A ``raw`` fetch keeps the default ``Accept``,
so it gets the site's default representation (a page's HTML) as before. These
tests drive ``serve()`` through an MCP client with HTTP served by
``harness.FakeWeb``.
"""

from __future__ import annotations

import httpx
import pytest

from mcp_server_fetch.server import MARKDOWN_ACCEPT, _is_markdown

from .harness import FakeWeb, connect

PAGE = "https://example.com/doc"
ROBOTS = "https://example.com/robots.txt"

# Opens with an "<html" mention inside the first 100 characters, which the
# HTML sniff would otherwise take for a page to simplify.
MARKDOWN = "# Title\n\nUse an `<html>` tag at the top.\n\n- one\n- two\n"

ARTICLE = """<html><head><title>Test Page</title></head><body>
<article>
<h1>Hello World</h1>
<p>This is a <a href="https://example.com/x">link</a> in a test paragraph
with enough words to count as the main content of the page.</p>
</article>
</body></html>"""


def markdown(content_type: str = "text/markdown; charset=utf-8") -> httpx.Response:
    return httpx.Response(
        200, content=MARKDOWN.encode(), headers={"content-type": content_type}
    )


async def call_fetch(web: FakeWeb, arguments: dict[str, object]) -> str:
    async with connect() as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE, **arguments})
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert data["isError"] is False
    return data["content"][0]["text"]


def page_requests(web: FakeWeb) -> list[httpx.Request]:
    return [r for r in web.requests if str(r.url) == PAGE]


async def test_a_fetch_prefers_markdown_then_html(web: FakeWeb) -> None:
    web.add(ROBOTS, httpx.Response(404))
    web.add(PAGE, markdown())
    await call_fetch(web, {})
    [request] = page_requests(web)
    assert request.headers["accept"] == "text/markdown, text/html;q=0.9, */*;q=0.8"
    assert MARKDOWN_ACCEPT == request.headers["accept"]
    # The robots.txt lookup is not a page fetch and asks for nothing new.
    [robots] = [r for r in web.requests if str(r.url) == ROBOTS]
    assert robots.headers["accept"] == "*/*"


@pytest.mark.parametrize(
    "content_type", ["text/markdown", "text/markdown; charset=utf-8", "Text/Markdown"]
)
async def test_markdown_is_returned_as_is_without_the_raw_prefix(
    web: FakeWeb, content_type: str
) -> None:
    web.add(ROBOTS, httpx.Response(404))
    web.add(PAGE, markdown(content_type))
    text = await call_fetch(web, {})
    assert text == f"Contents of {PAGE}:\n{MARKDOWN}"


async def test_a_raw_fetch_keeps_the_default_accept(web: FakeWeb) -> None:
    web.add(ROBOTS, httpx.Response(404))
    web.add(
        PAGE, httpx.Response(200, text=ARTICLE, headers={"content-type": "text/html"})
    )
    text = await call_fetch(web, {"raw": True})
    [request] = page_requests(web)
    assert request.headers["accept"] == "*/*"
    assert text.endswith(f"Contents of {PAGE}:\n{ARTICLE}")


async def test_markdown_under_raw_is_unchanged_and_unprefixed(web: FakeWeb) -> None:
    # Markdown served unasked (a .md file, say) is the same either way.
    web.add(ROBOTS, httpx.Response(404))
    web.add(PAGE, markdown())
    text = await call_fetch(web, {"raw": True})
    assert text == f"Contents of {PAGE}:\n{MARKDOWN}"


@pytest.mark.usefixtures("python_readability")
async def test_html_from_a_site_that_ignores_accept_is_still_simplified(
    web: FakeWeb,
) -> None:
    web.add(ROBOTS, httpx.Response(404))
    web.add(
        PAGE, httpx.Response(200, text=ARTICLE, headers={"content-type": "text/html"})
    )
    text = await call_fetch(web, {})
    assert "cannot be simplified" not in text
    assert "<article>" not in text
    assert "Hello World" in text


async def test_the_prompt_returns_markdown_as_is(web: FakeWeb) -> None:
    web.add(PAGE, markdown())
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    message = result.model_dump(by_alias=True, mode="json")["messages"][0]
    assert message["content"]["text"].endswith(MARKDOWN)
    assert "cannot be simplified" not in message["content"]["text"]
    [request] = page_requests(web)
    assert request.headers["accept"] == MARKDOWN_ACCEPT


@pytest.mark.parametrize(
    ("content_type", "expected"),
    [
        ("text/markdown", True),
        (" text/markdown ; variant=GFM", True),
        ("text/markdownish", False),
        ("text/x-markdown", False),
        ("text/plain", False),
        ("", False),
    ],
)
def test_is_markdown(content_type: str, expected: bool) -> None:
    assert _is_markdown(content_type) is expected
