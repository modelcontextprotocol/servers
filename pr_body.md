Adds [LetsFG](https://github.com/LetsFG/LetsFG) to the Community Servers section.

**What it does:** LetsFG is an MCP server for flight search and comparison. It connects AI assistants to real airline pricing data from 400+ airlines via GDS/NDC aggregators plus 102 direct airline API connectors. No price bias, no tracking.

**Install:**
```json
{
  "mcpServers": {
    "letsfg": {
      "command": "npx",
      "args": ["-y", "letsfg-mcp"],
      "env": {
        "LETSFG_API_KEY": "your_api_key"
      }
    }
  }
}
```

**npm:** [letsfg-mcp](https://www.npmjs.com/package/letsfg-mcp)
**PyPI:** [letsfg](https://pypi.org/project/letsfg/)
**GitHub:** [LetsFG/LetsFG](https://github.com/LetsFG/LetsFG)
