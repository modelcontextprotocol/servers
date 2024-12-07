#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import sql from 'mssql';

const server = new Server(
  {
    name: "example-servers/mssql",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

// รับ connection string จาก command line argument
const connectionString = process.argv[2];
if (!connectionString) {
  console.error('Connection string is required');
  process.exit(1);
}

// แปลง connection string เป็น config object
const sqlConfig = {
  ...sql.ConnectionPool.parseConnectionString(connectionString),
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolConnection: Promise<sql.ConnectionPool> | null = null;

async function getConnection() {
  if (!poolConnection) {
    poolConnection = sql.connect(sqlConfig);
  }
  return poolConnection;
}

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const pool = await getConnection();
  try {
    const result = await pool.request().query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
    );
    return {
      resources: result.recordset.map((row) => ({
        uri: `mssql://${row.TABLE_NAME}/schema`,
        mimeType: "application/json",
        name: `"${row.TABLE_NAME}" database schema`,
      })),
    };
  } catch (error) {
    console.error('Error in ListResources:', error);
    throw error;
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = new URL(request.params.uri);
  const tableName = uri.pathname.split('/')[1];
  const pool = await getConnection();

  try {
    const result = await pool.request()
      .input('tableName', sql.VarChar, tableName)
      .query(
        "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName"
      );

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
    console.error('Error in ReadResource:', error);
    throw error;
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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "query") {
    const pool = await getConnection();
    try {
      const result = await pool.request().query(request.params.arguments?.sql as string);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result.recordset, null, 2) 
        }],
        isError: false,
      };
    } catch (error) {
      console.error('Error in CallTool:', error);
      throw error;
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

process.on('beforeExit', async () => {
  if (poolConnection) {
    const pool = await poolConnection;
    await pool.close();
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);