import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const REDACTED_VALUE = "[REDACTED]";

export const SENSITIVE_SUBSTRINGS = [
  "KEY",
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "AUTH",
  "PRIVATE",
  "CREDENTIAL",
  "APIKEY",
  "ACCESS_KEY",
  "PASSPHRASE",
  "CERT",
] as const;

export const SENSITIVE_PREFIXES = [
  "AWS_",
  "GITHUB_",
  "ANTHROPIC_",
  "OPENAI_",
  "SLACK_",
  "SSH_",
] as const;

/**
 * Checks whether an environment variable key is considered sensitive.
 * Matching is case-insensitive.
 */
export const isSensitiveEnvVar = (key: string): boolean => {
  const upperKey = key.toUpperCase();
  return (
    SENSITIVE_SUBSTRINGS.some((substr) => upperKey.includes(substr)) ||
    SENSITIVE_PREFIXES.some((prefix) => upperKey.startsWith(prefix))
  );
};

/**
 * Returns a shallow copy of the environment variables with sensitive values redacted.
 */
export const getRedactedEnv = (
  env: NodeJS.ProcessEnv = process.env
): Record<string, string | undefined> => {
  const redacted: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      redacted[key] = isSensitiveEnvVar(key) ? REDACTED_VALUE : value;
    }
  }
  return redacted;
};

// Tool configuration
const name = "get-env";
const config = {
  title: "Print Environment Tool",
  description:
    "Returns all environment variables, helpful for debugging MCP server configuration",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool retrieves and returns the environment variables
 * of the current process (with sensitive values redacted) as a JSON-formatted string encapsulated in a text response.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(getRedactedEnv(process.env), null, 2),
        },
      ],
    };
  });
};
