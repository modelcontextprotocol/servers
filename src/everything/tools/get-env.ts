/**
 * The `get-env` tool: returns the server process's environment as JSON, for
 * debugging how a client launched the server.
 *
 * A raw dump would put every credential in the server's environment into
 * model context, on a tool annotated read-only that clients may auto-approve
 * (#3986, #5130). So by default every variable NAME is returned, but the VALUE
 * of a credential-looking name is replaced with a placeholder. A name counts
 * as credential-looking when one of its underscore-separated segments is a
 * credential word (`OPENAI_API_KEY`, `GITHUB_TOKEN`, `DB_PASSWORD`). Whole
 * segments, not substrings, so `PWD`, `KEYBOARD` or `MONKEY` stay readable.
 * The heuristic over-masks some names (`SSH_AUTH_SOCK`) and cannot see a
 * secret stored under an innocuous name; it is a safer default, not a
 * guarantee. Setting `GET_ENV_INCLUDE_SECRETS` to a truthy value restores the
 * full, unmasked dump for debugging. It is read on each call, so it reflects
 * the environment at call time.
 */
import { McpServer, CallToolResult } from "@modelcontextprotocol/server";

/** The placeholder that replaces a masked value. */
export const REDACTED = "<redacted>";

/** The opt-in that returns every value unmasked. */
export const INCLUDE_SECRETS_VAR = "GET_ENV_INCLUDE_SECRETS";

/** Name segments that mark a variable as holding a credential. */
const CREDENTIAL_SEGMENTS = new Set([
  "KEY",
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "PASSWD",
  "CREDENTIAL",
  "AUTH",
  "COOKIE",
]);

/** Values of `GET_ENV_INCLUDE_SECRETS` that turn the opt-in on. */
const TRUTHY = new Set(["1", "true", "yes", "on"]);

// Tool configuration
const name = "get-env";
const config = {
  title: "Print Environment Tool",
  description:
    "Returns all environment variables, helpful for debugging MCP server configuration. " +
    `Values of credential-like names (a KEY, TOKEN, SECRET, PASSWORD, PASSWD, CREDENTIAL, AUTH or COOKIE name segment) are masked as "${REDACTED}" unless ${INCLUDE_SECRETS_VAR} is set to 1 or true in the server's environment.`,
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Whether an environment variable name looks like it holds a credential:
 * one of its underscore-separated segments, compared case-insensitively, is
 * a credential word.
 *
 * @param {string} key - The environment variable name.
 * @returns {boolean} True when the value should be masked.
 */
export const isCredentialName = (key: string): boolean =>
  key
    .toUpperCase()
    .split("_")
    .some((segment) => CREDENTIAL_SEGMENTS.has(segment));

/**
 * Whether `GET_ENV_INCLUDE_SECRETS` is set to a truthy value
 * (`1`, `true`, `yes` or `on`, case-insensitively).
 *
 * @param {NodeJS.ProcessEnv} env - The environment to read the opt-in from.
 * @returns {boolean} True when values should be returned unmasked.
 */
export const includeSecrets = (env: NodeJS.ProcessEnv): boolean =>
  TRUTHY.has((env[INCLUDE_SECRETS_VAR] ?? "").trim().toLowerCase());

/**
 * The environment as the tool returns it: every name, with the value of each
 * credential-like name masked unless the opt-in is set.
 *
 * @param {NodeJS.ProcessEnv} env - The environment to render.
 * @returns {Record<string, string | undefined>} The (possibly masked) copy.
 */
export const maskEnv = (
  env: NodeJS.ProcessEnv,
): Record<string, string | undefined> => {
  if (includeSecrets(env)) return { ...env };
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      isCredentialName(key) ? REDACTED : value,
    ]),
  );
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool returns the environment variables of the current
 * process as a JSON-formatted string in a text response, with the values of
 * credential-like names masked unless `GET_ENV_INCLUDE_SECRETS` is set.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(maskEnv(process.env), null, 2),
        },
      ],
    };
  });
};
