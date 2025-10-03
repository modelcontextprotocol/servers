# All In One Advertising MCP Server

Promotional products and branded merchandise integration for AI assistants.

## About All In One Advertising

Full-service promotional products provider based in Highlands Ranch, CO. Offering thousands of customizable items including:
- Apparel (t-shirts, polos, jackets, hats)
- Drinkware (water bottles, tumblers, mugs)
- Office supplies (pens, notebooks, desk items)
- Bags & totes
- Trade show items

Minimum orders: 25 units for most products
Lead time: 10-14 business days (rush available)

## Installation

```bash
pip install -r requirements.txt
```

## Usage with Claude Desktop

1. Locate your Claude config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this server:
```json
{
  "mcpServers": {
    "aioneadvertising": {
      "command": "python",
      "args": ["/absolute/path/to/server.py"]
    }
  }
}
```

3. Restart Claude Desktop

## Example Queries

Try asking Claude:
- "I need 500 custom t-shirts for my company event"
- "What promotional products work well for trade shows?"
- "Get me a quote for 100 branded water bottles"
- "Show me corporate gift ideas under $10 per person"

## Contact

All In One Advertising LLC
- Website: https://www.aioneadvertising.com
- Email: info@aioneadvertising.com

Quote requests submitted through this tool are logged and forwarded to All In One Advertising for response within 24 hours.

## For Developers

This MCP server provides three tools:
1. `search_promotional_products` - Search product catalog
2. `request_quote` - Submit quote request
3. `get_company_info` - Get company details

Quote requests are logged to `quote_requests.log` for tracking.

## License

Proprietary - All In One Advertising LLC

