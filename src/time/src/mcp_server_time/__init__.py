from .server import serve
from .transport import TRANSPORTS, http_endpoint


def main():
    """MCP Time Server - Time and timezone conversion functionality for MCP"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="give a model the ability to handle time queries and timezone conversions"
    )
    parser.add_argument("--local-timezone", type=str, help="Override local timezone")
    parser.add_argument(
        "--transport",
        choices=TRANSPORTS,
        default="stdio",
        help="How clients reach the server (default: stdio). streamable-http "
        "listens on $HOST:$PORT, 127.0.0.1:3001 by default",
    )

    args = parser.parse_args()
    if args.transport == "streamable-http":
        # A bad HOST or PORT stops the server here, as a usage error.
        try:
            http_endpoint()
        except ValueError as e:
            parser.error(str(e))
    asyncio.run(serve(args.local_timezone, args.transport))


if __name__ == "__main__":
    main()
