# Clavis

Secure credential management for MCP servers and Claude Desktop.

### Features

- 🔐 **Encrypted Storage** - Credentials encrypted at rest with AES-256
- 🔄 **Auto Token Refresh** - OAuth tokens refreshed automatically before expiry
- ⚡ **Rate Limiting** - Distributed rate limiting across multiple agent instances
- 📊 **Audit Logs** - Complete audit trail of all credential access
- 🔌 **Multi-Service** - Supports OpenAI, Anthropic, Stripe, GitHub, Brave Search, and custom OAuth2

### Install
```bash
npm install -g @clavisagent/mcp-server
```

Or use without installing:
```bash
npx @clavisagent/mcp-server
```

### Configuration

Add to Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "clavis": {
      "command": "npx",
      "args": ["-y", "@clavisagent/mcp-server"],
      "env": {
        "CLAVIS_API_KEY": "your-jwt-token"
      }
    }
  }
}
```

Get your API key by signing up at [clavisagent.com](https://clavisagent.com/register.html)

### Available Tools

| Tool | Description |
|------|-------------|
| `list_services` | List all configured services in your Clavis account |
| `get_credentials` | Retrieve valid credentials with automatic token refresh |
| `check_credential_status` | Check credential validity and rate limit status |

### Supported Services

OpenAI, Anthropic, Stripe, GitHub, Brave Search, Kalshi, Coinbase, plus generic API key and OAuth2 support for any service.

### Links

- Website: https://clavisagent.com
- Documentation: https://clavisagent.com/docs/mcp
- NPM: https://www.npmjs.com/package/@clavisagent/mcp-server
