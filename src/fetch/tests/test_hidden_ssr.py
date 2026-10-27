"""Tests for #3878: content that server-side rendering hides until hydration.

A progressively rendered page streams a visible loading shell, then the real
page in a container hidden until the client hydrates it. Readability.js drops
hidden nodes, so fetch returned only the shell. The server now re-runs
Readability.js with such a container unhidden, but only when a hidden element
(that is not navigation or other page furniture) holds more text than the whole
first extraction, and keeps the second result only when it has more text.

What counts as hidden depends on the Readability.js that readabilipy runs: the
copy bundled with readabilipy 0.2 (the lockfile's) drops ``display: none`` and
``hidden``; the ``@mozilla/readability`` that readabilipy 0.3 installs also
drops ``visibility: hidden`` and ``aria-hidden="true"``. The protocol tests
that prove the second run happens use the two hidings both versions drop. They
count readabilipy calls, so "a normal page is unchanged" is asserted as "it
was extracted once, as before", not inferred from the Markdown.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import readabilipy.simple_json
from bs4 import BeautifulSoup
from mcp.types import CallToolResult

from mcp_server_fetch.server import _is_hidden

from .harness import FakeWeb, connect

PAGE = "https://example.com/docs"

ARTICLE = """<article><h1>Developer Concepts</h1>
<p>Everything you need to integrate the framework: guides, concepts and
references for developers and architects, rendered on the server.</p>
<h2>Install</h2>
<p>Install the package and initialize your first project. The command line
handles project setup and configuration automatically.</p></article>"""


def ssr_page(hiding: str) -> str:
    # The shape from the issue: a visible shell, then the content, hidden.
    return f"""<html><head><title>Docs</title></head><body>
<div class="shell"><p>Unified framework for full-stack applications</p></div>
<div {hiding}>{ARTICLE}</div></body></html>"""


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record every HTML string readabilipy is asked to simplify."""
    seen: list[str] = []
    original = readabilipy.simple_json.simple_json_from_html_string

    def spy(html: str, **kwargs: Any) -> Any:
        seen.append(html)
        return original(html, **kwargs)

    monkeypatch.setattr(readabilipy.simple_json, "simple_json_from_html_string", spy)
    return seen


def html(body: str) -> httpx.Response:
    return httpx.Response(
        200, content=body.encode(), headers={"content-type": "text/html"}
    )


def text_of(result: CallToolResult) -> str:
    data = result.model_dump(
        by_alias=True, mode="json", exclude_none=True, exclude_unset=True
    )
    assert data["isError"] is False
    [content] = data["content"]
    assert content["type"] == "text"
    return content["text"]


async def fetch(web: FakeWeb, page: str, **serve_kwargs: Any) -> str:
    web.add(PAGE, html(page))
    async with connect(ignore_robots_txt=True, **serve_kwargs) as (session, _):
        return text_of(await session.call_tool("fetch", {"url": PAGE}))


@pytest.mark.usefixtures("node_readability")
@pytest.mark.parametrize(
    "hiding",
    [
        'style="position:absolute;top:-9999px;display:none"',
        "hidden",
        'style="display: NONE !important"',
        'style="display:none !IMPORTANT"',
    ],
)
async def test_hidden_ssr_content_is_recovered(
    web: FakeWeb, calls: list[str], hiding: str
) -> None:
    text = await fetch(web, ssr_page(hiding))
    assert "## Install" in text
    assert "rendered on the server" in text
    assert "configuration automatically" in text
    # Extracted once as is, then once with the container unhidden.
    assert len(calls) == 2


@pytest.mark.usefixtures("node_readability")
@pytest.mark.parametrize("hiding", ['style="visibility: hidden"', 'aria-hidden="true"'])
async def test_newer_readability_hidings_come_back_too(
    web: FakeWeb, hiding: str
) -> None:
    # Dropped by readabilipy 0.3's Readability.js, kept by 0.2's: either way
    # the content reaches the model.
    text = await fetch(web, ssr_page(hiding))
    assert "rendered on the server" in text


