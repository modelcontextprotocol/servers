from .server import serve


def main():
    """MCP Time Server - Time, timezone conversion, and date calculation functionality for MCP"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="give a model the ability to handle time queries, timezone conversions, and date calculations"
    )
    parser.add_argument("--local-timezone", type=str, help="Override local timezone")

    args = parser.parse_args()
    asyncio.run(serve(args.local_timezone))


if __name__ == "__main__":
    main()
