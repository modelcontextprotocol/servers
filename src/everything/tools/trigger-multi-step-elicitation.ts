// The `trigger-multi-step-elicitation` tool: asks the user two questions in
// sequence, each depending on the last, to show `requestState` carrying a
// multi-round-trip flow from one round to the next (#4852).
//
// Each retry of a multi-round-trip request carries only that round's answers,
// and on the 2026-07-28 HTTP path a later round may be served by a fresh
// server instance, so nothing on the server remembers earlier rounds. What
// the flow has learned travels in `requestState` instead: an opaque string
// the server returns with `input_required` and the client echoes back on the
// retry. It is attacker-controlled on the way back, so the server signs it
// and gives it an expiry (`roundStateCodec`); the SDK rejects a tampered or
// expired state with -32602 before the handler runs. The handler switches on
// the phase the state names rather than on which answers arrived.
//
// Written once for both protocol eras: for a 2025-era client the SDK's legacy
// shim sends each round as a real `elicitation/create` request and replays
// the state between rounds.

import {
  McpServer,
  CallToolResult,
  acceptedContent,
  inputRequired,
  inputResponse,
  type InputRequiredResult,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { roundStateCodec, type RoundState } from "../server/index.js";

// Tool configuration
const name = "trigger-multi-step-elicitation";
const config = {
  title: "Trigger Multi-Step Elicitation Tool",
  description:
    "Asks the user for their name, then for a favorite color addressed to them by that name, carrying " +
    "the first answer to the second round in requestState. Demonstrates multi-round-trip requests " +
    "(input_required) and requestState on protocol version 2026-07-28; 2025-era clients get the same " +
    "flow as elicitation requests.",
  inputSchema: {},
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/** The first question's answer: a name that is not blank. */
const NameSchema = z.object({
  name: z.string().trim().min(1).describe("Your name"),
});

/** The second question's answer. */
const ColorSchema = z.object({
  color: z
    .enum(["red", "green", "blue"])
    .describe("Your favorite of the three"),
});

/** Ask for the name: the first round, and a repeat of it after a bad answer. */
const askForName = async (message: string): Promise<InputRequiredResult> =>
  inputRequired({
    inputRequests: {
      name: inputRequired.elicit({ message, requestedSchema: NameSchema }),
    },
    requestState: await roundStateCodec.mint({ step: "awaiting-name" }),
  });

/** Ask for the color, carrying the name the first round proved. */
const askForColor = async (name: string): Promise<InputRequiredResult> =>
  inputRequired({
    inputRequests: {
      color: inputRequired.elicit({
        message: `Thanks, ${name}. Which color do you like best?`,
        requestedSchema: ColorSchema,
      }),
    },
    requestState: await roundStateCodec.mint({ step: "awaiting-color", name }),
  });

/** The result for a user who declined or cancelled a question. */
const stopped = (action: string, step: string): CallToolResult => ({
  content: [
    { type: "text", text: `Stopped: the user chose ${action} at ${step}.` },
  ],
  isError: true,
});

/**
 * Registers the 'trigger-multi-step-elicitation' tool.
 *
 * The tool needs a client that supports form-mode elicitation, so it is gated
 * like `trigger-elicitation-request`. Each entry reads the phase from the
 * verified `requestState`:
 * - none: the first call, which asks for the name;
 * - `awaiting-name`: reads the name, asking again if it is missing or blank,
 *   then asks for the color with the name in the next state;
 * - `awaiting-color`: reads the color, asking again if it is not one of the
 *   choices, then returns both answers.
 * A declined or cancelled question ends the flow with an error result.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerMultiStepElicitationTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (_args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const state = ctx.mcpReq.requestState<RoundState>();
      const responses = ctx.mcpReq.inputResponses;

      switch (state?.step) {
        case "awaiting-name": {
          const view = inputResponse(responses, "name");
          if (view.kind === "elicit" && view.action !== "accept") {
            return stopped(view.action, "the name question");
          }
          const answer = acceptedContent(responses, "name", NameSchema);
          if (answer === undefined) {
            return askForName("A name is required. What is your name?");
          }
          return askForColor(answer.name);
        }
        case "awaiting-color": {
          const view = inputResponse(responses, "color");
          if (view.kind === "elicit" && view.action !== "accept") {
            return stopped(view.action, "the color question");
          }
          const answer = acceptedContent(responses, "color", ColorSchema);
          const name = String(state.name);
          if (answer === undefined) return askForColor(name);
          return {
            content: [
              {
                type: "text",
                text: `${name}'s favorite color is ${answer.color}.`,
              },
            ],
            structuredContent: { name, color: answer.color },
          };
        }
        default:
          return askForName("What is your name?");
      }
    },
  );
};
