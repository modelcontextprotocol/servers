#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import oracledb from "oracledb";

const server = new Server(
  {
    name: "example-servers/oracle",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {}, // Add this line to indicate support for prompts
    },
  },
);

const prompts = [
  { id: 1, text: "query select * from COUNTRIES" },
  { id: 2, text: "explain select * from COUNTRIES" },
  { id: 3, text: "stats COUNTRIES" },
  { id: 4, text: "connect to Oracle using an string like host.docker.internal:1521/freepdb1 user name and password" }
];

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Please provide an Oracle database connection string as a command-line argument");
  process.exit(1);
}

const connectionString = args[0];

if (!process.env.ORACLE_USER) {
  console.error("Error: Environment variable ORACLE_USER must be set.");
  process.exit(1);
}
const resourceBaseUrl = new URL("oracle://" + process.env.ORACLE_USER.toUpperCase());
resourceBaseUrl.protocol = "oracle:";
resourceBaseUrl.password = "";

const SCHEMA_PATH = "schema";

// Initialize the pool outside of request handlers.
let pool: oracledb.Pool | undefined = undefined;

// Helper function to initialize the connection pool
async function initializePool(connectionString: string) {
  const dbUser = process.env.ORACLE_USER;
  const dbPassword = process.env.ORACLE_PASSWORD;

  if (!dbUser || !dbPassword) {
    console.error(
      "Error: Environment variables ORACLE_USER and ORACLE_PASSWORD must be set.",
    );
    process.exit(1);
  }

  try {
    //console.log("Initializing OracleDB connection pool...");
    pool = await oracledb.createPool({
      user: dbUser,
      password: dbPassword,
      connectionString,
      poolMin: 4,
      poolMax: 10,
      poolIncrement: 1,
      queueTimeout: 60000,
    });
    //console.log("OracleDB connection pool initialized successfully.");
  } catch (err) {
    console.error("connectionString:", connectionString);
    console.error("Error initializing connection pool:", err);
    process.exit(1);
  }
}


