"""End-to-end user-facing symptom test for #4600.

The dep pin in pyproject.toml (`mcp<2`) prevents resolution to mcp 2.0.0
via the package's own dependency metadata. But a downstream consumer
using `uvx --with mcp mcp-server-fetch` can override that pin with
`--with mcp` (no version), which pulls mcp 2.0.0 and breaks the import
of `McpError` (renamed to `MCPError` in mcp 2.0.0).

The runtime version guard in `mcp_server_fetch/__init__.py` catches
this case and surfaces a clear error instead of a cryptic ImportError.
This test exercises the guard end-to-end by simulating the mcp 2.x
resolution and asserting the server refuses to start with exit code 2.

Note: the guard is now in `main()` rather than at module-import time
(this was a F-C HIGH attack in round 4: sys.exit at import time would
kill any tool that does `import mcp_server_fetch` for introspection).
The test invokes `mcp_server_fetch.main()` rather than just importing.
"""

import subprocess
import sys
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent.parent / "src"


def _run_with_patched_mcp_version(version: str) -> subprocess.CompletedProcess:
    """Run a Python script that patches importlib.metadata.version('mcp')
    to return the given string, then calls mcp_server_fetch.main().

    Uses a subprocess so the patch is isolated to the test run.
    """
    script = (
        "import sys\n"
        f"sys.path.insert(0, {str(PKG_DIR)!r})\n"
        "import importlib.metadata\n"
        "_real_version = importlib.metadata.version\n"
        f"def _patched_version(name):\n"
        f"    if name == 'mcp':\n"
        f"        return {version!r}\n"
        f"    return _real_version(name)\n"
        "importlib.metadata.version = _patched_version\n"
        # Now invoke main(). The guard inside main() should fire
        # before the heavy server import.
        "import mcp_server_fetch\n"
        "try:\n"
        "    mcp_server_fetch.main()\n"
        "except SystemExit as e:\n"
        # SystemExit with code 2 → guard worked, re-raise so subprocess
        # reports the right exit code
        "    sys.exit(e.code)\n"
        "except Exception as e:\n"
        "    print(f'UNEXPECTED EXCEPTION: {e!r}', file=sys.stderr)\n"
        "    sys.exit(99)\n"
    )
    return subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_runtime_guard_refuses_mcp_2_x():
    """Simulate mcp 2.0.0 being resolved and assert the server refuses
    to start with a clear error message instead of a cryptic
    ImportError on McpError.
    """
    result = _run_with_patched_mcp_version("2.0.0")
    assert result.returncode == 2, (
        f"expected exit code 2 (guard refused to start), got "
        f"{result.returncode}.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )
    assert "mcp<2" in result.stderr, (
        f"expected the error message to mention the mcp<2 constraint, "
        f"got: {result.stderr}"
    )
    assert (
        "MCPError" in result.stderr or "McpError" in result.stderr
    ), f"expected the error message to mention the rename, got: {result.stderr}"
    # And the message should include the remediation hint
    assert (
        "uvx --with" in result.stderr
    ), f"expected the error message to suggest the uvx fix, got: {result.stderr}"


def test_runtime_guard_catches_2_0_0rc1():
    """Major-version check must catch pre-releases too: 2.0.0rc1 has
    version string '2.0.0rc1', split('.')[0] is '2', int('2') == 2
    which is >= 2 → guard fires."""
    result = _run_with_patched_mcp_version("2.0.0rc1")
    assert result.returncode == 2, (
        f"expected exit 2 for 2.0.0rc1, got {result.returncode}.\n"
        f"stderr: {result.stderr}"
    )


def test_runtime_guard_catches_3_0_0():
    """Future 3.x is also blocked (the guard uses major-version check)."""
    result = _run_with_patched_mcp_version("3.0.0")
    assert result.returncode == 2, (
        f"expected exit 2 for 3.0.0, got {result.returncode}.\n"
        f"stderr: {result.stderr}"
    )


def test_runtime_guard_accepts_mcp_1_x():
    """Sanity check: the guard does NOT fire when mcp<2 is resolved.
    Note: this test only checks that the guard doesn't fire BEFORE
    main() does its work. mcp 1.28.1 is installed, so the import
    succeeds; main() will then try to parse args, which will fail
    with SystemExit(2) on argparse error (no args provided).
    We distinguish guard-fires (our stderr message) from
    argparse-fires (different stderr pattern).
    """
    result = _run_with_patched_mcp_version("1.28.1")
    # The guard should NOT have produced the "mcp<2" message
    assert "mcp-server-fetch requires mcp<2" not in result.stderr, (
        f"guard fired for mcp 1.28.1 (should not have); " f"stderr: {result.stderr}"
    )


def test_runtime_guard_uses_sys_exit_2_not_1():
    """The guard uses sys.exit(2) (not 1) so callers can distinguish
    'wrong mcp version' from other failure modes."""
    result = _run_with_patched_mcp_version("2.0.0")
    # Exit code 2 is conventional for "misuse of shell" but here we
    # use it for "wrong mcp version". Just assert it's 2 specifically,
    # not 1.
    assert result.returncode == 2, f"expected exit 2, got {result.returncode}"


def test_import_does_not_fire_guard():
    """F-C HIGH attack from round 4: importing the package (for tooling
    or --help) should NOT trigger the guard. The guard only fires when
    main() is actually invoked."""
    script = (
        "import sys\n"
        f"sys.path.insert(0, {str(PKG_DIR)!r})\n"
        "import mcp_server_fetch  # noqa: just import it\n"
        "print('OK: import did not fire guard')\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, (
        f"importing the package should not exit; got {result.returncode}.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )
    assert "mcp-server-fetch requires mcp<2" not in result.stderr, (
        f"guard fired on import (should only fire on main()); "
        f"stderr: {result.stderr}"
    )
