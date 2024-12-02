# AWS MCP Server

An MCP server implementation for AWS operations, supporting S3 and DynamoDB services. All operations are automatically logged and can be accessed through the `audit://aws-operations` resource endpoint.

## Setup

1. Install dependencies
2. Configure AWS credentials using either:
   - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
   - AWS credentials file
3. Run the server

## Available Tools

### S3 Operations

- **s3_bucket_create**: Create a new S3 bucket
  - Required: `bucket_name`

- **s3_bucket_list**: List all S3 buckets

- **s3_bucket_delete**: Delete an S3 bucket
  - Required: `bucket_name`

- **s3_object_upload**: Upload an object to S3
  - Required: `bucket_name`, `object_key`, `file_content` (Base64 encoded)

- **s3_object_delete**: Delete an object from S3
  - Required: `bucket_name`, `object_key`

- **s3_object_list**: List objects in an S3 bucket
  - Required: `bucket_name`

- **s3_object_read**: Read an object's content from S3
  - Required: `bucket_name`, `object_key`

### DynamoDB Operations

#### Table Operations
- **dynamodb_table_create**: Create a new DynamoDB table
  - Required: `table_name`, `key_schema`, `attribute_definitions`

- **dynamodb_table_describe**: Get details about a DynamoDB table
  - Required: `table_name`

- **dynamodb_table_list**: List all DynamoDB tables

- **dynamodb_table_delete**: Delete a DynamoDB table
  - Required: `table_name`

- **dynamodb_table_update**: Update a DynamoDB table
  - Required: `table_name`, `attribute_definitions`

#### Item Operations
- **dynamodb_item_put**: Put an item into a DynamoDB table
  - Required: `table_name`, `item`

- **dynamodb_item_get**: Get an item from a DynamoDB table
  - Required: `table_name`, `key`

- **dynamodb_item_update**: Update an item in a DynamoDB table
  - Required: `table_name`, `key`, `item`

- **dynamodb_item_delete**: Delete an item from a DynamoDB table
  - Required: `table_name`, `key`

- **dynamodb_item_query**: Query items in a DynamoDB table
  - Required: `table_name`, `key_condition`, `expression_values`

- **dynamodb_item_scan**: Scan items in a DynamoDB table
  - Required: `table_name`
  - Optional: `filter_expression`, `expression_attributes` (with `values` and `names`)

#### Batch Operations
- **dynamodb_batch_get**: Batch get multiple items from DynamoDB tables
  - Required: `request_items`

- **dynamodb_item_batch_write**: Batch write operations (put/delete) for DynamoDB items
  - Required: `table_name`, `operation` (put/delete), `items`
  - Optional: `key_attributes` (for delete operations)

- **dynamodb_batch_execute**: Execute multiple PartiQL statements in a batch
  - Required: `statements`, `parameters`

#### TTL Operations
- **dynamodb_describe_ttl**: Get the TTL settings for a table
  - Required: `table_name`

- **dynamodb_update_ttl**: Update the TTL settings for a table
  - Required: `table_name`, `ttl_enabled`, `ttl_attribute`

## Configuration

The server requires AWS credentials to be configured in one of these ways:
- Environment variables: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
- Default AWS credential chain (e.g., AWS CLI configuration)

Additional configuration:
- AWS_REGION (defaults to "us-east-1")

## Quickstart

### Install

#### Claude Desktop

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

<details>
  <summary>Development/Unpublished Servers Configuration</summary>
  ```
  "mcpServers": {
    "mcp-server-aws": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/repo/servers/src/aws",
        "run",
        "mcp-server-aws"
      ]
    }
  }
  ```
</details>
