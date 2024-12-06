import os
import json
import logging
from typing import List, Dict, Optional
from minio import Minio
from mcp.server import types, NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from pydantic import AnyUrl

# Configure logging
logger = logging.getLogger(__name__)

# Configuration file path (adjust as needed)
CONFIG_FILE_PATH = os.path.expanduser(r"C:\Users\btuud\AppData\Roaming\Claude\claude_desktop_config.json")

def load_minio_config():
    """
    Load MinIO configuration from the S3 server configuration in Claude Desktop config file.
    
    Expected configuration structure:
    {
      "mcpServers": {
        "s3": {
          "command": "...",
          "args": [...],
          "minioConfig": {
            "serverUrl": "192.168.68.50:9000",
            "accessKey": "your_access_key",
            "secretKey": "your_secret_key",
            "secure": false
          }
        }
      }
    }
    """
    try:
        with open(CONFIG_FILE_PATH, 'r') as config_file:
            config = json.load(config_file)
        
        # Navigate to the S3 server configuration
        s3_config = config.get('mcpServers', {}).get('s3', {})
        
        # Look for MinIO configuration
        minio_config = s3_config.get('minioConfig', {})
        
        # Validate required fields
        required_fields = ['serverUrl', 'accessKey', 'secretKey']
        for field in required_fields:
            if field not in minio_config:
                raise ValueError(f"Missing required MinIO configuration: {field}")
        
        return {
            'server_url': minio_config['serverUrl'],
            'access_key': minio_config['accessKey'],
            'secret_key': minio_config['secretKey'],
            'secure': minio_config.get('secure', False)
        }
    except FileNotFoundError:
        logger.error(f"Configuration file not found: {CONFIG_FILE_PATH}")
        raise
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON in configuration file: {CONFIG_FILE_PATH}")
        raise
    except ValueError as ve:
        logger.error(str(ve))
        raise

def get_minio_client():
    """
    Lazily initialize and return MinIO client using dynamic configuration.
    """
    try:
        config = load_minio_config()
        return Minio(
            config['server_url'],
            access_key=config['access_key'],
            secret_key=config['secret_key'],
            secure=config['secure'],
        )
    except Exception as e:
        logger.error(f"Failed to create MinIO client: {str(e)}")
        raise

# MCP Server instance
server = Server("s3")

@server.list_resources()
async def handle_list_resources(uri: Optional[AnyUrl] = None) -> List[types.Resource]:
    """
    List available resources within the specified MinIO bucket.
    If no URI is provided, list resources from the first available bucket.
    """
    minio_client = get_minio_client()
    
    # If no URI is provided, get the first bucket
    if uri is None:
        try:
            buckets = list(minio_client.list_buckets())
            if not buckets:
                return []  # No buckets available
            
            # Use the first bucket as default
            bucket_name = buckets[0].name
            uri = AnyUrl(f"minio://{bucket_name}")
        except Exception as e:
            logger.error(f"Error listing buckets: {str(e)}")
            return []
    
    try:
        # Ensure uri is not None and has a path
        if not uri or not uri.path:
            logger.error("Invalid or empty URI provided")
            return []
        
        # Extract bucket name, handling potential None values
        bucket_name = uri.path.lstrip("/") if uri.path else ""
        
        if not bucket_name:
            logger.error("No bucket name could be extracted from URI")
            return []
        
        # Validate URI scheme
        if uri.scheme != "minio":
            logger.error(f"Unsupported URI scheme: {uri.scheme}")
            return []
        
        # List objects in the bucket
        objects = list(minio_client.list_objects(bucket_name))
        return [
            types.Resource(
                name=obj.object_name,
                uri=f"minio://{bucket_name}/{obj.object_name}",
                description=f"Object size: {obj.size} bytes",
            )
            for obj in objects
        ]
    except Exception as e:
        logger.error(f"Error listing resources for bucket {bucket_name}: {str(e)}")
        return []

@server.read_resource()
async def handle_read_resource(uri: AnyUrl) -> str:
    """
    Read a resource (file) from the MinIO server.
    """
    if uri.scheme != "minio":
        raise ValueError(f"Unsupported URI scheme: {uri.scheme}")
    
    minio_client = get_minio_client()
    bucket_name, _, object_name = uri.path.lstrip("/").partition("/")
    try:
        response = minio_client.get_object(bucket_name, object_name)
        content = response.read()
        return content.decode("utf-8")
    except Exception as e:
        logger.error(f"Error reading resource {uri}: {str(e)}")
        raise

