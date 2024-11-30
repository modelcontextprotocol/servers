from . import server
import asyncio
import argparse
def main():
    """Main entry point for the package."""
    parser = argparse.ArgumentParser(description='BigQuery MCP Server')
    parser.add_argument('--project', help='BigQuery project', required=False)
    parser.add_argument('--location', help='BigQuery location', required=False)
    parser.add_argument('--dataset', help='BigQuery dataset', required=False, action='append')
    
    args = parser.parse_args()

    datasets_filter = args.dataset if args.dataset else []
    asyncio.run(server.main(args.project, args.location, datasets_filter))

# Optionally expose other important items at package level
__all__ = ['main', 'server']
