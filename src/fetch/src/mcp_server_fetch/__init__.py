from .server import serve, DEFAULT_REQUEST_TIMEOUT


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

    env_timeout = os.environ.get("FETCH_TIMEOUT")
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(env_timeout) if env_timeout else DEFAULT_REQUEST_TIMEOUT,
        help="Request timeout in seconds (default: 30, or the FETCH_TIMEOUT env var)",
    )

    args = parser.parse_args()
    asyncio.run(
        serve(args.user_agent, args.ignore_robots_txt, args.proxy_url, args.timeout)
    )


if __name__ == "__main__":
    main()
