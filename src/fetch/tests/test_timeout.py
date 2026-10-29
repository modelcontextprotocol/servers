"""Tests for the configurable HTTP request timeout (#4448).

The timeout is set at three levels, the most specific winning: the ``fetch``
tool's ``timeout_ms`` argument, then ``--timeout-ms`` / ``FETCH_TIMEOUT_MS``,
then the 30 s the server always used. Tool and prompt tests drive the real
server through an MCP client (``harness.connect``) with HTTP served by
``harness.FakeWeb``, and read the timeout httpx actually applied from the
request's ``timeout`` extension, so they assert what reaches the transport
rather than what a function was called with. ``main()`` runs in-process with
``serve`` patched.
"""

from __future__ import annotations

import os
import sys
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest

import mcp_server_fetch
from mcp_server_fetch.server import create_server
from mcp_server_fetch.timeout import (
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    TIMEOUT_ENV,
    timeout_ms_from_env,
)

from .harness import FakeWeb, connect

PAGE = "https://example.com/page"
TOOL_ERROR = "Error executing tool fetch: "


@pytest.fixture(autouse=True)
def no_timeout_env(monkeypatch: pytest.MonkeyPatch) -> None:
    # A developer's own FETCH_TIMEOUT_MS must not leak into these tests, nor
    # what main() writes to it into later tests. setenv first: delenv of an
    # absent variable records no undo, so main()'s write would survive.
    monkeypatch.setenv(TIMEOUT_ENV, "")
    monkeypatch.delenv(TIMEOUT_ENV)


def recording_page(seen: list[dict[str, Any]]) -> Any:
    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.extensions["timeout"]))
        return httpx.Response(
            200, content=b"hello", headers={"content-type": "text/plain"}
        )

    return respond


def every_phase(seconds: float) -> dict[str, float]:
    return {"connect": seconds, "read": seconds, "write": seconds, "pool": seconds}


def wire(result: Any) -> dict[str, Any]:
    return result.model_dump(by_alias=True, mode="json", exclude_none=True)


async def fetch_timeouts(
    web: FakeWeb, arguments: dict[str, Any]
) -> list[dict[str, Any]]:
    seen: list[dict[str, Any]] = []
    web.add(PAGE, recording_page(seen))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE, **arguments})
    assert wire(result)["isError"] is False
    return seen


# --- tool -------------------------------------------------------------------


async def test_default_is_thirty_seconds(web: FakeWeb) -> None:
    assert await fetch_timeouts(web, {}) == [every_phase(30.0)]


async def test_environment_sets_the_server_default(
    web: FakeWeb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, "5000")
    assert await fetch_timeouts(web, {}) == [every_phase(5.0)]


async def test_tool_argument_outranks_the_server_default(
    web: FakeWeb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, "5000")
    assert await fetch_timeouts(web, {"timeout_ms": 120000}) == [every_phase(120.0)]


@pytest.mark.parametrize("timeout_ms", [MIN_TIMEOUT_MS, MAX_TIMEOUT_MS])
async def test_tool_argument_bounds_are_inclusive(
    web: FakeWeb, timeout_ms: int
) -> None:
    assert await fetch_timeouts(web, {"timeout_ms": timeout_ms}) == [
        every_phase(timeout_ms / 1000)
    ]


@pytest.mark.parametrize(
    "timeout_ms", [MIN_TIMEOUT_MS - 1, MAX_TIMEOUT_MS + 1, 0, -1, "1000", 1.5, True]
)
async def test_tool_argument_outside_the_schema_is_a_tool_error(
    web: FakeWeb, timeout_ms: Any
) -> None:
    web.add(PAGE, httpx.Response(200, content=b"never fetched"))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool(
            "fetch", {"url": PAGE, "timeout_ms": timeout_ms}
        )
    data = wire(result)
    assert data["isError"] is True
    assert "timeout_ms" in data["content"][0]["text"]
    assert web.requests == []


async def test_schema_advertises_bounds_and_the_server_default(
    web: FakeWeb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, "7000")
    async with connect() as (session, _):
        [tool] = wire(await session.list_tools())["tools"]
    prop = tool["inputSchema"]["properties"]["timeout_ms"]
    assert prop["type"] == "integer"
    assert prop["minimum"] == MIN_TIMEOUT_MS
    assert prop["maximum"] == MAX_TIMEOUT_MS
    assert prop["default"] == 7000
    assert "milliseconds" in prop["description"]
    assert tool["inputSchema"]["required"] == ["url"]


