#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import mysql, { MysqlError, PoolConnection, OkPacket } from "mysql";

type MySQLErrorType = MysqlError | null;

interface TableRow {
  table_name: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
}

type QueryResult = OkPacket | any[] | any;
const server = new Server(
  {
    name: "example-servers/mysql",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

const MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const MYSQL_PORT = process.env.MYSQL_PORT || "3306";
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASS = process.env.MYSQL_PASS || "";
const MYSQL_DB = process.env.MYSQL_DB || "";

const pool = mysql.createPool({
  connectionLimit: 10,
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT),
  user: MYSQL_USER,
  password: MYSQL_PASS,
  database: MYSQL_DB,
});

const SCHEMA_PATH = "schema";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return new Promise((resolve, reject) => {
    pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()",
      (error: MySQLErrorType, results: TableRow[]) => {
        if (error) reject(error);
        resolve({
          resources: results.map((row: TableRow) => ({
            uri: new URL(
              `${row.table_name}/${SCHEMA_PATH}`,
              `${MYSQL_HOST}:${MYSQL_PORT}`,
            ).href,
            mimeType: "application/json",
            name: `"${row.table_name}" database schema`,
          })),
        });
      },
    );
  });
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const resourceUrl = new URL(request.params.uri);

  const pathComponents = resourceUrl.pathname.split("/");
  const schema = pathComponents.pop();
  const tableName = pathComponents.pop();

  if (schema !== SCHEMA_PATH) {
    throw new Error("Invalid resource URI");
  }

  return new Promise((resolve, reject) => {
    pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?",
      [tableName],
      (error: MySQLErrorType, results: ColumnRow[]) => {
        if (error) reject(error);
        resolve({
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(results, null, 2),
            },
          ],
        });
      },
    );
  });
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
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
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "mysql_query") {
    const sql = request.params.arguments?.sql as string;

    return new Promise((resolve, reject) => {
      pool.getConnection((err: MySQLErrorType, connection: PoolConnection) => {
        if (err) reject(err);

        // @INFO: Set session to read only BEFORE beginning the transaction
        connection.query(
          "SET SESSION TRANSACTION READ ONLY",
          (err: MySQLErrorType) => {
            if (err) {
              connection.release();
              reject(err);
              return;
            }

            connection.beginTransaction((err: MySQLErrorType) => {
              if (err) {
                connection.release();
                reject(err);
                return;
              }

              connection.query(
                sql,
                (error: MySQLErrorType, results: QueryResult) => {
                  if (error) {
                    connection.rollback(() => {
                      connection.release();
                      reject(error);
                    });
                    return;
                  }

                  // @INFO: Reset the transaction mode back to default before releasing
                  connection.rollback(() => {
                    connection.query(
                      "SET SESSION TRANSACTION READ WRITE",
                      (err: MySQLErrorType) => {
                        connection.release();
                        if (err) {
                          console.warn(
                            "Failed to reset transaction mode:",
                            err,
                          );
                        }
                        resolve({
                          content: [
                            {
                              type: "text",
                              text: JSON.stringify(results, null, 2),
                            },
                          ],
                          isError: false,
                        });
                      },
                    );
                  });
                },
              );
            });
          },
        );
      });
    });
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on("SIGINT", () => {
  pool.end((err: MySQLErrorType) => {
    if (err) console.error("Error closing pool:", err);
    process.exit(err ? 1 : 0);
  });
});

runServer().catch(console.error);
