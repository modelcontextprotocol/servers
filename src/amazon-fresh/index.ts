#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types.js";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";

type Unit =
  | "count"
  | "cups"
  | "fl_oz"
  | "gallons"
  | "grams"
  | "kilograms"
  | "liters"
  | "milliliters"
  | "ounces"
  | "pints"
  | "pounds"
  | "quarts"
  | "tbsp"
  | "tsp";

interface Quantity {
  unit: Unit;
  amount: number;
}

interface Ingredient {
  name: string;
  quantityList?: Quantity[];
  brand?: string;
  asinOverride?: string;
}

interface ShoppingList {
  ingredients: Ingredient[];
}

const createAmazonFreshLinkTool: Tool = {
  name: "create_amazon_fresh_link",
  description: `Create a link to this recipe's ingredients on Amazon Fresh. Please show the link in your response after using the tool. Here are some other suggestions on how to use this tool:
For best search results, please only include the canonical ingredient in the “name” field. Best practices for the “name” field include:
- Remove all unnecessary qualifiers, brands, quantities, and prep instructions (grated, sliced, chopped, crush, crumble, etc.).
- Avoid packaging description such as “1-gallon box” or “1 six-pack”. We’ll find the best size container for the specified unit.
- Avoid punctuation marks (periods, commas, etc.).
- If you want to use brand preference, enter it in the “brand” property rather than the “name” field. Absolutely do not add a brand in both the “name” and “brand” field.`,
  inputSchema: {
    type: "object",
    required: ["ingredients"],
    properties: {
      ingredients: {
        type: "array",
        description: "List of ingredient objects",
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description:
                "The canonical ingredient name without brand names, quantity information, or unnecessary qualifiers",
            },
            quantityList: {
              type: "array",
              description:
                "List of quantity objects. If not provided, defaults to count = 1",
              items: {
                type: "object",
                required: ["unit", "amount"],
                properties: {
                  unit: {
                    type: "string",
                    description: "The unit type",
                    enum: [
                      "count",
                      "cups",
                      "fl_oz",
                      "gallons",
                      "grams",
                      "kilograms",
                      "liters",
                      "milliliters",
                      "ounces",
                      "pints",
                      "pounds",
                      "quarts",
                      "tbsp",
                      "tsp",
                    ],
                  },
                  amount: {
                    type: "number",
                    description: "The quantity amount as an integer or float",
                  },
                },
              },
            },
            brand: {
              type: "string",
              description: "Optional brand preference",
            },
            asinOverride: {
              type: "string",
              description:
                "Optional ASIN product identifier for specific product recommendation",
            },
          },
        },
      },
    },
  },
};

/**
 * Encodes a JSON object into a custom URL-safe base64 gzip-compressed format.
 *
 * @param jsonData - The JSON object to encode.
 * @returns The encoded string.
 */
function encodeToCustomFormat(jsonData: ShoppingList): string {
  // Convert the JSON object to a string and encode it as UTF-8
  const jsonString = Buffer.from(JSON.stringify(jsonData), "utf-8");

  // Compress the JSON string with gzip
  const compressedData = gzipSync(jsonString, { level: 9 });

  // Convert the compressed data to a base64 string
  const base64String = compressedData.toString("base64");

  // Convert standard base64 to URL-safe base64
  return base64String
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Converts a shopping list to x-www-form-urlencoded format for Amazon Fresh
 * @param shoppingList The shopping list to convert
 * @returns The encoded URL string with the base URL and parameters
 */
async function convertShoppingListToFormUrl(
  shoppingList: ShoppingList
): Promise<string> {
  const baseUrl = "https://www.amazon.com/afx/ingredients/landingencoded";

  const encodedIngredients = await encodeToCustomFormat(shoppingList);

  return `${baseUrl}?encodedIngredients=${encodedIngredients}`;
}

async function main() {
  console.error("Starting Amazon Fresh MCP Server...");
  const server = new Server(
    {
      name: "Amazon Fresh MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        switch (request.params.name) {
          case "create_amazon_fresh_link": {
            const args = request.params.arguments as unknown as ShoppingList;
            const response = await convertShoppingListToFormUrl(args);
            return {
              content: [
                { type: "text", text: `Here is the link: "${response}". Please render it with markdown for the user.` },
              ],
            };
          }
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        console.error("Error executing tool:", error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListToolsRequest");
    return {
      tools: [createAmazonFreshLinkTool],
    };
  });

  const transport = new StdioServerTransport();
  console.error("Connecting server to transport...");
  await server.connect(transport);

  console.error("Amazon Fresh MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
