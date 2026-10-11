import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ListToolsResultSchema,
  CallToolResultSchema,
  ReadResourceResultSchema,
  ListResourcesResultSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";

import {
  EXTENSION_KEY,
  ISSUER_NAME,
  ISSUER_JWKS_URI,
  WELL_KNOWN_LEVELS,
  SUPPORTED_SCHEMES,
  EndUserContextSchema,
  ClientExtensionParamsSchema,
  redactContext,
  type EndUserContext,
  type UserId,
  type PolicyOverrides,
  type DefaultPolicies,
  type Levels,
} from "../extension.js";
import { DEFAULT_POLICIES, intersectPolicies } from "../policy.js";
import {
  canonicalize,
  splitOidc,
  pickScopes,
  resolveUser,
  MalformedUserIdError,
  type Order,
  type Account,
} from "../data.js";
import {
  createIdp,
  verifyAssertion,
  AssertionError,
  type MintAssertionInput,
  type Idp,
} from "../jwt.js";
import { createServer, negotiateProtocolVersion } from "../server.js";
import { buildMeta, JANE_OVERRIDES, wrapClient } from "../client.js";
import { createRecordingTransport } from "../demo.js";

function makeUserId(overrides?: Partial<UserId>): UserId {
  return { scheme: "email", value: "ben@example.com", ...overrides };
}

function makeContext(overrides?: Partial<EndUserContext>): EndUserContext {
  const base: EndUserContext = { verificationLevel: "anonymous" };
  return { ...base, ...overrides };
}

function makeOrder(overrides?: Partial<Order>): Order {
  return {
    id: "ORD-1001",
    status: "Shipped",
    orderedAt: "2025-01-15",
    items: [{ name: "Widget", qty: 1 }],
    total: 29.99,
    paymentMethod: "Visa ****1234",
    billingAddress: "123 Main St",
    shippingAddress: "123 Main St",
    ...overrides,
  };
}

function makeAccount(overrides?: Partial<Account>): Account {
  return {
    name: "Ben Carter",
    email: "ben@example.com",
    phone: "+1-555-0100",
    notifications: "email",
    language: "en-US",
    ...overrides,
  };
}

function makeMintInput(
  overrides?: Partial<MintAssertionInput>
): MintAssertionInput {
  return {
    subject: "ben@example.com",
    verificationMethod: "magic-link",
    overrides: {},
    ...overrides,
  };
}

let sharedIdp: Idp;

interface TrioResult {
  client: any;
  records: { direction: string; message: any }[];
  server: any;
}

