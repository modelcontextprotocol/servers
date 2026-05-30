import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const registerPrompts = (server: McpServer): void => {
  server.registerPrompt("read-file",
    { title: "Read File", description: "Read a file for review.", argsSchema: { path: z.string().describe("Absolute file path") } },
    ({ path }) => ({ messages: [{ role: "user", content: { type: "text", text: `Read ${path} and summarize.` } }] }));
};
