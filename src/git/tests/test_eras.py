# Both protocol eras, driven through a real `mcp` 2.x `Client` (#4853).
#
# serve() answers a 2025-11-25 client through the initialize handshake and a
# 2026-07-28 client sessionlessly, the client's first request deciding which.
# Each test here pins the client's `mode` explicitly (never "auto" alone), so
# a test names the era it covers and cannot pass by falling back to the other
# one. The client talks to the real `serve()` over in-memory streams, the same
# JSON-RPC path stdio takes, rather than the SDK's in-process shortcut, which
# would bypass serve() and its era dispatch.
#
# Roots is deprecated in 2026-07-28, and a 2026-07-28 client cannot be asked
# for it at all, so repository access must come from `--repository` (or from
# `repo_path` alone when none is set). These clients offer no Roots, and the
# server never asks for them (test_protocol.py pins that on the legacy era).
#
# The legacy-era characterization tests in test_protocol.py stay as the
# backward-compatibility net; this file adds what differs by era and shows
# that the rest does not.

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from unittest.mock import patch

import anyio
import git
import pytest
from mcp import Client
from mcp.client._transport import TransportStreams
from mcp.shared.exceptions import MCPError
from mcp.shared.memory import create_client_server_memory_streams
from mcp.types import (
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    CallToolResult,
    PromptReference,
    TextContent,
)

from mcp_server_git.server import serve

from conftest import make_repo

MODERN = "2026-07-28"
LEGACY = "2025-11-25"
# Each `mode` a test pins, with the protocol version it must negotiate.
ERAS = [
    pytest.param(MODERN, MODERN, id=MODERN),
    pytest.param("legacy", LEGACY, id=LEGACY),
]


@asynccontextmanager
async def connect(mode: str, repository: Path | None) -> AsyncIterator[Client]:
    """Run `serve(repository)` in-process and yield a `Client` in `mode`."""
    async with create_client_server_memory_streams() as (
        client_streams,
        server_streams,
    ):

        @asynccontextmanager
        async def fake_stdio_server() -> AsyncIterator[Any]:
            yield server_streams

        @asynccontextmanager
        async def transport() -> AsyncIterator[TransportStreams]:
            yield client_streams

        with patch("mcp.server.mcpserver.server.stdio_server", fake_stdio_server):
            async with anyio.create_task_group() as tg:
                tg.start_soon(serve, repository)
                async with Client(transport(), mode=mode) as client:
                    yield client
                tg.cancel_scope.cancel()


def text_of(result: CallToolResult) -> str:
    """The text of a result holding one text block."""
    assert len(result.content) == 1
    block = result.content[0]
    assert isinstance(block, TextContent)
    return block.text


def tool_wire(tools: Any) -> list[dict[str, Any]]:
    return [t.model_dump(by_alias=True, mode="json", exclude_none=True) for t in tools]


def repo_dir(repo: git.Repo) -> Path:
    return Path(repo.working_dir)


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_each_era_is_negotiated(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    async with connect(mode, repo_dir(repo)) as client:
        assert client.session.protocol_version == negotiated


async def test_auto_mode_discovers_the_2026_07_28_era(repo: git.Repo) -> None:
    # An auto client probes server/discover first and only falls back to the
    # handshake on a server that refuses it; this server no longer does.
    async with connect("auto", repo_dir(repo)) as client:
        assert client.session.protocol_version == MODERN


async def test_tools_list_is_the_same_in_both_eras(repo: git.Repo) -> None:
    # Same tools, same schemas, same deterministic order, in either era and on
    # every call.
    async with connect(MODERN, repo_dir(repo)) as client:
        modern = tool_wire((await client.list_tools()).tools)
        again = tool_wire((await client.list_tools()).tools)
    async with connect("legacy", repo_dir(repo)) as client:
        legacy = tool_wire((await client.list_tools()).tools)
    assert [t["name"] for t in modern][:3] == [
        "git_status",
        "git_diff_unstaged",
        "git_diff_staged",
    ]
    assert modern == again == legacy


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_repository_access_without_roots(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    # --repository alone grants access; no Roots are offered or requested.
    (repo_dir(repo) / "new.txt").write_text("untracked\n")
    async with connect(mode, repo_dir(repo)) as client:
        result = await client.call_tool(
            "git_status", {"repo_path": str(repo_dir(repo))}
        )
    assert result.is_error is False
    assert result.result_type == "complete"
    assert text_of(result).startswith("Repository status:\n")
    assert "new.txt" in text_of(result)


async def test_repo_path_alone_grants_access_on_2026_07_28_with_no_repository(
    repo: git.Repo,
) -> None:
    # With no --repository the server is unconfined, as on the legacy era, and
    # still never falls back to asking the client for Roots.
    async with connect(MODERN, None) as client:
        result = await client.call_tool(
            "git_log", {"repo_path": str(repo_dir(repo)), "max_count": 1}
        )
    assert result.is_error is False
    assert "initial commit" in text_of(result)


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_repository_confinement_holds_in_each_era(
    tmp_path: Path, repo: git.Repo, mode: str, negotiated: str
) -> None:
    elsewhere = make_repo(tmp_path / "elsewhere")
    try:
        async with connect(mode, repo_dir(repo)) as client:
            result = await client.call_tool(
                "git_status", {"repo_path": elsewhere.working_dir}
            )
    finally:
        elsewhere.close()
    assert result.is_error is True
    assert "is outside the allowed repository" in text_of(result)


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_tool_failure_is_an_is_error_result_in_each_era(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    # A tool's own failure is an isError result the model can read and act on.
    async with connect(mode, repo_dir(repo)) as client:
        missing = await client.call_tool("git_status", {})
        outside = await client.call_tool("git_status", {"repo_path": "/"})
    assert missing.is_error is True
    assert text_of(missing).startswith(
        "Error executing tool git_status: 1 validation error for statusArguments\n"
        "repo_path\n  Field required"
    )
    assert outside.is_error is True
    assert text_of(outside) == (
        # repo_path is a Path parameter, so the message echoes the platform's
        # form of "/" ("\\" on Windows).
        f"Error executing tool git_status: Repository path '{Path('/')}' is "
        f"outside the allowed repository '{repo_dir(repo)}'"
    )


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_unknown_tool_is_a_json_rpc_invalid_params_error_in_each_era(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    # #5174: both spec revisions make an unknown tool a protocol error,
    # JSON-RPC -32602, not an isError result.
    async with connect(mode, repo_dir(repo)) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.call_tool("no_such_tool", {})
    assert excinfo.value.error.code == INVALID_PARAMS
    assert excinfo.value.error.message == "Unknown tool: no_such_tool"


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_unsupported_method_is_a_json_rpc_error_in_each_era(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    # The server registers no completion handler, so completion/complete is a
    # protocol error (an MCPError on the client), not an isError result.
    async with connect(mode, repo_dir(repo)) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.complete(
                PromptReference(type="ref/prompt", name="none"),
                {"name": "x", "value": ""},
            )
    assert excinfo.value.error.code == METHOD_NOT_FOUND


async def test_ping_is_served_only_in_the_legacy_era(repo: git.Repo) -> None:
    # ping is removed in 2026-07-28; the legacy era keeps answering it.
    async with connect("legacy", repo_dir(repo)) as client:
        await client.session.send_ping()
    async with connect(MODERN, repo_dir(repo)) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.session.send_ping()
    assert excinfo.value.error.code == METHOD_NOT_FOUND
