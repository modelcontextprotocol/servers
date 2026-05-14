import sys

from .server import serve


def main():
    """MCP Click Server - Expose Click command lines as MCP tools"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="expose click command lines as MCP tools"
    )
    parser.add_argument(
        "import_path", type=str, help="path to click CLI, eg. mymodule.cli:cli"
    )
    args = parser.parse_args()
    print(f"Importing Click CLI from {args.import_path}", file=sys.stderr)
    asyncio.run(serve(args.import_path))


if __name__ == "__main__":
    main()
