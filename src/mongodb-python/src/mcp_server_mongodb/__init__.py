from . import server
import asyncio
import os
from dotenv import load_dotenv

def main():
    """Main entry point for the package."""
    # Load environment variables from .env file if it exists
    load_dotenv()
    
    # Get MongoDB URI from environment variable
    mongo_uri = os.getenv("MONGODB_URI")
    mongo_db_name = os.getenv("MONGODB_DB_NAME")
    
    if not mongo_uri:
        raise ValueError("MONGODB_URI environment variable must be set")
    if not mongo_db_name:
        raise ValueError("MONGODB_DB_NAME environment variable must be set")
    
    asyncio.run(server.main(mongo_uri, mongo_db_name))

# Expose important items at package level
__all__ = ["main", "server"]