server.setRequestHandler(ListResourcesRequestSchema, async () => {
  if (!pool) {
    throw new Error("Oracle connection pool not initialized.");
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute<{ TABLE_NAME: string }>(
      `SELECT table_name as "TABLE_NAME" FROM user_tables`,
      [], // binding parameters
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return {
      resources: result.rows!.map((row) => ({
        uri: new URL(`${row.TABLE_NAME}/${SCHEMA_PATH}`, resourceBaseUrl).href,
        mimeType: "application/json",
        name: `"${row.TABLE_NAME}" database schema`,
      })),
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error closing Oracle connection:", err);
      }
    }
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!pool) {
    throw new Error("Oracle connection pool not initialized.");
  }

  const resourceUrl = new URL(request.params.uri);

  const pathComponents = resourceUrl.pathname.split("/");
  const schema = pathComponents.pop();
  const tableName = pathComponents.pop();

  if (schema !== SCHEMA_PATH) {
    throw new Error("Invalid resource URI");
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute<{ METADATA: string }>(
      `select dbms_developer.get_metadata (name => UPPER(:tableName)) as metadata from dual`, [tableName], { outFormat: oracledb.OUT_FORMAT_OBJECT });

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(result.rows?.[0]?.METADATA, null, 2),
        },
      ],
      isError: false,
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error closing Oracle connection:", err);
      }
    }
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
        name: "explain",
        description: "Explain Plan for SQL query",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string" },
          },
        },
      },
      {
        name: "stats",
        description: "Stats for SQL object",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      },
      {
        name: "connect",
        description: "Switch to a new Oracle DB connection on the fly",
        inputSchema: {
          type: "object",
          properties: {
            connectionString: { type: "string" },
            user: { type: "string" },
            password: { type: "string" },
          },
          required: ["connectionString", "user", "password"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!pool) {
    throw new Error("Oracle connection pool not initialized.");
  }

  if (request.params.name === "query") {
    const sql = typeof request.params.arguments?.sql === "string" 
      ? request.params.arguments.sql.replace(/;\s*$/, "") 
      : "";

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.execute("SET TRANSACTION READ ONLY");
      const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
        isError: false,
      };
    } catch (error) {
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.warn("Could not close connection:", err);
        }
      }
    }
  }
  if (request.params.name === "explain") {
    const sql = typeof request.params.arguments?.sql === "string" 
      ? request.params.arguments.sql.replace(/;\s*$/, "") 
      : "";

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.execute("EXPLAIN PLAN FOR " + sql);
      const result = await connection.execute("SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, NULL, 'ALL'))", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
        isError: false,
      };
    } catch (error) {
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.warn("Could not close connection:", err);
        }
      }
    }
  }
  if (request.params.name === "stats") {
    const tableName = request.params.arguments?.name as string;
    let connection;
    try {
      connection = await pool.getConnection();
      const result = await connection.execute<{ STATS_JSON: string }>(`SELECT JSON_OBJECT(
  'table_stats' VALUE (
    SELECT JSON_OBJECT(
      'owner' VALUE owner,
      'table_name' VALUE table_name,
      'num_rows' VALUE num_rows,
      'blocks' VALUE blocks,
      'empty_blocks' VALUE empty_blocks,
      'avg_row_len' VALUE avg_row_len,
      'last_analyzed' VALUE TO_CHAR(last_analyzed, 'YYYY-MM-DD HH24:MI:SS')
    )
    FROM dba_tab_statistics
    WHERE owner = UPPER(USER) AND table_name = UPPER(:tableName)
  ),
  'index_stats' VALUE (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'index_name' VALUE index_name,
        'blevel' VALUE blevel,
        'leaf_blocks' VALUE leaf_blocks,
        'distinct_keys' VALUE distinct_keys,
        'num_rows' VALUE num_rows,
        'clustering_factor' VALUE clustering_factor,
        'last_analyzed' VALUE TO_CHAR(last_analyzed, 'YYYY-MM-DD HH24:MI:SS')
      )
    )
    FROM dba_ind_statistics
    WHERE table_owner = UPPER(USER) AND table_name = UPPER(:tableName)
  ),
  'column_stats' VALUE (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'column_name' VALUE column_name,
        'num_distinct' VALUE num_distinct,
        'density' VALUE density,
        'histogram' VALUE histogram,
        'last_analyzed' VALUE TO_CHAR(last_analyzed, 'YYYY-MM-DD HH24:MI:SS')
      )
    )
    FROM dba_tab_col_statistics
    WHERE owner = UPPER(USER) AND table_name = UPPER(:tableName)
  )
) AS stats_json
FROM dual`, [tableName,tableName,tableName], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return {
        content: [{ type: "text", text: result.rows?.[0]?.STATS_JSON }],
        isError: false,
      };
    } catch (error) {
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.warn("Could not close connection:", err);
        }
      }
    }
  }
  if (request.params.name === "connect") {
    const newConnectionString = request.params.arguments?.connectionString;
    const newUser = request.params.arguments?.user;
    const newPassword = request.params.arguments?.password;
    if (
      typeof newConnectionString !== "string" || !newConnectionString ||
      typeof newUser !== "string" || !newUser ||
      typeof newPassword !== "string" || !newPassword
    ) {
      return {
        content: [{ type: "text", text: "Missing or invalid connectionString, user, or password argument." }],
        isError: true,
      };
    }
    try {
      if (pool) {
        try {
          await pool.close(0); // Close existing pool immediately
        } catch (err) {
          // Log but continue
          console.warn("Error closing previous pool:", err);
        }
      }
      // Override env vars for this session
      process.env.ORACLE_USER = newUser;
      process.env.ORACLE_PASSWORD = newPassword;
      await initializePool(newConnectionString);
      return {
        content: [{ type: "text", text: `Successfully connected to new Oracle DB: ${newConnectionString} as user ${newUser}` }],
        isError: false,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to connect: ${err}` }],
        isError: true,
      };
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

import { z } from "zod";

const PromptsListRequestSchema = z.object({
  method: z.literal("prompts/list"),
  params: z.object({}),
});

server.setRequestHandler(PromptsListRequestSchema, async () => {
  return {
    prompts,
  };
});

async function runServer() {
  await initializePool(connectionString); // Initialize the pool before starting the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on("close", () => {
  console.error("Oracle MCP Server closed");
  server.close();
  process.exit(0);
});
