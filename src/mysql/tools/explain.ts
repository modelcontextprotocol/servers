import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { withConnection } from "../db.js";

export const explainHandler = async (request: CallToolRequest) => {
    const sql = typeof request.params.arguments?.sql === "string"
        ? request.params.arguments.sql.replace(/;\s*$/, "")
        : "";

    return await withConnection(async (connection) => {
        const [rows] = await connection.query(`EXPLAIN FORMAT=JSON ${sql}`);
        return {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2), mimeType: "application/json" }],
            isError: false,
        };
    });
};
