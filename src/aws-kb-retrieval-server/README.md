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
  - Response format:
    - The response now returns two separate content items:
      - A text item containing the raw context from the knowledge base.
      - A JSON item containing the structured RAG sources with metadata (id, fileName, snippet, and score).
    - This separation allows for more flexible processing of the results.

## Configuration

### Setting up AWS Credentials

You have two options for configuring AWS credentials:

#### Option 1: IAM Access Keys

1. Obtain AWS access key ID, secret access key, and region from the AWS Management Console.
2. Ensure these credentials have appropriate permissions for Bedrock Agent Runtime operations.
3. Set the environment variables as shown in the configuration examples below.
4. For temporary credentials, you can also provide a session token using the `AWS_SESSION_TOKEN` environment variable.

#### Option 2: AWS SSO (Single Sign-On)

The server now supports AWS SSO credentials:

1. Configure AWS CLI with your SSO profile: `aws configure sso`
2. Set only the AWS_REGION environment variable in the MCP server configuration.
3. The server will use the default credential provider chain, which includes SSO credentials.

### Optional: Configure Default Knowledge Base IDs

You can optionally specify one or more knowledge base IDs to use by default:

1. Create an array of knowledge base IDs in JSON format.
2. Set this as the AWS_KB_IDS environment variable in your configuration.
3. When this is configured, the `knowledgeBaseId` parameter becomes optional in the tool.

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Docker with IAM Access Keys

```json
{
  "mcpServers": {
    "aws-kb-retrieval": {
      "command": "docker",
      "args": [ "run", "-i", "--rm", "-e", "AWS_ACCESS_KEY_ID", "-e", "AWS_SECRET_ACCESS_KEY", "-e", "AWS_REGION", "-e", "AWS_KB_IDS", "mcp/aws-kb-retrieval-server" ],
      "env": {
        "AWS_ACCESS_KEY_ID": "YOUR_ACCESS_KEY_HERE",
        "AWS_SECRET_ACCESS_KEY": "YOUR_SECRET_ACCESS_KEY_HERE",
        "AWS_SESSION_TOKEN": "YOUR_OPTIONAL_SESSION_ID_FOR_SSO_TEMPORARY_CREDENTIALS_HERE",
        "AWS_REGION": "YOUR_AWS_REGION_HERE",
        "AWS_KB_IDS": "[\"kb-12345\", \"kb-67890\"]"
      }
    }
  }
}
```

#### Docker with AWS SSO

```json
{
  "mcpServers": {
    "aws-kb-retrieval": {
      "command": "docker",
      "args": [ "run", "-i", "--rm", "-e", "AWS_REGION", "-e", "AWS_KB_IDS", "-v", "${HOME}/.aws:/root/.aws", "mcp/aws-kb-retrieval-server" ],
      "env": {
        "AWS_ACCESS_KEY_ID": "YOUR_ACCESS_KEY_HERE",
        "AWS_SECRET_ACCESS_KEY": "YOUR_SECRET_ACCESS_KEY_HERE",
        "AWS_SESSION_TOKEN": "YOUR_OPTIONAL_SESSION_ID_FOR_SSO_TEMPORARY_CREDENTIALS_HERE",
        "AWS_REGION": "YOUR_AWS_REGION_HERE",
        "AWS_KB_IDS": "[\"kb-12345\", \"kb-67890\"]"
      }
    }
  }
}
```

#### NPX with IAM Access Keys

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
        "AWS_SESSION_TOKEN": "YOUR_OPTIONAL_SESSION_ID_FOR_SSO_TEMPORARY_CREDENTIALS_HERE",
        "AWS_REGION": "YOUR_AWS_REGION_HERE",
        "AWS_KB_IDS": "[\"kb-12345\", \"kb-67890\"]"
      }
    }
  }
}
```

#### NPX with AWS SSO

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
        "AWS_SESSION_TOKEN": "YOUR_OPTIONAL_SESSION_ID_FOR_SSO_TEMPORARY_CREDENTIALS_HERE",
        "AWS_REGION": "YOUR_AWS_REGION_HERE",
        "AWS_KB_IDS": "[\"kb-12345\", \"kb-67890\"]"
      }
    }
  }
}
```

#### Local Repository (from cloned/built repo)

```json
{
  "mcpServers": {
    "aws-kb": {
      "command": "node",
      "args": [
        "/path/to/mcp-aws-kb/dist/index.js"
      ],
      "env": {
        "AWS_ACCESS_KEY_ID": "YOUR_ACCESS_KEY_HERE",
        "AWS_SECRET_ACCESS_KEY": "YOUR_SECRET_ACCESS_KEY_HERE",
        "AWS_SESSION_TOKEN": "YOUR_OPTIONAL_SESSION_ID_FOR_SSO_TEMPORARY_CREDENTIALS_HERE",
        "AWS_REGION": "YOUR_AWS_REGION_HERE",
        "AWS_KB_IDS": "[\"kb-12345\", \"kb-67890\"]"
      },
      "disabled": false,
      "autoApprove": [
        "retrieve_from_aws_kb"
      ],
      "timeout": 120
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
