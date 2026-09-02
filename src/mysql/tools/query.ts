import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
import { withConnection } from "../db.js";

export const queryHandler = async (request: CallToolRequest) => {
    const sql = typeof request.params.arguments?.sql === "string"
        ? request.params.arguments.sql.replace(/;\s*$/, "")
        : "";

    return await withConnection(async (connection) => {
        try {
            await connection.query("SET SESSION TRANSACTION READ ONLY");
            await connection.query("START TRANSACTION READ ONLY");
            const [rows] = await connection.query(sql);
            return {
                content: [{ type: "text", text: encode(rows) }],
                isError: false,
            };
        } catch (error) {
            throw error;
        } finally {
            connection
                .query("ROLLBACK")
                .catch((error: any) =>
                    console.warn("Could not roll back transaction:", error),
                );
        }
    });
};
