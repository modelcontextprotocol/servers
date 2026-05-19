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
        "--no-readability-js",
        action="store_true",
        help="Use readabilipy's Python-only HTML simplifier even when Node.js is installed",
    )

    args = parser.parse_args()
    asyncio.run(
        serve(
            custom_user_agent=args.user_agent,
            ignore_robots_txt=args.ignore_robots_txt,
            proxy_url=args.proxy_url,
            use_readability_js=not args.no_readability_js,
        )
    )


if __name__ == "__main__":
    main()
