import logging
from logging.handlers import RotatingFileHandler
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio
from pydantic import AnyUrl
from typing import Any, Optional, TypedDict, List, Dict, Union, Set
import json
from bson import json_util

# Configure logging
logger = logging.getLogger('mcp_mongodb_server')

def setup_logging() -> None:
    """Configure logging with rotation"""
    handler = RotatingFileHandler(
        Config.LOG_FILE,
        maxBytes=Config.LOG_MAX_BYTES,
        backupCount=Config.LOG_BACKUP_COUNT
    )
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

class Config:
    """Configuration settings for the MongoDB MCP server"""
    DEFAULT_SAMPLE_SIZE = 100
    MAX_SAMPLE_SIZE = 1000
    MAX_EXECUTION_TIME_MS = 30000
    DEFAULT_BATCH_SIZE = 1000
    MAX_POOL_SIZE = 50
    CONNECT_TIMEOUT_MS = 5000
    SERVER_SELECTION_TIMEOUT_MS = 5000
    LOG_FILE = "mongodb_mcp.log"
    LOG_MAX_BYTES = 10 * 1024 * 1024  # 10MB
    LOG_BACKUP_COUNT = 5

class AggregateOptions(TypedDict, total=False):
    allowDiskUse: bool
    maxTimeMS: int
    comment: str

class MongoDatabase:
    def __init__(self, connection_string: str, db_name: str):
        """Initialize MongoDB connection and database"""
        self.connection_string = connection_string
        self.client = MongoClient(
            connection_string,
            maxPoolSize=Config.MAX_POOL_SIZE,
            connectTimeoutMS=Config.CONNECT_TIMEOUT_MS,
            serverSelectionTimeoutMS=Config.SERVER_SELECTION_TIMEOUT_MS
        )
        self.db: Database = self.client[db_name]
        logger.info("Connected to MongoDB")

    def validate_pipeline(self, pipeline: List[Dict[str, Any]]) -> None:
        """Validate aggregation pipeline for security"""
        restricted_ops = {'$out', '$merge'}
        for stage in pipeline:
            if any(op in stage for op in restricted_ops):
                raise ValueError("Pipeline contains restricted operations")

    def validate_collection_name(self, collection_name: str) -> None:
        """Validate that collection exists"""
        if collection_name not in self.db.list_collection_names():
            raise ValueError(f"Collection '{collection_name}' does not exist")

    def analyze_collection_schema(
        self,
        collection_name: str,
        sample_size: int = Config.DEFAULT_SAMPLE_SIZE,
        include_indexes: bool = True
    ) -> Dict[str, Any]:
        """Analyze collection schema using sampling and index information"""
        try:
            self.validate_collection_name(collection_name)
            collection = self.db[collection_name]
            schema_info: Dict[str, Any] = {"fields": {}}
            
            # Sample documents to analyze field types
            sample_size = min(max(1, sample_size), Config.MAX_SAMPLE_SIZE)
            pipeline = [{"$sample": {"size": sample_size}}]
            samples = list(collection.aggregate(pipeline))
            
            # Analyze field types across samples
            for doc in samples:
                self._analyze_document_fields(doc, schema_info["fields"], path="")
            
            # Convert sets to lists for JSON serialization
            for field_info in schema_info["fields"].values():
                field_info["types"] = list(field_info["types"])
            
            # Add index information if requested
            if include_indexes:
                schema_info["indexes"] = list(collection.list_indexes())
            
            # Add collection stats
            stats = self.db.command("collstats", collection_name)
            schema_info["stats"] = {
                "size": stats["size"],
                "count": stats["count"],
                "avgObjSize": stats.get("avgObjSize"),
                "storageSize": stats["storageSize"],
                "nindexes": stats["nindexes"]
            }
            
            return json.loads(json_util.dumps(schema_info))
        
        except Exception as e:
            logger.error(f"Error analyzing collection schema: {e}")
            raise

    def _analyze_document_fields(
        self,
        doc: Dict[str, Any],
        schema_fields: Dict[str, Any],
        path: str
    ) -> None:
        """Recursively analyze document fields and their types"""
        for key, value in doc.items():
            field_path = f"{path}.{key}" if path else key
            
            if field_path not in schema_fields:
                schema_fields[field_path] = {
                    "types": set(),
                    "sample_values": []
                }
                
            field_info = schema_fields[field_path]
            field_info["types"].add(type(value).__name__)
            
            # Store sample values (limited set)
            if len(field_info["sample_values"]) < 5:
                sample_value = str(value) if len(str(value)) < 100 else str(value)[:100] + "..."
                if sample_value not in field_info["sample_values"]:
                    field_info["sample_values"].append(sample_value)
            
            # Recurse into nested documents
            if isinstance(value, dict):
                self._analyze_document_fields(value, schema_fields, field_path)
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                self._analyze_document_fields(value[0], schema_fields, field_path)

    def _execute_aggregate(
        self,
        collection_name: str,
        pipeline: List[Dict[str, Any]],
        options: Optional[AggregateOptions] = None
    ) -> List[Dict[str, Any]]:
        """Execute MongoDB aggregation pipeline with options"""
        try:
            self.validate_collection_name(collection_name)
            self.validate_pipeline(pipeline)
            collection: Collection = self.db[collection_name]
            
            # Apply default options
            agg_options = {
                "allowDiskUse": False,
                "maxTimeMS": Config.MAX_EXECUTION_TIME_MS
            }
            if options:
                agg_options.update(options)

            # Check if pipeline has a $limit stage, if not add default limit
            has_limit = any("$limit" in stage for stage in pipeline)
            if not has_limit:
                pipeline.append({"$limit": Config.DEFAULT_BATCH_SIZE})

            results = list(collection.aggregate(pipeline, **agg_options))
            return json.loads(json_util.dumps(results))
            
        except Exception as e:
            logger.error(f"Aggregation error: {e}")
            raise

    def _execute_explain(
        self,
        collection_name: str,
        pipeline: List[Dict[str, Any]],
        verbosity: str = "queryPlanner"
    ) -> Dict[str, Any]:
        """Get execution plan for an aggregation pipeline"""
        try:
            self.validate_collection_name(collection_name)
            explain_command = {
                'explain': {
                    'aggregate': collection_name,
                    'pipeline': pipeline,
                    'cursor': {}
                },
                'verbosity': verbosity
            }
            results = self.db.command(explain_command)
            return json.loads(json_util.dumps(results))
        except Exception as e:
            logger.error(f"Explain error: {e}")
            raise

