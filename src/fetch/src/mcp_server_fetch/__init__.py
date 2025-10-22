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
        nargs="*",
        help="List of allowed hostnames/domains (supports wildcards like *.example.com). If not specified, all hosts are allowed unless blocked by IP restrictions.",
    )
    parser.add_argument(
        "--allow-private-ips",
        action="store_true",
        help="Allow access to private/internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, etc.)",
    )
    parser.add_argument(
        "--blocked-ip-ranges",
        type=str,
        nargs="*",
        help="Custom list of CIDR ranges to block (in addition to or instead of default private ranges)",
    )

    args = parser.parse_args()
    asyncio.run(serve(
        args.user_agent, 
        args.ignore_robots_txt, 
        args.proxy_url,
        args.allowed_hosts,
        args.allow_private_ips,
        args.blocked_ip_ranges,
    ))


if __name__ == "__main__":
    main()
