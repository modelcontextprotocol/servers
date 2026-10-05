"""Shared fixtures: temporary repositories and an in-process MCP client.

`connect()` drives the real `serve()` through the protocol without a
subprocess: `stdio_server` is patched to hand `serve()` the server side of a
pair of in-memory streams, and a `ClientSession` talks to the other side. Every
assertion is then made on what a client receives over the wire.
"""

import os
import shutil
import stat
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from unittest import mock

import anyio
import git
import pytest
from mcp import ClientSession
from mcp.client.session import ListRootsFnT
from mcp.shared.memory import create_client_server_memory_streams
from pydantic import BaseModel

from mcp_server_git.server import serve


@pytest.fixture
def test_repository(tmp_path: Path) -> Iterator[git.Repo]:
    repo_path = tmp_path / "temp_test_repo"
    test_repo = git.Repo.init(repo_path)
    disable_autocrlf(test_repo)

    Path(repo_path / "test.txt").write_text("test")
    test_repo.index.add(["test.txt"])
    test_repo.index.commit("initial commit")

    yield test_repo

    # Close GitPython's persistent `git cat-file` processes first: on Windows
    # their cwd is inside the repository, so rmtree fails with WinError 32
    # (#4855, unblocks #1149).
    test_repo.close()
    rmtree(repo_path)


def disable_autocrlf(repo: git.Repo) -> None:
    """Commit and check out bytes unchanged, whatever the host's git config.

    Git for Windows defaults to `core.autocrlf=true`, which rewrites the
    fixtures' LF line endings to CRLF in the working tree, so diffs and `show`
    output carry CRLF there and nowhere else. Set it repo-locally, before
    anything is committed, so every OS sees the same bytes.
    """
    with repo.config_writer() as config:
        config.set_value("core", "autocrlf", "false")


def _clear_readonly_and_retry(func: Any, path: str, _exc_info: Any) -> None:
    # Git writes object files read-only; on Windows that makes them
    # undeletable (WinError 5) until the read-only bit is cleared.
    os.chmod(path, stat.S_IWRITE)
    func(path)


def rmtree(path: Path) -> None:
    """`shutil.rmtree` that also removes git's read-only files on Windows.

    Uses `onerror`, not `onexc`: the server pins Python 3.10, and `onexc` is
    3.12+.
    """
    shutil.rmtree(path, onerror=_clear_readonly_and_retry)


def make_repo(path: Path) -> git.Repo:
    """A repository on branch `main` with one commit of `test.txt`."""
    repo = git.Repo.init(path, initial_branch="main")
    disable_autocrlf(repo)
    with repo.config_writer() as config:
        config.set_value("user", "name", "Test User")
        config.set_value("user", "email", "test@example.com")
    (path / "test.txt").write_text("line 1\nline 2\nline 3\nline 4\nline 5\n")
    repo.index.add(["test.txt"])
    repo.index.commit("initial commit")
    return repo


@pytest.fixture
def repo(tmp_path: Path) -> Iterator[git.Repo]:
    r = make_repo(tmp_path / "repo")
    yield r
    r.close()


@asynccontextmanager
async def connect(
    repository: Path | None,
    *,
    list_roots_callback: ListRootsFnT | None = None,
    initialize: bool = True,
) -> AsyncIterator[ClientSession]:
    """Run `serve(repository)` in-process and yield a connected client.

    The client is initialized unless `initialize=False`, for a test that
    inspects the initialize result itself.
    """
    async with create_client_server_memory_streams() as (
        client_streams,
        server_streams,
    ):

        @asynccontextmanager
        async def fake_stdio_server() -> AsyncIterator[Any]:
            yield server_streams

        with mock.patch("mcp_server_git.server.stdio_server", fake_stdio_server):
            async with anyio.create_task_group() as tg:
                tg.start_soon(serve, repository)
                async with ClientSession(
                    *client_streams, list_roots_callback=list_roots_callback
                ) as session:
                    if initialize:
                        await session.initialize()
                    yield session
                tg.cancel_scope.cancel()


def wire(model: BaseModel) -> dict[str, Any]:
    """A result as it travels on the wire, independent of SDK attribute names."""
    return model.model_dump(by_alias=True, mode="json", exclude_none=True)


def text_result(text: str, *, is_error: bool = False) -> dict[str, Any]:
    """The wire shape of a tool result holding a single text block."""
    return {"content": [{"type": "text", "text": text}], "isError": is_error}
