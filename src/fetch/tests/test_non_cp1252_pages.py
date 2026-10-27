"""Protocol-level tests for pages whose text has no cp1252 encoding (#5303).

readabilipy 0.2.0's Readability.js path wrote the page to a temp file opened
in the locale encoding, so on a Western-locale Windows (cp1252) any page
holding a character outside that code page (CJK text, a leading byte-order
mark, U+2010 HYPHEN) crashed extraction with ``UnicodeEncodeError``. readabilipy
0.3.0 writes and reads its temp files as UTF-8, and pyproject.toml now requires
it. On Linux and macOS the locale is already UTF-8, so these tests pass there
either way; the "Test fetch (Windows)" CI leg is where they prove the fix.

Each test drives ``serve()`` through an MCP client, with the page served by
``harness.FakeWeb``, on the Readability.js path (the one that crashed).
"""

from __future__ import annotations

import httpx
import pytest
from mcp.types import CallToolResult

from .harness import FakeWeb, connect

PAGE = "https://example.jp/article"
BOM = "﻿"

# None of these characters exists in cp1252.
HEADING = "日本語の見出し"
PARAGRAPH = (
    "これは本文の段落です。読みやすさの抽出が主な内容として選ぶのに"
    "十分な長さの文章をここに書いています。"
)
HYPHENATED = "non‐breaking"

ARTICLE = f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>{HEADING}</title></head>
<body><article>
<h1>{HEADING}</h1>
<p>{PARAGRAPH}</p>
<p>A <a href="https://example.jp/x">link</a> and a {HYPHENATED} word.</p>
</article></body></html>"""


def text_of(result: CallToolResult) -> str:
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert data["isError"] is False
    assert len(data["content"]) == 1
    assert data["content"][0]["type"] == "text"
    return data["content"][0]["text"]


async def fetch(web: FakeWeb, response: httpx.Response) -> str:
    web.add(PAGE, response)
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    return text_of(result)


@pytest.mark.usefixtures("node_readability")
@pytest.mark.parametrize(
    "body",
    [
        pytest.param(ARTICLE, id="japanese"),
        pytest.param(f"{BOM}{ARTICLE}", id="japanese-with-bom"),
    ],
)
async def test_non_cp1252_page_is_simplified(web: FakeWeb, body: str) -> None:
    response = httpx.Response(
        200,
        content=body.encode("utf-8"),
        headers={"content-type": "text/html; charset=utf-8"},
    )
    text = await fetch(web, response)

    assert "Page failed to be simplified" not in text
    assert text.startswith(f"Contents of {PAGE}:\n")
    # The non-cp1252 text came through Readability.js intact, as Markdown.
    assert PARAGRAPH in text
    assert HYPHENATED in text
    assert "[link](https://example.jp/x)" in text
    assert "<article>" not in text
