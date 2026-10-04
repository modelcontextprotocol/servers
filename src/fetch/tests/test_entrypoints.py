"""Tests for the command-line entry points: ``main()``, ``__main__`` and the console script."""

from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

import mcp_server_fetch
import mcp_server_fetch.server


def run_main(monkeypatch: pytest.MonkeyPatch, *argv: str) -> AsyncMock:
    serve = AsyncMock()
    monkeypatch.setattr(mcp_server_fetch, "serve", serve)
    monkeypatch.setattr(sys, "argv", ["mcp-server-fetch", *argv])
    mcp_server_fetch.main()
    return serve


def test_main_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    serve = run_main(monkeypatch)
    serve.assert_awaited_once_with(None, False, None)


def test_main_passes_every_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    serve = run_main(
        monkeypatch,
        "--user-agent",
        "MyBot/1.0",
        "--ignore-robots-txt",
        "--proxy-url",
        "http://proxy.example.com:8080",
    )
    serve.assert_awaited_once_with("MyBot/1.0", True, "http://proxy.example.com:8080")


def test_main_help_exits_zero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as excinfo:
        run_main(monkeypatch, "--help")
    assert excinfo.value.code == 0
    out = capsys.readouterr().out
    assert "give a model the ability to make web requests" in out
    for flag in ("--user-agent", "--ignore-robots-txt", "--proxy-url"):
        assert flag in out


def test_main_rejects_unknown_flag(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as excinfo:
        run_main(monkeypatch, "--bogus")
    assert excinfo.value.code == 2
    assert "unrecognized arguments: --bogus" in capsys.readouterr().err


def test_dunder_main_calls_main(monkeypatch: pytest.MonkeyPatch) -> None:
    # `python -m mcp_server_fetch`, in-process.
    main = MagicMock()
    monkeypatch.setattr(mcp_server_fetch, "main", main)
    monkeypatch.delitem(sys.modules, "mcp_server_fetch.__main__", raising=False)
    runpy.run_module("mcp_server_fetch", run_name="__main__")
    main.assert_called_once_with()


def test_package_init_run_as_main_calls_main(monkeypatch: pytest.MonkeyPatch) -> None:
    # Covers the `if __name__ == "__main__"` guard at the foot of __init__.py.
    serve = AsyncMock()
    monkeypatch.setattr(mcp_server_fetch.server, "serve", serve)
    monkeypatch.setattr(sys, "argv", ["mcp-server-fetch"])
    runpy.run_module("mcp_server_fetch.__init__", run_name="__main__")
    serve.assert_awaited_once_with(None, False, None)


def console_script() -> Path:
    bin_dir = Path(sys.executable).parent
    name = "mcp-server-fetch.exe" if os.name == "nt" else "mcp-server-fetch"
    return bin_dir / name


async def test_console_script_serves_over_stdio() -> None:
    # The one subprocess smoke: the installed console script boots and answers
    # tools/list over real stdio. Everything else runs in-process.
    script = console_script()
    assert script.exists(), f"console script not installed at {script}"
    params = StdioServerParameters(command=str(script), args=[])
    with open(os.devnull, "w") as devnull:
        async with stdio_client(params, errlog=devnull) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
    assert [t.name for t in tools.tools] == ["fetch"]
