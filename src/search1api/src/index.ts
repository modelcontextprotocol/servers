#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { 
  SearchResponse,
  SearchArgs,
  isValidSearchArgs,
  CrawlResponse,
  CrawlArgs,
  isValidCrawlArgs,
  SitemapResponse,
  SitemapArgs,
  isValidSitemapArgs
} from "./types.js";

dotenv.config();

const API_KEY = process.env.SEARCH1API_KEY;
if (!API_KEY) {
  throw new Error("SEARCH1API_KEY environment variable is required");
}

const API_CONFIG = {
  BASE_URL: 'https://api.search1api.com',
  DEFAULT_QUERY: 'latest news in the world',
  ENDPOINTS: {
    SEARCH: '/search',
    CRAWL: '/crawl',
    SITEMAP: '/sitemap'
  }
} as const;

const SEARCH_TOOL: Tool = {
  name: "search",
  description: "A fast way to search the world",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query"
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
        default: 10
      },
      search_service: {
        type: "string",
        description: "Search service to use (default: google)",
        default: "google"
      }
    },
    required: ["query"]
  }
};

const CRAWL_TOOL: Tool = {
  name: "crawl",
  description: "Extract content from URL",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to crawl"
      }
    },
    required: ["url"]
  }
};

const SITEMAP_TOOL: Tool = {
  name: "sitemap",
  description: "Get all related links from a URL",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to get sitemap"
      }
    },
    required: ["url"]
  }
};

// Server implementation
const server = new Server(
  {
    name: "search1api-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// 添加服务器事件监听
server.onerror = (error) => {
  log('MCP Server Error:', error);
};

server.onclose = () => {
  log('MCP Server Connection Closed');
};

// 添加异步请求函数
async function makeRequest<T>(endpoint: string, data: any): Promise<T> {
  const startTime = Date.now();
  // 确保 BASE_URL 末尾没有斜杠，endpoint 开头有斜杠
  const baseUrl = API_CONFIG.BASE_URL.replace(/\/+$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${path}`;
  
  log(`Starting request to ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API error: ${response.status} ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    const endTime = Date.now();
    log(`Request completed in ${endTime - startTime}ms`);
    
    return result;
  } catch (error) {
    const endTime = Date.now();
    log(`Request failed after ${endTime - startTime}ms:`, error);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout after 30 seconds');
      }
      // 添加更多网络错误的详细信息
      const networkError = error as any;
      if (networkError.code) {
        throw new Error(`Network error (${networkError.code}): ${networkError.message}`);
      }
    }
    throw error;
  }
}

// 添加错误处理工具函数
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// Resource handlers
server.setRequestHandler(
  ListResourcesRequestSchema,
  async () => ({
    resources: [{
      uri: `search://${encodeURIComponent(API_CONFIG.DEFAULT_QUERY)}`,
      name: `Search results for "${API_CONFIG.DEFAULT_QUERY}"`,
      mimeType: "application/json",
      description: "Search results including title, link, and snippet"
    }]
  })
);

server.setRequestHandler(
  ReadResourceRequestSchema,
  async (request) => {
    const defaultQuery = API_CONFIG.DEFAULT_QUERY;
    if (request.params.uri !== `search://${encodeURIComponent(defaultQuery)}`) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource: ${request.params.uri}`
      );
    }

    try {
      const response = await makeRequest<SearchResponse>(
        API_CONFIG.ENDPOINTS.SEARCH,
        {
          query: defaultQuery,
          search_service: "google",
          max_results: 10
        }
      );

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(response.results, null, 2)
        }]
      };
    } catch (error) {
      log("Search error:", error);
      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "text/plain",
          text: `Search API error: ${formatError(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SEARCH_TOOL, CRAWL_TOOL, SITEMAP_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "search": {
        if (!isValidSearchArgs(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid search arguments"
          );
        }

        const { query, max_results = 10, search_service = "google" } = args;

        const response = await makeRequest<SearchResponse>(
          API_CONFIG.ENDPOINTS.SEARCH,
          {
            query,
            search_service,
            max_results
          }
        );

        return {
          content: [{
            type: "text",
            mimeType: "application/json",
            text: JSON.stringify(response.results, null, 2)
          }]
        };
      }

      case "crawl": {
        if (!isValidCrawlArgs(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid crawl arguments"
          );
        }

        const { url } = args;

        log("Starting crawl for:", url);

        try {
          const startTime = Date.now();
          const response = await makeRequest<CrawlResponse>(
            API_CONFIG.ENDPOINTS.CRAWL,
            { url }
          );
          const endTime = Date.now();
          log(`Crawl completed successfully in ${endTime - startTime}ms`);

          return {
            content: [{
              type: "text",
              mimeType: "application/json",
              text: JSON.stringify(response.results, null, 2)
            }]
          };
        } catch (error) {
          log("Crawl error:", error);
          return {
            content: [{
              type: "text",
              mimeType: "text/plain",
              text: `Crawl API error: ${formatError(error)}`
            }],
            isError: true
          };
        }
      }

      case "sitemap": {
        if (!isValidSitemapArgs(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid sitemap arguments"
          );
        }

        try {
          const response = await makeRequest<SitemapResponse>(
            API_CONFIG.ENDPOINTS.SITEMAP,
            args
          );
          return {
            content: [{
              type: "text",
              mimeType: "application/json",
              text: JSON.stringify(response.links, null, 2)
            }]
          };
        } catch (error) {
          throw formatError(error);
        }
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    log("Tool error:", error);
    return {
      content: [{
        type: "text",
        mimeType: "text/plain",
        text: `API error: ${formatError(error)}`
      }],
      isError: true
    };
  }
});

// 添加日志工具函数
function log(message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ${message}`, ...args);
}

async function runServer() {
  const transport = new StdioServerTransport();
  log("Starting Search1API MCP Server...");
  
  // 添加全局错误处理
  process.on('uncaughtException', (error) => {
    log('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    log('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  await server.connect(transport);
  log("Search1API MCP Server running on stdio");
}

runServer().catch((error) => {
  log('Fatal error running server:', error);
  process.exit(1);
});