async function makeTrio(opts?: {
  policyOverrides?: PolicyOverrides;
  trustedIssuers?: { name: string; jwksUri: string }[];
  negotiate?: boolean;
}): Promise<TrioResult> {
  if (!sharedIdp) sharedIdp = await createIdp(ISSUER_NAME);
  const { server } = createServer({
    jwksFetcher: () => Promise.resolve(sharedIdp.getJwks()),
    trustedIssuers: opts?.trustedIssuers ?? [
      { name: ISSUER_NAME, jwksUri: ISSUER_JWKS_URI },
    ],
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const recording = createRecordingTransport(clientTransport);

  if (opts?.negotiate === false) {
    const bareClient = new Client(
      { name: "test-client", version: "0.1.0" },
      { capabilities: {} }
    );
    await Promise.all([
      server.connect(serverTransport),
      bareClient.connect(recording.transport),
    ]);
    return { client: bareClient, records: recording.records as any, server };
  }

  const extensionParams: Record<string, unknown> = {
    issuer: { name: ISSUER_NAME, jwksUri: ISSUER_JWKS_URI },
  };
  if (opts?.policyOverrides) {
    extensionParams.policyOverrides = opts.policyOverrides;
  }

  const sdkClient = new Client(
    { name: "test-client", version: "0.1.0" },
    {
      capabilities: {
        extensions: { [EXTENSION_KEY]: extensionParams },
      },
    }
  );

  await Promise.all([
    server.connect(serverTransport),
    sdkClient.connect(recording.transport),
  ]);

  const delegatedClient = wrapClient(sdkClient);
  return {
    client: delegatedClient,
    records: recording.records as any,
    server,
  };
}

beforeEach(async () => {
  sharedIdp = await createIdp(ISSUER_NAME);
});

describe("negotiateProtocolVersion", () => {
  it("itEchoesBackASupportedVersion", () => {
    expect(negotiateProtocolVersion("2025-03-26")).toBe("2025-03-26");
  });

  it("itFallsBackToLatestOnUnsupportedVersion", () => {
    expect(negotiateProtocolVersion("1999-01-01")).toBe(
      LATEST_PROTOCOL_VERSION
    );
  });

  it("itUsesTheRealSDKConstants", () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain("2025-03-26");
    expect(LATEST_PROTOCOL_VERSION).toBe("2025-11-25");
  });
});

describe("intersectPolicies", () => {
  it("itReturnsDefaultsWhenNoOverrides", () => {
    const result = intersectPolicies(DEFAULT_POLICIES);
    expect(result).toEqual(DEFAULT_POLICIES.levels);
  });

  it("itNarrowsScopesToIntersection", () => {
    const overrides: PolicyOverrides = {
      claimed: {
        tools: {
          lookup_orders: { resourceScopes: ["orders:summary"] },
        },
      },
    };
    const result = intersectPolicies(DEFAULT_POLICIES, overrides);
    expect(result.claimed.tools.lookup_orders.resourceScopes).toEqual([
      "orders:summary",
    ]);
  });

  it("itIgnoresForeignScopesNoWidening", () => {
    const overrides: PolicyOverrides = {
      claimed: {
        tools: {
          lookup_orders: {
            resourceScopes: ["orders:summary", "orders:financial"],
          },
        },
      },
    };
    const result = intersectPolicies(DEFAULT_POLICIES, overrides);
    // orders:financial is not in default claimed → ignored
    expect(result.claimed.tools.lookup_orders.resourceScopes).toEqual([
      "orders:summary",
    ]);
  });

  it("itRemovesToolWhenEnabledFalse", () => {
    const overrides: PolicyOverrides = {
      claimed: {
        tools: { lookup_orders: { enabled: false } },
      },
    };
    const result = intersectPolicies(DEFAULT_POLICIES, overrides);
    expect(result.claimed.tools.lookup_orders).toBeUndefined();
  });

  it("itIgnoresEnabledFalseOnNeverGrantedTool", () => {
    const overrides: PolicyOverrides = {
      anonymous: {
        tools: { initiate_return: { enabled: false } },
      },
    };
    const result = intersectPolicies(DEFAULT_POLICIES, overrides);
    // initiate_return was never in anonymous → no-op
    expect(result.anonymous.tools.initiate_return).toBeUndefined();
    expect(result.anonymous.tools.search_knowledge_base).toBeDefined();
  });

  it("itIgnoresForeignLevels", () => {
    const overrides: PolicyOverrides = {
      superuser: { tools: { search_knowledge_base: { resourceScopes: [] } } },
    };
    const result = intersectPolicies(DEFAULT_POLICIES, overrides);
    expect(result.superuser).toBeUndefined();
  });

  it("itDoesNotMutateDefaults", () => {
    const snapshot = JSON.parse(JSON.stringify(DEFAULT_POLICIES));
    const overrides: PolicyOverrides = {
      claimed: {
        tools: { lookup_orders: { resourceScopes: ["orders:summary"] } },
      },
    };
    intersectPolicies(DEFAULT_POLICIES, overrides);
    expect(JSON.parse(JSON.stringify(DEFAULT_POLICIES))).toEqual(snapshot);
  });

  it("itDoesNotMutateOverrides", () => {
    const overrides: PolicyOverrides = {
      claimed: {
        tools: { lookup_orders: { resourceScopes: ["orders:summary"] } },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(overrides));
    intersectPolicies(DEFAULT_POLICIES, overrides);
    expect(JSON.parse(JSON.stringify(overrides))).toEqual(snapshot);
  });

  it("itLeavesVerifiedUntouchedWhenOnlyClaimedOverridden", () => {
    const result = intersectPolicies(DEFAULT_POLICIES, JANE_OVERRIDES);
    expect(result.verified).toEqual(DEFAULT_POLICIES.levels.verified);
  });
});

describe("canonicalize", () => {
  it("itLowercasesEmail", () => {
    expect(canonicalize("email", "Ben@Example.com")).toBe("ben@example.com");
  });

  it("itSplitsOidcIntoIssuerHashSubject", () => {
    expect(canonicalize("oidc", "https://techcorp.example#sub123")).toBe(
      "https://techcorp.example#sub123"
    );
  });

  it("itThrowsForUnsupportedScheme", () => {
    expect(() => canonicalize("phone", "+15551234")).toThrow();
  });
});

describe("splitOidc", () => {
  it("itSplitsValidIssuerHashSubject", () => {
    expect(splitOidc("https://techcorp.example#sub123")).toEqual({
      issuer: "https://techcorp.example",
      subject: "sub123",
    });
  });

  it("itThrowsForNoDelimiter", () => {
    expect(() => splitOidc("issuer")).toThrow(MalformedUserIdError);
  });

  it("itThrowsForEmptySubject", () => {
    expect(() => splitOidc("https://techcorp.example#")).toThrow(
      MalformedUserIdError
    );
  });

  it("itThrowsForEmptyIssuer", () => {
    expect(() => splitOidc("#subject")).toThrow(MalformedUserIdError);
  });

  it("itThrowsForEmptyString", () => {
    expect(() => splitOidc("")).toThrow(MalformedUserIdError);
  });

  it("itThrowsForSecondHash", () => {
    expect(() => splitOidc("https://techcorp.example#subject#extra")).toThrow(
      MalformedUserIdError
    );
  });
});

describe("pickScopes", () => {
  it("itPicksSummaryFieldsOnly", () => {
    const order = makeOrder();
    const result = pickScopes(order as unknown as Record<string, unknown>, [
      "orders:summary",
    ]);
    expect(Object.keys(result).sort()).toEqual(["id", "orderedAt", "status"]);
  });

  it("itPicksSummaryDetailAndFinancial", () => {
    const order = makeOrder();
    const result = pickScopes(order as unknown as Record<string, unknown>, [
      "orders:summary",
      "orders:detail",
      "orders:financial",
    ]);
    expect(Object.keys(result).sort()).toEqual([
      "billingAddress",
      "id",
      "items",
      "orderedAt",
      "paymentMethod",
      "shippingAddress",
      "status",
      "total",
    ]);
  });

  it("itReturnsEmptyForNoScopes", () => {
    const order = makeOrder();
    const result = pickScopes(order as unknown as Record<string, unknown>, []);
    expect(result).toEqual({});
  });
});

describe("verifyAssertion", () => {
  async function mintAndVerify(
    input: MintAssertionInput,
    opts: {
      expectedSubject?: string;
      expectedTokenIssuer?: string;
      jwksFetcher?: () => Promise<any>;
    }
  ) {
    const jwt = await sharedIdp.mintAssertion(input);
    return verifyAssertion(jwt, {
      jwksFetcher:
        opts.jwksFetcher ?? (() => Promise.resolve(sharedIdp.getJwks())),
      jwksUri: ISSUER_JWKS_URI,
      expectedTokenIssuer: opts.expectedTokenIssuer ?? ISSUER_NAME,
      expectedSubject: opts.expectedSubject ?? "ben@example.com",
    });
  }

  it("itPassesForValidAssertion", async () => {
    await expect(mintAndVerify(makeMintInput(), {})).resolves.toBeUndefined();
  });

  it("itThrowsAssertionMissingForUndefinedJwt", async () => {
    await expect(
      verifyAssertion(undefined, {
        jwksFetcher: () => Promise.resolve(sharedIdp.getJwks()),
        jwksUri: ISSUER_JWKS_URI,
        expectedTokenIssuer: ISSUER_NAME,
        expectedSubject: "ben@example.com",
      })
    ).rejects.toThrow(AssertionError);
  });

  it("itThrowsAssertionInvalidForWrongSigningKey", async () => {
    const otherIdp = await createIdp("https://other-issuer.example");
    await expect(
      mintAndVerify(makeMintInput(), {
        jwksFetcher: () => Promise.resolve(otherIdp.getJwks()),
      })
    ).rejects.toMatchObject({ reason: "assertion_invalid" });
  });

  it("itThrowsAssertionExpiredForExpiredToken", async () => {
    const jwt = await sharedIdp.mintExpiredAssertion(makeMintInput());
    await expect(
      verifyAssertion(jwt, {
        jwksFetcher: () => Promise.resolve(sharedIdp.getJwks()),
        jwksUri: ISSUER_JWKS_URI,
        expectedTokenIssuer: ISSUER_NAME,
        expectedSubject: "ben@example.com",
      })
    ).rejects.toMatchObject({ reason: "assertion_expired" });
  });

  it("itThrowsAssertionInvalidForWrongAudience", async () => {
    await expect(
      mintAndVerify(
        makeMintInput({
          overrides: { aud: "wrong-audience" },
        }),
        {}
      )
    ).rejects.toMatchObject({ reason: "assertion_invalid" });
  });

  it("itPassesForMultiAudienceToken", async () => {
    await expect(
      mintAndVerify(
        makeMintInput({
          overrides: { aud: ["other-aud", "acme-support.example.com"] },
        }),
        {}
      )
    ).resolves.toBeUndefined();
  });

  it("itThrowsAssertionInvalidForSubMismatch", async () => {
    await expect(
      mintAndVerify(
        makeMintInput({ overrides: { sub: "wrong@example.com" } }),
        {}
      )
    ).rejects.toMatchObject({ reason: "assertion_invalid" });
  });

  it("itThrowsAssertionInvalidForIssMismatch", async () => {
    await expect(
      mintAndVerify(
        makeMintInput({ overrides: { iss: "https://wrong-issuer" } }),
        {}
      )
    ).rejects.toMatchObject({ reason: "assertion_invalid" });
  });
});

describe("initialize", () => {
  it("itAdvertisesExtensionCapabilitiesWhenNegotiated", async () => {
    const { client } = await makeTrio();
    expect(client.serverCapabilities.userIdSchemes).toEqual(["email", "oidc"]);
    expect(client.serverCapabilities.verificationLevels).toEqual([
      "anonymous",
      "claimed",
      "verified",
    ]);
    expect(client.serverCapabilities.assertionRequired).toEqual(["verified"]);
    expect(client.serverCapabilities.contextInListRequests).toBe(true);
    expect(client.serverCapabilities.effectivePolicies).toEqual(
      client.serverCapabilities.defaultPolicies.levels
    );
  });

  it("itReflectsOverridesInEffectivePolicies", async () => {
    const { client } = await makeTrio({
      policyOverrides: JANE_OVERRIDES,
    });
    expect(
      client.serverCapabilities.effectivePolicies.claimed.tools.lookup_orders
        .resourceScopes
    ).toEqual(["orders:summary"]);
  });

  it("itHasNoExtensionCapsWhenNotNegotiated", async () => {
    const { client } = await makeTrio({ negotiate: false });
    const caps = client.getServerCapabilities();
    expect(caps?.extensions?.[EXTENSION_KEY]).toBeUndefined();
  });
});

describe("handler authorization", () => {
  it("itReturns32001ForMissingContextWhenNegotiated", async () => {
    const { client } = await makeTrio();
    await expect(
      client.client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      )
    ).rejects.toMatchObject({ code: -32001 });
  });

  it("itReturns32002MalformedContextForBadShape", async () => {
    const { client } = await makeTrio();
    await expect(
      client.client.request(
        {
          method: "tools/list",
          params: { _meta: { [EXTENSION_KEY]: { verificationLevel: 123 } } },
        },
        ListToolsResultSchema
      )
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: "malformed_context" },
    });
  });

  it("itReturns32002MalformedContextForIffViolation", async () => {
    const { client } = await makeTrio();
    await expect(
      client.client.request(
        {
          method: "tools/list",
          params: {
            _meta: {
              [EXTENSION_KEY]: {
                verificationLevel: "anonymous",
                userId: { scheme: "email", value: "ben@example.com" },
              },
            },
          },
        },
        ListToolsResultSchema
      )
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: "malformed_context" },
    });
  });

  it("itReturns32003ForUnsupportedScheme", async () => {
    const { client } = await makeTrio();
    await expect(
      client.client.request(
        {
          method: "tools/list",
          params: {
            _meta: {
              [EXTENSION_KEY]: {
                verificationLevel: "claimed",
                userId: { scheme: "phone", value: "+15551234" },
              },
            },
          },
        },
        ListToolsResultSchema
      )
    ).rejects.toMatchObject({
      code: -32003,
      data: { scheme: "phone", supportedSchemes: ["email", "oidc"] },
    });
  });

  it("itReturns32602ForMalformedOidcValue", async () => {
    const { client } = await makeTrio();
    await expect(
      client.client.request(
        {
          method: "tools/list",
          params: {
            _meta: {
              [EXTENSION_KEY]: {
                verificationLevel: "claimed",
                userId: { scheme: "oidc", value: "no-delimiter" },
              },
            },
          },
        },
        ListToolsResultSchema
      )
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: "malformed_context" },
    });
  });

  it("itReturns32602ForUnknownLevelOnToolsList", async () => {
    const { client } = await makeTrio();
    await expect(
      client.client.request(
        {
          method: "tools/list",
          params: {
            _meta: {
              [EXTENSION_KEY]: {
                verificationLevel: "superuser",
                userId: { scheme: "email", value: "ben@example.com" },
              },
            },
          },
        },
        ListToolsResultSchema
      )
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: "unsupported_verification_level" },
    });
  });

  it("itReturns32602ForUnknownLevelOnToolsCall", async () => {
    const { client } = await makeTrio();
    await expect(
      client.callTool(
        "search_knowledge_base",
        { query: "test" },
        buildMeta("superuser", { scheme: "email", value: "ben@example.com" })
      )
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: "unsupported_verification_level" },
    });
  });

  it("itReturns32002AssertionMissingForVerifiedWithoutAssertion", async () => {
    const { client } = await makeTrio();
    await expect(
      client.callTool(
        "lookup_orders",
        {},
        buildMeta("verified", { scheme: "email", value: "ben@example.com" })
      )
    ).rejects.toMatchObject({
      code: -32002,
      data: { reason: "assertion_missing" },
    });
  });

  it("itReturnsIsErrorForToolNotAllowedAtClaimed", async () => {
    const { client } = await makeTrio();
    const result = await client.callTool(
      "initiate_return",
      { orderId: "ORD-1001" },
      buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
    );
    expect(result.isError).toBe(true);
  });

  it("itReturnsSameGenericIsErrorForCrossUserAndUnknownOrder", async () => {
    const { client } = await makeTrio();
    const crossUser = await client.callTool(
      "lookup_orders",
      { orderIds: ["ORD-2001"] },
      buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
    );
    const unknownOrder = await client.callTool(
      "lookup_orders",
      { orderIds: ["ORD-9999"] },
      buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
    );
    expect(crossUser.isError).toBe(true);
    expect(unknownOrder.isError).toBe(true);
    expect(crossUser.content[0].text).toEqual(unknownOrder.content[0].text);
  });

  it("itRejectsInitiateReturnWhenReturnsCreateScopeRemoved", async () => {
    // A policy override that keeps initiate_return enabled but removes
    // returns:create from its scopes must not allow the write action.
    const { client } = await makeTrio({
      policyOverrides: {
        verified: {
          tools: {
            initiate_return: { resourceScopes: [] },
          },
        },
      },
    });
    const assertion = await sharedIdp.mintAssertion(makeMintInput());
    const result = await client.callTool(
      "initiate_return",
      { orderId: "ORD-1001" },
      buildMeta(
        "verified",
        { scheme: "email", value: "ben@example.com" },
        assertion
      )
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "Tool not available at this verification level."
    );
  });

  it("itReturns32602MalformedArgumentsForBadToolArgs", async () => {
    const { client } = await makeTrio();
    await expect(
      client.callTool(
        "search_knowledge_base",
        { wrongKey: true },
        buildMeta("anonymous")
      )
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: "malformed_arguments" },
    });
  });

  it("itReturns32602ForEmptyStringOrderId", async () => {
    const { client } = await makeTrio();
    await expect(
      client.callTool(
        "lookup_orders",
        { orderIds: [""] },
        buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
      )
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: "malformed_arguments" },
    });
  });
});

