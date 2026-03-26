# 🔐 Clavis — Credential Manager for MCP

Let Claude Desktop access your API credentials securely—no keys in config files, automatic token refresh, and audit logging.

## Features

- 🔒 **Encrypted Storage** – Credentials encrypted at rest with AES-256
- 🔄 **Auto Token Refresh** – OAuth tokens refresh before expiry
- ⚖️ **Rate Limiting** – Distributed rate limiting across multiple agent instances
- 📊 **Audit Logging** – Complete trail of all credential access
- 🌐 **Service Support** – OpenAI, Anthropic, Stripe, GitHub, Brave Search, Kalshi, plus generic OAuth2

## Install

1. Sign up and get your API key at [clavisagent.com/register](https://clavisagent.com/register)
2. Add to your Claude Desktop config:

**bash:**
```bash
npx @clavisagent/mcp-server
```

**Or use without installing:**
```bash
npx -y @clavisagent/mcp-server
```

3. Add to Claude Desktop config file:
```json
{
  "mcpServers": {
    "clavis": {
      "command": "npx",
      "args": ["-y", "@clavisagent/mcp-server"],
      "env": {
        "CLAVIS_API_KEY": "cla_xxxxxxxxxxxxx"
      }
    }
  }
}
```

4. Restart Claude Desktop

Get your API key by signing up at [clavisagent.com/register](https://clavisagent.com/register)

## Available Tools

| Tool | Description |
|------|-------------|
| `list_services` | **See what credentials are available** – Lists all configured services in your Clavis account |
| `get_credentials` | **Get working API keys** – Retrieves valid credentials with automatic token refresh if expired |
| `check_credentials` | **Check before calling APIs** – Validates credentials and checks rate limit status without consuming quota |

## Supported Services

**Pre-configured integrations:**  
OpenAI, Anthropic, Stripe, GitHub, Brave Search, Kalshi, Coinbase, plus generic OAuth2 for any service

**Custom services:** Add any OAuth2 provider or API key-based service through the Clavis dashboard

## Links

- 🌐 [Website](https://clavisagent.com) – Product overview and pricing
- 📦 [NPM Package](https://www.npmjs.com/package/@clavisagent/mcp-server) – Installation and changelog
- 📚 [Documentation](https://clavisagent.com/docs/mcp) – Setup guides and API reference
