from .server import serve


def main() -> None:
    """MCP S3 Server - S3 functionality for MCP"""
    import asyncio

    asyncio.run(serve())


if __name__ == "__main__":
    main()
