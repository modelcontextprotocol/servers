# mcp-server-qdrant: A Qdrant MCP server

## Overview

A basic Model Context Protocol server for keeping and retrieving memories in the Qdrant vector search engine.
It acts as a semantic memory layer on top of the Qdrant database.

## Components

### Tools

1. `qdrant-store-memory`
   - Store a memory in the Qdrant database
   - Input:
     - `information` (string): Memory to store
   - Returns: Confirmation message
2. `qdrant-find-memories`
   - Retrieve a memory from the Qdrant database
   - Input:
     - `query` (string): Query to retrieve a memory
   - Returns: Memories stored in the Qdrant database as separate messages

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-server-qdrant*.

```shell
uvx mcp-server-qdrant \
  --qdrant-url "http://localhost:6333" \
  --qdrant-api-key "your_api_key" \
  --collection-name "my_collection" \
  --fastembed-model-name "sentence-transformers/all-MiniLM-L6-v2"
```

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

```json
{
  "qdrant": {
    "command": "uvx",
    "args": [
      "mcp-server-qdrant", 
      "--qdrant-url", 
      "http://localhost:6333",
      "--qdrant-api-key", 
      "your_api_key",
      "--collection-name",
      "your_collection_name"
    ]
  }
}
```

Replace `http://localhost:6333`, `your_api_key` and `your_collection_name` with your Qdrant server URL, Qdrant API key 
and collection name, respectively. The use of API key is optional, but recommended for security reasons, and depends on 
the Qdrant server configuration.

This MCP server will automatically create a collection with the specified name if it doesn't exist.

By default, the server will use the `sentence-transformers/all-MiniLM-L6-v2` embedding model to encode memories.
For the time being, only [FastEmbed](https://qdrant.github.io/fastembed/) models are supported, and you can change it
by passing the `--fastembed-model-name` argument to the server.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, 
subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project 
repository.
