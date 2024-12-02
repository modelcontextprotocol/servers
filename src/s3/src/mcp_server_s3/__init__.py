from .server import serve


def main():
    """
    MCP S3 Server - Provides S3 document search and analysis capabilities for MCP

    This server allows AI models to:
    - Search through documents in S3 buckets
    - Analyze document content
    - Extract and process text from various file types
    - Filter and retrieve documents based on metadata
    """
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="Give a model the ability to search and analyze documents in S3 buckets"
    )
    parser.add_argument(
        "--bucket",
        type=str,
        required=True,
        help="S3 bucket name"
    )
    parser.add_argument(
        "--prefix",
        type=str,
        default="",
        help="S3 bucket prefix (folder path)"
    )

    args = parser.parse_args()
    asyncio.run(serve(args.local_timezone))


if __name__ == "__main__":
    main()
