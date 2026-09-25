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
        "--no-readability",
        action="store_true",
        help="Disable Readability.js extraction and use the Python HTML simplifier only",
    )

    args = parser.parse_args()
    asyncio.run(serve(args.user_agent, args.ignore_robots_txt, args.proxy_url, not args.no_readability))


if __name__ == "__main__":
    main()
