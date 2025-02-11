# azure_server.py
import os
import json
import logging
from datetime import datetime
from typing import Any, Sequence
from functools import lru_cache
import base64
import io
import asyncio
from dotenv import load_dotenv
import mcp.server.stdio
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
from mcp.types import Resource, Tool, TextContent, ImageContent, EmbeddedResource
from pydantic import AnyUrl

from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient
from azure.cosmos import CosmosClient
from mcp_server_azure.azure_tools import get_azure_tools
from mcp_server_azure.azure_utils import (
    get_cosmosdb_type,
)  # Assuming you choose Cosmos DB

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("azure-mcp-server")


def custom_json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class AzureResourceManager:
    def __init__(self):
        logger.info("Initializing AzureResourceManager")
        self.audit_entries: list[dict] = []
        self.credential = (
            DefaultAzureCredential()
        )  # Use DefaultAzureCredential for simpler auth

    @lru_cache(maxsize=None)
    def get_blob_service_client(
        self, account_url: str | None = None
    ) -> BlobServiceClient:
        """Get an Azure Blob Service client."""
        try:
            logger.info(f"Creating BlobServiceClient for account: {account_url}")
            account_url = account_url or os.getenv("AZURE_STORAGE_ACCOUNT_URL")
            if not account_url:
                raise ValueError(
                    "Azure Storage Account URL is not specified and not set in the environment."
                )

            return BlobServiceClient(
                account_url=account_url, credential=self.credential
            )
        except Exception as e:
            logger.error(f"Failed to create BlobServiceClient: {e}")
            raise RuntimeError(f"Failed to create BlobServiceClient: {e}")

    @lru_cache(maxsize=None)
    def get_cosmos_client(
        self,
        endpoint: str | None = None,
        key: str | None = None,
        url: str | None = None,
    ) -> CosmosClient:
        """Get an Azure Cosmos DB client."""
        try:
            logger.info(f"Creating CosmosClient for endpoint: {endpoint}")
            url = url or os.getenv("AZURE_COSMOSDB_URL")
            endpoint = endpoint or os.getenv("AZURE_COSMOSDB_ENDPOINT")
            key = key or os.getenv("AZURE_COSMOSDB_KEY")
            url = str(url)
            if not endpoint or not key:
                raise ValueError(
                    "Azure Cosmos DB Endpoint or Key is not specified and not set in the environment."
                )

            return CosmosClient(endpoint=endpoint, credential=key, url=url)
        except Exception as e:
            logger.error(f"Failed to create CosmosClient: {e}")
            raise RuntimeError(f"Failed to create CosmosClient: {e}")

    def _synthesize_audit_log(self) -> str:
        """Generate formatted audit log from entries"""
        logger.debug("Synthesizing audit log")
        if not self.audit_entries:
            return "No Azure operations have been performed yet."

        report = "📋 Azure Operations Audit Log 📋\n\n"
        for entry in self.audit_entries:
            report += f"[{entry['timestamp']}]\n"
            report += f"Service: {entry['service']}\n"
            report += f"Operation: {entry['operation']}\n"
            report += f"Parameters: {json.dumps(
                entry['parameters'], indent=2)}\n"
            report += "-" * 50 + "\n"

        return report

    def log_operation(self, service: str, operation: str, parameters: dict) -> None:
        """Log an Azure operation to the audit log"""
        logger.info(f"Logging operation - Service: {service}, Operation: {operation}")
        audit_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "service": service,
            "operation": operation,
            "parameters": parameters,
        }
        self.audit_entries.append(audit_entry)


