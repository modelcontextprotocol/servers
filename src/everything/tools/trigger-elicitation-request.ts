import {
  McpServer,
  CallToolResult,
  InputRequiredResult,
  inputRequired,
  inputResponse,
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

// Key for this tool's embedded elicitation request. It identifies the request
// on the way out and its response on the way back in.
const PROFILE = "profile";

/**
 * Registers the 'trigger-elicitation-request' tool.
 *
 * The tool asks the user to fill in a form covering the full range of field
 * types the elicitation schema supports -- text, booleans, numbers, email,
 * dates, and enums of several shapes -- then formats the answer, handling
 * acceptance, decline and cancellation.
 *
 * The request is made in the **multi-round-trip** style: the handler *returns*
 * `inputRequired(...)` rather than pushing a server->client
 * `elicitation/create` request. This is written once and serves both protocol
 * eras. On 2026-07-28 the client fulfils the embedded request and retries the
 * call with `inputResponses`; on a legacy-era connection the SDK's legacy shim
 * turns the same return into a real server->client request over the live
 * session and re-enters this handler with the collected response. The handler
 * cannot tell which era served it.
 *
 * There is also no longer a client-capability check around registration. The
 * SDK gates the embedded request at dispatch on both eras, refusing a caller
 * that never declared `elicitation` with `-32021`, so the tool can be
 * registered unconditionally -- which matters because on 2026-07-28 there is no
 * `initialize` handshake to learn capabilities from in the first place.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerElicitationRequestTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const answer = inputResponse(ctx.mcpReq.inputResponses, PROFILE);

      // First round: nothing has been asked yet, so ask.
      if (answer.kind === "missing") {
        return inputRequired({
          inputRequests: {
            [PROFILE]: inputRequired.elicit({
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
            }),
          },
        });
      }

      // Re-entry: the client answered. `answer` is the discriminated view of
      // this round's response, which covers decline/cancel as well as accept.
      const content: CallToolResult["content"] = [];

      if (answer.kind === "elicit" && answer.action === "accept") {
        content.push({
          type: "text",
          text: `✅ User provided the requested information!`,
        });

        // Content only exists on an accepted elicitation. It comes from the
        // client and is NOT re-validated against `requestedSchema` on either
        // era -- treat it as untrusted input.
        const userData = answer.content ?? {};
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
      } else if (answer.kind === "elicit" && answer.action === "decline") {
        content.push({
          type: "text",
          text: `❌ User declined to provide the requested information.`,
        });
      } else if (answer.kind === "elicit" && answer.action === "cancel") {
        content.push({
          type: "text",
          text: `⚠️ User cancelled the elicitation dialog.`,
        });
      }

      // Include raw result for debugging
      content.push({
        type: "text",
        text: `\nRaw result: ${JSON.stringify(answer, null, 2)}`,
      });

      return { content };
    }
  );
};
