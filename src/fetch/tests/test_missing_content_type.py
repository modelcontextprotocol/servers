"""Protocol-level tests for responses served without a Content-Type (#5134).

A missing Content-Type header used to make every body count as HTML, so JSON,
plain text and other payloads were pushed through readability and came back
altered or as a simplification error. Now a header-less body is simplified
only when it itself opens like an HTML document (an HTML doctype or an
``<html`` tag, after any byte-order mark and whitespace); anything else comes
back raw. These tests drive ``serve()`` through an MCP client with HTTP served
by ``harness.FakeWeb``, and also pin the HTML media types that are still
simplified whatever the body looks like.
"""

from __future__ import annotations

import httpx
import pytest
from mcp.types import CallToolResult

from mcp_server_fetch.server import _body_looks_like_html

from .harness import FakeWeb, connect

PAGE = "https://example.com/page"
BOM = "\ufeff"

ARTICLE_BODY = """<head><title>Test Page</title></head><body>
<article>
<h1>Hello World</h1>
<p>This is a <a href="https://example.com/x">link</a> in a test paragraph
with enough words to count as the main content of the page.</p>
<h2>Sub heading</h2>
<p>More text here.</p>
</article>
</body>"""


def text_of(result: CallToolResult) -> str:
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert data["isError"] is False
    assert len(data["content"]) == 1
    assert data["content"][0]["type"] == "text"
    return data["content"][0]["text"]


def headerless(body: str) -> httpx.Response:
    response = httpx.Response(200, content=body.encode())
    assert "content-type" not in response.headers
    return response


async def fetch(web: FakeWeb, response: httpx.Response) -> str:
    web.add(PAGE, response)
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    return text_of(result)


def assert_raw(text: str, body: str) -> None:
    assert "Page failed to be simplified" not in text
    assert text.endswith(f"Contents of {PAGE}:\n{body}")
    assert "cannot be simplified to markdown, but here is the raw content:" in text


def assert_simplified(text: str) -> None:
    assert text.startswith(f"Contents of {PAGE}:\n")
    assert "[link](https://example.com/x)" in text
    assert "## Sub heading" in text
    assert "<article>" not in text


@pytest.mark.parametrize(
    "body",
    [
        '{"key": "value", "snake_case": "*starred*"}',
        "[1, 2, 3]",
        "just some plain_text with *asterisks*\nand a second line",
        "a,b,c\n1,2,3\n",
    ],
    ids=["json-object", "json-array", "plain-text", "csv"],
)
async def test_non_html_without_content_type_is_returned_raw(
    web: FakeWeb, body: str
) -> None:
    assert_raw(await fetch(web, headerless(body)), body)


async def test_empty_body_without_content_type_is_not_simplified(
    web: FakeWeb,
) -> None:
    # An empty body used to reach readability and fail to simplify; now it is
    # raw content with nothing in it, which the tool reports as such.
    text = await fetch(web, headerless(""))
    assert "Page failed to be simplified" not in text
    assert "cannot be simplified to markdown, but here is the raw content:" in text
    assert text.endswith("<error>No more content available.</error>")


@pytest.mark.usefixtures("node_readability")
@pytest.mark.parametrize(
    "body",
    [
        pytest.param(f"<!DOCTYPE html>\n{ARTICLE_BODY}", id="doctype-upper"),
        pytest.param(f"<!doctype html>{ARTICLE_BODY}", id="doctype-lower"),
        pytest.param(
            f"{BOM}\n  <!DocType HTML>\n{ARTICLE_BODY}", id="bom-and-whitespace"
        ),
        # More leading whitespace than the 100-character "<html" window.
        pytest.param(f"{' ' * 120}<HTML>{ARTICLE_BODY}</HTML>", id="long-indent"),
    ],
)
async def test_html_without_content_type_is_still_simplified(
    web: FakeWeb, body: str
) -> None:
    assert_simplified(await fetch(web, headerless(body)))


@pytest.mark.usefixtures("node_readability")
@pytest.mark.parametrize(
    "content_type",
    [
        "application/xhtml+xml",
        "application/xhtml+xml; charset=utf-8",
        "Text/HTML; charset=UTF-8",
    ],
)
async def test_html_media_types_are_simplified(web: FakeWeb, content_type: str) -> None:
    # The body carries no "<html" tag, so only the header can make it HTML.
    response = httpx.Response(
        200, content=ARTICLE_BODY.encode(), headers={"content-type": content_type}
    )
    assert_simplified(await fetch(web, response))


async def test_doctype_alone_does_not_override_a_declared_content_type(
    web: FakeWeb,
) -> None:
    # Sniffing the doctype applies only when the header is missing.
    body = f"<!doctype html>{ARTICLE_BODY}"
    response = httpx.Response(
        200, content=body.encode(), headers={"content-type": "text/plain"}
    )
    assert_raw(await fetch(web, response), body)


@pytest.mark.parametrize(
    "body, expected",
    [
        (f"{BOM}<!doctype html><p>x</p>", True),
        (f"{BOM}\n  <!DocType HTML>\n<p>x</p>", True),
        (f"{BOM} \t\r\n<HTML><p>x</p></HTML>", True),
        (f'{BOM}{{"key": "value"}}', False),
        (f"{BOM}plain text", False),
        ("", False),
    ],
    ids=[
        "bom-doctype",
        "bom-whitespace-doctype",
        "bom-html",
        "bom-json",
        "bom-text",
        "empty",
    ],
)
def test_body_detection_skips_bom_and_whitespace(body: str, expected: bool) -> None:
    # What #5134 decides, without readabilipy's extraction.
    assert _body_looks_like_html(body) is expected
