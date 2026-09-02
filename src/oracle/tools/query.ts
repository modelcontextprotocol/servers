import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
import { withConnection } from "../db.js";
import oracledb from "oracledb";

export const queryHandler = async (request: CallToolRequest) => {
    const sql = typeof request.params.arguments?.sql === "string"
        ? request.params.arguments.sql.replace(/;\s*$/, "")
        : "";

    return await withConnection(async (connection) => {
        await connection.execute("SET TRANSACTION READ ONLY");
        const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return {
            content: [{ type: "text", text: encode(result.rows) }],
            isError: false,
        };
    });
};
