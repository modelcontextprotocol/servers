# DeBanK MCP Server

A stateless Model Context Protocol (MCP) server for interacting with the DeBanK API to retrieve blockchain and DeFi data.

## Overview

This project implements a Model Context Protocol (MCP) server that provides various tools for querying blockchain data, including chains, protocols, tokens, pools, and user assets. Built with the [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/mcp), it leverages the HTTP Streamable transport to provide a modern, efficient API interface.

The server is designed to be completely stateless, with each request being handled independently, making it highly scalable and robust for production environments.

## Features

- **Stateless Architecture**: Each request creates a new server instance and transport
- **Comprehensive DeFi Data Tools**: Access to chains, protocols, tokens, pools, and user data
- **Pagination Support**: All list-returning endpoints support pagination
- **Error Handling**: Robust error handling and reporting

## Tools Available

| Tool Name | Description |
|-----------|-------------|
| `get_chain_info` | Get information about blockchains |
| `get_protocol_info` | Get information about DeFi protocols |
| `get_token_info` | Get information about tokens |
| `get_pool_info` | Get detailed information about a specific liquidity pool |
| `get_user_assets` | Get information about a user's assets across different blockchains |
| `get_user_activities` | Get information about a user's protocol positions, transaction history, and balance charts |
| `get_user_authorizations` | Get information about a user's token and NFT authorizations |
| `get_collection_nft_list` | Get a list of NFTs in a specific collection |
| `wallet_tools` | Access wallet-related functionality |

## Prerequisites

- [Deno](https://deno.land/) 1.35 or later
- DeBanK API Access Key - [Get one here](https://pro.debank.com/)

## Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/debank-mcp-server.git
cd debank-mcp-server
```

2. Set up your environment variables
```bash
export ACCESS_KEY=your_debank_api_key
```

## Running the Server

Start the server with the following command:

```bash
deno run --allow-net --allow-env main.ts
```

The server will start and listen on port 8080 by default. You can now send MCP requests to `http://localhost:8080/mcp`.

## MCP HTTP Streamable Implementation

This project uses the StreamableHTTPServerTransport from the Model Context Protocol SDK to handle MCP requests. Every request creates a new server instance and transport, making the service completely stateless:

```typescript
// Create new server instance and transport for each request
const server = createServer();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

// Connect to server
await server.connect(transport);

// Handle request
await transport.handleRequest(req, res, req.body);
```

This approach simplifies deployment and scaling, as there's no need to manage session state across multiple instances.

## Project Structure

```
├── main.ts                # Main server file with MCP endpoint handling
├── deno.json              # Deno configuration
├── deno.lock              # Dependency lock file
├── tool/
│   ├── toolInfo.ts        # Tool definitions
│   └── toolHandler.ts     # Tool handler implementations
└── README.md              # This file
```

## Configuration

The following environment variables can be configured:

- `ACCESS_KEY` - Your DeBanK API access key
- `PORT` - (Optional) Port to run the server on (default: 8080)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Model Context Protocol](https://github.com/modelcontextprotocol/mcp)
- [DeBanK API](https://pro.debank.com/)
