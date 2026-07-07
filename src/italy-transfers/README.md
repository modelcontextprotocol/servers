# ItalyFare — Italy Transfers MCP Server

Real-time train, bus, ferry and private transfer prices for 40+ Italian cities. Find the cheapest transport options and best travel days with live data updated daily.

## Tools

- **search_italy_transport** — Search for train, bus, ferry and private transfer options between two Italian cities with live prices
- **list_italy_routes** — List all available transport routes between Italian cities (71+ routes)
- **get_route_info** — Get detailed price ranges and travel times for a specific route
- **get_cheapest_travel_day** — Find the cheapest day of the week to travel between two Italian cities

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "italy-transfers": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://italyfare.com/mcp"]
    }
  }
}
```

Restart Claude Desktop. The 4 Italy transport tools will appear automatically.

## Source

- **MCP endpoint:** https://italyfare.com/mcp
- **Homepage:** https://italyfare.com
- **Partner API docs:** https://italyfare.com/en/partner-api
- **GitHub:** https://github.com/trendbender/italy-transfer
- **License:** MIT

## Data Sources

Prices updated daily from FlixBus, Trenitalia, Italo, and other Italian transport operators.