describe("non-negotiated behavior", () => {
  it("itReturnsAnonymousToolsWithout32001", async () => {
    const { client } = await makeTrio({ negotiate: false });
    const result = await client.request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema
    );
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("search_knowledge_base");
  });

  it("itSucceedsSearchKnowledgeBaseWithoutExtension", async () => {
    const { client } = await makeTrio({ negotiate: false });
    const result = await client.request(
      {
        method: "tools/call",
        params: { name: "search_knowledge_base", arguments: { query: "test" } },
      },
      CallToolResultSchema
    );
    expect(result.isError).toBeFalsy();
  });
});

describe("tool-list filtering", () => {
  it("itReturns1ToolForAnonymous", async () => {
    const { client } = await makeTrio();
    const result = await client.listTools(buildMeta("anonymous"));
    expect(result.tools).toHaveLength(1);
    expect(result.tools.map((t: any) => t.name)).toContain(
      "search_knowledge_base"
    );
  });

  it("itReturns2ToolsForClaimed", async () => {
    const { client } = await makeTrio();
    const result = await client.listTools(
      buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
    );
    expect(result.tools).toHaveLength(2);
  });

  it("itReturns4ToolsForVerified", async () => {
    const { client } = await makeTrio();
    const assertion = await sharedIdp.mintAssertion(makeMintInput());
    const result = await client.listTools(
      buildMeta(
        "verified",
        { scheme: "email", value: "ben@example.com" },
        assertion
      )
    );
    expect(result.tools).toHaveLength(4);
    expect(result.tools.map((t: any) => t.name).sort()).toEqual([
      "get_account_details",
      "initiate_return",
      "lookup_orders",
      "search_knowledge_base",
    ]);
  });
});

