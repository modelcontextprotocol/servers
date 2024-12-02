#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import FirecrawlApp, {
  type ScrapeParams,
  type MapParams,
  type CrawlParams,
  type FirecrawlDocument,
} from "@mendable/firecrawl-js";
import { AxiosResponse } from "axios";

// Tool definitions
const SCRAPE_TOOL: Tool = {
  name: "fire_crawl_scrape",
  description:
    "Scrape a single webpage with advanced options for content extraction. " +
    "Supports various formats including markdown, HTML, and screenshots. " +
    "Can execute custom actions like clicking or scrolling before scraping.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to scrape",
      },
      formats: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "markdown",
            "html",
            "rawHtml",
            "screenshot",
            "links",
            "screenshot@fullPage",
            "extract",
          ],
        },
        description: "Content formats to extract (default: ['markdown'])",
      },
      onlyMainContent: {
        type: "boolean",
        description:
          "Extract only the main content, filtering out navigation, footers, etc.",
      },
      includeTags: {
        type: "array",
        items: { type: "string" },
        description: "HTML tags to specifically include in extraction",
      },
      excludeTags: {
        type: "array",
        items: { type: "string" },
        description: "HTML tags to exclude from extraction",
      },
      waitFor: {
        type: "number",
        description: "Time in milliseconds to wait for dynamic content to load",
      },
      timeout: {
        type: "number",
        description:
          "Maximum time in milliseconds to wait for the page to load",
      },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "wait",
                "click",
                "screenshot",
                "write",
                "press",
                "scroll",
                "scrape",
                "executeJavascript",
              ],
              description: "Type of action to perform",
            },
            selector: {
              type: "string",
              description: "CSS selector for the target element",
            },
            milliseconds: {
              type: "number",
              description: "Time to wait in milliseconds (for wait action)",
            },
            text: {
              type: "string",
              description: "Text to write (for write action)",
            },
            key: {
              type: "string",
              description: "Key to press (for press action)",
            },
            direction: {
              type: "string",
              enum: ["up", "down"],
              description: "Scroll direction",
            },
            script: {
              type: "string",
              description: "JavaScript code to execute",
            },
            fullPage: {
              type: "boolean",
              description: "Take full page screenshot",
            },
          },
          required: ["type"],
        },
        description: "List of actions to perform before scraping",
      },
      extract: {
        type: "object",
        properties: {
          schema: {
            type: "object",
            description: "Schema for structured data extraction",
          },
          systemPrompt: {
            type: "string",
            description: "System prompt for LLM extraction",
          },
          prompt: {
            type: "string",
            description: "User prompt for LLM extraction",
          },
        },
        description: "Configuration for structured data extraction",
      },
      mobile: {
        type: "boolean",
        description: "Use mobile viewport",
      },
      skipTlsVerification: {
        type: "boolean",
        description: "Skip TLS certificate verification",
      },
      removeBase64Images: {
        type: "boolean",
        description: "Remove base64 encoded images from output",
      },
      location: {
        type: "object",
        properties: {
          country: {
            type: "string",
            description: "Country code for geolocation",
          },
          languages: {
            type: "array",
            items: { type: "string" },
            description: "Language codes for content",
          },
        },
        description: "Location settings for scraping",
      },
    },
    required: ["url"],
  },
};

const MAP_TOOL: Tool = {
  name: "fire_crawl_map",
  description:
    "Discover URLs from a starting point. Can use both sitemap.xml and HTML link discovery.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Starting URL for URL discovery",
      },
      search: {
        type: "string",
        description: "Optional search term to filter URLs",
      },
      ignoreSitemap: {
        type: "boolean",
        description: "Skip sitemap.xml discovery and only use HTML links",
      },
      sitemapOnly: {
        type: "boolean",
        description: "Only use sitemap.xml for discovery, ignore HTML links",
      },
      includeSubdomains: {
        type: "boolean",
        description: "Include URLs from subdomains in results",
      },
      limit: {
        type: "number",
        description: "Maximum number of URLs to return",
      },
    },
    required: ["url"],
  },
};

