import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  ListToolsResultSchema,
  CallToolResultSchema,
  ReadResourceResultSchema,
  type ListToolsResult,
  type CallToolResult,
  type ReadResourceResult,
  type InitializeResult,
} from "@modelcontextprotocol/sdk/types.js";

import {
  EXTENSION_KEY,
  ISSUER_NAME,
  ISSUER_JWKS_URI,
  ServerExtensionCapabilitiesSchema,
  type EndUserContext,
  type PolicyOverrides,
  type ServerExtensionCapabilities,
  type UserId,
} from "./extension.js";

export interface CreateClientOpts {
  policyOverrides?: PolicyOverrides;
  issuer?: { name: string; jwksUri: string };
}

export interface MetaEnvelope {
  [key: string]: unknown;
  [EXTENSION_KEY]: EndUserContext;
}

export interface DelegatedClient {
  client: Client;
  serverCapabilities: ServerExtensionCapabilities;
  initializeResult: InitializeResult;
  listTools: (meta: MetaEnvelope) => Promise<ListToolsResult>;
  callTool: (
    name: string,
    args: unknown,
    meta: MetaEnvelope
  ) => Promise<CallToolResult>;
  readResource: (
    uri: string,
    meta: MetaEnvelope
  ) => Promise<ReadResourceResult>;
}

export async function createClient(
  transport: Transport,
  opts?: CreateClientOpts
): Promise<DelegatedClient> {
  const issuer = opts?.issuer ?? {
    name: ISSUER_NAME,
    jwksUri: ISSUER_JWKS_URI,
  };

  const extensionParams: Record<string, unknown> = { issuer };
  if (opts?.policyOverrides) {
    extensionParams.policyOverrides = opts.policyOverrides;
  }

  const client = new Client(
    { name: "delegated-user-auth-client", version: "0.1.0" },
    {
      capabilities: {
        extensions: { [EXTENSION_KEY]: extensionParams },
      },
    }
  );

  await client.connect(transport);
  return wrapClient(client);
}

export function wrapClient(client: Client): DelegatedClient {
  const serverCaps = client.getServerCapabilities();
  const rawExtCaps = serverCaps?.extensions?.[EXTENSION_KEY];
  if (!rawExtCaps) {
    throw new Error(
      "Server did not advertise delegated-end-user-context extension capabilities"
    );
  }
  const parsed = ServerExtensionCapabilitiesSchema.safeParse(rawExtCaps);
  if (!parsed.success) {
    throw new Error(
      `Server advertised malformed extension capabilities: ${parsed.error.issues
        .map((i) => i.message)
        .join("; ")}`
    );
  }

  const listTools = (meta: MetaEnvelope): Promise<ListToolsResult> =>
    client.request(
      { method: "tools/list", params: { _meta: meta } },
      ListToolsResultSchema
    );

  const callTool = (
    name: string,
    args: unknown,
    meta: MetaEnvelope
  ): Promise<CallToolResult> =>
    client.request(
      {
        method: "tools/call",
        params: { name, arguments: args, _meta: meta },
      },
      CallToolResultSchema
    );

  const readResource = (
    uri: string,
    meta: MetaEnvelope
  ): Promise<ReadResourceResult> =>
    client.request(
      { method: "resources/read", params: { uri, _meta: meta } },
      ReadResourceResultSchema
    );

  return {
    client,
    serverCapabilities: parsed.data,
    initializeResult: {
      capabilities: serverCaps ?? {},
      serverInfo: client.getServerVersion() ?? { name: "", version: "" },
    } as InitializeResult,
    listTools,
    callTool,
    readResource,
  };
}

// JANE_OVERRIDES — the example narrowing: at `claimed`, `lookup_orders` gets
// only `["orders:summary"]`. Narrows `claimed` only; `verified` is untouched.
export const JANE_OVERRIDES: PolicyOverrides = {
  claimed: {
    tools: {
      lookup_orders: { resourceScopes: ["orders:summary"] },
    },
  },
};

export function buildMeta(
  level: string,
  userId?: UserId,
  assertion?: string
): MetaEnvelope {
  const ctx: EndUserContext = { verificationLevel: level };
  if (userId) ctx.userId = userId;
  if (assertion) ctx.assertion = assertion;
  return { [EXTENSION_KEY]: ctx };
}