describe("client wrapper metadata injection", () => {
  it("itInjectsMetaOnListTools", async () => {
    const { client, records } = await makeTrio();
    records.length = 0; // clear init records
    await client.listTools(buildMeta("anonymous"));
    const outgoing = records.filter((r) => r.direction === "outgoing");
    expect(outgoing.length).toBeGreaterThan(0);
    const last = outgoing[outgoing.length - 1];
    expect(last.message.params?._meta?.[EXTENSION_KEY]).toBeDefined();
  });

  it("itInjectsMetaOnCallTool", async () => {
    const { client, records } = await makeTrio();
    records.length = 0;
    await client.callTool(
      "search_knowledge_base",
      { query: "test" },
      buildMeta("anonymous")
    );
    const outgoing = records.filter((r) => r.direction === "outgoing");
    expect(outgoing.length).toBeGreaterThan(0);
    const last = outgoing[outgoing.length - 1];
    expect(last.message.params?._meta?.[EXTENSION_KEY]).toBeDefined();
  });

  it("itInjectsMetaOnReadResource", async () => {
    const { client, records } = await makeTrio();
    records.length = 0;
    await client.readResource(
      "kb://help/getting-started",
      buildMeta("anonymous")
    );
    const outgoing = records.filter((r) => r.direction === "outgoing");
    expect(outgoing.length).toBeGreaterThan(0);
    const last = outgoing[outgoing.length - 1];
    expect(last.message.params?._meta?.[EXTENSION_KEY]).toBeDefined();
  });
});

