"""The operator-configured host allowlist, ``--allowed-hosts`` (#2317).

Entry parsing and matching are unit-tested directly in ``allowlist``; the
enforcement is driven through the real server over the MCP protocol (see
``harness.connect``), so every request path is covered as a client sees it:
the tool's page, the prompt's page, the robots.txt check, and a redirect hop
of each. ``web.urls()`` proves a refused request was never sent.
"""

from __future__ import annotations

import argparse
from typing import Any

import httpx
import pytest
from mcp.types import CallToolResult

import mcp_server_fetch
from mcp_server_fetch.allowlist import (
    host_is_allowed,
    normalize_allowed_host,
    normalize_allowed_hosts,
    parse_allowed_host,
)

from .harness import FakeWeb, connect

TOOL_ERROR = "Error executing tool fetch: "
PAGE = "https://docs.example.com/guide"
ROBOTS = "https://docs.example.com/robots.txt"
OTHER = "https://other.example.org/secret"
OTHER_ROBOTS = "https://other.example.org/robots.txt"


def refused(url: str, host: str) -> str:
    return (
        f"Refused to fetch {url}: {host} is not one of the hosts this server "
        "is allowed to fetch from (--allowed-hosts)."
    )


def plain(text: str, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status, content=text.encode(), headers={"content-type": "text/plain"}
    )


def wire(result: CallToolResult) -> dict[str, Any]:
    return result.model_dump(
        by_alias=True, mode="json", exclude_none=True, exclude_unset=True
    )


def text_of(result: CallToolResult) -> str:
    data = wire(result)
    assert len(data["content"]) == 1
    return data["content"][0]["text"]


# --- entries ---------------------------------------------------------------


@pytest.mark.parametrize(
    "entry, normalized",
    [
        ("Example.COM", "example.com"),
        ("example.com.", "example.com"),
        ("  example.com ", "example.com"),
        ("*.Example.com", "*.example.com"),
        ("bücher.example", "xn--bcher-kva.example"),
        ("*.bücher.example", "*.xn--bcher-kva.example"),
        ("10.0.0.1", "10.0.0.1"),
        ("::1", "::1"),
        ("[0:0::1]", "::1"),
        ("localhost", "localhost"),
    ],
)
def test_entries_are_normalized(entry: str, normalized: str) -> None:
    assert normalize_allowed_host(entry) == normalized


@pytest.mark.parametrize(
    "entry",
    [
        "",
        ".",
        "*.",
        "*",
        "*example.com",
        "a.*.example.com",
        "https://example.com",
        "example.com:443",
        "example.com/path",
        "user@example.com",
        "exa mple.com",
        "example.com?x",
        "a..b",
        "*.*.example.com",
    ],
)
def test_malformed_entries_are_rejected(entry: str) -> None:
    with pytest.raises(ValueError):
        normalize_allowed_host(entry)


def test_an_entry_httpx_cannot_encode_is_rejected() -> None:
    with pytest.raises(ValueError, match="is not a valid host name"):
        normalize_allowed_host("☃.example.com")


def test_parse_allowed_host_reports_through_argparse() -> None:
    assert parse_allowed_host("Example.com") == "example.com"
    with pytest.raises(argparse.ArgumentTypeError, match="no scheme, port"):
        parse_allowed_host("https://example.com")


def test_no_entries_is_no_allowlist() -> None:
    assert normalize_allowed_hosts(None) == ()
    assert normalize_allowed_hosts([]) == ()


@pytest.mark.parametrize(
    "host, allowed",
    [
        ("example.com", True),
        ("EXAMPLE.com.", True),
        ("www.example.com", False),
        ("api.example.org", True),
        ("a.b.example.org", True),
        ("example.org", False),
        ("badexample.org", False),
        ("example.org.evil.com", False),
        ("10.0.0.1", True),
        ("10.0.0.2", False),
        ("0:0::1", True),
        ("evil.com", False),
    ],
)
def test_matching(host: str, allowed: bool) -> None:
    entries = normalize_allowed_hosts(["example.com", "*.example.org", "10.0.0.1"])
    entries += normalize_allowed_hosts(["::1"])
    assert host_is_allowed(host, entries) is allowed


# --- command line ----------------------------------------------------------


def run_main(monkeypatch: pytest.MonkeyPatch, *argv: str) -> Any:
    from unittest.mock import AsyncMock

    serve = AsyncMock()
    monkeypatch.setattr(mcp_server_fetch, "serve", serve)
    monkeypatch.setattr("sys.argv", ["mcp-server-fetch", *argv])
    mcp_server_fetch.main()
    return serve


