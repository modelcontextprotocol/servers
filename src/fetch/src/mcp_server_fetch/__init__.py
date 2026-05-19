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
        "--allow-private-networks",
        action="store_true",
        help=(
            "Disable the SSRF safety check that rejects URLs resolving to "
            "loopback, link-local, RFC1918, or cloud-metadata addresses. "
            "Off by default — enable ONLY when every reachable internal target "
            "is trusted (developer tooling, internal-network scraping behind a "
            "trusted egress allowlist)."
        ),
    )

    args = parser.parse_args()
    asyncio.run(serve(
        args.user_agent,
        args.ignore_robots_txt,
        args.proxy_url,
        args.allow_private_networks,
    ))


if __name__ == "__main__":
    main()
