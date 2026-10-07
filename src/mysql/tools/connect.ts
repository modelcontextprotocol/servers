import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { initializePool, closePool } from "../db.js";

export const connectHandler = async (request: CallToolRequest) => {
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
        await closePool();
        // Override env vars for this session
        process.env.MYSQL_USER = newUser;
        process.env.MYSQL_PASSWORD = newPassword;
        await initializePool(newConnectionString);
        return {
            content: [{ type: "text", text: `Successfully connected to MySQL DB: ${newConnectionString} as user ${newUser}` }],
            isError: false,
        };
    } catch (err) {
        return {
            content: [{ type: "text", text: `Failed to connect: ${err}` }],
            isError: true,
        };
    }
};