@server.list_prompts()
async def handle_list_prompts() -> List[types.Prompt]:
    """
    List prompts supported by the server.
    """
    return [
        types.Prompt(
            name="bucket_summary",
            description="Summarize the contents of a bucket.",
            arguments=[
                types.PromptArgument(
                    name="bucket_name",
                    description="Name of the MinIO bucket to summarize.",
                    required=True,
                )
            ],
        ),

        types.Prompt(
            name="object_details",
            description="Get detailed information about an object in a bucket.",
            arguments=[
                types.PromptArgument(
                    name="bucket_name",
                    description="Name of the MinIO bucket.",
                    required=True,
                ),
                types.PromptArgument(
                    name="object_name",
                    description="Name of the object to get details for.",
                    required=True,
                )
            ],
        )
    ]

@server.get_prompt()
async def handle_get_prompt(
    name: str, arguments: Optional[Dict[str, str]]
) -> types.GetPromptResult:
    """
    Generate a prompt based on its name and arguments.
    """
    if name == "bucket_summary":
        bucket_name = arguments.get("bucket_name", "unknown_bucket")
        return types.GetPromptResult(
            description=f"Summarize the contents of bucket '{bucket_name}'.",
            messages=[
                types.PromptMessage(
                    role="user",
                    content=types.TextContent(
                        type="text", 
                        text=f"Provide a comprehensive summary of the contents in the MinIO bucket named '{bucket_name}'."
                    ),
                )
            ],
        )
    
    elif name == "object_details":
        bucket_name = arguments.get("bucket_name", "unknown_bucket")
        object_name = arguments.get("object_name", "unknown_object")
        return types.GetPromptResult(
            description=f"Get details for object '{object_name}' in bucket '{bucket_name}'.",
            messages=[
                types.PromptMessage(
                    role="user",
                    content=types.TextContent(
                        type="text", 
                        text=f"Provide detailed information about the object named '{object_name}' in the MinIO bucket '{bucket_name}'."
                    ),
                )
            ],
        )
    
    else:
        raise ValueError(f"Unknown prompt: {name}")

