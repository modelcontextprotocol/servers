from . import server
import asyncio
import argparse
import os

def main():
    """Main entry point for the package."""
    parser = argparse.ArgumentParser(description='SQLite MCP Server')
    parser.add_argument('--db-path', 
                       default="./sqlite_mcp_server.db",
                       help='Path to SQLite database file')
    parser.add_argument('--anthropic-api-key',
                       default=os.environ.get('ANTHROPIC_API_KEY'),
                       help='Anthropic API key (can also be set via ANTHROPIC_API_KEY environment variable)')
    
    args = parser.parse_args()
    asyncio.run(server.main(args.db_path, args.anthropic_api_key))

# Optionally expose other important items at package level
__all__ = ['main', 'server']