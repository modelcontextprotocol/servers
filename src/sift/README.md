# Sift — Agent Execution Governance MCP Server

Sift is a cryptographic execution governance layer for AI agents. This MCP server exposes Sift's authorization tools to any Claude client, enabling pre-execution governance for every agent action.

## What it does

Before your agent executes any real-world action (API calls, file writes, emails, transactions), Sift:

1. Authenticates the agent (Ed25519 challenge-response)
2. Evaluates the action against policy
3. Issues a cryptographically signed authorization receipt
4. Logs the decision immutably

**Fail-closed**: if Sift is unreachable, execution is denied by default.

## Tools

- `sift_authorize` — get a signed authorization receipt before executing any action
- `sift_check_policy` — check what your agent is allowed to do
- `sift_register_agent` — get onboarding instructions

## Install

```bash
pip install mcp httpx cryptography
```

## Add to Claude Desktop

Edit your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "sift": {
      "command": "python",
      "args": ["/path/to/sift_mcp_server.py"]
    }
  }
}
```

## Get access

Register your agent at **sift.walkosystems.com** ($29/month early access) or email jason@walkosystems.com.

## Source

GitHub: https://github.com/walkojas-boop/Sift-core/tree/main/mcp