describe("resource authorization", () => {
  it("itListsKbForAllLevels", async () => {
    const { client } = await makeTrio();
    const anonList = await client.client.request(
      {
        method: "resources/list",
        params: { _meta: buildMeta("anonymous") },
      },
      ListResourcesResultSchema
    );
    expect(anonList.resources.map((r: any) => r.uri)).toContain(
      "kb://help/getting-started"
    );
  });

  it("itListsAccountResourceOnlyForVerified", async () => {
    const { client } = await makeTrio();
    const anonList = await client.client.request(
      {
        method: "resources/list",
        params: { _meta: buildMeta("anonymous") },
      },
      ListResourcesResultSchema
    );
    expect(anonList.resources.map((r: any) => r.uri)).not.toContain(
      "account://me/summary"
    );

    const assertion = await sharedIdp.mintAssertion(makeMintInput());
    const verifiedList = await client.client.request(
      {
        method: "resources/list",
        params: {
          _meta: buildMeta(
            "verified",
            { scheme: "email", value: "ben@example.com" },
            assertion
          ),
        },
      },
      ListResourcesResultSchema
    );
    expect(verifiedList.resources.map((r: any) => r.uri)).toContain(
      "account://me/summary"
    );
  });

  it("itReturnsIdenticalErrorForBelowLevelAndUnknownUri", async () => {
    const { client } = await makeTrio();
    const belowLevel = await client.client
      .request(
        {
          method: "resources/read",
          params: {
            uri: "account://me/summary",
            _meta: buildMeta("anonymous"),
          },
        },
        ReadResourceResultSchema
      )
      .catch((e: any) => e);

    const unknownUri = await client.client
      .request(
        {
          method: "resources/read",
          params: {
            uri: "unknown://nothing",
            _meta: buildMeta("anonymous"),
          },
        },
        ReadResourceResultSchema
      )
      .catch((e: any) => e);

    expect(belowLevel.code).toBe(-32602);
    expect(unknownUri.code).toBe(-32602);
    // The two payloads must be deep-equal (no existence leak)
    expect(belowLevel.data).toEqual(unknownUri.data);
    expect(belowLevel.message).toEqual(unknownUri.message);
  });

  it("itSucceedsReadAtPermittedLevel", async () => {
    const { client } = await makeTrio();
    const result = await client.readResource(
      "kb://help/getting-started",
      buildMeta("anonymous")
    );
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Welcome");
  });
});

