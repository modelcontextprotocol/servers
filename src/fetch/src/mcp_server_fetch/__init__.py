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
        "--timeout",
        type=float,
        default=None,
        help="Timeout in seconds for fetch requests (default: 30.0, or MCP_FETCH_TIMEOUT env var)",
    )

    args = parser.parse_args()
    asyncio.run(
        serve(
            args.user_agent,
            args.ignore_robots_txt,
            args.proxy_url,
            timeout=args.timeout,
        )
    )


if __name__ == "__main__":
    main()
