#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { ZendeskClient } from "./client.js";
import { registerArticleTools } from "./tools/article-tools.js";
import { registerTicketTools } from "./tools/ticket-tools.js";

/**
 * Zendesk Help Center MCP Server
 * This server provides tools for interacting with Zendesk Help Center and Support APIs
 */

// Load environment variables
dotenv.config();

/**
 * Validate and load configuration from environment variables
 */
function loadConfig() {
  // Zendesk API configuration
  const subdomain = process.env.ZENDESK_SUBDOMAIN || "";
  const email = process.env.ZENDESK_EMAIL || "";
  const apiToken = process.env.ZENDESK_API_TOKEN || "";

  // Get default locale from environment variable or fallback to "en"
  const DEFAULT_LOCALE = process.env.DEFAULT_LOCALE || "en";

  if (!subdomain || !email || !apiToken) {
    console.error("Environment variables are not set. Please check your .env file.");
    process.exit(1);
  }

  return {
    subdomain,
    email,
    apiToken,
    defaultLocale: DEFAULT_LOCALE
  };
}

/**
 * Initialize and start the MCP server
 */
async function main() {
  // Load configuration
  const config = loadConfig();
  
  // Initialize Zendesk client
  const zendeskClient = new ZendeskClient(config);

  // Create MCP server
  const server = new McpServer({
    name: "zendeskHelpCenter",
    version: "1.0.0",
  });

  // Register all tools
  registerArticleTools(server, zendeskClient, config.defaultLocale);
  registerTicketTools(server, zendeskClient);

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Zendesk Help Center MCP Server is running");
}

// Start the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
