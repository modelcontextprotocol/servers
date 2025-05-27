#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";

const server = new Server(
  {
    name: "example-servers/postgres",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Please provide a database URL as a command-line argument");
  process.exit(1);
}

const databaseUrl = args[0];

const resourceBaseUrl = new URL(databaseUrl);
resourceBaseUrl.protocol = "postgres:";
resourceBaseUrl.password = "";

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

const SCHEMA_PATH = "schema";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    return {
      resources: result.rows.map((row) => ({
        uri: new URL(`${row.table_name}/${SCHEMA_PATH}`, resourceBaseUrl).href,
        mimeType: "application/json",
        name: `"${row.table_name}" database schema`,
      })),
    };
  } finally {
    client.release();
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const resourceUrl = new URL(request.params.uri);

  const pathComponents = resourceUrl.pathname.split("/");
  const schema = pathComponents.pop();
  const tableName = pathComponents.pop();

  if (schema !== SCHEMA_PATH) {
    throw new Error("Invalid resource URI");
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
      [tableName],
    );

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(result.rows, null, 2),
        },
      ],
    };
  } finally {
    client.release();
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query",
        description: "Run a read-only SQL query",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string" },
          },
        },
      },
      {
        name: "insert",
        description: "Execute a SQL write query to insert a new row into a table",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string", description: "The name of the row to insert into" },
            values: { type: "object", description: "The values to insert into the table" }
          },
          required: ["table", "values"],
        }
      },
      {
        name: "update",
        description: "Execute a SQL write query to update existing rows in a table",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string", description: "The name of the table to update" },
            values: { type: "object", description: "The values to update in the table" },
            where: { type: "string", description: "The WHERE clause to filter rows to update" }
          },
          required: ["table", "values", "where"],
        }
      },
      {
        name: "delete",
        description: "Execute a SQL write query to delete rows from a table",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string", description: "The name of the table to delete from" },
            where: { type: "string", description: "The WHERE clause to filter rows to delete" }
          },
          required: ["table", "where"],
        }
      },
      {
        name: "execute",
        description: "Execute a general SQL command (e.g., CREATE TABLE, ALTER TABLE)",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "SQL command to execute general queries" }
          },
          required: ["sql"],
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const client = await pool.connect();
  const name = request.params.name;
  const args = request.params.arguments as any;

  try {
    switch (name) {
      case "query": {
        await client.query("BEGIN TRANSACTION READ ONLY");
        const result = await client.query(args.sql);
        await client.query("COMMIT");
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
          isError: false,
        };
      }

      case "insert": {
        await client.query("BEGIN TRANSACTION READ WRITE");
        const columns = Object.keys(args.values).map((key) => `"${key}"`).join(", ");
        const values = Object.values(args.values);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
        const sql = `INSERT INTO "${args.table}" (${columns}) VALUES (${placeholders}) RETURNING *`;

        const result = await client.query(sql, values);
        await client.query("COMMIT");
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows[0], null, 2) }],
          isError: false,
        };
      }

      case "update": {
        await client.query("BEGIN TRANSACTION READ WRITE");
        const setParts = Object.entries(args.values)
          .map(([key], i) => `"${key}" = $${i + 1}`)
          .join(", ");
        const values = Object.values(args.values);
        const sql = `UPDATE "${args.table}" SET ${setParts} WHERE ${args.where} RETURNING *`;

        const result = await client.query(sql, values);
        await client.query("COMMIT");
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
          isError: false,
        };
      }

      case "delete": {
        await client.query("BEGIN TRANSACTION READ WRITE");
        const sql = `DELETE FROM "${args.table}" WHERE ${args.where} RETURNING *`;

        const result = await client.query(sql);
        await client.query("COMMIT");
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
          isError: false,
        };
      }

      case "execute": {
        await client.query("BEGIN TRANSACTION READ WRITE");
        await client.query(args.sql);
        await client.query("COMMIT");
        return {
          content: [{ type: "text", text: "SQL command executed successfully." }],
          isError: false,
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => { });
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  } finally {
    client.release();
  }
});


async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
