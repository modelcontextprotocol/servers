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

    def positive_timeout(value: str) -> float:
        seconds = float(value)
        if seconds <= 0:
            raise argparse.ArgumentTypeError(
                "timeout must be a positive number of seconds"
            )
        return seconds

    env_timeout = os.environ.get("FETCH_TIMEOUT")
    try:
        default_timeout = (
            positive_timeout(env_timeout) if env_timeout else DEFAULT_REQUEST_TIMEOUT
        )
    except (ValueError, argparse.ArgumentTypeError) as error:
        parser.error(f"invalid FETCH_TIMEOUT environment variable: {error}")

    parser.add_argument(
        "--timeout",
        type=positive_timeout,
        default=default_timeout,
        help="Request timeout in seconds (default: 30, or the FETCH_TIMEOUT env var)",
    )

    args = parser.parse_args()
    asyncio.run(
        serve(args.user_agent, args.ignore_robots_txt, args.proxy_url, args.timeout)
    )


if __name__ == "__main__":
    main()
