"""Tests for the page title on the fetch tool's simplified result (#2472).

Readability.js drops an article heading that repeats the document title, so a
page such as pandas' "What's new in 2.1.0" release note came back without the
line naming it. ``with_page_title`` now puts the title on top as a heading
unless the Markdown already opens with it. The protocol-level tests drive the
real server through an MCP client with HTTP served by ``harness.FakeWeb``, on
both extractor paths, and pin that the raw result is untouched; the unit tests
below pin each rule for choosing the title and spotting a duplicate.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from mcp import ClientSession
from mcp.types import CallToolResult

from mcp_server_fetch.title import page_title, with_page_title

from .harness import FakeWeb, connect

PAGE = "https://example.com/page"
ROBOTS = "https://example.com/robots.txt"
PREFIX = f"Contents of {PAGE}:\n"

# The shape of a Sphinx (pydata theme) page: `<title>` adds the site name to
# the `<h1>`, which carries a "#" permalink.
BODY = "<p>These are the changes in pandas 2.1.0, with a long enough body. " * 8
SPHINX_PAGE = f"""<!DOCTYPE html>
<html><head><title>What’s new in 2.1.0 (Aug 30, 2023) — pandas documentation</title></head>
<body><article>
<h1>What’s new in 2.1.0 (Aug 30, 2023)<a class="headerlink" href="#x">#</a></h1>
{BODY}</p>
</article></body></html>"""


def text_of(result: CallToolResult) -> str:
    assert not result.is_error, result
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert len(data["content"]) == 1
    return data["content"][0]["text"]


async def fetch(web: FakeWeb, html: str, **arguments: Any) -> str:
    web.add(ROBOTS, httpx.Response(404))
    web.add(
        PAGE,
        httpx.Response(200, text=html, headers={"content-type": "text/html"}),
    )
    async with connect() as (session, _):
        assert isinstance(session, ClientSession)
        result = await session.call_tool("fetch", {"url": PAGE, **arguments})
    return text_of(result)


@pytest.mark.usefixtures("node_readability", "private_tempdir")
async def test_readability_js_result_gains_the_dropped_title(web: FakeWeb) -> None:
    text = await fetch(web, SPHINX_PAGE)
    assert text.startswith(f"{PREFIX}# What’s new in 2.1.0 (Aug 30, 2023)\n\n")
    assert text.count("What’s new in 2.1.0") == 1
    assert "These are the changes in pandas 2.1.0" in text


@pytest.mark.usefixtures("python_readability")
async def test_python_result_is_not_given_a_second_title(web: FakeWeb) -> None:
    # The pure-Python extractor keeps the `<h1>` (and opens with the
    # `<title>`), so the title is already there and nothing is added.
    text = await fetch(web, SPHINX_PAGE)
    assert not text.startswith(f"{PREFIX}# ")
    assert "What’s new in 2.1.0" in text
    assert "These are the changes in pandas 2.1.0" in text


async def test_raw_result_is_untouched(web: FakeWeb) -> None:
    text = await fetch(web, SPHINX_PAGE, raw=True)
    assert text.endswith(SPHINX_PAGE)
    assert "\n# What’s new" not in text


@pytest.mark.usefixtures("node_readability", "private_tempdir")
async def test_failed_simplification_is_not_titled(web: FakeWeb) -> None:
    text = await fetch(
        web, "<html><head><title>Shell</title></head><body></body></html>"
    )
    assert text == f"{PREFIX}<error>Page failed to be simplified from HTML</error>"


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        # og:title wins over everything else.
        (
            '<head><meta property="og:title" content=" Social  title "><title>T</title></head><h1>T</h1>',
            "Social title",
        ),
        # The `<h1>` wins when `<title>` holds it.
        ("<title>Heading | Site</title><h1>Heading</h1>", "Heading"),
        # Otherwise `<title>`.
        ("<title>Document title</title><h1>Something else</h1>", "Document title"),
        # A trailing "¶" permalink that is plain text is dropped.
        ("<title>Doc ¶</title>", "Doc"),
        # No `<title>`: the `<h1>`.
        ("<body><h1>Only heading</h1></body>", "Only heading"),
        # An empty og:title and title fall through to the `<h1>`.
        (
            '<meta property="og:title" content=""><title> </title><h1>H</h1>',
            "H",
        ),
        # Nothing names the page.
        ("<body><p>No title</p></body>", None),
        ("<title></title><h1><a class='headerlink'>#</a></h1>", None),
    ],
)
def test_page_title(html: str, expected: str | None) -> None:
    assert page_title(html) == expected


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        # No heading: the title goes on top.
        ("Body text.\n", "# Title Here\n\nBody text.\n"),
        # Leading blank lines are folded into the separator.
        ("\n\nBody text.\n", "# Title Here\n\nBody text.\n"),
        # Already opens with the title as a heading, at any level.
        ("# Title Here\n\nBody.", "# Title Here\n\nBody."),
        ("\n## title here ¶\n\nBody.", "\n## title here ¶\n\nBody."),
        # A first line that holds the whole title, heading or not.
        ("<p>Title Here — Site</p>Skip\n", "<p>Title Here — Site</p>Skip\n"),
        # A first heading the title holds (the title adds a site name).
        ("# Title\n\nBody.", "# Title\n\nBody."),
        # A first paragraph the title holds is not a heading: title added.
        ("Title\n\nBody.", "# Title Here\n\nTitle\n\nBody."),
        # A first line of punctuation only cannot match.
        ("---\n\nBody.", "# Title Here\n\n---\n\nBody."),
        # The title only in a link destination or tag is not shown: added.
        (
            "[Source](https://example.com/title-here)\n",
            "# Title Here\n\n[Source](https://example.com/title-here)\n",
        ),
        (
            "<a href='title-here'>x</a>\n",
            "# Title Here\n\n<a href='title-here'>x</a>\n",
        ),
        # The title as a link's visible text is shown: not added.
        ("[Title Here](https://example.com)\n", "[Title Here](https://example.com)\n"),
        # Empty content still gains the title.
        ("", "# Title Here\n\n"),
    ],
)
def test_with_page_title(content: str, expected: str) -> None:
    assert with_page_title("<title>Title Here</title>", content) == expected


def test_with_page_title_leaves_untitled_page_and_failure_alone() -> None:
    assert with_page_title("<p>x</p>", "Body.") == "Body."
    failure = "<error>Page failed to be simplified from HTML</error>"
    assert with_page_title("<title>T</title>", failure) == failure


@pytest.mark.parametrize(
    ("title", "content"),
    [
        # Matching is by whole words, in both directions.
        ("Rust", "Trust the compiler."),
        ("Go", "Algorithms make this possible."),
        ("Rust Guide", "# Rust Gui\n"),
    ],
)
def test_partial_words_do_not_match(title: str, content: str) -> None:
    html = f"<title>{title}</title>"
    assert with_page_title(html, content) == f"# {title}\n\n{content}"


def test_code_span_contents_count_as_visible() -> None:
    # A heading's inline HTML example is text, not a tag, inside a code span.
    content = "# The `<input>` element\n\nBody."
    assert (
        with_page_title("<title>The &lt;input&gt; element</title>", content) == content
    )


@pytest.mark.parametrize("opener", ["](", "<", "`"])
def test_unterminated_markup_on_a_long_first_line(opener: str) -> None:
    # Linear in the line's length: a quadratic scan of 200,000 openers would
    # not finish in the test's time. The title is not on the line, so it is added.
    content = opener * 200_000
    result = with_page_title("<title>Title Here</title>", content)
    assert result == f"# Title Here\n\n{content}"


@pytest.mark.parametrize(
    ("title_html", "heading"),
    [
        ("Using &lt;T&gt;", "# Using \\<T\\>"),
        ("__init__ and *args", "# \\_\\_init\\_\\_ and \\*args"),
        (
            "[Draft] R&amp;D #3 `x` | a~b \\ c",
            "# \\[Draft\\] R\\&D \\#3 \\`x\\` \\| a\\~b \\\\ c",
        ),
    ],
)
def test_heading_escapes_markdown_and_html(title_html: str, heading: str) -> None:
    result = with_page_title(f"<title>{title_html}</title>", "Body.")
    assert result == f"{heading}\n\nBody."


def test_title_with_no_word_characters_is_not_matched() -> None:
    assert with_page_title("<title>—</title>", "Body.") == "# —\n\nBody."
