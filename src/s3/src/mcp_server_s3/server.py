import boto3

import mcp.server.stdio
import mcp.types as types
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions


async def serve() -> None:
    s3_client = boto3.client("s3")

    server = Server("s3")

    @server.list_tools()
    async def handle_list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="ListBuckets",  # https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBuckets.html
                description="Returns a list of all buckets owned by the authenticated sender of the request. To grant IAM permission to use this operation, you must add the s3:ListAllMyBuckets policy action.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "ContinuationToken": {
                            "type": "string",
                            "description": "ContinuationToken indicates to Amazon S3 that the list is being continued on this bucket with a token. ContinuationToken is obfuscated and is not a real key. You can use this ContinuationToken for pagination of the list results. Length Constraints: Minimum length of 0. Maximum length of 1024.",
                        },
                        "MaxBuckets": {
                            "type": "integer",
                            "description": "Maximum number of buckets to be returned in response. When the number is more than the count of buckets that are owned by an AWS account, return all the buckets in response. Valid Range: Minimum value of 1. Maximum value of 10000.",
                        },
                    },
                    "required": [],
                },
            ),
            types.Tool(
                name="ListObjectsV2",  # https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
                description="Returns some or all (up to 1,000) of the objects in a bucket with each request. You can use the request parameters as selection criteria to return a subset of the objects in a bucket. To get a list of your buckets, see ListBuckets.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "Bucket": {
                            "type": "string",
                            "description": "When you use this operation with a directory bucket, you must use virtual-hosted-style requests in the format Bucket_name.s3express-az_id.region.amazonaws.com. Path-style requests are not supported. Directory bucket names must be unique in the chosen Availability Zone. Bucket names must follow the format bucket_base_name--az-id--x-s3 (for example, DOC-EXAMPLE-BUCKET--usw2-az1--x-s3).",
                        },
                        "ContinuationToken": {
                            "type": "string",
                            "description": "ContinuationToken indicates to Amazon S3 that the list is being continued on this bucket with a token. ContinuationToken is obfuscated and is not a real key. You can use this ContinuationToken for pagination of the list results.",
                        },
                        "FetchOwner": {
                            "type": "boolean",
                            "description": "The owner field is not present in ListObjectsV2 by default. If you want to return the owner field with each key in the result, then set the FetchOwner field to true.",
                        },
                        "MaxKeys": {
                            "type": "integer",
                            "description": "Sets the maximum number of keys returned in the response. By default, the action returns up to 1,000 key names. The response might contain fewer keys but will never contain more.",
                        },
                        "Prefix": {
                            "type": "string",
                            "description": "Limits the response to keys that begin with the specified prefix.",
                        },
                        "StartAfter": {
                            "type": "string",
                            "description": "StartAfter is where you want Amazon S3 to start listing from. Amazon S3 starts listing after this specified key. StartAfter can be any key in the bucket.",
                        },
                    },
                    "required": ["Bucket"],
                },
            ),
            types.Tool(
                name="GetObject",  # https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
                description="Retrieves an object from Amazon S3. In the GetObject request, specify the full key name for the object. General purpose buckets - Both the virtual-hosted-style requests and the path-style requests are supported. For a virtual hosted-style request example, if you have the object photos/2006/February/sample.jpg, specify the object key name as /photos/2006/February/sample.jpg. For a path-style request example, if you have the object photos/2006/February/sample.jpg in the bucket named examplebucket, specify the object key name as /examplebucket/photos/2006/February/sample.jpg.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "Bucket": {
                            "type": "string",
                            "description": "Directory buckets - When you use this operation with a directory bucket, you must use virtual-hosted-style requests in the format Bucket_name.s3express-az_id.region.amazonaws.com. Path-style requests are not supported. Directory bucket names must be unique in the chosen Availability Zone. Bucket names must follow the format bucket_base_name--az-id--x-s3 (for example, DOC-EXAMPLE-BUCKET--usw2-az1--x-s3).",
                        },
                        "Key": {
                            "type": "string",
                            "description": "Key of the object to get. Length Constraints: Minimum length of 1.",
                        },
                        "Range": {
                            "type": "string",
                            "description": "Downloads the specified byte range of an object.",
                        },
                        "VersionId": {
                            "type": "string",
                            "description": "Version ID used to reference a specific version of the object. By default, the GetObject operation returns the current version of an object. To return a different version, use the versionId subresource.",
                        },
                    },
                    "required": ["Bucket", "Key"],
                },
            ),
        ]

    @server.call_tool()
    async def handle_call_tool(
        name: str, arguments: dict | None
    ) -> list[types.TextContent]:
        try:
            match name:
                case "ListBuckets":
                    buckets = s3_client.list_buckets(**arguments)
                    return [types.TextContent(type="text", text=str(buckets))]
                case "ListObjectsV2":
                    objects = s3_client.list_objects_v2(**arguments)
                    return [types.TextContent(type="text", text=str(objects))]
                case "GetObject":
                    response = s3_client.get_object(**arguments)
                    object_content = response["Body"].read().decode("utf-8")
                    return [types.TextContent(type="text", text=str(object_content))]
                case _:
                    raise ValueError(f"Unknown tool: {name}")
        except Exception as error:
            return [types.TextContent(type="text", text=f"Error: {str(error)}")]

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="s3-mcp-server",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )
