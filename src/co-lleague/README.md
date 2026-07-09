# Co-lleague MCP Server

AGI co-worker for the Model Context Protocol. Query screens, run tabular predictions, execute intents, and check agent status — all from any MCP-compatible client (Claude Desktop, Cursor, Windsurf, VS Code Copilot, OpenCode).

## Tools

### `co-lleague_screen_query`
Query what's on the user's screen right now. Returns screen content with AI analysis.

### `co-lleague_tabular_predict`
Run a tabular prediction on input features. Uses TabICL for in-context learning.

### `co-lleague_intent_execute`
Execute a natural-language intent. Describe what you want to do and get results.

### `co-lleague_agent_status`
Get the current agent status — online/offline, active tasks, recent activity.

## Installation

### Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "co-lleague": {
      "command": "npx",
      "args": ["-y", "@aimino/co-lleague-mcp"],
      "env": {
        "CO_LEAGUE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### OpenCode / Cline / Continue.dev
```json
{
  "mcpServers": {
    "co-lleague": {
      "command": "npx",
      "args": ["-y", "@aimino/co-lleague-mcp"]
    }
  }
}
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `CO_LEAGUE_API_KEY` | Yes | — | API key for co-lleague backend |
| `CO_LEAGUE_API_BASE` | No | `https://api.co-lleague.ai` | Backend API base URL |

## Resources

- `co-lleague://agents/{agentId}/status` — Live agent status resource

## License

MIT
