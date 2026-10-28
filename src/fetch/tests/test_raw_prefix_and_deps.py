"""Tests for the raw-content prefix and the declared dependencies (#5321).

A body fetch returns raw names its Content-Type in the prefix it adds. A
response with no Content-Type left that slot empty ("Content type  cannot be
simplified"), so the prefix now says the type was not declared. The prefix tests
drive ``serve()`` through an MCP client with HTTP served by ``harness.FakeWeb``.

``server.py`` imports ``bs4`` directly, so ``beautifulsoup4`` must be a declared
dependency of the package rather than one that only arrives through
readabilipy; the last test reads the installed package's metadata to pin that.
"""

from __future__ import annotations

import re
from importlib.metadata import requires

import httpx

from .harness import FakeWeb, connect

PAGE = "https://example.com/data"


async def fetch_text(web: FakeWeb, response: httpx.Response) -> str:
    web.add(PAGE, response)
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert data["isError"] is False
    return data["content"][0]["text"]


async def test_a_missing_content_type_is_named_as_not_declared(
    web: FakeWeb,
) -> None:
    response = httpx.Response(200, content=b'{"key": "value"}')
    assert "content-type" not in response.headers

    text = await fetch_text(web, response)

    assert text.startswith(
        "Content type (not declared) cannot be simplified to markdown, "
        "but here is the raw content:\n"
    )
    assert "Content type  " not in text


async def test_a_declared_content_type_is_still_named(web: FakeWeb) -> None:
    response = httpx.Response(
        200, content=b"a,b\n1,2\n", headers={"content-type": "text/csv"}
    )

    text = await fetch_text(web, response)

    assert text.startswith(
        "Content type text/csv cannot be simplified to markdown, "
        "but here is the raw content:\n"
    )


def test_beautifulsoup4_is_a_declared_dependency() -> None:
    names = {
        re.split(r"[\s\[<>=!~;]", requirement, maxsplit=1)[0].lower()
        for requirement in requires("mcp-server-fetch") or []
    }
    assert "beautifulsoup4" in names
