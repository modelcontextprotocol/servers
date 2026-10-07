from .server import serve, DEFAULT_MAX_RETRIES, DEFAULT_RETRY_DELAY_MS


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

    args = parser.parse_args()
    max_retries = int(os.environ.get("FETCH_MAX_RETRIES", DEFAULT_MAX_RETRIES))
    retry_delay_ms = int(os.environ.get("FETCH_RETRY_DELAY_MS", DEFAULT_RETRY_DELAY_MS))
    asyncio.run(
        serve(args.user_agent, args.ignore_robots_txt, args.proxy_url, max_retries, retry_delay_ms)
    )


if __name__ == "__main__":
    main()
