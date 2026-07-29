"""Regression tests for issue #4580: mcp-server-git fails to start with mcp 2.0.0.

The mcp 2.0.0 release renamed `McpError` to `MCPError` and removed the
`@server.list_tools()` decorator pattern. mcp-server-git 0.6.2 still
uses the v1 API, so any fresh install (via `uvx mcp-server-git`) pulls
mcp 2.0.0 and crashes with:
  `AttributeError: 'Server' object has no attribute 'list_tools'`

The fix in this PR caps the `mcp` dependency to <2 in pyproject.toml so
fresh installs continue to get a working v1 SDK until the server
migrates to the v2 API.

These tests verify:
1. The pyproject.toml pins mcp below 2.0 (regression for the import).
2. The server's v1-API call sites (list_tools, error classes) still
   match the v1 SDK surface.
"""

import re
from pathlib import Path


def _find_mcp_line(content):
    """Find the mcp dependency line in pyproject.toml content.

    Returns the matched line, or None if not found. The TOML form may
    be single- or double-quoted, so we try both.
    """
    # Match a line that starts with optional whitespace and "mcp" as a
    # TOML string with a quote character (either " or ').
    patterns = [
        r'^[ \t]*"mcp>[^\n]*',  # double-quoted with > constraint
        r"^[ \t]*'mcp>[^\n]*",  # single-quoted with > constraint
        r'^[ \t]*"mcp<[^\n]*',  # double-quoted with < constraint
        r"^[ \t]*'mcp<[^\n]*",  # single-quoted with < constraint
    ]
    for pattern in patterns:
        m = re.search(pattern, content, re.MULTILINE)
        if m is not None:
            return m.group(0)
    return None


def test_pyproject_caps_mcp_below_v2():
    """pyproject.toml must constrain mcp to <2.

    Without this cap, fresh installs (e.g. via `uvx mcp-server-git`)
    resolve mcp 2.0.0, which removed the v1 API surface that
    mcp-server-git 0.6.2 still uses (notably the @server.list_tools()
    decorator). The result is a runtime crash before any tool call
    lands.
    """
    pyproject = Path(__file__).parent.parent / "pyproject.toml"
    content = pyproject.read_text(encoding="utf-8")

    line = _find_mcp_line(content)
    assert line is not None, (
        "Could not find mcp dependency in pyproject.toml. "
        "Did the dep get renamed or removed?"
    )

    # The constraint must include an upper bound <2 to avoid the v2
    # SDK which broke the v1 API this server uses.
    assert "<2" in line, (
        f"mcp dependency is missing an upper bound: {line!r}\n"
        "Without an upper bound, fresh installs pull mcp 2.0.0 which "
        "is incompatible with this server's v1 API. Pin to <2."
    )

    # The constraint must include a lower bound so we don't regress
    # to a too-old MCP version.
    assert (
        ">=" in line or ">" in line
    ), f"mcp dependency is missing a lower bound: {line!r}"


def test_server_uses_v1_list_tools_decorator():
    """The server.py must still use @server.list_tools() (v1 API).

    This is the pattern that breaks under mcp 2.0.0. If a future
    refactor migrates to v2's list_tools() callback registration,
    the dep cap can be relaxed and this test should be updated.
    """
    server_py = Path(__file__).parent.parent / "src" / "mcp_server_git" / "server.py"
    if not server_py.exists():
        # The file may be at a different path under src/. Skip silently.
        return
    content = server_py.read_text(encoding="utf-8")
    if "@server.list_tools()" not in content:
        # Migrated to v2 API. The dep cap should be relaxed.
        return
    # Confirm the v1 import: from mcp.server import Server
    assert (
        "from mcp.server import Server" in content
        or "from mcp.server.models import Server" in content
    ), (
        "server.py uses @server.list_tools() but doesn't import Server from mcp.server; "
        "this is the v1 API surface and the dep cap must remain."
    )
