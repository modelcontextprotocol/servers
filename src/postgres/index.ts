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
            where: { type: "object", description: "The WHERE clause to filter rows to update" }
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
            where: { type: "object", description: "The WHERE clause to filter rows to delete" }
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

  const tableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  try {
    if (args.table && !tableNameRegex.test(args.table)) {
      throw new Error("Invalid table name");
    }

    switch (name) {
      case "query": {
        const result = await withTransaction(client, true, () => client.query(args.sql));
        return {
          content: [{ type: "text", text: JSON.stringify((result as any).rows, null, 2) }],
          isError: false,
        };
      }

      case "insert": {
        if (args.values) validateObjectKeys(args.values, "column");

        const { sql, params } = buildInsertQuery(args.table, args.values);
        const result = await withTransaction(client, false, () => {
          return client.query(sql, params);
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows[0], null, 2) }],
          isError: false,
        };
      }

      case "update": {
        if (args.values) validateObjectKeys(args.values, "column");
        if (args.where) validateObjectKeys(args.where, "where field");

        const { sql, params } = buildUpdateQuery(args.table, args.values, args.where);
        const result = await withTransaction(client, false, () => client.query(sql, params));
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
          isError: false,
        };
      }

      case "delete": {
        if (args.where) validateObjectKeys(args.where, "where field");

        const { sql, params } = buildDeleteQuery(args.table, args.where);
        const result = await withTransaction(client, false, () => {
          return client.query(sql, params);
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
          isError: false,
        };
      }

      case "execute": {
        await withTransaction(client, false, () => client.query(args.sql));
        return {
          content: [{ type: "text", text: "SQL command executed successfully." }],
          isError: false,
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  } finally {
    client.release();
  }
});

function buildInsertQuery(table: string, values: Record<string, any>) {
  const columns = Object.keys(values).map(key => `"${key}"`).join(", ");
  const placeholders = Object.values(values).map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`;
  const params = Object.values(values);
  return { sql, params };
}

function buildUpdateQuery(table: string, values: Record<string, any>, where: Record<string, any>) {
  const setParts = Object.keys(values).map((key, i) => `"${key}" = $${i + 1}`).join(", ");
  const whereOffset = Object.keys(values).length;
  const whereParts = Object.keys(where).map((key, i) => `"${key}" = $${i + 1 + whereOffset}`).join(" AND ");
  const sql = `UPDATE "${table}" SET ${setParts} WHERE ${whereParts} RETURNING *`;
  const params = [...Object.values(values), ...Object.values(where)];
  return { sql, params };
}

function buildDeleteQuery(table: string, where: Record<string, any>) {
  const whereParts = Object.keys(where).map((key, i) => `"${key}" = $${i + 1}`).join(" AND ");
  const sql = `DELETE FROM "${table}" WHERE ${whereParts} RETURNING *`;
  const params = Object.values(where);
  return { sql, params };
}

async function withTransaction<T>(client: pg.PoolClient, readOnly: boolean, fn: () => Promise<T>): Promise<T> {
  try {
    await client.query(`BEGIN TRANSACTION ${readOnly ? "READ ONLY" : "READ WRITE"}`);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => { });
    throw error;
  }
}

const validIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateObjectKeys(obj: Record<string, any>, name = "field") {
  for (const key of Object.keys(obj)) {
    if (!validIdentifier.test(key)) {
      throw new Error(`Invalid ${name} name: ${key}`);
    }
  }
}

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
