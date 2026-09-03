import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  InitializeRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type InitializeResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  EXTENSION_KEY,
  SERVER_RESOURCE_URI,
  ISSUER_NAME,
  ISSUER_JWKS_URI,
  WELL_KNOWN_LEVELS,
  SUPPORTED_SCHEMES,
  ClientExtensionParamsSchema,
  EndUserContextSchema,
  ServerExtensionCapabilitiesSchema,
  TOOL_INPUT_SCHEMAS,
  missingContextError,
  invalidAssertionError,
  unsupportedSchemeError,
  malformedParamsError,
  unsupportedLevelError,
  type EndUserContext,
  type Levels,
  type ServerExtensionCapabilities,
} from "./extension.js";
import { DEFAULT_POLICIES, intersectPolicies } from "./policy.js";
import {
  canonicalize,
  splitOidc,
  resolveUser,
  pickScopes,
  MalformedUserIdError,
} from "./data.js";
import { verifyAssertion, AssertionError, type JwksFetcher } from "./jwt.js";

export interface TrustedIssuer {
  name: string;
  jwksUri: string;
}

export interface Session {
  negotiated: boolean;
  effectivePolicies: Levels;
  trustedIssuer?: { name: string; jwksUri: string };
}

export interface AuthDecision {
  level: string;
  canonicalUserId: string | null;
  effectiveTools: Levels[string]["tools"];
}

export interface CreateServerOptions {
  jwksFetcher: JwksFetcher;
  trustedIssuers: TrustedIssuer[];
}

