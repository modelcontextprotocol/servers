# Bitcoin Price MCP Server

An MCP server implementation for fetching the latest bitcoin price using a public API.

## Features

- **Fetch Bitcoin Price**: Retrieve the latest bitcoin price from a public API.

## Tools

- **fetch_bitcoin_price**
  - Fetches the latest bitcoin price.
  - Inputs: None

## Configuration

### Setting up the Server

1. Clone the repository.
2. Navigate to the `src/bitcoin-price-server` directory.
3. Install dependencies using `npm install`.

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Docker

```json
{
  "mcpServers": {
    "bitcoin-price": {
      "command": "docker",
      "args": [ "run", "-i", "--rm", "mcp/bitcoin-price-server" ]
    }
  }
}
```

#### NPX

```json
{
  "mcpServers": {
    "bitcoin-price": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-bitcoin-price"
      ]
    }
  }
}
```

## Usage Examples

### Fetching the Latest Bitcoin Price

To fetch the latest bitcoin price, you can use the `fetch_bitcoin_price` tool. Here is an example:

```json
{
  "tool": "fetch_bitcoin_price",
  "arguments": {}
}
```

## Building

Docker:

```sh
docker build -t mcp/bitcoin-price-server -f src/bitcoin-price-server/Dockerfile .
```
