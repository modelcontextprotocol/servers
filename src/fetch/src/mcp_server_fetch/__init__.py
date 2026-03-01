import os
import sys

from .server import ACLConfigError, serve


def _env_flag(name: str) -> bool:
    value = os.getenv(name, "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def main():
    """MCP Fetch Server - HTTP fetching functionality for MCP"""
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
    parser.add_argument(
        "--allow-host",
        action="append",
        default=[],
        help="Allowed host (repeatable). Required when --strict-acl is enabled.",
    )
    parser.add_argument(
        "--strict-acl",
        action="store_true",
        help="Fail startup unless explicit ACL configuration is provided.",
    )

    args = parser.parse_args()
    strict_acl = args.strict_acl or _env_flag("MCP_SERVER_STRICT_ACL")
    allowed_hosts = tuple(args.allow_host or [])
    try:
        asyncio.run(
            serve(
                args.user_agent,
                args.ignore_robots_txt,
                args.proxy_url,
                strict_acl=strict_acl,
                allowed_hosts=allowed_hosts,
            )
        )
    except ACLConfigError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