@server.list_tools()
async def handle_list_tools() -> List[types.Tool]:
    """
    List tools available for interacting with MinIO.
    """
    existing_tools = [
        types.Tool(
            name="list_buckets",
            description="List all buckets in the MinIO server.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False}
        ),
        types.Tool(
            name="read_bucket",
            description="Read the contents of a specific bucket.",
            inputSchema={
                "type": "object", 
                "properties": {
                    "bucket_name": {"type": "string", "description": "The bucket name."}
                },
                "required": ["bucket_name"],
                "additionalProperties": False
            }
        ),
        types.Tool(
            name="bucket_size",
            description="Calculate total size of a bucket.",
            inputSchema={
                "type": "object", 
                "properties": {
                    "bucket_name": {"type": "string", "description": "The bucket name."}
                },
                "required": ["bucket_name"],
                "additionalProperties": False
            }
        ),
        # New tools
        types.Tool(
            name="make_bucket",
            description="Create a new bucket in MinIO.",
            inputSchema={
                "type": "object", 
                "properties": {
                    "bucket_name": {"type": "string", "description": "The name of the bucket to create."}
                },
                "required": ["bucket_name"],
                "additionalProperties": False
            }
        ),
        types.Tool(
            name="remove_bucket",
            description="Remove a bucket from MinIO.",
            inputSchema={
                "type": "object", 
                "properties": {
                    "bucket_name": {"type": "string", "description": "The name of the bucket to remove."}
                },
                "required": ["bucket_name"],
                "additionalProperties": False
            }
        ),
        types.Tool(
            name="list_objects",
            description="List all objects in a bucket, including those in nested folders.",
            inputSchema={
                "type": "object", 
                "properties": {
                    "bucket_name": {"type": "string", "description": "The name of the bucket."},
                    "prefix": {
                        "type": "string", 
                        "description": "Optional prefix to filter objects (e.g., for a specific folder)."
                    }
                },
                "required": ["bucket_name"],
                "additionalProperties": False
            }
        ),
        types.Tool(
            name="fput_object",
            description="Upload a file to a MinIO bucket, with intelligent filename handling.",
            inputSchema={
                "type": "object", 
                "properties": {
                    "bucket_name": {"type": "string", "description": "The name of the bucket."},
                    "object_name": {
                        "type": "string", 
                        "description": "Optional. The name to give the object in the bucket. If not provided, uses the original filename."
                    },
                    "file_path": {"type": "string", "description": "Local file path of the file to upload."},
                    "prefix": {
                        "type": "string", 
                        "description": "Optional prefix/folder path within the bucket (e.g., 'data/documents')."
                    }
                },
                "required": ["bucket_name", "file_path"],
                "additionalProperties": False
            }
        ),
        types.Tool(
            name="fget_object",
            description="Download object(s) from a MinIO bucket, with flexible download options.",
            inputSchema={
                "type": "object", 
                "properties": {
                    "bucket_name": {"type": "string", "description": "The name of the bucket."},
                    "object_name": {
                        "type": "string", 
                        "description": "Optional. Specific object name to download. If not provided, uses prefix or downloads entire bucket."
                    },
                    "file_path": {"type": "string", "description": "Local file path or directory to save downloaded object(s)."},
                    "prefix": {
                        "type": "string", 
                        "description": "Optional prefix to filter and download objects (e.g., 'data/documents')."
                    }
                },
                "required": ["bucket_name", "file_path"],
                "additionalProperties": False
            }
        )
    ]
    return existing_tools

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: Optional[Dict[str, str]] = None
) -> List[types.TextContent]:
    """
    Execute a tool based on its name and arguments.
    """
    minio_client = get_minio_client()
    arguments = arguments or {}  # Ensure arguments is not None

    try:
        if name == "list_buckets":
            # List all buckets in MinIO
            buckets = list(minio_client.list_buckets())
            bucket_list = [
                {
                    "name": bucket.name,
                    "creation_date": str(bucket.creation_date),
                }
                for bucket in buckets
            ]
            return [types.TextContent(type="text", text=json.dumps(bucket_list, indent=2))]
        
        elif name == "read_bucket":
            # Read bucket contents
            bucket_name = arguments.get("bucket_name")
            if not bucket_name:
                raise ValueError("Bucket name is required.")
            
            objects = list(minio_client.list_objects(bucket_name))
            object_list = [
                {"object_name": obj.object_name, "size": obj.size} for obj in objects
            ]
            return [types.TextContent(type="text", text=json.dumps(object_list, indent=2))]
        
        elif name == "bucket_size":
            # Calculate total size of a bucket
            bucket_name = arguments.get("bucket_name")
            if not bucket_name:
                raise ValueError("Bucket name is required.")
            
            objects = list(minio_client.list_objects(bucket_name))
            total_size = sum(obj.size for obj in objects)
            
            return [types.TextContent(
                type="text", 
                text=json.dumps({
                    "bucket_name": bucket_name,
                    "total_objects": len(objects),
                    "total_size_bytes": total_size,
                    "total_size_mb": round(total_size / (1024 * 1024), 2)
                }, indent=2)
            )]
        
        elif name == "make_bucket":
            # Create a new bucket
            bucket_name = arguments.get("bucket_name")
            if not bucket_name:
                raise ValueError("Bucket name is required.")
            
            # Check if bucket already exists
            try:
                if minio_client.bucket_exists(bucket_name):
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "error",
                            "message": f"Bucket '{bucket_name}' already exists."
                        }, indent=2)
                    )]
                
                # Create the bucket
                minio_client.make_bucket(bucket_name)
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "success",
                        "message": f"Bucket '{bucket_name}' created successfully."
                    }, indent=2)
                )]
            except Exception as e:
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "error",
                        "message": f"Failed to create bucket: {str(e)}"
                    }, indent=2)
                )]
        
        elif name == "remove_bucket":
            # Remove a bucket
            bucket_name = arguments.get("bucket_name")
            if not bucket_name:
                raise ValueError("Bucket name is required.")
            
            try:
                # Check if bucket exists before attempting to remove
                if not minio_client.bucket_exists(bucket_name):
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "error",
                            "message": f"Bucket '{bucket_name}' does not exist."
                        }, indent=2)
                    )]
                
                # Remove all objects in the bucket first
                objects = minio_client.list_objects(bucket_name, recursive=True)
                for obj in objects:
                    minio_client.remove_object(bucket_name, obj.object_name)
                
                # Remove the bucket
                minio_client.remove_bucket(bucket_name)
                
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "success",
                        "message": f"Bucket '{bucket_name}' and all its contents removed successfully."
                    }, indent=2)
                )]
            except Exception as e:
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "error",
                        "message": f"Failed to remove bucket: {str(e)}"
                    }, indent=2)
                )]
        
        elif name == "list_objects":
            # List objects in a bucket, supporting nested folders
            bucket_name = arguments.get("bucket_name")
            prefix = arguments.get("prefix", "")
            
            if not bucket_name:
                raise ValueError("Bucket name is required.")
            
            try:
                # Check if bucket exists
                if not minio_client.bucket_exists(bucket_name):
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "error",
                            "message": f"Bucket '{bucket_name}' does not exist."
                        }, indent=2)
                    )]
                
                # List objects with optional prefix (for nested folders)
                objects = list(minio_client.list_objects(
                    bucket_name, 
                    prefix=prefix, 
                    recursive=True
                ))
                
                # Organize objects into a structured format
                object_list = [
                    {
                        "object_name": obj.object_name,
                        "size": obj.size,
                        "last_modified": str(obj.last_modified) if obj.last_modified else None,
                        "is_dir": obj.object_name.endswith('/')
                    } for obj in objects
                ]
                
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "bucket_name": bucket_name,
                        "prefix": prefix or "root",
                        "total_objects": len(object_list),
                        "objects": object_list
                    }, indent=2)
                )]
            except Exception as e:
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "error",
                        "message": f"Failed to list objects: {str(e)}"
                    }, indent=2)
                )]
        
        elif name == "fput_object":
            # Upload a file to a MinIO bucket with optional prefix and intelligent object naming
            bucket_name = arguments.get("bucket_name")
            object_name = arguments.get("object_name")
            file_path = arguments.get("file_path")
            prefix = arguments.get("prefix", "")
            
            # Validate inputs
            if not all([bucket_name, file_path]):
                raise ValueError("Bucket name and file path are required.")
            
            try:
                # Check if bucket exists
                if not minio_client.bucket_exists(bucket_name):
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "error",
                            "message": f"Bucket '{bucket_name}' does not exist."
                        }, indent=2)
                    )]
                
                # Check if file exists
                if not os.path.exists(file_path):
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "error",
                            "message": f"Local file '{file_path}' does not exist."
                        }, indent=2)
                    )]
                
                # Determine object name
                # If no object_name provided, use the original filename
                if not object_name:
                    object_name = os.path.basename(file_path)
                
                # Construct full object name with optional prefix
                # Ensure the full object name (including extension) is preserved
                full_object_name = f"{prefix.rstrip('/')}/{object_name}".lstrip('/')
                
                # Upload the file
                minio_client.fput_object(bucket_name, full_object_name, file_path)
                
                # Get file stats to return details
                file_stat = os.stat(file_path)
                
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "success",
                        "message": f"File uploaded successfully to bucket '{bucket_name}'.",
                        "details": {
                            "bucket_name": bucket_name,
                            "object_name": full_object_name,
                            "local_file_path": file_path,
                            "file_size_bytes": file_stat.st_size
                        }
                    }, indent=2)
                )]
            except Exception as e:
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "error",
                        "message": f"Failed to upload file: {str(e)}"
                    }, indent=2)
                )]
        
        elif name == "fget_object":
            # Download an object or entire prefix from a MinIO bucket
            bucket_name = arguments.get("bucket_name")
            object_name = arguments.get("object_name", "")  # Optional
            file_path = arguments.get("file_path")
            prefix = arguments.get("prefix", "")  # Optional prefix to download
            
            # Validate inputs
            if not all([bucket_name, file_path]):
                raise ValueError("Bucket name and file path are required.")
            
            try:
                # Check if bucket exists
                if not minio_client.bucket_exists(bucket_name):
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "error",
                            "message": f"Bucket '{bucket_name}' does not exist."
                        }, indent=2)
                    )]
                
                # Determine download strategy based on input
                if object_name:
                    # Download specific object
                    try:
                        minio_client.stat_object(bucket_name, object_name)
                    except Exception:
                        return [types.TextContent(
                            type="text", 
                            text=json.dumps({
                                "status": "error",
                                "message": f"Object '{object_name}' does not exist in bucket '{bucket_name}'."
                            }, indent=2)
                        )]
                    
                    # Download specific object
                    minio_client.fget_object(bucket_name, object_name, file_path)
                    file_stat = os.stat(file_path)
                    
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "success",
                            "message": f"File downloaded successfully from bucket '{bucket_name}'.",
                            "details": {
                                "bucket_name": bucket_name,
                                "object_name": object_name,
                                "local_file_path": file_path,
                                "file_size_bytes": file_stat.st_size
                            }
                        }, indent=2)
                    )]
                
                elif prefix:
                    # Download entire prefix
                    objects = list(minio_client.list_objects(
                        bucket_name, 
                        prefix=prefix, 
                        recursive=True
                    ))
                    
                    if not objects:
                        return [types.TextContent(
                            type="text", 
                            text=json.dumps({
                                "status": "error",
                                "message": f"No objects found with prefix '{prefix}' in bucket '{bucket_name}'."
                            }, indent=2)
                        )]
                    
                    # Ensure the destination directory exists
                    os.makedirs(file_path, exist_ok=True)
                    
                    downloaded_files = []
                    for obj in objects:
                        # Skip directory placeholders
                        if obj.object_name.endswith('/'):
                            continue
                        
                        # Maintain folder structure
                        relative_path = obj.object_name[len(prefix):].lstrip('/')
                        dest_path = os.path.join(file_path, relative_path)
                        
                        # Create necessary subdirectories
                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                        
                        # Download object
                        minio_client.fget_object(bucket_name, obj.object_name, dest_path)
                        
                        downloaded_files.append({
                            "object_name": obj.object_name,
                            "local_path": dest_path,
                            "size": obj.size
                        })
                    
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "success",
                            "message": f"Downloaded {len(downloaded_files)} files from prefix '{prefix}' in bucket '{bucket_name}'.",
                            "details": {
                                "bucket_name": bucket_name,
                                "prefix": prefix,
                                "local_destination": file_path,
                                "downloaded_files": downloaded_files
                            }
                        }, indent=2)
                    )]
                
                else:
                    # If no object_name or prefix specified, download entire bucket
                    objects = list(minio_client.list_objects(bucket_name, recursive=True))
                    
                    if not objects:
                        return [types.TextContent(
                            type="text", 
                            text=json.dumps({
                                "status": "error",
                                "message": f"No objects found in bucket '{bucket_name}'."
                            }, indent=2)
                        )]
                    
                    # Ensure the destination directory exists
                    os.makedirs(file_path, exist_ok=True)
                    
                    downloaded_files = []
                    for obj in objects:
                        # Skip directory placeholders
                        if obj.object_name.endswith('/'):
                            continue
                        
                        # Maintain folder structure
                        dest_path = os.path.join(file_path, obj.object_name)
                        
                        # Create necessary subdirectories
                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                        
                        # Download object
                        minio_client.fget_object(bucket_name, obj.object_name, dest_path)
                        
                        downloaded_files.append({
                            "object_name": obj.object_name,
                            "local_path": dest_path,
                            "size": obj.size
                        })
                    
                    return [types.TextContent(
                        type="text", 
                        text=json.dumps({
                            "status": "success",
                            "message": f"Downloaded {len(downloaded_files)} files from bucket '{bucket_name}'.",
                            "details": {
                                "bucket_name": bucket_name,
                                "local_destination": file_path,
                                "downloaded_files": downloaded_files
                            }
                        }, indent=2)
                    )]
            
            except Exception as e:
                return [types.TextContent(
                    type="text", 
                    text=json.dumps({
                        "status": "error",
                        "message": f"Failed to download file(s): {str(e)}"
                    }, indent=2)
                )]
        
        else:
            raise ValueError(f"Unknown tool: {name}")
    except Exception as e:
        logger.error(f"Error in tool {name}: {str(e)}")
        raise

async def main():
    """
    Main entry point for the MCP server tool.
    """
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="minIO",
                server_version="0.3.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())