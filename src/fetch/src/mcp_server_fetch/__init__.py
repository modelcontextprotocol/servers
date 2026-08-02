"""Top-level entry for mcp-server-fetch.

The actual server logic lives in `.server` and is imported lazily
inside `main()` so that:
  - the version guard can run BEFORE the heavy imports
  - importing the package (e.g. for tooling, --help, metadata
    introspection) does NOT trigger the guard
"""

import sys
from importlib.metadata import version as _pkg_version


def _check_mcp_version_or_exit() -> None:
    """Refuse to start if mcp>=2 is resolved. The package's
    pyproject.toml pins mcp<2 (see #4600), but a downstream consumer
    using `uvx --with mcp mcp-server-fetch` can override that pin
    with `--with mcp` (no version), which pulls mcp 2.0.0 and
    breaks the import of `McpError` (renamed to `MCPError` in
    mcp 2.0.0). This guard catches that case and surfaces a clear
    error instead of a cryptic ImportError.

    Exits with code 2 (conventional for "wrong environment").
    Skipped silently if `importlib.metadata.version` cannot resolve
    the mcp package (the downstream import will produce the real
    error in that case).

    See https://github.com/modelcontextprotocol/servers/issues/4600
    """
    try:
        mcp_version = _pkg_version("mcp")
    except Exception:
        return
    # Major-version check: catches 2.0.0, 2.0.0rc1, 2.0.0a1, 2.1.0, 3.0.0.
    # Uses the major version (first dotted component) to be robust to
    # pre-release tags like 2.0.0rc1 where the version string is
    # "2.0.0rc1" (split('.')[0] is "2", int("2") is 2).
    try:
        major = int(mcp_version.split(".")[0])
    except (ValueError, IndexError):
        return
    if major >= 2:
        sys.stderr.write(
            f"mcp-server-fetch requires mcp<2, but mcp {mcp_version} is "
            f"resolved. The mcp 2.0.0 release renamed `McpError` to "
            f"`MCPError` and is incompatible with this server.\n"
            f"Fix: pin the mcp dependency in your environment, e.g.\n"
            f"  uvx --with 'mcp<2' mcp-server-fetch\n"
            f"or upgrade to a version of mcp-server-fetch that has been "
            f"migrated to the mcp 2.x API (tracked separately).\n"
        )
        sys.exit(2)


def main() -> None:
    """MCP Fetch Server - HTTP fetching functionality for MCP"""
    # Runtime guard: check the installed mcp version BEFORE the
    # heavy imports. Catches the `uvx --with mcp` case where the
    # dep pin is overridden at the command line.
    _check_mcp_version_or_exit()

    # Lazy import: defer the heavy `from .server import serve` until
    # after the version guard has run, so the guard's error message
    # is what the user sees (not an ImportError on McpError).
    from .server import serve

    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="give a model the ability to make web requests"
    )
    parser.add_argument("--user-agent", type=str, help="Custom User-Agent string")
    parser.add_argument(
        "--ignore-robots-txt",
        action="store_true",
        help="Ignore robots.txt restrictions",
    )
    parser.add_argument("--proxy-url", type=str, help="Proxy URL to use for requests")

    args = parser.parse_args()
    asyncio.run(serve(args.user_agent, args.ignore_robots_txt, args.proxy_url))


if __name__ == "__main__":
    main()