const CRAWL_TOOL: Tool = {
  name: "fire_crawl_crawl",
  description:
    "Start an asynchronous crawl of multiple pages from a starting URL. " +
    "Supports depth control, path filtering, and webhook notifications.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Starting URL for the crawl",
      },
      excludePaths: {
        type: "array",
        items: { type: "string" },
        description: "URL paths to exclude from crawling",
      },
      includePaths: {
        type: "array",
        items: { type: "string" },
        description: "Only crawl these URL paths",
      },
      maxDepth: {
        type: "number",
        description: "Maximum link depth to crawl",
      },
      ignoreSitemap: {
        type: "boolean",
        description: "Skip sitemap.xml discovery",
      },
      limit: {
        type: "number",
        description: "Maximum number of pages to crawl",
      },
      allowBackwardLinks: {
        type: "boolean",
        description: "Allow crawling links that point to parent directories",
      },
      allowExternalLinks: {
        type: "boolean",
        description: "Allow crawling links to external domains",
      },
      webhook: {
        oneOf: [
          {
            type: "string",
            description: "Webhook URL to notify when crawl is complete",
          },
          {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "Webhook URL",
              },
              headers: {
                type: "object",
                description: "Custom headers for webhook requests",
              },
            },
            required: ["url"],
          },
        ],
      },
      deduplicateSimilarURLs: {
        type: "boolean",
        description: "Remove similar URLs during crawl",
      },
      ignoreQueryParameters: {
        type: "boolean",
        description: "Ignore query parameters when comparing URLs",
      },
      scrapeOptions: {
        type: "object",
        properties: {
          formats: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "markdown",
                "html",
                "rawHtml",
                "screenshot",
                "links",
                "screenshot@fullPage",
                "extract",
              ],
            },
          },
          onlyMainContent: {
            type: "boolean",
          },
          includeTags: {
            type: "array",
            items: { type: "string" },
          },
          excludeTags: {
            type: "array",
            items: { type: "string" },
          },
          waitFor: {
            type: "number",
          },
        },
        description: "Options for scraping each page",
      },
    },
    required: ["url"],
  },
};

const BATCH_SCRAPE_TOOL: Tool = {
  name: "fire_crawl_batch_scrape",
  description:
    "Scrape multiple URLs in batch mode. Returns a job ID that can be used to check status.",
  inputSchema: {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description: "List of URLs to scrape",
      },
      options: {
        type: "object",
        properties: {
          formats: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "markdown",
                "html",
                "rawHtml",
                "screenshot",
                "links",
                "screenshot@fullPage",
                "extract",
              ],
            },
          },
          onlyMainContent: {
            type: "boolean",
          },
          includeTags: {
            type: "array",
            items: { type: "string" },
          },
          excludeTags: {
            type: "array",
            items: { type: "string" },
          },
          waitFor: {
            type: "number",
          },
        },
      },
    },
    required: ["urls"],
  },
};

const CHECK_BATCH_STATUS_TOOL: Tool = {
  name: "fire_crawl_check_batch_status",
  description: "Check the status of a batch scraping job.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Batch job ID to check",
      },
    },
    required: ["id"],
  },
};

const CHECK_CRAWL_STATUS_TOOL: Tool = {
  name: "fire_crawl_check_crawl_status",
  description: "Check the status of a crawl job.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Crawl job ID to check",
      },
    },
    required: ["id"],
  },
};

// Type definitions
interface BatchScrapeOptions {
  urls: string[];
  options?: Omit<ScrapeParams, "url">;
}

interface StatusCheckOptions {
  id: string;
}

// Type guards
function isScrapeOptions(
  args: unknown
): args is ScrapeParams & { url: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    "url" in args &&
    typeof (args as { url: unknown }).url === "string"
  );
}

function isMapOptions(args: unknown): args is MapParams & { url: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    "url" in args &&
    typeof (args as { url: unknown }).url === "string"
  );
}

function isCrawlOptions(args: unknown): args is CrawlParams & { url: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    "url" in args &&
    typeof (args as { url: unknown }).url === "string"
  );
}

function isBatchScrapeOptions(args: unknown): args is BatchScrapeOptions {
  return (
    typeof args === "object" &&
    args !== null &&
    "urls" in args &&
    Array.isArray((args as { urls: unknown }).urls) &&
    (args as { urls: unknown[] }).urls.every((url) => typeof url === "string")
  );
}

function isStatusCheckOptions(args: unknown): args is StatusCheckOptions {
  return (
    typeof args === "object" &&
    args !== null &&
    "id" in args &&
    typeof (args as { id: unknown }).id === "string"
  );
}