async def test_a_timeout_says_how_long_it_waited(web: FakeWeb) -> None:
    def hang(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    web.add(PAGE, hang)
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE, "timeout_ms": 2000})
    data = wire(result)
    assert data["isError"] is True
    [content] = data["content"]
    assert content["text"].startswith(
        f"{TOOL_ERROR}Failed to fetch {PAGE}: timed out after 2000 ms: ReadTimeout("
    )


async def test_robots_txt_check_keeps_the_httpx_default(web: FakeWeb) -> None:
    # Only the page request is configurable; the robots.txt check is not.
    robots: list[dict[str, Any]] = []
    page: list[dict[str, Any]] = []

    def robots_txt(request: httpx.Request) -> httpx.Response:
        robots.append(dict(request.extensions["timeout"]))
        return httpx.Response(200, content=b"User-agent: *\nAllow: /")

    web.add("https://example.com/robots.txt", robots_txt)
    web.add(PAGE, recording_page(page))
    async with connect() as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE, "timeout_ms": 9000})
    assert wire(result)["isError"] is False
    assert robots == [every_phase(5.0)]
    assert page == [every_phase(9.0)]


# --- prompt -----------------------------------------------------------------


async def test_prompt_uses_the_server_default(
    web: FakeWeb, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, "4000")
    seen: list[dict[str, Any]] = []
    web.add(PAGE, recording_page(seen))
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    assert "hello" in str(result.messages[0].content)
    assert seen == [every_phase(4.0)]


# --- server-wide setting ----------------------------------------------------


@pytest.mark.parametrize("value", ["", "   "])
def test_unset_or_blank_environment_is_the_default(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, value)
    assert timeout_ms_from_env() == DEFAULT_TIMEOUT_MS


def test_environment_value_is_trimmed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, " 2500 ")
    assert timeout_ms_from_env() == 2500


@pytest.mark.parametrize(
    ("value", "message"),
    [
        ("abc", "'abc' is not a whole number of milliseconds"),
        ("1.5", "'1.5' is not a whole number of milliseconds"),
        ("99", f"99 ms is outside {MIN_TIMEOUT_MS}..{MAX_TIMEOUT_MS} ms"),
        ("600001", f"600001 ms is outside {MIN_TIMEOUT_MS}..{MAX_TIMEOUT_MS} ms"),
    ],
)
def test_bad_environment_stops_the_server_at_startup(
    monkeypatch: pytest.MonkeyPatch, value: str, message: str
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, value)
    with pytest.raises(ValueError, match=f"^{TIMEOUT_ENV}: {message}$"):
        create_server()


# --- command line -----------------------------------------------------------


def run_main(monkeypatch: pytest.MonkeyPatch, *argv: str) -> AsyncMock:
    serve = AsyncMock()
    monkeypatch.setattr(mcp_server_fetch, "serve", serve)
    monkeypatch.setattr(sys, "argv", ["mcp-server-fetch", *argv])
    mcp_server_fetch.main()
    return serve


def test_flag_sets_the_variable_the_server_reads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    serve = run_main(monkeypatch, "--timeout-ms", "60000")
    serve.assert_awaited_once()
    assert os.environ[TIMEOUT_ENV] == "60000"
    assert timeout_ms_from_env() == 60000


def test_flag_outranks_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    # Even a bad value in the environment: the flag replaces it.
    monkeypatch.setenv(TIMEOUT_ENV, "nonsense")
    run_main(monkeypatch, "--timeout-ms", "1500")
    assert os.environ[TIMEOUT_ENV] == "1500"


def test_no_flag_leaves_the_environment_alone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, "8000")
    run_main(monkeypatch)
    assert os.environ[TIMEOUT_ENV] == "8000"


@pytest.mark.parametrize("value", ["abc", "50", "600001"])
def test_bad_flag_is_a_usage_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], value: str
) -> None:
    with pytest.raises(SystemExit) as excinfo:
        run_main(monkeypatch, "--timeout-ms", value)
    assert excinfo.value.code == 2
    assert "argument --timeout-ms:" in capsys.readouterr().err
    assert TIMEOUT_ENV not in os.environ


def test_bad_environment_is_a_usage_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv(TIMEOUT_ENV, "soon")
    with pytest.raises(SystemExit) as excinfo:
        run_main(monkeypatch)
    assert excinfo.value.code == 2
    assert (
        f"{TIMEOUT_ENV}: 'soon' is not a whole number of milliseconds"
        in capsys.readouterr().err
    )


def test_flag_is_in_help(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as excinfo:
        run_main(monkeypatch, "--help")
    assert excinfo.value.code == 0
    out = capsys.readouterr().out
    assert "--timeout-ms" in out
    assert TIMEOUT_ENV in out
