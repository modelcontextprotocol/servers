import os
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Sequence
from functools import lru_cache

import boto3
import asyncio
from dotenv import load_dotenv
import mcp.server.stdio
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
from mcp.types import Resource, Tool, TextContent, ImageContent, EmbeddedResource
from pydantic import AnyUrl

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aws-mcp-server")


class AWSManager:
    def __init__(self):
        self.audit_entries: list[dict] = []

    @lru_cache(maxsize=None)
    def get_boto3_client(self, service_name: str, region_name: str = None):
        """Get a boto3 client using explicit credentials if available"""
        try:
            region_name = region_name or os.getenv("AWS_REGION", "us-east-1")
            if not region_name:
                raise ValueError(
                    "AWS region is not specified and not set in the environment.")

            aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

            if aws_access_key and aws_secret_key:
                logger.debug("Using explicit AWS credentials")
                session = boto3.Session(
                    aws_access_key_id=aws_access_key,
                    aws_secret_access_key=aws_secret_key,
                    region_name=region_name
                )
            else:
                logger.debug("Using default AWS credential chain")
                session = boto3.Session(region_name=region_name)

            return session.client(service_name)
        except Exception as e:
            logger.error(f"Failed to create boto3 client for {
                         service_name}: {e}")
            raise RuntimeError(f"Failed to create boto3 client: {e}")

    async def run_aws_command(self, command: list[str]) -> str:
        """Execute AWS CLI command and return output"""
        process = await asyncio.create_subprocess_exec(
            'aws', *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        output, error = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(f"AWS CLI command failed: {error.decode()}")

        return output.decode()

    def _synthesize_audit_log(self) -> str:
        """Generate formatted audit log from entries"""
        if not self.audit_entries:
            return "No AWS operations have been performed yet."

        report = "📋 AWS Operations Audit Log 📋\n\n"
        for entry in self.audit_entries:
            report += f"[{entry['timestamp']}]\n"
            report += f"Service: {entry['service']}\n"
            report += f"Operation: {entry['operation']}\n"
            report += f"Parameters: {json.dumps(
                entry['parameters'], indent=2)}\n"
            report += "-" * 50 + "\n"

        return report

    def log_operation(self, service: str, operation: str, parameters: dict) -> None:
        """Log an AWS operation to the audit log"""
        audit_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "service": service,
            "operation": operation,
            "parameters": parameters
        }
        self.audit_entries.append(audit_entry)


