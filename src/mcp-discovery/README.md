# MCP Discovery Server

Enables AI agents to discover, evaluate, and select MCP servers dynamically using semantic search.

## Features

- **Semantic Search**: Find MCP servers using natural language ("I need a database with auth")
- **Performance Metrics**: Get latency, uptime, and reliability data
- **Server Comparison**: Compare multiple servers side-by-side
- **24+ Servers Indexed**: Databases, communication, automation, and more

## Installation

```bash
npx mcp-discovery-api
```

## Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-discovery": {
      "command": "npx",
      "args": ["-y", "mcp-discovery-api"],
      "env": {
        "SUPABASE_URL": "your-supabase-url",
        "SUPABASE_SERVICE_ROLE_KEY": "your-key",
        "OPENAI_API_KEY": "your-openai-key"
      }
    }
  }
}
```

Or use the hosted API (no setup required):

```json
{
  "mcpServers": {
    "mcp-discovery": {
      "command": "npx",
      "args": ["-y", "mcp-discovery-api", "--api", "https://mcp-discovery-production.up.railway.app"]
    }
  }
}
```

## Tools

### discover_mcp_server

Find MCP servers matching a natural language requirement.

**Input:**
```json
{
  "need": "database with authentication",
  "constraints": {
    "max_latency_ms": 200,
    "required_features": ["auth"]
  },
  "limit": 5
}
```

**Output:**
```json
{
  "recommendations": [
    {
      "server": "postgres-server",
      "npm_package": "@modelcontextprotocol/server-postgres",
      "install_command": "npx -y @modelcontextprotocol/server-postgres",
      "confidence": 0.87,
      "capabilities": ["postgres", "sql", "database"],
      "metrics": {
        "avg_latency_ms": 85,
        "uptime_pct": 99.9
      }
    }
  ],
  "total_found": 1,
  "query_time_ms": 450
}
```

### get_server_metrics

Get performance metrics for a specific MCP server.

**Input:**
```json
{
  "server_id": "postgres-server",
  "time_range": "24h"
}
```

### compare_servers

Compare multiple MCP servers side-by-side.

**Input:**
```json
{
  "server_ids": ["postgres-server", "sqlite-server"],
  "compare_by": ["latency", "uptime", "features"]
}
```

## API Access

Hosted API available at: `https://mcp-discovery-production.up.railway.app`

- **Free tier**: 100 queries/month
- **Pro tier**: 10,000 queries/month ($29/mo)
- **Enterprise**: Unlimited (custom pricing)

Get an API key:
```bash
curl -X POST https://mcp-discovery-production.up.railway.app/api/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

## Links

- **GitHub**: https://github.com/yksanjo/mcp-discovery
- **API**: https://mcp-discovery-production.up.railway.app
- **npm**: https://www.npmjs.com/package/mcp-discovery-api

## License

MIT
