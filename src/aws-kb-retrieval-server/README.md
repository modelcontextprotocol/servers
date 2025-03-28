# AWS Knowledge Base Retrieval MCP Server

An MCP server implementation for retrieving information from the AWS Knowledge Base using the Bedrock Agent Runtime.

## Features

- **RAG (Retrieval-Augmented Generation)**: Retrieve context from the AWS Knowledge Base based on a query and a Knowledge Base ID.
- **Supports multiple results retrieval**: Option to retrieve a customizable number of results.
- **Flexible AWS authentication**: Support for AWS profiles, or explicit credentials.

## Tools

- **retrieve_from_aws_kb**
  - Perform retrieval operations using the AWS Knowledge Base.
  - Inputs:
    - `query` (string): The search query for retrieval.
    - `knowledgeBaseId` (string): The ID of the AWS Knowledge Base.
    - `n` (number, optional): Number of results to retrieve (default: 3).

## Configuration

### Setting up AWS Credentials

This server supports multiple authentication methods:

1. **AWS Profile** (recommended for development):
   - Set the `AWS_PROFILE` environment variable to use a specific profile from your AWS config.
   - Example: `AWS_PROFILE=my-profile`

2. **Explicit Credentials**:
   - Provide `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables.
   - Obtain these from the AWS Management Console.

3. **Default Credential Chain**:
   - If neither AWS_PROFILE nor explicit credentials are provided, the AWS SDK's default credential provider chain will be used.
   - This includes checking environment variables, shared credential file, and IAM roles for EC2/ECS.

In all cases, ensure the credentials have appropriate permissions for Bedrock Agent Runtime operations.

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Docker with AWS Profile

```json
{
  "mcpServers": {
    "aws-kb-retrieval": {
      "command": "docker",
      "args": [ "run", "-i", "--rm", "-e", "AWS_PROFILE", "-e", "AWS_REGION", "-v", "${HOME}/.aws:/root/.aws", "mcp/aws-kb-retrieval-server" ],
      "env": {
        "AWS_PROFILE": "YOUR_PROFILE_NAME",
        "AWS_REGION": "YOUR_AWS_REGION_HERE"
      }
    }
  }
}
```

#### Docker with Explicit Credentials

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

#### NPX

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
