from . import server
import asyncio
import argparse
def main():
    """Main entry point for the package."""
    parser = argparse.ArgumentParser(description='BigQuery MCP Server')
    parser.add_argument('--project', help='BigQuery project', required=False)
    parser.add_argument('--location', help='BigQuery location', required=False)
    
    args = parser.parse_args()
    asyncio.run(server.main(args.project, args.location))

# Optionally expose other important items at package level
__all__ = ['main', 'server']
