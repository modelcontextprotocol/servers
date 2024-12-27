#!/usr/bin/env node
import EverArt from "everart";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import open from "open";

const server = new Server(
  {
    name: "example-servers/everart",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {}, // Required for image resources
    },
  },
);

if (!process.env.EVERART_API_KEY) {
  console.error("EVERART_API_KEY environment variable is not set");
  process.exit(1);
}

const client = new EverArt.default(process.env.EVERART_API_KEY);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description:
        "Generate images using EverArt Models and returns a clickable link to view the generated image. " +
        "The tool will return a URL that can be clicked to view the image in a browser. " +
        "Available models:\n" +
        "- 5000:FLUX1.1: Standard quality\n" +
        "- 9000:FLUX1.1-ultra: Ultra high quality\n" +
        "- 6000:SD3.5: Stable Diffusion 3.5\n" +
        "- 7000:Recraft-Real: Photorealistic style\n" +
        "- 8000:Recraft-Vector: Vector art style\n" +
        "\nThe response will contain a direct link to view the generated image.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of desired image",
          },
          model: {
            type: "string",
            description:
              "Model ID (5000:FLUX1.1, 9000:FLUX1.1-ultra, 6000:SD3.5, 7000:Recraft-Real, 8000:Recraft-Vector)",
            default: "5000",
          },
          image_count: {
            type: "number",
            description: "Number of images to generate",
            default: 1,
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "everart://images",
        mimeType: "image/png",
        name: "Generated Images",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "everart://images") {
    return {
      contents: [
        {
          uri: "everart://images",
          mimeType: "image/png",
          blob: "", // Empty since this is just for listing
        },
      ],
    };
  }
  throw new Error("Resource not found");
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "generate_image") {
    try {
      const {
        prompt,
        model = "207910310772879360",
        image_count = 1,
      } = request.params.arguments as any;

      // Use correct EverArt API method
      const generation = await client.v1.generations.create(
        model,
        prompt,
        "txt2img",
        {
          imageCount: image_count,
          height: 1024,
          width: 1024,
        },
      );

      // Wait for generation to complete
      const completedGen = await client.v1.generations.fetchWithPolling(
        generation[0].id,
      );

      const imgUrl = completedGen.image_url;
      if (!imgUrl) throw new Error("No image URL");

      // Automatically open the image URL in the default browser
      await open(imgUrl);

      // Return a formatted message with the clickable link
      return {
        content: [
          {
            type: "text",
            text: `Image generated successfully!\nThe image has been opened in your default browser.\n\nGeneration details:\n- Model: ${model}\n- Prompt: "${prompt}"\n- Image URL: ${imgUrl}\n\nYou can also click the URL above to view the image again.`,
          },
        ],
      };
    } catch (error: unknown) {
      console.error("Detailed error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("EverArt MCP Server running on stdio");
}

runServer().catch(console.error);
