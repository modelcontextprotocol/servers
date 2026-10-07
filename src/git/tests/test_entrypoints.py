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


async def test_serve_resolves_repository_subdirectory_to_root(
    repo: git.Repo, caplog: pytest.LogCaptureFixture
):
    # #3029: `--repository` pointing inside a working tree is resolved to the
    # repository root, like `git rev-parse --show-toplevel`, and the server
    # serves that root.
    assert repo.working_dir is not None
    root = Path(repo.working_dir)
    sub = root / "sub" / "deeper"
    sub.mkdir(parents=True)
    with caplog.at_level(logging.INFO, logger="mcp_server_git.server"):
        async with connect(sub) as session:
            result = await session.call_tool("git_status", {"repo_path": str(root)})
    assert not result.is_error
    assert f"Resolved --repository {sub} to repository root {root}" in caplog.text
    assert f"Using repository at {root}" in caplog.text


async def test_serve_resolves_dot_from_subdirectory(
    repo: git.Repo, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
):
    # #3029: the shared-config case, `--repository .` launched from a
    # subdirectory of the repository.
    assert repo.working_dir is not None
    root = Path(repo.working_dir)
    sub = root / "sub"
    sub.mkdir()
    monkeypatch.chdir(sub)
    with caplog.at_level(logging.INFO, logger="mcp_server_git.server"):
        async with connect(Path(".")):
            pass
    assert f"Using repository at {root}" in caplog.text


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


async def test_serve_exits_for_nonexistent_repository(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
):
    # #4993: a nonexistent path is logged like an invalid repository, and the
    # server exits non-zero without opening stdio.
    stdio = mock.MagicMock()
    missing = tmp_path / "missing"
    with (
        mock.patch("mcp_server_git.server.stdio_server", stdio),
        caplog.at_level(logging.ERROR, logger="mcp_server_git.server"),
    ):
        with pytest.raises(SystemExit) as exc:
            await serve(missing)
    assert exc.value.code == 1
    stdio.assert_not_called()
    assert f"{missing} does not exist" in caplog.text


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


def test_console_script_nonexistent_repository_exits_with_one_line_error(
    tmp_path: Path,
):
    # The one subprocess test: the installed entry point, end to end. A
    # nonexistent --repository exits non-zero with a one-line logged error
    # naming the path, not a Python traceback (#4993).
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
    assert "Traceback" not in proc.stderr
    assert proc.stderr.splitlines() == [
        f"ERROR:mcp_server_git.server:{missing} does not exist"
    ]