// Server implementation
const server = new Server(
  {
    name: "fire-crawl",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Check for API key
const FIRE_CRAWL_API_KEY = process.env.FIRE_CRAWL_API_KEY!;
if (!FIRE_CRAWL_API_KEY) {
  console.error("Error: FIRE_CRAWL_API_KEY environment variable is required");
  process.exit(1);
}

// Initialize FireCrawl client
const client = new FirecrawlApp({ apiKey: FIRE_CRAWL_API_KEY });

// Rate limit configuration
const RATE_LIMIT = {
  perMinute: 3,
  waitTime: 25000 // 25 seconds in milliseconds
};

let requestCount = {
  minute: 0,
  lastReset: Date.now(),
  nextAllowedTime: Date.now()
};

async function checkRateLimit() {
  const now = Date.now();
  
  // Reset counter if minute has passed
  if (now - requestCount.lastReset > 60000) {
    requestCount.minute = 0;
    requestCount.lastReset = now;
  }

  // Check if we need to wait
  if (now < requestCount.nextAllowedTime) {
    const waitTime = requestCount.nextAllowedTime - now;
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime/1000)} seconds before trying again.`);
  }

  // Check if we've hit the per-minute limit
  if (requestCount.minute >= RATE_LIMIT.perMinute) {
    requestCount.nextAllowedTime = now + RATE_LIMIT.waitTime;
    throw new Error(`Rate limit exceeded. Please wait ${RATE_LIMIT.waitTime/1000} seconds before trying again.`);
  }

  requestCount.minute++;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    SCRAPE_TOOL,
    MAP_TOOL,
    CRAWL_TOOL,
    BATCH_SCRAPE_TOOL,
    CHECK_BATCH_STATUS_TOOL,
    CHECK_CRAWL_STATUS_TOOL,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "fire_crawl_scrape": {
        if (!isScrapeOptions(args)) {
          throw new Error("Invalid arguments for fire_crawl_scrape");
        }
        const { url, ...options } = args;
        try {
          await checkRateLimit();
          const response = await client.scrapeUrl(url, options);
          if (!response.success) {
            throw new Error(`Scraping failed: ${response.error || 'Unknown error'}`);
          }
          const content = response.markdown || response.html || response.rawHtml;
          if (!content) {
            throw new Error(`No content received from FireCrawl API. Response: ${JSON.stringify(response, null, 2)}`);
          }
          return {
            content: [{ type: "text", text: content }],
            isError: false
          };
        } catch (error) {
          const errorMessage = error instanceof Error 
            ? error.message
            : `Scraping failed: ${JSON.stringify(error)}`;
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true
          };
        }
      }

      case "fire_crawl_map": {
        if (!isMapOptions(args)) {
          throw new Error("Invalid arguments for fire_crawl_map");
        }
        const { url, ...options } = args;
        const response = await client.mapUrl(url, options);
        if ("error" in response) {
          throw new Error(response.error);
        }
        if (!response.links) {
          throw new Error("No links received from FireCrawl API");
        }
        return {
          content: [{ type: "text", text: response.links.join("\n") }],
          isError: false,
        };
      }

      case "fire_crawl_batch_scrape": {
        if (!isBatchScrapeOptions(args)) {
          throw new Error("Invalid arguments for fire_crawl_batch_scrape");
        }
        try {
          await checkRateLimit();
          const response = await client.asyncBatchScrapeUrls(args.urls, args.options);
          if (!response.success) {
            throw new Error(`Batch scrape failed: ${response.error || 'Unknown error'}`);
          }
          return {
            content: [{ type: "text", text: `Started batch scrape with job ID: ${response.id}` }],
            isError: false
          };
        } catch (error) {
          const errorMessage = error instanceof Error 
            ? error.message
            : `Batch scrape failed: ${JSON.stringify(error)}`;
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true
          };
        }
      }

      case "fire_crawl_check_batch_status": {
        if (!isStatusCheckOptions(args)) {
          throw new Error("Invalid arguments for fire_crawl_check_batch_status");
        }
        try {
          await checkRateLimit();
          const response = await client.checkBatchScrapeStatus(args.id);
          if (!response.success) {
            throw new Error(`Status check failed: ${response.error || 'Unknown error'}`);
          }
          const status = `Batch Status:
Status: ${response.status}
Progress: ${response.completed}/${response.total}
Credits Used: ${response.creditsUsed}
Expires At: ${response.expiresAt}
${response.data.length > 0 ? '\nResults:\n' + formatResults(response.data) : ''}`;
          return {
            content: [{ type: "text", text: status }],
            isError: false
          };
        } catch (error) {
          const errorMessage = error instanceof Error 
            ? error.message
            : `Status check failed: ${JSON.stringify(error)}`;
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true
          };
        }
      }

      case "fire_crawl_crawl": {
        if (!isCrawlOptions(args)) {
          throw new Error("Invalid arguments for fire_crawl_crawl");
        }
        const { url, ...options } = args;
        const response = await client.asyncCrawlUrl(url, options);
        if (!response.success) {
          throw new Error(response.error);
        }
        return {
          content: [
            {
              type: "text",
              text: `Started crawl for ${url} with job ID: ${response.id}`,
            },
          ],
          isError: false,
        };
      }

      case "fire_crawl_check_crawl_status": {
        if (!isStatusCheckOptions(args)) {
          throw new Error(
            "Invalid arguments for fire_crawl_check_crawl_status"
          );
        }
        const response = await client.checkCrawlStatus(args.id);
        if (!response.success) {
          throw new Error(response.error);
        }
        const status = `Crawl Status:
Status: ${response.status}
Progress: ${response.completed}/${response.total}
Credits Used: ${response.creditsUsed}
Expires At: ${response.expiresAt}
${
  response.data.length > 0 ? "\nResults:\n" + formatResults(response.data) : ""
}`;
        return {
          content: [{ type: "text", text: status }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

// Helper function to format results
function formatResults(data: FirecrawlDocument[]): string {
  return data
    .map((doc) => {
      const content = doc.markdown || doc.html || doc.rawHtml || "No content";
      return `URL: ${doc.url || "Unknown URL"}
Content: ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}
${doc.metadata?.title ? `Title: ${doc.metadata.title}` : ""}`;
    })
    .join("\n\n");
}

// Server startup
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("FireCrawl MCP Server running on stdio");
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
