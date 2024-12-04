# mcp-server-s3: A S3 MCP server

## Overview

A Model Context Protocol server for interfacing with Amazon S3. This server provides tools to interface with your buckets and their objects.

Please note that mcp-server-s3 is currently in early development. The functionality will certainly change and expand as we continue to develop and improve the server.

### Tools

1. `ListBuckets`
   - Lists buckets in the local AWS account
   - Input:
     - `ContinuationToken` (string, optional): Used for continuing to list across multiple requests
     - `MaxBuckets` (integer, optional): Max # of buckets to list
   - Returns: List of S3 buckets
2. `ListObjectsV2`
   - List object keys in the specified S3 bucket
   - Input:
     - `Bucket` (string): The bucket to list object keys from
     - `ContinuationToken` (string, optional): Used for continuing to list across multiple requests
     - `FetchOwner` (boolean, optional): Determines whether or not the 'owner' field is returned for each object key
     - `MaxKeys` (integer, optional): Max # of object keys to list
     - `Prefix` (string, optional): Limits the response to object keys that begin with this Prefix
     - `StartAfter` (string, optional): Defines which key to start listing from
   - Returns: List of S3 object keys
3. `GetObject`
   - Retrieve an object from S3
   - Input:
     - `Bucket` (string): The bucket that contains the object
     - `Key` (string): The key of the object
     - `Range` (string, optional): The byte range of the object to retrieve
     - `VersionId` (string, optional): The specific version of the object to retrieve
   - Returns: String of object content

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run _mcp-server-s3_.

### Using PIP

Alternatively you can install `mcp-server-s3` via pip:

```
pip install mcp-server-s3
```

After installation, you can run it as a script using:

```
python -m mcp_server_s3
```

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "s3": {
    "command": "uvx",
    "args": ["mcp-server-s3", "--repository", "path/to/git/repo"]
  }
}
```

</details>

<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "s3": {
    "command": "python",
    "args": ["-m", "mcp_server_s3", "--repository", "path/to/git/repo"]
  }
}
```

</details>

## Debugging

You can use the MCP inspector to debug the server. For uvx installations:

```
npx @modelcontextprotocol/inspector uvx mcp-server-s3
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/git
npx @modelcontextprotocol/inspector uv run mcp-server-s3
```

Running `tail -n 20 -f ~/Library/Logs/Claude/mcp*.log` will show the logs from the server and may
help you debug any issues.

## Development

If you are doing local development, there are two ways to test your changes:

1. Run the MCP inspector to test your changes. See [Debugging](#debugging) for run instructions.

2. Test using the Claude desktop app. Add the following to your `claude_desktop_config.json`:

```json
"s3": {
  "command": "uv",
  "args": [
    "--directory",
    "/<path to mcp-servers>/mcp-servers/src/s3",
    "run",
    "mcp-server-s3"
  ]
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