describe("session isolation", () => {
  it("itHasIndependentEffectivePoliciesForDifferentTrios", async () => {
    const trio1 = await makeTrio({ policyOverrides: JANE_OVERRIDES });
    const trio2 = await makeTrio({
      policyOverrides: {
        verified: {
          tools: { lookup_orders: { resourceScopes: ["orders:summary"] } },
        },
      },
    });
    expect(
      trio1.client.serverCapabilities.effectivePolicies.claimed.tools
        .lookup_orders.resourceScopes
    ).toEqual(["orders:summary"]);
    expect(
      trio2.client.serverCapabilities.effectivePolicies.verified.tools
        .lookup_orders.resourceScopes
    ).toEqual(["orders:summary"]);
    // trio1's verified is untouched
    expect(
      trio1.client.serverCapabilities.effectivePolicies.verified.tools
        .lookup_orders.resourceScopes
    ).toEqual(["orders:summary", "orders:detail", "orders:financial"]);
  });
});

describe("issuer trust", () => {
  it("itRejectsTokenFromDifferentIssuer", async () => {
    const otherIdp = await createIdp("https://other-issuer.example");
    const jwt = await otherIdp.mintAssertion(
      makeMintInput({ overrides: { iss: "https://other-issuer.example" } })
    );
    await expect(
      verifyAssertion(jwt, {
        jwksFetcher: () => Promise.resolve(otherIdp.getJwks()),
        jwksUri: "https://other-issuer.example/.well-known/jwks.json",
        expectedTokenIssuer: ISSUER_NAME,
        expectedSubject: "ben@example.com",
      })
    ).rejects.toMatchObject({ reason: "assertion_invalid" });
  });

  it("itRejectsOffListIssuerNameAtInitialize", async () => {
    await expect(
      makeTrio({
        trustedIssuers: [
          {
            name: "https://trusted.example",
            jwksUri: "https://trusted.example/.well-known/jwks.json",
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("itRejectsAllowlistedNameWithNonApprovedJwksUri", async () => {
    // The client advertises ISSUER_NAME but a different jwksUri than the configured one
    const { server } = createServer({
      jwksFetcher: () => Promise.resolve(sharedIdp.getJwks()),
      trustedIssuers: [
        {
          name: ISSUER_NAME,
          jwksUri: "https://approved.example/.well-known/jwks.json",
        },
      ],
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    const sdkClient = new Client(
      { name: "test-client", version: "0.1.0" },
      {
        capabilities: {
          extensions: {
            [EXTENSION_KEY]: {
              issuer: {
                name: ISSUER_NAME,
                jwksUri: "https://attacker.example/.well-known/jwks.json",
              },
            },
          },
        },
      }
    );

    // The server should reject initialize because jwksUri doesn't match
    await server.connect(serverTransport);
    await expect(sdkClient.connect(clientTransport)).rejects.toThrow();
  });

  it("itAcceptsFullyMatchingEntry", async () => {
    const { client } = await makeTrio({
      trustedIssuers: [{ name: ISSUER_NAME, jwksUri: ISSUER_JWKS_URI }],
    });
    expect(client.serverCapabilities.userIdSchemes).toEqual(["email", "oidc"]);
  });

  it("itRejectsClientControlledJwksUriEndToEnd", async () => {
    // Even with a trusted-issuer allowlist, a client that advertises a
    // different jwksUri than the approved one must be rejected at initialize.
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const { server } = createServer({
      jwksFetcher: () => Promise.resolve(sharedIdp.getJwks()),
      trustedIssuers: [{ name: ISSUER_NAME, jwksUri: ISSUER_JWKS_URI }],
    });
    const sdkClient = new Client(
      { name: "attacker-client", version: "0.1.0" },
      {
        capabilities: {
          extensions: {
            [EXTENSION_KEY]: {
              issuer: {
                name: ISSUER_NAME,
                jwksUri: "https://attacker.example/.well-known/jwks.json",
              },
            },
          },
        },
      }
    );
    await server.connect(serverTransport);
    await expect(sdkClient.connect(clientTransport)).rejects.toThrow();
  });
});

describe("jwksUri HTTPS validation", () => {
  it("itRejectsNonHttpsJwksUri", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const { server } = createServer({
      jwksFetcher: () => Promise.resolve(sharedIdp.getJwks()),
      trustedIssuers: [{ name: ISSUER_NAME, jwksUri: ISSUER_JWKS_URI }],
    });
    const sdkClient = new Client(
      { name: "test-client", version: "0.1.0" },
      {
        capabilities: {
          extensions: {
            [EXTENSION_KEY]: {
              issuer: {
                name: ISSUER_NAME,
                jwksUri: "http://techcorp.example/.well-known/jwks.json",
              },
            },
          },
        },
      }
    );
    await server.connect(serverTransport);
    await expect(sdkClient.connect(clientTransport)).rejects.toThrow();
  });

  it("itRejectsMalformedJwksUri", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const { server } = createServer({
      jwksFetcher: () => Promise.resolve(sharedIdp.getJwks()),
      trustedIssuers: [{ name: ISSUER_NAME, jwksUri: ISSUER_JWKS_URI }],
    });
    const sdkClient = new Client(
      { name: "test-client", version: "0.1.0" },
      {
        capabilities: {
          extensions: {
            [EXTENSION_KEY]: {
              issuer: {
                name: ISSUER_NAME,
                jwksUri: "not-a-url",
              },
            },
          },
        },
      }
    );
    await server.connect(serverTransport);
    await expect(sdkClient.connect(clientTransport)).rejects.toThrow();
  });
});

describe("OIDC issuer anchoring", () => {
  it("itRejectsOidcContextWithDifferentIssuer", async () => {
    const { client } = await makeTrio();
    const assertion = await sharedIdp.mintAssertion(
      makeMintInput({ subject: "sub123" })
    );
    // Context claims other-issuer#sub123 but token is from ISSUER_NAME
    await expect(
      client.callTool(
        "lookup_orders",
        {},
        buildMeta(
          "verified",
          { scheme: "oidc", value: "https://other-issuer.example#sub123" },
          assertion
        )
      )
    ).rejects.toMatchObject({
      code: -32002,
      data: { reason: "assertion_invalid" },
    });
  });

  it("itPassesForMatchingOidcIssuer", async () => {
    const { client } = await makeTrio();
    const assertion = await sharedIdp.mintAssertion(
      makeMintInput({ subject: "sub123" })
    );
    const result = await client.callTool(
      "lookup_orders",
      {},
      buildMeta(
        "verified",
        { scheme: "oidc", value: `${ISSUER_NAME}#sub123` },
        assertion
      )
    );
    // ben doesn't have oidc id "sub123" in dataset → notFound
    expect(result.isError).toBe(true);
  });
});

describe("redactContext", () => {
  it("itMasksAssertionField", () => {
    const ctx = makeContext({
      verificationLevel: "verified",
      userId: { scheme: "email", value: "ben@example.com" },
      assertion: "eyJhbGciOiJSUzI1NiJ9...",
    });
    const redacted = redactContext(ctx);
    expect(redacted.assertion).toBe("***REDACTED***");
  });

  it("itDoesNotAddAssertionIfAbsent", () => {
    const ctx = makeContext({ verificationLevel: "anonymous" });
    const redacted = redactContext(ctx);
    expect(redacted.assertion).toBeUndefined();
  });
});

describe("end-to-end", () => {
  it("itReturnsMoreFieldsAtVerifiedThanClaimed", async () => {
    const { client } = await makeTrio({ policyOverrides: JANE_OVERRIDES });
    const claimedResult = await client.callTool(
      "lookup_orders",
      {},
      buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
    );
    const assertion = await sharedIdp.mintAssertion(makeMintInput());
    const verifiedResult = await client.callTool(
      "lookup_orders",
      {},
      buildMeta(
        "verified",
        { scheme: "email", value: "ben@example.com" },
        assertion
      )
    );

    const claimedFields = Object.keys(
      JSON.parse(claimedResult.content[0].text)[0]
    ).sort();
    const verifiedFields = Object.keys(
      JSON.parse(verifiedResult.content[0].text)[0]
    ).sort();

    // Verified includes financial fields (total, paymentMethod, billingAddress)
    expect(verifiedFields).toContain("total");
    expect(verifiedFields).toContain("paymentMethod");
    expect(verifiedFields).toContain("billingAddress");
    // Claimed (narrowed to summary only) does not include financial fields
    expect(claimedFields).not.toContain("total");
    expect(claimedFields).not.toContain("paymentMethod");
  });

  it("itWideningOverrideDoesNotWidenEffective", async () => {
    const { client } = await makeTrio({
      policyOverrides: {
        claimed: {
          tools: {
            lookup_orders: {
              resourceScopes: ["orders:summary", "orders:financial"],
            },
          },
        },
      },
    });
    // orders:financial is not in default claimed → ignored
    expect(
      client.serverCapabilities.effectivePolicies.claimed.tools.lookup_orders
        .resourceScopes
    ).toEqual(["orders:summary"]);
  });
});
