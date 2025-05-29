// src/resources/databaseTables.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pool, resourceBaseUrl, SCHEMA_PATH } from "../config/database.js";

export function registerDatabaseTablesResource(mcpServer: McpServer) {
    mcpServer.resource(
        "Database Tables",
        "database://tables",
        {
            description: "List of database tables with schemas",
            mimeType: "application/json",
        },
        async () => {
            const client = await pool.connect();
            try {
                const result = await client.query(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
                );

                const tables = result.rows.map((row) => ({
                    table_name: row.table_name,
                    uri: new URL(`${row.table_name}/${SCHEMA_PATH}`, resourceBaseUrl).href,
                    schema_type: "database_table"
                }));

                return {
                    contents: [
                        {
                            uri: "database://tables",
                            text: JSON.stringify(tables, null, 2),
                        },
                    ],
                };
            } finally {
                client.release();
            }
        }
    );
}
