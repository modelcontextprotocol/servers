import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const addSimplePrompt = (server: McpServer) => {
  server.registerPrompt(
    "simple-prompt",
    {
      title: "Simple Prompt",
      description: "A prompt with no arguments",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "This is a simple prompt without arguments.",
          },
        },
      ],
    })
  );
};