def test_flag_is_normalized_and_passed_to_serve(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    serve = run_main(
        monkeypatch,
        "--allowed-hosts",
        "Example.com",
        "*.docs.example.org",
        "--allowed-hosts",
        "10.0.0.1",
    )
    serve.assert_awaited_once_with(
        None,
        False,
        None,
        False,
        ["example.com", "*.docs.example.org", "10.0.0.1"],
        True,
    )


def test_malformed_flag_value_exits_with_usage_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as excinfo:
        run_main(monkeypatch, "--allowed-hosts", "example.com:8080")
    assert excinfo.value.code == 2
    assert "argument --allowed-hosts: 'example.com:8080' is not a host name" in (
        capsys.readouterr().err
    )


async def test_create_server_rejects_a_malformed_entry() -> None:
    from mcp_server_fetch.server import create_server

    with pytest.raises(ValueError, match="'https://x' is not a host name"):
        create_server(allowed_hosts=["https://x"])


# --- enforcement -----------------------------------------------------------


async def test_listed_host_is_fetched_with_its_robots_txt(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, plain("guide"))
    async with connect(allowed_hosts=["*.example.com"]) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert wire(result)["isError"] is False
    assert web.urls() == [ROBOTS, PAGE]


async def test_unlisted_host_is_refused_before_robots_txt(web: FakeWeb) -> None:
    async with connect(allowed_hosts=["docs.example.com"]) as (session, _):
        result = await session.call_tool("fetch", {"url": OTHER})
    assert text_of(result) == TOOL_ERROR + refused(OTHER_ROBOTS, "other.example.org")
    assert web.requests == []
    # Checked by name: nothing was resolved for the unlisted host.
    assert web.lookups == []


async def test_unlisted_host_is_refused_with_robots_txt_ignored(
    web: FakeWeb,
) -> None:
    async with connect(ignore_robots_txt=True, allowed_hosts=["docs.example.com"]) as (
        session,
        _,
    ):
        result = await session.call_tool("fetch", {"url": OTHER})
    assert text_of(result) == TOOL_ERROR + refused(OTHER, "other.example.org")
    assert web.requests == []


async def test_redirect_to_unlisted_host_is_refused(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, httpx.Response(302, headers={"location": OTHER}))
    web.add(OTHER, plain("secret"))
    async with connect(allowed_hosts=["docs.example.com"]) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert text_of(result) == TOOL_ERROR + refused(OTHER, "other.example.org")
    # Neither the hop's robots.txt nor the hop itself was requested.
    assert web.urls() == [ROBOTS, PAGE]


async def test_robots_redirect_to_unlisted_host_is_refused(web: FakeWeb) -> None:
    web.add(ROBOTS, httpx.Response(301, headers={"location": OTHER_ROBOTS}))
    async with connect(allowed_hosts=["docs.example.com"]) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert text_of(result) == TOOL_ERROR + refused(OTHER_ROBOTS, "other.example.org")
    assert web.urls() == [ROBOTS]


async def test_redirect_between_listed_hosts_is_followed(web: FakeWeb) -> None:
    web.add(ROBOTS, plain("", status=404))
    web.add(PAGE, httpx.Response(302, headers={"location": OTHER}))
    web.add(OTHER_ROBOTS, plain("", status=404))
    web.add(OTHER, plain("moved here"))
    async with connect(allowed_hosts=["docs.example.com", "*.example.org"]) as (
        session,
        _,
    ):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("moved here")
    assert web.urls() == [ROBOTS, PAGE, OTHER_ROBOTS, OTHER]


async def test_prompt_refuses_unlisted_host_and_its_redirects(web: FakeWeb) -> None:
    web.add(PAGE, httpx.Response(302, headers={"location": OTHER}))
    async with connect(allowed_hosts=["docs.example.com"]) as (session, _):
        direct = await session.get_prompt("fetch", {"url": OTHER})
        redirected = await session.get_prompt("fetch", {"url": PAGE})
    for prompt in (direct, redirected):
        text = prompt.messages[0].content
        assert getattr(text, "text") == refused(OTHER, "other.example.org")
    assert web.urls() == [PAGE]


async def test_listed_private_address_still_needs_allow_private_ips(
    web: FakeWeb,
) -> None:
    # Both checks apply: listing an internal host does not lift the
    # private-address guard, and --allow-private-ips does not lift the list.
    internal = "http://10.0.0.1/status"
    web.add(internal, plain("internal"))
    async with connect(ignore_robots_txt=True, allowed_hosts=["10.0.0.1"]) as (
        session,
        _,
    ):
        guarded = await session.call_tool("fetch", {"url": internal})
    assert "which is not a public address" in text_of(guarded)
    async with connect(
        ignore_robots_txt=True,
        allow_private_ips=True,
        allowed_hosts=["10.0.0.1"],
    ) as (session, _):
        allowed = await session.call_tool("fetch", {"url": internal})
        unlisted = await session.call_tool("fetch", {"url": "http://10.0.0.2/"})
    assert text_of(allowed).endswith("internal")
    assert text_of(unlisted) == TOOL_ERROR + refused("http://10.0.0.2/", "10.0.0.2")
    assert web.urls() == [internal]


async def test_no_allowlist_fetches_any_public_host(web: FakeWeb) -> None:
    web.add(OTHER, plain("anywhere"))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": OTHER})
    assert text_of(result).endswith("anywhere")
