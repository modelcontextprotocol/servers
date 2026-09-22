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
        "--allowed-hosts",
        type=str,
        nargs="+",
        metavar="HOST",
        help="Only allow fetching these hosts (exact names like example.com or wildcards like *.example.com, which also covers example.com itself). Applies to the initial URL and every redirect hop. If omitted, all hosts are allowed.",
    )

    args = parser.parse_args()
    asyncio.run(serve(args.user_agent, args.ignore_robots_txt, args.proxy_url, allowed_hosts=args.allowed_hosts))


if __name__ == "__main__":
    main()