async def main():
    logger.info("Starting Azure MCP Server")

    azure_rm = AzureResourceManager()  # Rename AWSManager to AzureResourceManager
    server = Server("azure-mcp-server")  # Rename server name

    logger.debug("Registering handlers")

    @server.list_resources()
    async def handle_list_resources() -> list[Resource]:
        logger.debug("Handling list_resources request")
        return [
            Resource(
                uri=AnyUrl("audit://azure-operations"),  # Update URI scheme and path
                name="Azure Operations Audit Log",  # Update name
                description="A log of all Azure operations performed through this server",  # Update description
                mimeType="text/plain",
            )
        ]

    @server.read_resource()
    async def handle_read_resource(uri: AnyUrl) -> str:
        logger.debug(f"Handling read_resource request for URI: {uri}")
        if uri.scheme != "audit":
            logger.error(f"Unsupported URI scheme: {uri.scheme}")
            raise ValueError(f"Unsupported URI scheme: {uri.scheme}")

        path = str(uri).replace("audit://", "")
        if path != "azure-operations":  # Update resource path
            logger.error(f"Unknown resource path: {path}")
            raise ValueError(f"Unknown resource path: {path}")

        return azure_rm._synthesize_audit_log()  # Use AzureResourceManager

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available Azure tools"""
        logger.debug("Handling list_tools request")
        return get_azure_tools()  # Use get_azure_tools

    async def handle_blob_storage_operations(
        azure_rm: AzureResourceManager, name: str, arguments: dict
    ) -> list[TextContent]:
        """Handle Azure Blob Storage operations"""
        blob_service_client = azure_rm.get_blob_service_client()
        response = None

        if name == "blob_container_create":
            container_client = blob_service_client.create_container(
                arguments["container_name"]
            )
            response = {
                "container_name": container_client.container_name,
                "created": True,
            }  # Simplify response
        elif name == "blob_container_list":
            containers = blob_service_client.list_containers()
            container_names = [container.name for container in containers]
            response = {"container_names": container_names}
        elif name == "blob_container_delete":
            blob_service_client.delete_container(arguments["container_name"])
            response = {"container_name": arguments["container_name"], "deleted": True}
        elif name == "blob_upload":
            blob_client = blob_service_client.get_blob_client(
                container=arguments["container_name"], blob=arguments["blob_name"]
            )
            decoded_content = base64.b64decode(arguments["file_content"])
            blob_client.upload_blob(decoded_content, overwrite=True)
            response = {"blob_name": arguments["blob_name"], "uploaded": True}
        elif name == "blob_delete":
            blob_client = blob_service_client.get_blob_client(
                container=arguments["container_name"], blob=arguments["blob_name"]
            )
            blob_client.delete_blob()
            response = {"blob_name": arguments["blob_name"], "deleted": True}
        elif name == "blob_list":
            container_client = blob_service_client.get_container_client(
                arguments["container_name"]
            )
            blob_list = container_client.list_blobs()
            blob_names = [blob.name for blob in blob_list]
            response = {"blob_names": blob_names}
        elif name == "blob_read":
            blob_client = blob_service_client.get_blob_client(
                container=arguments["container_name"], blob=arguments["blob_name"]
            )
            downloader = blob_client.download_blob()
            content = downloader.readall().decode("utf-8")
            return [TextContent(type="text", text=content)]
        else:
            raise ValueError(f"Unknown Blob Storage operation: {name}")

        azure_rm.log_operation(
            "blob_storage", name.replace("blob_", ""), arguments
        )  # Update service name in log
        return [
            TextContent(
                type="text",
                text=f"Operation Result:\n{json.dumps(response, indent=2, default=custom_json_serializer)}",
            )
        ]

    async def handle_cosmosdb_operations(
        azure_rm: AzureResourceManager, name: str, arguments: dict
    ) -> list[TextContent]:
        """Handle Azure Cosmos DB operations (NoSQL API)"""
        cosmos_client = azure_rm.get_cosmos_client()
        logger.log(cosmos_client)
        database = cosmos_client.get_database_client(
            arguments.get("database_name", "SampleDB")
        )  # Assuming a default db
        response = None

        if name == "cosmosdb_container_create":  # Renamed from table to container
            container = database.create_container(
                id=arguments["container_name"], partition_key=arguments["partition_key"]
            )
            response = {"container_id": container.id, "created": True}
        elif name == "cosmosdb_container_describe":  # Renamed from table to container
            container = database.get_container_client(arguments["container_name"])
            container_properties = container.read()
            response = container_properties
        elif name == "cosmosdb_container_list":  # Renamed from table to container
            containers = list(database.list_containers())
            container_names = [c["id"] for c in containers]
            response = {"container_names": container_names}
        elif name == "cosmosdb_container_delete":  # Renamed from table to container
            database.delete_container(arguments["container_name"])
            response = {"container_name": arguments["container_name"], "deleted": True}
        elif (
            name == "cosmosdb_item_create"
        ):  # Renamed from put to create, and table to container
            container_client = database.get_container_client(
                arguments["container_name"]
            )
            item = container_client.create_item(body=arguments["item"])
            response = {"item_id": item["id"], "created": True}
        elif (
            name == "cosmosdb_item_read"
        ):  # Renamed from get to read, and table to container
            container_client = database.get_container_client(
                arguments["container_name"]
            )
            item = container_client.read_item(
                item=arguments["item_id"], partition_key=arguments["partition_key"]
            )
            response = item
        elif (
            name == "cosmosdb_item_replace"
        ):  # Renamed from update to replace, and table to container, using replace_item for full replace
            container_client = database.get_container_client(
                arguments["container_name"]
            )
            item = container_client.replace_item(
                item=arguments["item_id"], body=arguments["item"]
            )
            response = {"item_id": item["id"], "replaced": True}
        elif name == "cosmosdb_item_delete":  # Renamed table to container
            container_client = database.get_container_client(
                arguments["container_name"]
            )
            container_client.delete_item(
                item=arguments["item_id"], partition_key=arguments["partition_key"]
            )
            response = {"item_id": arguments["item_id"], "deleted": True}
        elif (
            name == "cosmosdb_item_query"
        ):  # Renamed table to container, simplified query
            container_client = database.get_container_client(
                arguments["container_name"]
            )
            items = list(
                container_client.query_items(
                    query=arguments["query"],
                    parameters=arguments.get("parameters", []),  # Optional parameters
                )
            )
            response = {"items": items}
        else:
            raise ValueError(f"Unknown Cosmos DB operation: {name}")

        azure_rm.log_operation(
            "cosmosdb", name.replace("cosmosdb_", ""), arguments
        )  # Update service name in log
        return [
            TextContent(
                type="text",
                text=f"Operation Result:\n{json.dumps(response, indent=2, default=custom_json_serializer)}",
            )
        ]

    @server.call_tool()
    async def call_tool(
        name: str, arguments: Any
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """Handle Azure tool operations"""
        logger.info(f"Handling tool call: {name}")
        logger.debug(f"Tool arguments: {arguments}")

        if not isinstance(arguments, dict):
            logger.error("Invalid arguments: not a dictionary")
            raise ValueError("Invalid arguments")

        try:
            if name.startswith("blob_"):  # Updated prefix to blob_
                return await handle_blob_storage_operations(
                    azure_rm, name, arguments
                )  # Use blob handler
            elif name.startswith("cosmosdb_"):  # Updated prefix to cosmosdb_
                return await handle_cosmosdb_operations(
                    azure_rm, name, arguments
                )  # Use cosmosdb handler
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
                server_name="mcp-server-azure",  # Updated server name
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())
