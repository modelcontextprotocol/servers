# Exogram MCP Server

A Model Context Protocol server providing tools to evaluate, commit, and audit agentic actions through the Exogram Authority Runtime.

This server enables AI models (like Claude Desktop) to request cryptographic authorization before executing state-changing tools (such as database writes, payment updates, or API mutations) and securely store/retrieve records in the Exogram vault.

## Tools

- `exogram_evaluate_action`: Request authorization for a tool call. Returns a token if ALLOWED, or blocks execution if it violates policy constraints.
- `exogram_commit_action`: Commit an executed action token to the immutable audit ledger.
- `exogram_store_record`: Store a fact/record in the encrypted trust vault (scrubs PII, matches conflicts).
- `exogram_search_records`: Search vault records using semantic similarity.

## Configuration

Add this to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "exogram": {
      "command": "uv",
      "args": [
        "run",
        "--package",
        "mcp-server-exogram",
        "mcp-server-exogram"
      ],
      "env": {
        "EXOGRAM_API_URL": "https://api.exogram.ai",
        "EXOGRAM_BEARER_TOKEN": "<YOUR_EXOGRAM_BEARER_TOKEN>"
      }
    }
  }
}
```
