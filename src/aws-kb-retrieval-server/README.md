# AWS Knowledge Base Retrieval MCP Server

An MCP server implementation for retrieving information from the AWS Knowledge Base using the Bedrock Agent Runtime.

## Features

- **RAG (Retrieval-Augmented Generation)**: Retrieve context from the AWS Knowledge Base based on a query and a Knowledge Base ID.
- **Supports multiple results retrieval**: Option to retrieve a customizable number of results.

## Tools

- **retrieve_from_aws_kb**
  - Perform retrieval operations using the AWS Knowledge Base.
  - Inputs:
    - `query` (string): The search query for retrieval.
    - `knowledgeBaseId` (string): The ID of the AWS Knowledge Base.
    - `n` (number, optional): Number of results to retrieve (default: 3).

## Configuration

### Setting up AWS Credentials

1. Obtain AWS access key ID, secret access key, and region from the AWS Management Console.
2. Ensure these credentials have appropriate permissions for Bedrock Agent Runtime operations.

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Docker

```json
{
  "mcpServers": {
    "aws-kb-retrieval": {
      "command": "docker",
      "args": [ "run", "-i", "--rm", "-e", "AWS_ACCESS_KEY_ID", "-e", "AWS_SECRET_ACCESS_KEY", "-e", "AWS_REGION", "mcp/aws-kb-retrieval-server" ],
      "env": {
        "AWS_ACCESS_KEY_ID": "YOUR_ACCESS_KEY_HERE",
        "AWS_SECRET_ACCESS_KEY": "YOUR_SECRET_ACCESS_KEY_HERE",
        "AWS_REGION": "YOUR_AWS_REGION_HERE"
      }
    }
  }
}
```

```json
{
  "mcpServers": {
    "aws-kb-retrieval": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-aws-kb-retrieval"
      ],
      "env": {
        "AWS_ACCESS_KEY_ID": "YOUR_ACCESS_KEY_HERE",
        "AWS_SECRET_ACCESS_KEY": "YOUR_SECRET_ACCESS_KEY_HERE",
        "AWS_REGION": "YOUR_AWS_REGION_HERE"
      }
    }
  }
}
```

## Building

Docker: 

```sh
docker build -t mcp/aws-kb-retrieval -f src/aws-kb-retrieval-server/Dockerfile . 
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.

This README assumes that your server package is named `@modelcontextprotocol/server-aws-kb-retrieval`. Adjust the package name and installation details if they differ in your setup. Also, ensure that your server script is correctly built and that all dependencies are properly managed in your `package.json`.
