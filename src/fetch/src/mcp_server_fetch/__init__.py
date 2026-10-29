from .allowlist import parse_allowed_host
from .server import serve
from .timeout import (
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    TIMEOUT_ENV,
    parse_timeout_ms,
    timeout_ms_from_env,
)


def main():
    """MCP Fetch Server - HTTP fetching functionality for MCP"""
    import argparse
    import asyncio
    import os

    parser = argparse.ArgumentParser(
        description="give a model the ability to make web requests"
    )
    parser.add_argument("--user-agent", type=str, help="Custom User-Agent string")
    parser.add_argument(
        "--timeout-ms",
        type=parse_timeout_ms,
        help=f"HTTP request timeout in milliseconds, {MIN_TIMEOUT_MS} to "
        f"{MAX_TIMEOUT_MS} (default: ${TIMEOUT_ENV}, else {DEFAULT_TIMEOUT_MS}); "
        "a tool call's timeout_ms argument overrides it",
    )
    parser.add_argument(
        "--ignore-robots-txt",
        action="store_true",
        help="Ignore robots.txt restrictions",
    )
    parser.add_argument("--proxy-url", type=str, help="Proxy URL to use for requests")
    parser.add_argument(
        "--allow-private-ips",
        action="store_true",
        help="Allow fetching private, loopback and link-local addresses (refused by default)",
    )
    parser.add_argument(
        "--allowed-hosts",
        nargs="+",
        action="extend",
        type=parse_allowed_host,
        metavar="HOST",
        help="Only fetch from these hosts: an exact host name or IP address, or "
        "*.example.com for any subdomain of example.com (all hosts by default)",
    )
    parser.add_argument(
        "--no-readability-js",
        action="store_true",
        help="Extract HTML with the pure-Python extractor only, never starting Node.js "
        "or npm (by default Readability.js is used when Node.js is on PATH)",
    )

    args = parser.parse_args()
    # The server reads its timeout from the environment (see timeout.py), and
    # the flag outranks a value already there; a bad value stops it here.
    if args.timeout_ms is not None:
        os.environ[TIMEOUT_ENV] = str(args.timeout_ms)
    try:
        timeout_ms_from_env()
    except ValueError as e:
        parser.error(str(e))
    asyncio.run(
        serve(
            args.user_agent,
            args.ignore_robots_txt,
            args.proxy_url,
            args.allow_private_ips,
            args.allowed_hosts,
            not args.no_readability_js,
        )
    )


if __name__ == "__main__":
    main()