async def main(connection_string: str, db_name: str):
    """Main entry point for the MongoDB MCP server"""
    setup_logging()
    logger.info("Starting MongoDB MCP Server")
    
    db = MongoDatabase(connection_string, db_name)
    server = Server("mongodb-python")

    @server.list_tools()
    async def handle_list_tools() -> List[types.Tool]:
        """List available MongoDB tools"""
        return [
            types.Tool(
                name="describe-schema",
                description="Analyze and describe the schema of a MongoDB collection",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection": {
                            "type": "string",
                            "description": "Name of the collection to analyze"
                        },
                        "sampleSize": {
                            "type": "number",
                            "description": "Number of documents to sample for schema analysis",
                            "minimum": 1,
                            "maximum": Config.MAX_SAMPLE_SIZE,
                            "default": Config.DEFAULT_SAMPLE_SIZE
                        },
                        "includeIndexes": {
                            "type": "boolean",
                            "description": "Include collection index information",
                            "default": True
                        }
                    },
                    "required": ["collection"]
                }
            ),
            types.Tool(
                name="list-collections",
                description="List all collections in MongoDB",
                inputSchema={
                    "type": "object",
                    "properties": {},
                },
            ),
            types.Tool(
                name="aggregate",
                description="Run a MongoDB aggregation pipeline",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection": {
                            "type": "string",
                            "description": "Name of the collection to query"
                        },
                        "pipeline": {
                            "type": "array",
                            "items": {"type": "object"},
                            "description": "MongoDB aggregation pipeline stages"
                        },
                        "options": {
                            "type": "object",
                            "properties": {
                                "allowDiskUse": {
                                    "type": "boolean",
                                    "description": "Allow writing to temporary files"
                                },
                                "maxTimeMS": {
                                    "type": "number",
                                    "description": "Maximum execution time in milliseconds"
                                },
                                "comment": {
                                    "type": "string",
                                    "description": "Optional comment to help trace operations"
                                }
                            }
                        }
                    },
                    "required": ["collection", "pipeline"]
                }
            ),
            types.Tool(
                name="explain",
                description="Get the execution plan for an aggregation pipeline",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection": {
                            "type": "string",
                            "description": "Name of the collection to analyze"
                        },
                        "pipeline": {
                            "type": "array",
                            "items": {"type": "object"},
                            "description": "MongoDB aggregation pipeline stages to analyze"
                        },
                        "verbosity": {
                            "type": "string",
                            "enum": ["queryPlanner", "executionStats", "allPlansExecution"],
                            "default": "queryPlanner",
                            "description": "Level of detail in the execution plan"
                        }
                    },
                    "required": ["collection", "pipeline"]
                }
            ),
        ]

    @server.call_tool()
    async def handle_call_tool(
        name: str,
        arguments: Dict[str, Any] | None
    ) -> List[types.TextContent | types.ImageContent | types.EmbeddedResource]:
        """Handle tool execution requests"""
        try:
            if name == "list-collections":
                logger.info("Running list-collections tool")
                collections = db.db.list_collection_names()
                return [types.TextContent(type="text", text=str(collections))]
            
            if not arguments:
                raise ValueError("Missing arguments")

            if name == "describe-schema":
                logger.info("Running describe-schema tool")
                results = db.analyze_collection_schema(
                    arguments["collection"],
                    arguments.get("sampleSize", Config.DEFAULT_SAMPLE_SIZE),
                    arguments.get("includeIndexes", True)
                )
                return [types.TextContent(type="text", text=json.dumps(results, indent=2))]

            elif name == "aggregate":
                logger.info("Running aggregate tool")
                results = db._execute_aggregate(
                    arguments["collection"],
                    arguments["pipeline"],
                    arguments.get("options")
                )
                return [types.TextContent(type="text", text=json.dumps(results, indent=2))]

            elif name == "explain":
                logger.info("Running explain tool")
                results = db._execute_explain(
                    arguments["collection"],
                    arguments["pipeline"],
                    arguments.get("verbosity", "queryPlanner")
                )
                return [types.TextContent(type="text", text=json.dumps(results, indent=2))]

            else:
                raise ValueError(f"Unknown tool: {name}")

        except Exception as e:
            logger.error(f"Tool execution error: {e}")
            return [types.TextContent(type="text", text=f"Error: {str(e)}")]

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        logger.info("Server running with stdio transport")
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="mongodb",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )