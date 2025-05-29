// src/tools/queryTool.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pool } from "../config/database.js";

export function registerQueryTool(mcpServer: McpServer) {
    mcpServer.tool(
        "query",
        "Execute SQL queries with read-only transactions",
        {
            sql: z.string()
        },
        async ({ sql }) => {
            const client = await pool.connect();
            try {
                await client.query("BEGIN TRANSACTION READ ONLY");
                const result = await client.query(sql);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
                    isError: false,
                };
            } catch (error) {
                throw error;
            } finally {
                client
                    .query("ROLLBACK")
                    .catch((error) =>
                        console.warn("Could not roll back transaction:", error),
                    );

                client.release();
            }
        }
    );
}
