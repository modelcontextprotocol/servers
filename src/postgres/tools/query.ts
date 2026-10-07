import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
import { withConnection } from "../db.js";

export const queryHandler = async (request: CallToolRequest) => {
    const sql = typeof request.params.arguments?.sql === "string"
        ? request.params.arguments.sql.replace(/;\s*$/, "")
        : "";

    return await withConnection(async (client) => {
        try {
            await client.query("BEGIN TRANSACTION READ ONLY");
            const result = await client.query(sql);
            return {
                content: [{ type: "text", text: encode(result.rows) }],
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
        }
    });
};
