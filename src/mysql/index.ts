#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import mysql, { MysqlError, PoolConnection } from "mysql";

type MySQLErrorType = MysqlError | null;

interface TableRow {
  table_name: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
}

interface QueryResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError: boolean;
}

const config = {
  server: {
    name: "example-servers/mysql",
    version: "0.1.0",
  },
  mysql: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || "3306"),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASS || "",
    database: process.env.MYSQL_DB || "",
    connectionLimit: 10,
  },
  paths: {
    schema: "schema",
  },
};

const mysqlQuery = <T>(
  connection: PoolConnection,
  sql: string,
  params: any[] = [],
): Promise<T> => {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (error: MySQLErrorType, results: any) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
};

const mysqlGetConnection = (pool: mysql.Pool): Promise<PoolConnection> => {
  return new Promise(
    (
      resolve: (value: PoolConnection | PromiseLike<PoolConnection>) => void,
      reject,
    ) => {
      pool.getConnection(
        (error: MySQLErrorType, connection: PoolConnection) => {
          if (error) reject(error);
          else resolve(connection);
        },
      );
    },
  );
};

const mysqlBeginTransaction = (connection: PoolConnection): Promise<void> => {
  return new Promise((resolve, reject) => {
    connection.beginTransaction((error: MySQLErrorType) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

const mysqlRollback = (connection: PoolConnection): Promise<void> => {
  return new Promise((resolve, _) => {
    connection.rollback(() => resolve());
  });
};

const pool = mysql.createPool(config.mysql);
const server = new Server(config.server, {
  capabilities: {
    resources: {},
    tools: {},
  },
});

async function executeQuery<T>(sql: string, params: any[] = []): Promise<T> {
  const connection = await mysqlGetConnection(pool);
  try {
    const results = await mysqlQuery<T>(connection, sql, params);
    return results;
  } finally {
    connection.release();
  }
}

async function executeReadOnlyQuery<T>(sql: string): Promise<T> {
  const connection = await mysqlGetConnection(pool);

  try {
    // Set read-only mode
    await mysqlQuery(connection, "SET SESSION TRANSACTION READ ONLY");

    // Begin transaction
    await mysqlBeginTransaction(connection);

    // Execute query
    const results = await mysqlQuery(connection, sql);

    // Rollback transaction (since it's read-only)
    await mysqlRollback(connection);

    // Reset to read-write mode
    await mysqlQuery(connection, "SET SESSION TRANSACTION READ WRITE");

    return <T>{
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    await mysqlRollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

// Request handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const results = (await executeQuery(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()",
  )) as TableRow[];

  return {
    resources: results.map((row: TableRow) => ({
      uri: new URL(
        `${row.table_name}/${config.paths.schema}`,
        `${config.mysql.host}:${config.mysql.port}`,
      ).href,
      mimeType: "application/json",
      name: `"${row.table_name}" database schema`,
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const resourceUrl = new URL(request.params.uri);
  const pathComponents = resourceUrl.pathname.split("/");
  const schema = pathComponents.pop();
  const tableName = pathComponents.pop();

  if (schema !== config.paths.schema) {
    throw new Error("Invalid resource URI");
  }

  const results = (await executeQuery(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?",
    [tableName],
  )) as ColumnRow[];

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mysql_query",
      description: "Run a read-only MySQL query",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "mysql_query") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const sql = request.params.arguments?.sql as string;
  return executeReadOnlyQuery(sql);
});

// Server startup and shutdown
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down...`);
  return new Promise<void>((resolve, reject) => {
    pool.end((err: MySQLErrorType) => {
      if (err) {
        console.error("Error closing pool:", err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

process.on("SIGINT", async () => {
  try {
    await shutdown("SIGINT");
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  try {
    await shutdown("SIGTERM");
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

runServer().catch((error: unknown) => {
  console.error("Server error:", error);
  process.exit(1);
});
