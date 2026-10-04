"""Startup paths: `serve()` before the protocol starts, `main()` and `-m`.

Everything here runs in-process except one subprocess smoke of the
`mcp-server-git` console script.
"""

import logging
import runpy
import shutil
import subprocess
import sys
from pathlib import Path
from unittest import mock

import git
import pytest
from click.testing import CliRunner

import mcp_server_git
from mcp_server_git import main
from mcp_server_git.server import serve

from conftest import connect

# --------------------------------------------------------------------------
# serve() with --repository
# --------------------------------------------------------------------------


async def test_serve_logs_the_repository_it_uses(
    repo: git.Repo, caplog: pytest.LogCaptureFixture
):
    assert repo.working_dir is not None
    root = Path(repo.working_dir)
    with caplog.at_level(logging.INFO, logger="mcp_server_git.server"):
        async with connect(root):
            pass
    assert f"Using repository at {root}" in caplog.text


# KNOWN BUG #3029: pins current (wrong) behavior; the fix changes this assertion.
async def test_serve_returns_early_for_repository_subdirectory(
    repo: git.Repo, caplog: pytest.LogCaptureFixture
):
    # Pins #3029: `--repository` pointing inside a working tree (for example
    # `.` from a subdirectory) is not resolved to the repository root. serve()
    # logs an error and returns before opening stdio, so the server exits
    # without serving. Fixing #3029 changes this test.
    assert repo.working_dir is not None
    sub = Path(repo.working_dir) / "sub"
    sub.mkdir()
    stdio = mock.MagicMock()
    with (
        mock.patch("mcp_server_git.server.stdio_server", stdio),
        caplog.at_level(logging.ERROR, logger="mcp_server_git.server"),
    ):
        assert await serve(sub) is None
    stdio.assert_not_called()
    assert f"{sub} is not a valid Git repository" in caplog.text


async def test_serve_returns_early_for_non_repository(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
):
    stdio = mock.MagicMock()
    with (
        mock.patch("mcp_server_git.server.stdio_server", stdio),
        caplog.at_level(logging.ERROR, logger="mcp_server_git.server"),
    ):
        assert await serve(tmp_path) is None
    stdio.assert_not_called()
    assert f"{tmp_path} is not a valid Git repository" in caplog.text


# KNOWN BUG #4993: a nonexistent --repository escapes serve() as NoSuchPathError instead of a logged error; the fix changes this assertion.
async def test_serve_raises_for_nonexistent_repository(tmp_path: Path):
    # Characterization: serve() catches only InvalidGitRepositoryError, so a
    # nonexistent path escapes as NoSuchPathError and kills the server with a
    # traceback (see the console-script smoke below).
    stdio = mock.MagicMock()
    with mock.patch("mcp_server_git.server.stdio_server", stdio):
        with pytest.raises(git.NoSuchPathError):
            await serve(tmp_path / "missing")
    stdio.assert_not_called()


# --------------------------------------------------------------------------
# main()
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("flags", "level"),
    [
        ([], logging.WARN),
        (["-v"], logging.INFO),
        (["--verbose"], logging.INFO),
        (["-vv"], logging.DEBUG),
        (["-v", "-v", "-v"], logging.DEBUG),
    ],
)
def test_main_sets_log_level_and_serves_repository(
    tmp_path: Path, flags: list[str], level: int
):
    served: list[Path | None] = []

    async def fake_serve(repository: Path | None) -> None:
        served.append(repository)

    with (
        mock.patch("mcp_server_git.serve", fake_serve),
        mock.patch("logging.basicConfig") as basic_config,
    ):
        result = CliRunner().invoke(main, [*flags, "--repository", str(tmp_path)])
    assert result.exit_code == 0, result.output
    assert served == [tmp_path]
    basic_config.assert_called_once()
    assert basic_config.call_args.kwargs["level"] == level


def test_main_short_repository_flag(tmp_path: Path):
    served: list[Path | None] = []

    async def fake_serve(repository: Path | None) -> None:
        served.append(repository)

    with (
        mock.patch("mcp_server_git.serve", fake_serve),
        mock.patch("logging.basicConfig"),
    ):
        result = CliRunner().invoke(main, ["-r", str(tmp_path)])
    assert result.exit_code == 0, result.output
    assert served == [tmp_path]


def test_main_without_repository_serves_none():
    served: list[Path | None] = []

    async def fake_serve(repository: Path | None) -> None:
        served.append(repository)

    with (
        mock.patch("mcp_server_git.serve", fake_serve),
        mock.patch("logging.basicConfig"),
    ):
        result = CliRunner().invoke(main, [])
    assert result.exit_code == 0, result.output
    assert served == [None]


def test_main_help():
    result = CliRunner().invoke(main, ["--help"])
    assert result.exit_code == 0
    assert "MCP Git Server - Git functionality for MCP" in result.output
    assert "-r, --repository PATH" in result.output
    assert "-v, --verbose" in result.output


# --------------------------------------------------------------------------
# python -m mcp_server_git, and the console script
# --------------------------------------------------------------------------


def test_python_dash_m_calls_main():
    with mock.patch.object(mcp_server_git, "main") as fake_main:
        runpy.run_module("mcp_server_git", run_name="__main__")
    fake_main.assert_called_once_with()


# KNOWN BUG #4993: a nonexistent --repository kills the server with a Python traceback instead of a one-line error; the fix changes this assertion.
def test_console_script_nonexistent_repository_exits_with_traceback(tmp_path: Path):
    # The one subprocess test: the installed entry point, end to end. A
    # nonexistent --repository is not caught (see
    # test_serve_raises_for_nonexistent_repository), so the process dies with
    # a Python traceback instead of a one-line error.
    script = shutil.which("mcp-server-git", path=str(Path(sys.executable).parent))
    assert script is not None
    missing = tmp_path / "missing"
    proc = subprocess.run(
        [script, "--repository", str(missing)],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 1
    assert "Traceback (most recent call last)" in proc.stderr
    assert "git.exc.NoSuchPathError" in proc.stderr
    assert str(missing) in proc.stderr
