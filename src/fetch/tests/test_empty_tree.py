"""Regression tests for #5158: pages that simplify to an empty tree under beautifulsoup4 4.13.

readabilipy's pure-Python extractor (the path taken without Node) finishes by
wrapping its simplified tree in a ``<div>`` with ``Tag.append``. beautifulsoup4
4.13 implements ``append`` as ``self.insert(...)[0]``, and appending an empty
tree inserts nothing, so a page with no extractable content (an SPA shell, an
empty body) raised ``IndexError`` out of the tool call instead of returning the
server's "Page failed to be simplified" error.

The lockfile pins beautifulsoup4 4.12, where ``append`` returns nothing and the
crash cannot happen, and pyproject.toml is not where this is fixed: users who
install the server unpinned get 4.13. So ``bs4_413_append`` reproduces 4.13's
behavior on the installed version, and the first test proves the emulation
raises the crash the issue reports before the others rely on it.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import readabilipy.simple_json
from bs4 import BeautifulSoup
from bs4.element import Tag
from mcp.types import CallToolResult

from .harness import FakeWeb, connect

PAGE = "https://example.com/app"
FAILED = "<error>Page failed to be simplified from HTML</error>"

# The shape of the page in the issue's reproduction: client-rendered, nothing
# to extract. (A <title> would survive simplification as text, so it has none.)
SPA_SHELL = """<!doctype html><html><head><meta charset="utf-8">
<script type="module" src="/assets/index.js"></script></head>
<body><div id="root"></div></body></html>"""

ARTICLE = """<html><head><title>Article</title></head><body><article>
<h1>Heading</h1><p>A paragraph with enough words to be the page's content.</p>
</article></body></html>"""


@pytest.fixture
def bs4_413_append(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make ``Tag.append`` index the elements it inserted, as beautifulsoup4 4.13 does."""
    original = Tag.append

    def append(self: Tag, tag: Any) -> Any:
        # Appending a BeautifulSoup object inserts its children, so an empty
        # one inserts nothing, and 4.13's `insert(...)[0]` has nothing to index.
        inserted = list(tag.contents) if isinstance(tag, BeautifulSoup) else [tag]
        original(self, tag)
        return inserted[0]

    monkeypatch.setattr(Tag, "append", append)


def wire(result: CallToolResult) -> dict[str, Any]:
    # The result as it crosses the wire (2025-11-25 fields only).
    return result.model_dump(
        by_alias=True, mode="json", exclude_none=True, exclude_unset=True
    )


def html(body: str) -> httpx.Response:
    return httpx.Response(
        200, content=body.encode(), headers={"content-type": "text/html"}
    )


@pytest.mark.usefixtures("python_readability", "bs4_413_append")
@pytest.mark.parametrize("page", [SPA_SHELL, "<html><body></body></html>", ""])
def test_emulation_reproduces_the_reported_crash(page: str) -> None:
    with pytest.raises(IndexError, match="list index out of range"):
        readabilipy.simple_json.simple_json_from_html_string(page, use_readability=True)


@pytest.mark.usefixtures("python_readability", "bs4_413_append")
async def test_empty_tree_tool_call_reports_simplification_failure(
    web: FakeWeb,
) -> None:
    web.add(PAGE, html(SPA_SHELL))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert wire(result) == {
        "content": [{"type": "text", "text": f"Contents of {PAGE}:\n{FAILED}"}],
        "isError": False,
    }


@pytest.mark.usefixtures("python_readability", "bs4_413_append")
async def test_empty_tree_prompt_reports_simplification_failure(
    web: FakeWeb,
) -> None:
    web.add(PAGE, html(SPA_SHELL))
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    assert len(result.messages) == 1
    content = result.messages[0].content
    assert content.type == "text"
    assert content.text == FAILED


@pytest.mark.usefixtures("python_readability", "bs4_413_append")
async def test_page_with_content_still_extracts_under_bs4_413(web: FakeWeb) -> None:
    # Only the empty tree trips the index; a page with content is unaffected.
    web.add(PAGE, html(ARTICLE))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    data = wire(result)
    assert data["isError"] is False
    [content] = data["content"]
    assert content["type"] == "text"
    assert "# Heading" in content["text"]
    assert "A paragraph with enough words" in content["text"]
