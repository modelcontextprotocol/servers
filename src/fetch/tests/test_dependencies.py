"""Tests for the fetch MCP server's declared dependencies."""

import tomllib
from pathlib import Path

from packaging.requirements import Requirement
from packaging.version import Version

PYPROJECT = Path(__file__).parent.parent / "pyproject.toml"


def test_mcp_requirement_excludes_2_x():
    """The server uses the mcp 1.x low-level API, which mcp 2.0 removed.

    Without an upper bound, `uvx mcp-server-fetch` resolves mcp 2.x and the
    server dies on import.
    """
    dependencies = tomllib.loads(PYPROJECT.read_text())["project"]["dependencies"]
    mcp = next(r for r in map(Requirement, dependencies) if r.name == "mcp")
    assert not mcp.specifier.contains(Version("2.0.0"))
