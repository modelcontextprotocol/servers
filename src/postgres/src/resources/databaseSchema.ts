// src/resources/databaseSchema.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pool, SCHEMA_PATH } from "../config/database.js";

export function registerDatabaseSchemaResource(mcpServer: McpServer) {
    mcpServer.resource(
        "Database Schema",
        new ResourceTemplate("database://tables/{tableName}/{schema}", {
            list: undefined
        }),
        async (uri, { tableName, schema }) => {
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
                            uri: uri.href,
                            mimeType: "application/json",
                            text: JSON.stringify(result.rows, null, 2),
                        },
                    ],
                };
            } finally {
                client.release();
            }
        }
    );
}
