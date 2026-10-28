from .allowlist import parse_allowed_host
from .server import serve


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
