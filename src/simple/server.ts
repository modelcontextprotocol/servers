import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

export const createServer = () => {
  const server = new McpServer({
    name: "Echo",
    version: "1.0.0",
  })

  // Static resource
  server.resource("config", "config://app", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: "App configuration here",
      },
    ],
  }))

  // Dynamic resource with parameters
  server.resource(
    "user-profile",
    new ResourceTemplate("users://{userId}/profile", { list: undefined }),
    async (uri, { userId }) => ({
      contents: [
        {
          uri: uri.href,
          text: `Profile data for user ${userId}`,
        },
      ],
    })
  )

  server.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message}` }],
  }))

  server.prompt("echo", { message: z.string() }, ({ message }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please process this message: ${message}`,
        },
      },
    ],
  }))

  const cleanup = async () => {}
  return { server, cleanup }
}