// Protocol-version negotiation — mirrors the SDK's internal _oninitialize so the
// override handler can reproduce it exactly.
export function negotiateProtocolVersion(requested: string): string {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

// Resources: two concrete resources with a level-based visibility map. This gating
// is independent of resourceScopes (which are data/field labels, not MCP resources).
const KB_RESOURCE = {
  uri: "kb://help/getting-started",
  name: "Getting Started",
  mimeType: "text/plain",
  description: "Getting started guide for the support knowledge base.",
};
const ACCOUNT_RESOURCE = {
  uri: "account://me/summary",
  name: "My Account Summary",
  mimeType: "text/plain",
  description: "Summary of the caller's account.",
};
const RESOURCE_VISIBILITY: Record<string, string> = {
  [KB_RESOURCE.uri]: "anonymous",
  [ACCOUNT_RESOURCE.uri]: "verified",
};
const RESOURCE_CONTENTS: Record<string, string> = {
  [KB_RESOURCE.uri]:
    "Welcome! Browse our FAQ, track orders, and if you've verified your identity, initiate returns.",
  [ACCOUNT_RESOURCE.uri]:
    "Your account summary is available only to verified users.",
};

export function createServer(opts: CreateServerOptions): {
  server: Server;
  getSession: () => Session;
} {
  const session: Session = {
    negotiated: false,
    effectivePolicies: intersectPolicies(DEFAULT_POLICIES),
  };

  const server = new Server(
    { name: "delegated-user-auth-example", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
        extensions: { [EXTENSION_KEY]: {} },
      },
    }
  );

  const baseCapabilities = {
    tools: {},
    resources: {},
  };

  // We override the SDK's @deprecated/internal initialize handler deliberately —
  // it is the only way to inject computed (per-connection) extension capabilities.
  server.setRequestHandler(InitializeRequestSchema, (request) => {
    const rawClientParams =
      request.params.capabilities?.extensions?.[EXTENSION_KEY];

    if (!rawClientParams) {
      session.negotiated = false;
      return {
        protocolVersion: negotiateProtocolVersion(
          request.params.protocolVersion
        ),
        capabilities: baseCapabilities,
        serverInfo: { name: "delegated-user-auth-example", version: "0.1.0" },
      } as InitializeResult;
    }

    const parsed = ClientExtensionParamsSchema.safeParse(rawClientParams);
    if (!parsed.success) {
      throw malformedParamsError("malformed_init_params", parsed.error);
    }
    const clientParams = parsed.data;

    const advertised = clientParams.issuer ?? {
      name: ISSUER_NAME,
      jwksUri: ISSUER_JWKS_URI,
    };

    // The server must anchor JWT trust to a server-owned issuer allowlist —
    // never to a client-supplied JWKS URI. A malicious client could otherwise
    // advertise a trusted issuer name pointed at a key set it controls and
    // mint its own verified assertions.
    const entry = opts.trustedIssuers.find((ti) => ti.name === advertised.name);
    if (!entry) {
      throw malformedParamsError(
        "malformed_init_params",
        `issuer "${advertised.name}" is not in the trusted issuers list`
      );
    }
    if (entry.jwksUri !== advertised.jwksUri) {
      throw malformedParamsError(
        "malformed_init_params",
        `issuer "${advertised.name}" advertised jwksUri "${advertised.jwksUri}" does not match approved "${entry.jwksUri}"`
      );
    }
    session.trustedIssuer = { name: entry.name, jwksUri: entry.jwksUri };

    session.effectivePolicies = intersectPolicies(
      DEFAULT_POLICIES,
      clientParams.policyOverrides
    );
    session.negotiated = true;

    const serverCaps: ServerExtensionCapabilities = {
      userIdSchemes: [...SUPPORTED_SCHEMES],
      verificationLevels: [...WELL_KNOWN_LEVELS],
      contextInListRequests: true,
      assertionRequired: ["verified"],
      defaultPolicies: DEFAULT_POLICIES,
      effectivePolicies: session.effectivePolicies,
    };

    return {
      protocolVersion: negotiateProtocolVersion(request.params.protocolVersion),
      capabilities: {
        tools: {},
        resources: {},
        extensions: { [EXTENSION_KEY]: serverCaps },
      },
      serverInfo: { name: "delegated-user-auth-example", version: "0.1.0" },
    } as InitializeResult;
  });

  async function authorizeRequest(request: {
    params?: { _meta?: Record<string, unknown> };
  }): Promise<AuthDecision> {
    // If the extension was not negotiated, serve at anonymous level without
    // demanding _meta (spec: -32001 applies only when negotiated).
    if (!session.negotiated) {
      return {
        level: "anonymous",
        canonicalUserId: null,
        effectiveTools: session.effectivePolicies.anonymous?.tools ?? {},
      };
    }

    const raw = request.params?._meta?.[EXTENSION_KEY];
    if (!raw) {
      throw missingContextError();
    }

    const parsed = EndUserContextSchema.safeParse(raw);
    if (!parsed.success) {
      throw malformedParamsError("malformed_context", parsed.error);
    }
    const ctx: EndUserContext = parsed.data;

    const level = ctx.verificationLevel;
    if (!(level in session.effectivePolicies)) {
      throw unsupportedLevelError(
        level,
        Object.keys(session.effectivePolicies)
      );
    }

    let canonicalUserId: string | null = null;
    if (ctx.userId) {
      const { scheme, value } = ctx.userId;
      if (!SUPPORTED_SCHEMES.includes(scheme as any)) {
        throw unsupportedSchemeError(scheme, SUPPORTED_SCHEMES);
      }
      if (scheme === "oidc") {
        try {
          splitOidc(value);
        } catch (e) {
          if (e instanceof MalformedUserIdError) {
            throw malformedParamsError("malformed_context", e.message);
          }
          throw e;
        }
      }
      canonicalUserId = canonicalize(scheme, value);
    }

    const assertionRequired = ["verified"];
    if (assertionRequired.includes(level)) {
      if (!ctx.userId) {
        throw malformedParamsError(
          "malformed_context",
          "verified level requires userId"
        );
      }
      const { scheme, value } = ctx.userId;
      const expectedTokenIssuer = session.trustedIssuer!.name;

      let expectedSubject: string;
      if (scheme === "email") {
        expectedSubject = canonicalize("email", value);
      } else {
        // oidc: the identity's issuer must equal the negotiated trust anchor.
        const oidcParts = splitOidc(value);
        if (oidcParts.issuer !== expectedTokenIssuer) {
          throw invalidAssertionError("assertion_invalid");
        }
        expectedSubject = oidcParts.subject;
      }

      try {
        await verifyAssertion(ctx.assertion, {
          jwksFetcher: opts.jwksFetcher,
          jwksUri: session.trustedIssuer!.jwksUri,
          expectedTokenIssuer,
          expectedSubject,
        });
      } catch (e) {
        if (e instanceof AssertionError) {
          throw invalidAssertionError(e.reason);
        }
        throw e;
      }
    }

    return {
      level,
      canonicalUserId,
      effectiveTools: session.effectivePolicies[level].tools,
    };
  }

  // No list_changed notification for per-user level changes — the client re-issues
  // tools/list when the verification level changes.
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const decision = await authorizeRequest(request);
    const tools = Object.keys(decision.effectiveTools).map((name) => ({
      name,
      inputSchema: z.toJSONSchema(
        TOOL_INPUT_SCHEMAS[name as keyof typeof TOOL_INPUT_SCHEMAS]
      ),
    }));
    return { tools };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const decision = await authorizeRequest(request);
    const callerLevelIndex = WELL_KNOWN_LEVELS.indexOf(
      decision.level as (typeof WELL_KNOWN_LEVELS)[number]
    );
    const visible = [KB_RESOURCE, ACCOUNT_RESOURCE].filter((res) => {
      const requiredLevel = RESOURCE_VISIBILITY[res.uri];
      const requiredIndex = WELL_KNOWN_LEVELS.indexOf(
        requiredLevel as (typeof WELL_KNOWN_LEVELS)[number]
      );
      return callerLevelIndex >= requiredIndex;
    });
    return { resources: visible };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const decision = await authorizeRequest(request);
    const uri = request.params.uri;
    const requiredLevel = RESOURCE_VISIBILITY[uri];
    const callerLevelIndex = WELL_KNOWN_LEVELS.indexOf(
      decision.level as (typeof WELL_KNOWN_LEVELS)[number]
    );
    const requiredIndex = requiredLevel
      ? WELL_KNOWN_LEVELS.indexOf(
          requiredLevel as (typeof WELL_KNOWN_LEVELS)[number]
        )
      : -1;

    // Below-level reads are indistinguishable from unknown-uri reads — both throw
    // the identical -32602 payload so existence is not leaked.
    if (requiredIndex === -1 || callerLevelIndex < requiredIndex) {
      throw malformedParamsError(
        "unknown_resource_uri",
        "unknown resource uri"
      );
    }

    return {
      contents: [
        {
          type: "text",
          uri,
          mimeType: "text/plain",
          text: RESOURCE_CONTENTS[uri],
        },
      ],
    };
  });

  function notFound() {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "No matching data is available for the current user.",
        },
      ],
    };
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const decision = await authorizeRequest(request);
    const toolName = request.params.name;
    const toolPolicy = decision.effectiveTools[toolName];

    if (!toolPolicy) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: "Tool not available at this verification level.",
          },
        ],
      };
    }

    const argsSchema =
      TOOL_INPUT_SCHEMAS[toolName as keyof typeof TOOL_INPUT_SCHEMAS];
    const parsedArgs = argsSchema.safeParse(request.params.arguments);
    if (!parsedArgs.success) {
      throw malformedParamsError("malformed_arguments", parsedArgs.error);
    }
    const args = parsedArgs.data;
    const grantedScopes = toolPolicy.resourceScopes;

    switch (toolName) {
      case "search_knowledge_base": {
        const { query } = args as { query: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `KB results for "${query}":\n1. How to track your order\n2. Return policy FAQ\n3. Contacting support`,
            },
          ],
        };
      }

      case "lookup_orders": {
        const { orderIds } = args as { orderIds?: string[] };
        if (!decision.canonicalUserId) return notFound();
        const user = resolveUser(decision.canonicalUserId);
        if (!user) return notFound();

        let orders = user.orders;
        if (orderIds && orderIds.length > 0) {
          const requested = [...new Set(orderIds)];
          const allOwned = requested.every((id) =>
            orders.some((o) => o.id === id)
          );
          if (!allOwned) return notFound();
          orders = orders.filter((o) => requested.includes(o.id));
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                orders.map((o) =>
                  pickScopes(
                    o as unknown as Record<string, unknown>,
                    grantedScopes
                  )
                ),
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_account_details": {
        if (!decision.canonicalUserId) return notFound();
        const user = resolveUser(decision.canonicalUserId);
        if (!user) return notFound();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                pickScopes(
                  user.account as unknown as Record<string, unknown>,
                  grantedScopes
                ),
                null,
                2
              ),
            },
          ],
        };
      }

      case "initiate_return": {
        const { orderId } = args as { orderId: string };
        if (!decision.canonicalUserId) return notFound();
        const user = resolveUser(decision.canonicalUserId);
        if (!user) return notFound();
        const owned = user.orders.some((o) => o.id === orderId);
        if (!owned) return notFound();
        // The write action requires the returns:create scope; a policy
        // override that removes it must not still allow the action.
        if (!grantedScopes.includes("returns:create")) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Tool not available at this verification level.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                returnId: `RET-${Date.now()}`,
                orderId,
                status: "return_initiated",
              }),
            },
          ],
        };
      }

      default:
        return notFound();
    }
  });

  return { server, getSession: () => session };
}
