#!/usr/bin/env node

// --------------------------------------
// This code sets up a simple LLM tool server for MSSQL databases. It allows
// listing tables as resources, reading their schema, and performing read-only
// SQL queries. It's designed to be flexible, with schema configuration and
// resource path configuration taken from environment variables or default values.
// --------------------------------------

// --------------------------------------
// Environment configuration:
// - DB_SCHEMA: database schema to query (default: 'dbo')
// - RESOURCE_SCHEMA_PATH: the resource suffix used to fetch table schema (default: 'schema')
// Example: If RESOURCE_SCHEMA_PATH = 'schema' and table name = 'Users',
// resource URL might look like: mssql://Users/schema
// --------------------------------------

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import sql from "mssql";

// --------------------------------------
// Configure defaults for DB schema and resource schema path
// DB_SCHEMA: The schema in the database (e.g., 'dbo'). This is NOT the same as RESOURCE_SCHEMA_PATH.
// RESOURCE_SCHEMA_PATH: The suffix used in resource URIs to fetch the schema of a table.
const DB_SCHEMA = process.env.DB_SCHEMA || "dbo";
const RESOURCE_SCHEMA_PATH = process.env.RESOURCE_SCHEMA_PATH || "schema";

// --------------------------------------
// Initialize the server
const server = new Server(
  {
    name: "example-servers/mssql",
    version: "0.3.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// --------------------------------------
// Extract connection string from command line arguments
const connectionString = process.argv[2];
if (!connectionString) {
  console.error(
    "Error: A connection string must be provided as a command line argument."
  );
  process.exit(1);
}

// --------------------------------------
// Parse connection string and set up SQL configuration
// Note: Ensure the parseConnectionString function exists in the sql version you're using.
// If not supported, you'll need to manually parse the connection string.
let parsedConfig;
try {
  parsedConfig = sql.ConnectionPool.parseConnectionString(connectionString);
} catch (err) {
  console.error("Error parsing connection string:", err);
  process.exit(1);
}

const sqlConfig = {
  ...parsedConfig,
  options: {
    // It's often best practice to keep encryption enabled for MSSQL connections,
    // especially when connecting remotely.
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// --------------------------------------
// Lazy initialization of the SQL connection pool
let poolConnectionPromise: Promise<sql.ConnectionPool> | null = null;
async function getPoolConnection() {
  if (!poolConnectionPromise) {
    poolConnectionPromise = (async () => {
      const pool = new sql.ConnectionPool(sqlConfig);
      await pool.connect();
      return pool;
    })();
  }
  return poolConnectionPromise;
}

// --------------------------------------
// Request handler: ListResources
// This lists all tables in the specified DB_SCHEMA as resources.
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const pool = await getPoolConnection();
  try {
    // We filter by DB_SCHEMA to list only tables from that schema.
    const query = `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @dbSchema
      AND TABLE_TYPE = 'BASE TABLE';
    `;
    const result = await pool
      .request()
      .input("dbSchema", sql.VarChar, DB_SCHEMA)
      .query(query);

    // Each table is represented as a resource with a URI and a name.
    // The RESOURCE_SCHEMA_PATH suffix is appended to the URI to represent the schema resource.
    var resourceSchemaPath = encodeURIComponent(RESOURCE_SCHEMA_PATH);
    return {
      resources: result.recordset.map(
        ({ TABLE_NAME }: { TABLE_NAME: string }) => ({
          uri: `mssql://${encodeURIComponent(
            TABLE_NAME
          )}/${resourceSchemaPath}`,
          mimeType: "application/json",
          name: `"${TABLE_NAME}" database schema`,
        })
      ),
    };
  } catch (error) {
    console.error("Error in ListResources:", error);
    throw error;
  }
});

// --------------------------------------
// Request handler: ReadResource
// This reads the schema (column names and data types) for a given table resource URI.
// The URI is expected to look like: mssql://{TableName}/{RESOURCE_SCHEMA_PATH}
// Example: mssql://Users/schema
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const resourceUrl = new URL(request.params.uri);
  // The path components usually start with '/', so split and filter empty parts.
  const pathComponents = resourceUrl.pathname.split("/").filter(Boolean);
  // The last component should be RESOURCE_SCHEMA_PATH and the one before is the table name.
  const suffix = pathComponents.pop();
  const tableName = pathComponents.pop();

  if (suffix !== RESOURCE_SCHEMA_PATH || !tableName) {
    throw new Error(`Invalid resource URI: ${request.params.uri}`);
  }

  const pool = await getPoolConnection();
  try {
    // Retrieve column info for the given table from the specified DB_SCHEMA.
    const query = `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @dbSchema
      AND TABLE_NAME = @tableName;
    `;
    const result = await pool
      .request()
      .input("dbSchema", sql.VarChar, DB_SCHEMA)
      .input("tableName", sql.VarChar, tableName)
      .query(query);

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(result.recordset, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error("Error in ReadResource:", error);
    throw error;
  }
});

// --------------------------------------
// Request handler: ListTools
// We provide a single tool "query" that executes read-only queries.
// In this implementation, we use a transaction and rollback it afterward to avoid changes.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query",
        description: "Run a read-only MSSQL query",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string" },
          },
          required: ["sql"],
        },
      },
    ],
  };
});

// --------------------------------------
// Request handler: CallTool
// Currently supports only the "query" tool.
// Runs the provided SQL as a read-only query within a transaction, then rolls back.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "query") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const sqlQuery = request.params.arguments?.sql as string;
  if (!sqlQuery) {
    throw new Error("Missing 'sql' argument for the query tool.");
  }

  const pool = await getPoolConnection();
  const transaction = pool.transaction();
  try {
    await transaction.begin();
    // MSSQL does not have a "read-only transaction" mode by default,
    // but we will not perform any modifications. We run the query and then rollback.
    const result = await transaction.request().query(sqlQuery);
    await transaction.rollback(); // Always rollback to ensure no changes are applied.

    return {
      content: [
        { type: "text", text: JSON.stringify(result.recordset, null, 2) },
      ],
      isError: false,
    };
  } catch (error) {
    console.error("Error in CallTool (query):", error);
    // Rollback on error to avoid partial changes.
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Rollback error:", rollbackError);
    }
    throw error;
  }
});

// --------------------------------------
// Close the pool connection before process exit
process.on("beforeExit", async () => {
  if (poolConnectionPromise) {
    const pool = await poolConnectionPromise;
    try {
      await pool.close();
    } catch (e) {
      console.error("Error closing pool:", e);
    }
  }
});

// --------------------------------------
// Start the server and connect via stdio
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch((err) => {
  console.error("Error running server:", err);
  process.exit(1);
});
