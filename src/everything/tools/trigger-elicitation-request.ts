// The `trigger-elicitation-request` tool: asks the user to fill in a form
// that exercises every field type form-mode elicitation supports, and
// summarizes the answer.
//
// Written once for both protocol eras with a multi-round-trip request
// (#4852): the first call returns `input_required` carrying an
// `elicitation/create` request, the client shows the form and retries with
// the answer, and the retry summarizes it. A 2026-07-28 client does that
// in-band; for a 2025-era client the SDK's legacy shim sends a real
// `elicitation/create` request and re-enters the handler with the answer.

import {
  McpServer,
  CallToolResult,
  ElicitRequestFormParams,
  inputRequired,
  inputResponse,
  type InputRequiredResult,
} from "@modelcontextprotocol/server";

// Tool configuration
const name = "trigger-elicitation-request";
const config = {
  title: "Trigger Elicitation Request Tool",
  description: "Trigger a Request from the Server for User Elicitation",
  inputSchema: {},
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/** The form: one field of each type form-mode elicitation supports. */
const requestedSchema: ElicitRequestFormParams["requestedSchema"] = {
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
      enum: ["Monica", "Rachel", "Joey", "Chandler", "Ross", "Phoebe"],
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
};

/**
 * Registers the 'trigger-elicitation-request' tool.
 *
 * The tool needs a client that supports form-mode elicitation. On a 2025-era
 * connection the server factory registers it only for a client that declared
 * `elicitation.form`, or an `elicitation` object with neither `form` nor
 * `url`, which the spec treats as form mode for backwards compatibility; a
 * client that declared only `elicitation.url` does not get it (#4985). On
 * 2026-07-28 the SDK refuses the embedded request (-32021) of a client whose
 * request did not declare form-mode elicitation.
 *
 * The first round sends the form. The retry reads the user's response, which
 * may be acceptance with content, decline, or cancellation of the dialog, and
 * returns a structured summary with the raw result for debugging.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerElicitationRequestTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (_args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const answer = inputResponse(ctx.mcpReq.inputResponses, "form");

      // First round: show the user the form
      if (answer.kind !== "elicit") {
        return inputRequired({
          inputRequests: {
            form: inputRequired.elicit({
              message: "Please provide inputs for the following fields:",
              requestedSchema,
            }),
          },
        });
      }

      // The answer as the client sent it, for the debugging output
      const rawResult = {
        action: answer.action,
        ...(answer.content !== undefined && { content: answer.content }),
      };

      // Handle different response actions
      const content: CallToolResult["content"] = [];

      if (answer.action === "accept" && answer.content) {
        content.push({
          type: "text",
          text: `✅ User provided the requested information!`,
        });

        // Only access answer.content when action is accept
        const userData = answer.content;
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
      } else if (answer.action === "decline") {
        content.push({
          type: "text",
          text: `❌ User declined to provide the requested information.`,
        });
      } else if (answer.action === "cancel") {
        content.push({
          type: "text",
          text: `⚠️ User cancelled the elicitation dialog.`,
        });
      }

      // Include raw result for debugging
      content.push({
        type: "text",
        text: `\nRaw result: ${JSON.stringify(rawResult, null, 2)}`,
      });

      return { content };
    },
  );
};
