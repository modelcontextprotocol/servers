import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "./everything.js";

console.error('Starting SSE server...');

const app = express();

const { server, cleanup } = createServer();

let transport: SSEServerTransport;

app.get("/sse", async (req, res) => {
  console.error("Received connection");
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);

  server.onclose = async () => {
    await cleanup();
    await server.close();
  };

});

app.post("/message", async (req, res) => {
  console.error("Received message");

  await transport.handlePostMessage(req, res);
});

process.on("SIGINT", async () => {
  await cleanup();
  await server.close();
  process.exit(0);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`Server is running on port ${PORT}`);
});

