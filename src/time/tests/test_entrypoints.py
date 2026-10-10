# Tests for mcp-server-time's entry points (#4855): `main()` in `__init__.py`,
# `python -m mcp_server_time` (`__main__.py`), and the `mcp-server-time`
# console script.
#
# `main()` and both `__main__` paths run in-process with `serve` patched out,
# so coverage measures them and nothing reads real stdin. The console script
# gets the one thin subprocess smoke test: it is the only way to prove the
# installed entry point boots and speaks MCP over real stdio.

import os
import runpy
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

import mcp_server_time


@pytest.mark.parametrize(
    "argv,expected_local_timezone",
    [
        ([], None),
        (["--local-timezone", "Europe/Paris"], "Europe/Paris"),
        (["--local-timezone=America/Chicago"], "America/Chicago"),
    ],
)
def test_main_passes_local_timezone_to_serve(
    argv: list[str], expected_local_timezone: str | None
) -> None:
    serve = AsyncMock()
    with (
        patch.object(mcp_server_time, "serve", serve),
        patch.object(sys, "argv", ["mcp-server-time", *argv]),
    ):
        mcp_server_time.main()
    serve.assert_awaited_once_with(expected_local_timezone)


def test_main_help_describes_the_server(capsys: pytest.CaptureFixture[str]) -> None:
    serve = AsyncMock()
    with (
        patch.object(mcp_server_time, "serve", serve),
        patch.object(sys, "argv", ["mcp-server-time", "--help"]),
        pytest.raises(SystemExit) as exit_info,
    ):
        mcp_server_time.main()
    assert exit_info.value.code == 0
    out = capsys.readouterr().out
    assert (
        "give a model the ability to handle time queries and timezone conversions"
        in out
    )
    assert "--local-timezone" in out
    serve.assert_not_awaited()


def test_main_rejects_unknown_arguments(capsys: pytest.CaptureFixture[str]) -> None:
    serve = AsyncMock()
    with (
        patch.object(mcp_server_time, "serve", serve),
        patch.object(sys, "argv", ["mcp-server-time", "--bogus"]),
        pytest.raises(SystemExit) as exit_info,
    ):
        mcp_server_time.main()
    assert exit_info.value.code == 2
    assert "unrecognized arguments: --bogus" in capsys.readouterr().err
    serve.assert_not_awaited()


def test_python_dash_m_calls_main() -> None:
    # What `python -m mcp_server_time` executes.
    main = MagicMock()
    with patch.object(mcp_server_time, "main", main):
        runpy.run_module("mcp_server_time", run_name="__main__")
    main.assert_called_once_with()


def test_init_module_run_as_main_calls_main() -> None:
    # `__init__.py` carries its own `if __name__ == "__main__"` guard. Running
    # it as a module re-executes it in a fresh namespace, which imports
    # `serve` from `.server` again, so the patch goes there.
    serve = AsyncMock()
    with (
        patch("mcp_server_time.server.serve", serve),
        patch.object(sys, "argv", ["mcp-server-time", "--local-timezone", "UTC"]),
    ):
        runpy.run_module("mcp_server_time.__init__", run_name="__main__")
    serve.assert_awaited_once_with("UTC")


async def test_console_script_boots_over_stdio() -> None:
    script = shutil.which("mcp-server-time", path=str(Path(sys.executable).parent))
    assert script is not None, "the console script is not installed in this venv"
    params = StdioServerParameters(
        command=script,
        args=["--local-timezone", "UTC"],
        env={**os.environ},
    )
    with open(os.devnull, "w") as errlog:
        async with stdio_client(params, errlog=errlog) as (read, write):
            async with ClientSession(read, write) as session:
                init = await session.initialize()
                tools = await session.list_tools()
                result = await session.call_tool(
                    "get_current_time", {"timezone": "UTC"}
                )
    assert init.model_dump(by_alias=True, mode="json")["serverInfo"]["name"] == (
        "mcp-time"
    )
    assert [tool.name for tool in tools.tools] == ["get_current_time", "convert_time"]
    assert result.model_dump(by_alias=True, mode="json")["isError"] is False


def test_console_script_rejects_an_invalid_local_timezone() -> None:
    # #5001: one line on stderr naming the value, a non-zero exit, and no
    # traceback.
    script = shutil.which("mcp-server-time", path=str(Path(sys.executable).parent))
    assert script is not None, "the console script is not installed in this venv"
    proc = subprocess.run(
        [script, "--local-timezone", "Not/AZone"],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 1
    assert proc.stdout == ""
    assert proc.stderr.splitlines() == [
        "Error: invalid --local-timezone 'Not/AZone': not a known IANA timezone name"
    ]
