#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;

if (!API_KEY || !API_SECRET_KEY) {
  throw new Error("ALPACA_API_KEY and ALPACA_API_SECRET_KEY environment variables are required");
}

const API_CONFIG = {
  BASE_URL: "https://paper-api.alpaca.markets",
  DATA_BASE_URL: "https://data.alpaca.markets",
  ENDPOINTS: {
    ACCOUNT: "/v2/account",
    ASSET: "/v2/assets",
    LATEST_QUOTE: "/v2/stocks/{symbol}/quotes/latest",
    ORDERS: "/v2/orders"
  }
} as const;

// Tool definitions
const getAccountInfoTool: Tool = {
  name: "get_account_info",
  description: "Get information about the current account",
  inputSchema: {
    type: "object",
  },
};

const getAssetBySymbolTool: Tool = {
  name: "get_asset_by_symbol",
  description: "Get detailed information about a trading asset by its symbol",
  inputSchema: {
    type: "object",
    required: ["symbol"],
    properties: {
      symbol: {
        type: "string",
        description: "The asset symbol (e.g., OKTA, AAPL)",
      },
    },
  },
};

const getLatestQuoteTool: Tool = {
  name: "get_latest_quote",
  description: "Get the latest quote for a stock symbol",
  inputSchema: {
    type: "object",
    required: ["symbol"],
    properties: {
      symbol: {
        type: "string",
        description: "The stock symbol to get a quote for (e.g., SPY, AAPL)",
      },
    },
  },
};

const placeOrderTool: Tool = {
  name: "place_order",
  description: "Place a new order for a stock",
  inputSchema: {
    type: "object",
    required: ["symbol", "qty", "side", "type", "time_in_force"],
    properties: {
      symbol: {
        type: "string",
        description: "The stock symbol (e.g., AAPL)",
      },
      qty: {
        type: "string",
        description: "The quantity of shares to order",
      },
      side: {
        type: "string",
        enum: ["buy", "sell"],
        description: "Order side: buy or sell",
      },
      type: {
        type: "string",
        enum: ["market", "limit", "stop", "stop_limit"],
        description: "Order type",
      },
      limit_price: {
        type: "string",
        description: "Limit price for limit orders",
      },
      time_in_force: {
        type: "string",
        enum: ["day", "gtc", "opg", "cls", "ioc", "fok"],
        description: "Time in force for the order",
      },
    },
  },
};

// Define interface for account info response
interface AccountInfo {
  id: string;
  admin_configurations: Record<string, unknown>;
  user_configurations: null;
  account_number: string;
  status: string;
  crypto_status: string;
  options_approved_level: number;
  options_trading_level: number;
  currency: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
  effective_buying_power: string;
  non_marginable_buying_power: string;
  options_buying_power: string;
  bod_dtbp: string;
  cash: string;
  accrued_fees: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  trade_suspended_by_user: boolean;
  multiplier: string;
  shorting_enabled: boolean;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  position_market_value: string;
  initial_margin: string;
}

// Add interface for asset response
interface AssetInfo {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  maintenance_margin_requirement: number;
  margin_requirement_long: string;
  margin_requirement_short: string;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable: boolean;
  attributes: string[];
}

// Add interface for quote response
interface QuoteResponse {
  symbol: string;
  quote: {
    t: string;    // timestamp
    ax: string;   // ask exchange
    ap: number;   // ask price
    as: number;   // ask size
    bx: string;   // bid exchange
    bp: number;   // bid price
    bs: number;   // bid size
    c: string[];  // conditions
    z: string;    // tape (consolidated)
  };
}

// Add interface for order request
interface OrderRequest {
  symbol: string;
  qty: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  limit_price?: string;
  time_in_force: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
}

// Add interface for order response
interface OrderResponse {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  asset_id: string;
  symbol: string;
  status: string;
  order_type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  qty: string;
}

class AlpacaClient {
  private apiKey: string;
  private apiSecretKey: string;

  constructor(apiKey: string, apiSecretKey: string) {
    this.apiKey = apiKey;
    this.apiSecretKey = apiSecretKey;
  }

  async getAccountInfo(): Promise<AccountInfo> {
    const response = await axios.get(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ACCOUNT}`, {
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.apiSecretKey
      }
    });
    return response.data;
  }

  async getAssetBySymbol(symbol: string): Promise<AssetInfo> {
    const response = await axios.get(
      `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ASSET}/${symbol}`,
      {
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecretKey
        }
      }
    );
    return response.data;
  }

  async getLatestQuote(symbol: string): Promise<QuoteResponse> {
    const endpoint = API_CONFIG.ENDPOINTS.LATEST_QUOTE.replace("{symbol}", symbol);
    const response = await axios.get(
      `${API_CONFIG.DATA_BASE_URL}${endpoint}`,
      {
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecretKey
        }
      }
    );
    return response.data;
  }

  async placeOrder(orderRequest: OrderRequest): Promise<OrderResponse> {
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ORDERS}`,
      orderRequest,
      {
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecretKey
        }
      }
    );
    return response.data;
  }
}

// Create server instance with just tools capability
const server = new Server(
  {
    name: "alpaca",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Set up tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [getAccountInfoTool, getAssetBySymbolTool, getLatestQuoteTool, placeOrderTool]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const client = new AlpacaClient(API_KEY, API_SECRET_KEY);

  switch (request.params.name) {
    case "get_account_info": {
      const accountInfo = await client.getAccountInfo();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(accountInfo, null, 2)
        }]
      };
    }
    case "get_asset_by_symbol": {
      const args = request.params.arguments as unknown as { symbol: string };
      const assetInfo = await client.getAssetBySymbol(args.symbol);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(assetInfo, null, 2)
        }]
      };
    }
    case "get_latest_quote": {
      const args = request.params.arguments as unknown as { symbol: string };
      const quoteInfo = await client.getLatestQuote(args.symbol);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(quoteInfo, null, 2)
        }]
      };
    }
    case "place_order": {
      const args = request.params.arguments as unknown as OrderRequest;
      const orderInfo = await client.placeOrder(args);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(orderInfo, null, 2)
        }]
      };
    }
    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
