from mcp_server_azure import azure_server
import asyncio


def main():
    """Main entry point for the package."""
    asyncio.run(azure_server.main())


# Optionally expose other important items at package level
__all__ = ["main", "azure_server"]
if "__name__" == "__main__":
    main()
