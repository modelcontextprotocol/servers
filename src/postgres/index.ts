import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Changed from Server to McpServer
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import pg from "pg";
import { config } from 'dotenv';
config();

// Initialize McpServer (instead of Server)
const server = new McpServer(
  {
    name: "example-servers/postgres-http", // Updated name for clarity
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);



const databaseUrl = process.env.POSTGRES_CONNECTION_STRING;
if (!databaseUrl) {
  console.error("Missing POSTGRES_CONNECTION_STRING in environment");
  process.exit(1);
}

const resourceBaseUrl = new URL(databaseUrl);
resourceBaseUrl.protocol = "postgres:";
resourceBaseUrl.password = ""; // Clear password for constructing resource URIs

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

const SCHEMA_PATH = "schema";

async function runQuery() {
  try {
    // Example query - select version
    const res = await pool.query('SELECT * FROM sales;');
    console.log('Query result:', res.rows); // Output: Hello, world!
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    // Optional: close the pool if done
    await pool.end();
  }
}

// Run it
runQuery();
