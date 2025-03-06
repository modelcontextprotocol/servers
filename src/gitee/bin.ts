#!/usr/bin/env node
import { config } from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import createGiteeMCPServer from "./index.js";

// 加载 .env 文件
config();

async function runServer() {
  const server = createGiteeMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gitee MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
