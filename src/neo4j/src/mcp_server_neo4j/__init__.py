from . import server
import asyncio
import argparse
import os


def main():
    """Main entry point for the package."""
    parser = argparse.ArgumentParser(description='Neo4j MCP Server')
    parser.add_argument('--db-url', 
                       default="bolt://localhost:7687",
                       help='Neo4j connection URL')
    parser.add_argument('--username', 
                       default="neo4j",
                       help='Neo4j username')
    parser.add_argument('--password', 
                       default="password",
                       help='Neo4j password')
    
    args = parser.parse_args()
    asyncio.run(server.main(args.db_url, args.username, args.password))


# Optionally expose other important items at package level
__all__ = ["main", "server"]
