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
        help=(
            "Allow fetching URLs that resolve to private/loopback/link-local "
            "addresses. Off by default to reduce server-side request forgery "
            "(SSRF) risk — only enable this if every client that can reach "
            "this server is trusted."
        ),
    )

    args = parser.parse_args()
    asyncio.run(
        serve(
            args.user_agent,
            args.ignore_robots_txt,
            args.proxy_url,
            args.allow_private_ips,
        )
    )


if __name__ == "__main__":
    main()
