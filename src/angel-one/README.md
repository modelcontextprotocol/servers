# Angel One MCP Server

A Model Context Protocol (MCP) server that provides comprehensive trading and market data functionality for Angel One (Angel Broking) through their SmartAPI.

## Features

### Portfolio Management

- View stock holdings and investment portfolio
- Get comprehensive family account holdings
- Check current trading positions
- Access Risk Management System (RMS) limits

### Trading Operations

- Place buy/sell orders (market, limit, stop-loss)
- Modify existing orders
- Cancel orders
- View order book and trade history
- Create GTT (Good Till Triggered) rules

### Market Data

- Real-time Last Traded Price (LTP)
- Historical candlestick (OHLC) data
- Search for stocks and instruments
- Top gainers/losers analysis
- Put-Call Ratio (PCR) for market sentiment

### Advanced Features

- Option Greeks calculation
- Position conversion
- Brokerage estimation
- Automated authentication with TOTP
- Comprehensive error handling
- Safety controls and dry-run mode

## Installation

```bash
pip install angel-one-mcp
```

## Configuration

1. Create a `.env` file with your Angel One credentials:

```bash
ANGEL_ONE_API_KEY=your_api_key
ANGEL_ONE_CLIENT_CODE=your_client_code
ANGEL_ONE_PASSWORD=your_password
ANGEL_ONE_TOTP_SECRET=your_totp_secret
MAX_ORDER_QUANTITY=10000
DRY_RUN_MODE=false
```

2. Configure in Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "angel-one-trading": {
      "command": "python",
      "args": ["-m", "angel_one_mcp.server"],
      "env": {
        "ANGEL_ONE_API_KEY": "your_api_key",
        "ANGEL_ONE_CLIENT_CODE": "your_client_code", 
        "ANGEL_ONE_PASSWORD": "your_password",
        "ANGEL_ONE_TOTP_SECRET": "your_totp_secret"
      }
    }
  }
}
```

## Usage Examples

### Portfolio Management

- "Show my current holdings"
- "What's my available margin?"
- "Display my open positions"

### Trading

- "Buy 100 shares of RELIANCE at market price"
- "Place a limit order to sell 50 TCS at ₹3500"
- "Cancel order ID 12345"

### Market Data

- "What's the current price of NIFTY?"
- "Show me top gainers today"
- "Get historical data for SBIN"

## Security Features

- Automatic TOTP-based authentication
- Configurable order quantity limits
- Dry-run mode for testing
- Comprehensive error handling
- No credential storage in memory

## Requirements

- Python 3.8+
- Angel One SmartAPI account
- Valid API credentials and TOTP setup

## License

MIT License
