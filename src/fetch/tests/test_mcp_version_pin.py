"""Regression test for #4600: mcp-server-fetch fails to start when
mcp>=1.1.3 resolves to mcp 2.0.0 (which renamed McpError to MCPError).

Three layers of defense, in increasing strength:

1. **Structural** — pyproject.toml's `mcp` dep has an upper bound of
   exactly `<2.0.0` (catches both removal of the bound and over-pin
   like `<9999` or `<3`).
2. **Specifier-level** — `packaging.specifiers.SpecifierSet` confirms
   the specifier line in pyproject.toml rejects mcp 2.0.0 (the
   user-facing bug). Catches over-pins like `<9999` that would
   structurally have a bound but the bound would be wrong.
3. **Resolver-level (lockfile)** — `uv lock --check` confirms the
   resolved mcp is < 2.0.0. Catches drift between pyproject.toml
   and uv.lock.

The structural test alone does NOT catch an over-pin like `<9999`,
so tests 2 and 3 are the authoritative regression checks. All three
together give layered defense against dep pin regressions.

The deeper user-facing-symptom test (installing mcp 2.0.0 and
verifying the import fails) is documented in the PR body as a
follow-up — it requires network access to PyPI and a fresh venv,
which is heavier than the unit tests. The current three tests give
structural+specifier+resolver coverage that is hermetic and fast.
"""

import re
import subprocess
import tomllib
from pathlib import Path

import pytest

PYPROJECT = Path(__file__).resolve().parent.parent / "pyproject.toml"


def _load_mcp_dep() -> str | None:
    with PYPROJECT.open("rb") as f:
        data = tomllib.load(f)
    for dep in data.get("project", {}).get("dependencies", []):
        # Match the bare name (split on any of <, >, =, ;, ,)
        match = re.match(r"^([A-Za-z0-9_.\-]+)", dep)
        if match and match.group(1).lower() == "mcp":
            return dep
    return None


def test_mcp_dep_is_upper_bounded_below_2():
    """The mcp dep MUST be upper-bounded (<2 or <2.0.0 etc.) so the
    package cannot silently install mcp 2.0.0, which renamed
    McpError -> MCPError and breaks all `from mcp.shared.exceptions
    import McpError` import paths used by this server.

    This is the structural test: it asserts the constraint text in
    pyproject.toml. A separate test (test_mcp_specifier_rejects_2_0_0)
    asserts the constraint actually constrains at the specifier level.
    """
    dep = _load_mcp_dep()
    assert dep is not None, "mcp dep not found in pyproject.toml"
    # Parse out any upper-bound specifier
    upper_match = re.search(r"<([0-9.]+)", dep)
    assert upper_match is not None, (
        f"mcp dep {dep!r} has no upper bound; mcp 2.0.0 is published and "
        f"renamed McpError to MCPError (see #4600)"
    )
    # The upper bound must be strictly < 2.0.0 (i.e. <2, <2.0, or <2.0.0)
    upper = tuple(int(p) for p in upper_match.group(1).split("."))
    assert upper < (2, 0, 0), (
        f"mcp dep {dep!r} upper bound {upper_match.group(1)} is not < 2.0.0; "
        f"this would allow the breaking mcp 2.0.0 release."
    )


def test_mcp_specifier_rejects_2_0_0():
    """Authoritative regression test: parse the dep line and use
    `packaging.specifiers.SpecifierSet` to confirm the specifier
    REJECTS mcp==2.0.0. This catches:
      - removal of the upper bound (would let 2.0.0 in)
      - over-pin to <9999 or <3 (would let 2.0.0 in)
      - down-pin to <2.0 (would let 2.0 in)
    The test fails if the specifier would permit mcp 2.0.0, which is
    the user-facing bug from #4600.
    """
    dep = _load_mcp_dep()
    assert dep is not None, "mcp dep not found in pyproject.toml"
    from packaging.specifiers import SpecifierSet

    # The dep string is "mcp>=1.1.3,<2"; SpecifierSet needs just the
    # specifier part (">=1.1.3,<2"), not the package name. Strip the
    # leading "mcp" via the same name-match logic as _load_mcp_dep.
    spec_str = re.sub(r"^[A-Za-z0-9_.\-]+\s*", "", dep)
    spec = SpecifierSet(spec_str)
    assert not spec.contains("2.0.0"), (
        f"mcp dep {dep!r} (specifier {spec_str!r}) permits mcp 2.0.0 "
        f"(the breaking release); narrow the upper bound to exclude 2.x."
    )
    # And confirm the spec still permits the lower bound (sanity check)
    assert spec.contains("1.1.3"), (
        f"mcp dep {dep!r} (specifier {spec_str!r}) should permit mcp 1.1.3 "
        f"(the current minimum)"
    )
    # And that 1.28.1 (latest 1.x) is permitted (sanity check the
    # current acceptable version is still in range)
    assert spec.contains("1.28.1"), (
        f"mcp dep {dep!r} (specifier {spec_str!r}) should permit mcp 1.28.1 "
        f"(latest 1.x)"
    )
    # And explicit test that >= 2 versions are rejected
    for v in ["2.0.0", "2.0.1", "2.1.0", "3.0.0"]:
        assert not spec.contains(v), (
            f"mcp dep {dep!r} (specifier {spec_str!r}) permits mcp {v}; "
            f"this is the breaking version that the dep pin exists to "
            f"exclude."
        )


def test_lockfile_consistent_with_dep_pin():
    """Run `uv lock --check` to confirm the lockfile is consistent
    with the pyproject.toml dep pin. This catches drift between the
    two — e.g., if someone bumps the dep pin in pyproject but forgets
    to regenerate uv.lock, or vice versa.

    Skipped if uv is not on PATH (CI environments without uv).
    """
    try:
        subprocess.run(
            ["uv", "--version"],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except (
        subprocess.CalledProcessError,
        FileNotFoundError,
        subprocess.TimeoutExpired,
    ):
        pytest.skip("uv not available")

    result = subprocess.run(
        ["uv", "lock", "--check"],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=str(PYPROJECT.parent),
    )
    assert result.returncode == 0, (
        f"`uv lock --check` failed (lockfile drift from pyproject.toml):\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )
