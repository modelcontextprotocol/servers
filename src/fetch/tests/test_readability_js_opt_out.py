"""Tests for ``--no-readability-js`` (#4199): an operator opt-out from Node.js.

The server runs Mozilla's Readability.js under Node whenever Node is on PATH
(and may first run ``npm install``, see ``readability_js``). A deployment that
must not start them can opt out: with the flag the server uses readabilipy's
pure-Python extractor and never probes for Node at all.

The opt-out tests replace the ``subprocess`` module of both the server's
Readability.js runner and readabilipy with one that fails on any use, so they
prove no process is started rather than inferring it from the Markdown that
comes back. The default-path test needs Node on PATH,
like the repository's other Readability.js tests.
"""

from __future__ import annotations

import sys
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
import readabilipy.simple_json
from mcp.types import CallToolResult

import mcp_server_fetch
import mcp_server_fetch.server as server_module
from mcp_server_fetch import readability_js

from .harness import FakeWeb, connect

PAGE = "https://example.com/article"

ARTICLE = """<html><head><title>Article</title></head><body><article>
<h1>Heading</h1>
<p>This is a <a href="https://example.com/x">link</a> in a paragraph with
enough words to count as the main content of the page.</p>
</article></body></html>"""


class NoProcesses:
    """Stands in for a ``subprocess`` module: any use fails the test."""

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"a process was started: subprocess.{name}")


@pytest.fixture
def no_processes(monkeypatch: pytest.MonkeyPatch) -> None:
    # The server's Node probe, its `npm install` and its Readability.js run
    # all go through `readability_js.subprocess`; readabilipy's own Node path
    # (which the server no longer takes) goes through its module's. The probe
    # cache is cleared so a probe made by an earlier test cannot hide one.
    monkeypatch.setattr(readability_js, "_probed", False)
    monkeypatch.setattr(readability_js, "subprocess", NoProcesses())
    monkeypatch.setattr(readabilipy.simple_json, "subprocess", NoProcesses())


def wire(result: CallToolResult) -> dict[str, Any]:
    return result.model_dump(
        by_alias=True, mode="json", exclude_none=True, exclude_unset=True
    )


def html(body: str) -> httpx.Response:
    return httpx.Response(
        200, content=body.encode(), headers={"content-type": "text/html"}
    )


def test_no_processes_fixture_catches_the_node_probe(no_processes: None) -> None:
    # The guard the opt-out tests rely on does fire on the default path.
    with pytest.raises(AssertionError, match="a process was started: subprocess"):
        server_module.extract_content_from_html(ARTICLE)


def test_flag_is_passed_to_serve(monkeypatch: pytest.MonkeyPatch) -> None:
    serve = AsyncMock()
    monkeypatch.setattr(mcp_server_fetch, "serve", serve)
    monkeypatch.setattr(sys, "argv", ["mcp-server-fetch", "--no-readability-js"])
    mcp_server_fetch.main()
    serve.assert_awaited_once_with(None, False, None, False, False)


def test_flag_is_in_help(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(mcp_server_fetch, "serve", AsyncMock())
    monkeypatch.setattr(sys, "argv", ["mcp-server-fetch", "--help"])
    with pytest.raises(SystemExit) as excinfo:
        mcp_server_fetch.main()
    assert excinfo.value.code == 0
    assert "--no-readability-js" in capsys.readouterr().out


@pytest.mark.usefixtures("no_processes")
async def test_tool_call_without_readability_js_starts_no_process(
    web: FakeWeb,
) -> None:
    web.add(PAGE, html(ARTICLE))
    async with connect(ignore_robots_txt=True, use_readability_js=False) as (
        session,
        _,
    ):
        result = await session.call_tool("fetch", {"url": PAGE})
    data = wire(result)
    assert data["isError"] is False
    [content] = data["content"]
    # The pure-Python extractor's Markdown: the heading and the text survive,
    # the link target does not (Readability.js keeps it).
    assert content["text"].startswith(f"Contents of {PAGE}:\n")
    assert "# Heading" in content["text"]
    assert "This is a link in a paragraph" in content["text"]
    assert "https://example.com/x" not in content["text"]


@pytest.mark.usefixtures("no_processes")
async def test_prompt_without_readability_js_starts_no_process(
    web: FakeWeb,
) -> None:
    web.add(PAGE, html(ARTICLE))
    async with connect(use_readability_js=False) as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    [message] = result.messages
    assert message.content.type == "text"
    assert "This is a link in a paragraph" in message.content.text
    assert "https://example.com/x" not in message.content.text


@pytest.mark.usefixtures("node_readability")
async def test_default_still_uses_readability_js(web: FakeWeb) -> None:
    # Without the flag nothing changes: Node is used, and it keeps link targets.
    web.add(PAGE, html(ARTICLE))
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    [content] = wire(result)["content"]
    assert "[link](https://example.com/x)" in content["text"]
