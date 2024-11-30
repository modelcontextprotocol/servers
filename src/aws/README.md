# mcp-server-aws MCP server

This directory contains a Model Context Protocol server providing tools to read and manipulate AWS resources using an LLM. 

Overview of functionality:
- Create, list, and delete S3 buckets
- Create, list, and delete DynamoDB tables, as well as modify data within them
- Pull Cloudwatch logs
- View an audit log of all actions taken

## Components

### Resources

The server implements an audit logging system with:
- Custom audit:// URI scheme for accessing AWS operations log
- Audit log resource contains timestamped entries of all AWS operations performed
- Each entry includes service name, operation type, and parameters used

### Tools

The server implements several AWS management tools:

1. aws_operation
   - General-purpose AWS CLI command executor
   - Takes service, operation, and parameters as arguments
   - Converts parameters to appropriate CLI format

2. s3_bucket_operation
   - Manage S3 buckets
   - Operations: create, list, delete
   - Takes bucket_name as required parameter

3. s3_object_operation
   - Manage objects within S3 buckets
   - Operations: upload, download, delete, list
   - Required parameters: operation, bucket_name
   - Optional parameters: object_key, file_path (for upload/download)

4. dynamodb_table_operation
   - Manage DynamoDB tables
   - Operations: create, describe, list, delete, update
   - Required parameters: operation, table_name
   - Optional parameters: key_schema, attribute_definitions (for create/update)

5. dynamodb_item_operation
   - Manage items in DynamoDB tables
   - Operations: put, get, update, delete, query, scan
   - Required parameters: operation, table_name
   - Optional parameters: item, key, key_condition, expression_values

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

<details>
  <summary>Published Servers Configuration</summary>
  ```
  "mcpServers": {
    "mcp-server-aws": {
      "command": "uvx",
      "args": [
        "mcp-server-aws"
      ]

    }
  }
  ```
</details>

## Development

### Building and Publishing

To prepare the package for distribution:

1. Sync dependencies and update lockfile:
```bash
uv sync
```

2. Build package distributions:
```bash
uv build
```

This will create source and wheel distributions in the `dist/` directory.

3. Publish to PyPI:
```bash
uv publish
```

Note: You'll need to set PyPI credentials via environment variables or command flags:
- Token: `--token` or `UV_PUBLISH_TOKEN`
- Or username/password: `--username`/`UV_PUBLISH_USERNAME` and `--password`/`UV_PUBLISH_PASSWORD`

### Debugging

Since MCP servers run over stdio, debugging can be challenging. For the best debugging
experience, we strongly recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector).

You can launch the MCP Inspector via [`npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) with this command:

```bash
npx @modelcontextprotocol/inspector uv --directory /Users/rishikavikondala/Code/servers/src/aws run mcp-server-aws
```

Upon launching, the Inspector will display a URL that you can access in your browser to begin debugging.