async def main():
    logger.info("Starting AWS MCP Server")

    aws = AWSManager()
    server = Server("aws-mcp-server")

    # Register handlers
    logger.debug("Registering handlers")

    @server.list_resources()
    async def handle_list_resources() -> list[Resource]:
        logger.debug("Handling list_resources request")
        return [
            Resource(
                uri=AnyUrl("audit://aws-operations"),
                name="AWS Operations Audit Log",
                description="A log of all AWS operations performed through this server",
                mimeType="text/plain",
            )
        ]

    @server.read_resource()
    async def handle_read_resource(uri: AnyUrl) -> str:
        logger.debug(f"Handling read_resource request for URI: {uri}")
        if uri.scheme != "audit":
            raise ValueError(f"Unsupported URI scheme: {uri.scheme}")

        path = str(uri).replace("audit://", "")
        if path != "aws-operations":
            raise ValueError(f"Unknown resource path: {path}")

        return aws._synthesize_audit_log()

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available AWS tools"""
        return [
            Tool(
                name="aws_operation",
                description="Perform AWS operations using the AWS CLI",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "service": {
                            "type": "string",
                            "description": "AWS service (e.g., ec2, rds, s3)"
                        },
                        "operation": {
                            "type": "string",
                            "description": "Operation to perform (e.g., create-instance, describe-instances)"
                        },
                        "parameters": {
                            "type": "object",
                            "description": "Operation parameters as key-value pairs"
                        }
                    },
                    "required": ["service", "operation", "parameters"]
                }
            ),
            Tool(
                name="s3_bucket_operation",
                description="Manage S3 buckets (create, read, update, delete)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "operation": {
                            "type": "string",
                            "enum": ["create", "list", "delete"],
                            "description": "Operation to perform on S3 bucket"
                        },
                        "bucket_name": {
                            "type": "string",
                            "description": "Name of the S3 bucket"
                        }
                    },
                    "required": ["operation", "bucket_name"]
                }
            ),
            Tool(
                name="s3_object_operation",
                description="Manage objects within S3 buckets (upload, download, delete)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "operation": {
                            "type": "string",
                            "enum": ["upload", "download", "delete", "list"],
                            "description": "Operation to perform on S3 object"
                        },
                        "bucket_name": {
                            "type": "string",
                            "description": "Name of the S3 bucket"
                        },
                        "object_key": {
                            "type": "string",
                            "description": "Key/path of the object in the bucket"
                        },
                        "file_path": {
                            "type": "string",
                            "description": "Local file path (for upload/download operations)"
                        }
                    },
                    "required": ["operation", "bucket_name"]
                }
            ),
            Tool(
                name="dynamodb_table_operation",
                description="Manage DynamoDB tables (create, read, update, delete)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "operation": {
                            "type": "string",
                            "enum": ["create", "describe", "list", "delete", "update"],
                            "description": "Operation to perform on DynamoDB table"
                        },
                        "table_name": {
                            "type": "string",
                            "description": "Name of the DynamoDB table"
                        },
                        "key_schema": {
                            "type": "array",
                            "description": "Key schema for table creation"
                        },
                        "attribute_definitions": {
                            "type": "array",
                            "description": "Attribute definitions for table creation"
                        }
                    },
                    "required": ["operation", "table_name"]
                }
            ),
            Tool(
                name="dynamodb_item_operation",
                description="Manage items in DynamoDB tables (create, read, update, delete)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "operation": {
                            "type": "string",
                            "enum": ["put", "get", "update", "delete", "query", "scan"],
                            "description": "Operation to perform on DynamoDB items"
                        },
                        "table_name": {
                            "type": "string",
                            "description": "Name of the DynamoDB table"
                        },
                        "item": {
                            "type": "object",
                            "description": "Item data for put/update operations"
                        },
                        "key": {
                            "type": "object",
                            "description": "Key to identify the item"
                        }
                    },
                    "required": ["operation", "table_name"]
                }
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: Any) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """Handle AWS tool operations"""
        if not isinstance(arguments, dict):
            raise ValueError("Invalid arguments")

        try:
            if name == "aws_operation":
                service = arguments["service"]
                operation = arguments["operation"]
                parameters = arguments["parameters"]

                aws.log_operation(service, operation, parameters)

                cli_params = []
                for key, value in parameters.items():
                    param_key = f"--{key.replace('_', '-')}"
                    if isinstance(value, bool):
                        if value:
                            cli_params.append(param_key)
                    elif isinstance(value, (list, dict)):
                        cli_params.extend([param_key, json.dumps(value)])
                    else:
                        cli_params.extend([param_key, str(value)])

                command = [service, operation] + cli_params
                output = await aws.run_aws_command(command)

                return [TextContent(type="text", text=f"AWS CLI Operation Result:\n\nCommand: aws {' '.join(command)}\n\nOutput:\n{output}")]

            elif name == "s3_bucket_operation":
                s3_client = aws.get_boto3_client('s3')
                operation = arguments["operation"]
                bucket_name = arguments["bucket_name"]

                aws.log_operation("s3", operation, {
                                  "bucket_name": bucket_name})

                if operation == "create":
                    response = s3_client.create_bucket(Bucket=bucket_name)
                elif operation == "list":
                    response = s3_client.list_buckets()
                elif operation == "delete":
                    response = s3_client.delete_bucket(Bucket=bucket_name)
                else:
                    raise ValueError(
                        f"Invalid S3 bucket operation: {operation}")

                return [TextContent(type="text", text=f"S3 Bucket Operation Result:\n{json.dumps(response, indent=2)}")]

            elif name == "s3_object_operation":
                s3_client = aws.get_boto3_client('s3')
                operation = arguments["operation"]
                bucket_name = arguments["bucket_name"]
                object_key = arguments.get("object_key")

                aws.log_operation("s3", f"object_{operation}", arguments)

                if operation == "upload":
                    file_path = arguments["file_path"]
                    response = s3_client.upload_file(
                        file_path, bucket_name, object_key)
                elif operation == "download":
                    file_path = arguments["file_path"]
                    response = s3_client.download_file(
                        bucket_name, object_key, file_path)
                elif operation == "delete":
                    response = s3_client.delete_object(
                        Bucket=bucket_name, Key=object_key)
                elif operation == "list":
                    response = s3_client.list_objects_v2(Bucket=bucket_name)
                else:
                    raise ValueError(
                        f"Invalid S3 object operation: {operation}")

                return [TextContent(type="text", text=f"S3 Object Operation Result:\n{json.dumps(response, indent=2)}")]

            elif name == "dynamodb_table_operation":
                dynamodb_client = aws.get_boto3_client('dynamodb')
                operation = arguments["operation"]
                table_name = arguments["table_name"]

                aws.log_operation("dynamodb", f"table_{operation}", arguments)

                if operation == "create":
                    response = dynamodb_client.create_table(
                        TableName=table_name,
                        KeySchema=arguments["key_schema"],
                        AttributeDefinitions=arguments["attribute_definitions"],
                        BillingMode="PAY_PER_REQUEST"
                    )
                elif operation == "describe":
                    response = dynamodb_client.describe_table(
                        TableName=table_name)
                elif operation == "list":
                    response = dynamodb_client.list_tables()
                elif operation == "delete":
                    response = dynamodb_client.delete_table(
                        TableName=table_name)
                elif operation == "update":
                    response = dynamodb_client.update_table(
                        TableName=table_name,
                        AttributeDefinitions=arguments.get(
                            "attribute_definitions", [])
                    )
                else:
                    raise ValueError(
                        f"Invalid DynamoDB table operation: {operation}")

                return [TextContent(type="text", text=f"DynamoDB Table Operation Result:\n{json.dumps(response, indent=2)}")]

            elif name == "dynamodb_item_operation":
                dynamodb_client = aws.get_boto3_client('dynamodb')
                operation = arguments["operation"]
                table_name = arguments["table_name"]

                aws.log_operation("dynamodb", f"item_{operation}", arguments)

                if operation == "put":
                    response = dynamodb_client.put_item(
                        TableName=table_name,
                        Item=arguments["item"]
                    )
                elif operation == "get":
                    response = dynamodb_client.get_item(
                        TableName=table_name,
                        Key=arguments["key"]
                    )
                elif operation == "update":
                    response = dynamodb_client.update_item(
                        TableName=table_name,
                        Key=arguments["key"],
                        AttributeUpdates=arguments["item"]
                    )
                elif operation == "delete":
                    response = dynamodb_client.delete_item(
                        TableName=table_name,
                        Key=arguments["key"]
                    )
                elif operation == "query":
                    response = dynamodb_client.query(
                        TableName=table_name,
                        KeyConditionExpression=arguments.get("key_condition"),
                        ExpressionAttributeValues=arguments.get(
                            "expression_values")
                    )
                elif operation == "scan":
                    response = dynamodb_client.scan(TableName=table_name)
                else:
                    raise ValueError(
                        f"Invalid DynamoDB item operation: {operation}")

                return [TextContent(type="text", text=f"DynamoDB Item Operation Result:\n{json.dumps(response, indent=2)}")]

            else:
                raise ValueError(f"Unknown tool: {name}")

        except Exception as e:
            logger.error(f"Operation failed: {str(e)}")
            raise RuntimeError(f"Operation failed: {str(e)}")

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        logger.info("Server running with stdio transport")
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="aws",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    asyncio.run(main())
