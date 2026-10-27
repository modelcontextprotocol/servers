"""Protocol-level tests for how a robots.txt server error gates a tool fetch (#5197).

RFC 9309 section 2.3.1.4 says a robots.txt that is unreachable because of a
server error (5xx) means complete disallow. The fetch tool used to fall
through on a 5xx and parse the error page as rules, and an error page holds no
rules, so the fetch went ahead. These tests drive the real server through an
MCP client (``harness.connect``) with HTTP served by ``harness.FakeWeb``, and
pin that a 5xx refuses with the same guidance as 401 and 403, without reading
the body and without requesting the page.
"""

from __future__ import annotations

import httpx
import pytest

from .harness import FakeWeb, connect

PAGE = "https://example.com/page"
ROBOTS = "https://example.com/robots.txt"
TOOL_ERROR = "Error executing tool fetch: "


def refusal(status: int, robots_url: str = ROBOTS) -> str:
    return (
        f"{TOOL_ERROR}When fetching robots.txt ({robots_url}), received status "
        f"{status} so assuming that autonomous fetching is not allowed, the user "
        "can try manually fetching by using the fetch prompt"
    )


def page(body: str, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status, content=body.encode(), headers={"content-type": "text/plain"}
    )


@pytest.mark.parametrize("status", [500, 502, 503, 504, 599])
async def test_robots_5xx_refuses_without_parsing_the_body(
    web: FakeWeb, status: int
) -> None:
    # The body allows everything: if it were parsed as rules, the fetch would
    # go ahead. A 5xx must refuse whatever the error page says.
    web.add(ROBOTS, page("User-agent: *\nAllow: /", status=status))
    web.add(PAGE, page("should not be fetched"))
    async with connect() as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert data["isError"] is True
    assert [c["text"] for c in data["content"]] == [refusal(status)]
    assert web.urls() == [ROBOTS]


async def test_robots_5xx_after_a_redirect_refuses(web: FakeWeb) -> None:
    moved = "https://www.example.com/robots.txt"
    web.add(ROBOTS, httpx.Response(301, headers={"location": moved}))
    web.add(moved, page("", status=503))
    async with connect() as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert data["isError"] is True
    assert [c["text"] for c in data["content"]] == [refusal(503)]
    assert web.urls() == [ROBOTS, moved]


async def test_fetch_prompt_ignores_a_5xx_robots(web: FakeWeb) -> None:
    # The refusal points the user at the fetch prompt; that path must still
    # work, since a user-initiated fetch does not consult robots.txt.
    web.add(ROBOTS, page("", status=503))
    web.add(PAGE, page("manual ok"))
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    assert "manual ok" in str(result.model_dump(mode="json"))
    assert web.urls() == [PAGE]
