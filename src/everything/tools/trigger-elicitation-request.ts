import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ElicitResultSchema,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "trigger-elicitation-request";
const config = {
  title: "Trigger Elicitation Request Tool",
  description: "Trigger a Request from the Server for User Elicitation",
  inputSchema: {},
};

/**
 * Registers the 'trigger-elicitation-request' tool.
 *
 * If the client does not support the elicitation capability, the tool is not registered.
 *
 * The registered tool sends an elicitation request for the user to provide information
 * based on a pre-defined schema of fields including text inputs, booleans, numbers,
 * email, dates, enums of various types, etc. It uses validation and handles multiple
 * possible outcomes from the user's response, such as acceptance with content, decline,
 * or cancellation of the dialog. The process also ensures parsing and validating
 * the elicitation input arguments at runtime.
 *
 * The elicitation dialog response is returned, formatted into a structured result,
 * which contains both user-submitted input data (if provided) and debugging information,
 * including raw results.
 *
 * @param {McpServer} server - TThe McpServer instance where the tool will be registered.
 */
export const registerTriggerElicitationRequestTool = (server: McpServer) => {
  // Does the client support elicitation?
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientSupportsElicitation: boolean =
    clientCapabilities.elicitation !== undefined;

  // If so, register tool
  if (clientSupportsElicitation) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        const elicitationResult = await extra.sendRequest(
          {
            method: "elicitation/create",
            params: {
              message: "Please provide inputs for the following fields:",
              requestedSchema: {
                type: "object",
                properties: {
                  name: {
                    title: "String",
                    type: "string",
                    description: "Your full, legal name",
                  },
                  check: {
                    title: "Boolean",
                    type: "boolean",
                    description: "Agree to the terms and conditions",
                  },
                  firstLine: {
                    title: "String with default",
                    type: "string",
                    description: "Favorite first line of a story",
                    default: "It was a dark and stormy night.",
                  },
                  email: {
                    title: "String with email format",
                    type: "string",
                    format: "email",
                    description:
                      "Your email address (will be verified, and never shared with anyone else)",
                  },
                  homepage: {
                    type: "string",
                    format: "uri",
                    title: "String with uri format",
                    description: "Portfolio / personal website",
                  },
                  birthdate: {
                    title: "String with date format",
                    type: "string",
                    format: "date",
                    description: "Your date of birth",
                  },
                  integer: {
                    title: "Integer",
                    type: "integer",
                    description:
                      "Your favorite integer (do not give us your phone number, pin, or other sensitive info)",
                    minimum: 1,
                    maximum: 100,
                    default: 42,
                  },
                  number: {
                    title: "Number in range 1-1000",
                    type: "number",
                    description: "Favorite number (there are no wrong answers)",
                    minimum: 0,
                    maximum: 1000,
                    default: 3.14,
                  },
                  untitledSingleSelectEnum: {
                    type: "string",
                    title: "Untitled Single Select Enum",
                    description: "Choose your favorite friend",
                    enum: [
                      "Monica",
                      "Rachel",
                      "Joey",
                      "Chandler",
                      "Ross",
                      "Phoebe",
                    ],
                    default: "Monica",
                  },
                  untitledMultipleSelectEnum: {
                    type: "array",
                    title: "Untitled Multiple Select Enum",
                    description: "Choose your favorite instruments",
                    minItems: 1,
                    maxItems: 3,
                    items: {
                      type: "string",
                      enum: ["Guitar", "Piano", "Violin", "Drums", "Bass"],
                    },
                    default: ["Guitar"],
                  },
                  titledSingleSelectEnum: {
                    type: "string",
                    title: "Titled Single Select Enum",
                    description: "Choose your favorite hero",
                    oneOf: [
                      { const: "hero-1", title: "Superman" },
                      { const: "hero-2", title: "Green Lantern" },
                      { const: "hero-3", title: "Wonder Woman" },
                    ],
                    default: "hero-1",
                  },
                  titledMultipleSelectEnum: {
                    type: "array",
                    title: "Titled Multiple Select Enum",
                    description: "Choose your favorite types of fish",
                    minItems: 1,
                    maxItems: 3,
                    items: {
                      anyOf: [
                        { const: "fish-1", title: "Tuna" },
                        { const: "fish-2", title: "Salmon" },
                        { const: "fish-3", title: "Trout" },
                      ],
                    },
                    default: ["fish-1"],
                  },
                  legacyTitledEnum: {
                    type: "string",
                    title: "Legacy Titled Single Select Enum",
                    description: "Choose your favorite type of pet",
                    enum: ["pet-1", "pet-2", "pet-3", "pet-4", "pet-5"],
                    enumNames: ["Cats", "Dogs", "Birds", "Fish", "Reptiles"],
                    default: "pet-1",
                  },
                },
                required: ["name"],
              },
            },
          },
          ElicitResultSchema,
          { timeout: 10 * 60 * 1000 /* 10 minutes */ }
        );

        // Handle different response actions
        const content: CallToolResult["content"] = [];

        if (
          elicitationResult.action === "accept" &&
          elicitationResult.content
        ) {
          content.push({
            type: "text",
            text: `✅ User provided the requested information!`,
          });

          // Only access elicitationResult.content when action is accept
          const userData = elicitationResult.content;
          const lines = [];
          if (userData.name) lines.push(`- Name: ${userData.name}`);
          if (userData.check !== undefined)
            lines.push(`- Agreed to terms: ${userData.check}`);
          if (userData.color) lines.push(`- Favorite Color: ${userData.color}`);
          if (userData.email) lines.push(`- Email: ${userData.email}`);
          if (userData.homepage) lines.push(`- Homepage: ${userData.homepage}`);
          if (userData.birthdate)
            lines.push(`- Birthdate: ${userData.birthdate}`);
          if (userData.integer !== undefined)
            lines.push(`- Favorite Integer: ${userData.integer}`);
          if (userData.number !== undefined)
            lines.push(`- Favorite Number: ${userData.number}`);
          if (userData.petType) lines.push(`- Pet Type: ${userData.petType}`);

          content.push({
            type: "text",
            text: `User inputs:\n${lines.join("\n")}`,
          });
        } else if (elicitationResult.action === "decline") {
          content.push({
            type: "text",
            text: `❌ User declined to provide the requested information.`,
          });
        } else if (elicitationResult.action === "cancel") {
          content.push({
            type: "text",
            text: `⚠️ User cancelled the elicitation dialog.`,
          });
        }

        // Include raw result for debugging
        content.push({
          type: "text",
          text: `\nRaw result: ${JSON.stringify(elicitationResult, null, 2)}`,
        });

        return { content };
      }
    );
  }
};
