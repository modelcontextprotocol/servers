from .server import serve


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
        "--ignore-robots-txt",
        action="store_true",
        help="Ignore robots.txt restrictions",
    )
    parser.add_argument("--proxy-url", type=str, help="Proxy URL to use for requests")
    parser.add_argument(
        "--timeout",
        type=int,
        help="Default request timeout in milliseconds, used when a fetch call "
        "doesn't specify its own timeout_ms (env: FETCH_TIMEOUT_MS, default: 30000)",
    )

    args = parser.parse_args()
    default_timeout_ms = args.timeout or int(os.environ.get("FETCH_TIMEOUT_MS", 30000))
    asyncio.run(
        serve(args.user_agent, args.ignore_robots_txt, args.proxy_url, default_timeout_ms)
    )


if __name__ == "__main__":
    main()