@pytest.mark.usefixtures("node_readability")
async def test_page_with_small_hidden_element_is_extracted_once(
    web: FakeWeb, calls: list[str]
) -> None:
    page = f"""<html><body>{ARTICLE}
<div style="display:none">Copied to clipboard</div></body></html>"""
    text = await fetch(web, page)
    assert "rendered on the server" in text
    assert "Copied to clipboard" not in text
    assert len(calls) == 1


@pytest.mark.usefixtures("node_readability")
@pytest.mark.parametrize(
    ("opening", "closing"),
    [
        ("<nav hidden>", "</nav>"),
        ('<div role="navigation" hidden>', "</div>"),
        ("<nav><div hidden>", "</div></nav>"),
        ('<header><div style="display:none">', "</div></header>"),
        ('<div role="complementary"><div hidden>', "</div></div>"),
    ],
)
async def test_hidden_navigation_is_left_hidden(
    web: FakeWeb, calls: list[str], opening: str, closing: str
) -> None:
    # A collapsed menu larger than a short page is not a hydration container.
    links = "".join(
        f'<li><a href="/p{i}">Navigation link number {i}</a></li>' for i in range(30)
    )
    page = f"""<html><body><p>A short page with one visible paragraph.</p>
{opening}<ul>{links}</ul>{closing}</body></html>"""
    text = await fetch(web, page)
    assert "one visible paragraph" in text
    assert "Navigation link" not in text
    assert len(calls) == 1


@pytest.mark.usefixtures("node_readability")
async def test_second_run_is_kept_only_when_it_gains_text(
    web: FakeWeb, calls: list[str]
) -> None:
    # Readability.js discards a <select> even when it is visible, so unhiding
    # it gains nothing and the first extraction is returned.
    options = "".join(f"<option>Option number {i}</option>" for i in range(30))
    page = f"""<html><body><p>A short page with one visible paragraph.</p>
<div hidden><select>{options}</select></div></body></html>"""
    text = await fetch(web, page)
    assert "one visible paragraph" in text
    assert "Option number" not in text
    assert len(calls) == 2


@pytest.mark.usefixtures("node_readability")
async def test_shell_with_nothing_hidden_still_fails_to_simplify(
    web: FakeWeb, calls: list[str]
) -> None:
    text = await fetch(web, "<html><body></body></html>")
    assert text == (
        f"Contents of {PAGE}:\n<error>Page failed to be simplified from HTML</error>"
    )
    assert len(calls) == 1


@pytest.mark.usefixtures("python_readability")
async def test_pure_python_fallback_keeps_hidden_content_in_one_run(
    web: FakeWeb, calls: list[str]
) -> None:
    # Without Node, readabilipy's own extractor ignores visibility, so the
    # content is there the first time and there is nothing to recover.
    text = await fetch(web, ssr_page("hidden"))
    assert "rendered on the server" in text
    assert len(calls) == 1


async def test_no_readability_js_is_never_rerun(web: FakeWeb, calls: list[str]) -> None:
    text = await fetch(web, ssr_page("hidden"), use_readability_js=False)
    assert "rendered on the server" in text
    assert len(calls) == 1


@pytest.mark.parametrize(
    ("element", "hidden"),
    [
        ('<div style="display:none">', True),
        ('<div style="color: red; Display : None ;">', True),
        ('<div style="visibility:hidden !important">', True),
        ('<div style="visibility:hidden !Important">', True),
        ("<div hidden>", True),
        ('<div aria-hidden="true">', True),
        ("<div>", False),
        ('<div style="display:block">', False),
        ('<div style="visibility: visible">', False),
        ('<div style="display:none-ish">', False),
        ('<div aria-hidden="false">', False),
    ],
)
def test_is_hidden_follows_readability(element: str, hidden: bool) -> None:
    tag = BeautifulSoup(f"{element}text</div>", "html.parser").div
    assert tag is not None
    assert _is_hidden(tag) is hidden
