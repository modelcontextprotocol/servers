import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import {
  EXTENSION_KEY,
  ISSUER_NAME,
  ISSUER_JWKS_URI,
  redactContext,
  type EndUserContext,
  type PolicyOverrides,
} from "./extension.js";
import { createServer } from "./server.js";
import { buildMeta, JANE_OVERRIDES, wrapClient } from "./client.js";
import { createIdp } from "./jwt.js";

export interface JsonRpcRecord {
  direction: "outgoing" | "incoming";
  message: JSONRPCMessage;
}

// createRecordingTransport — the single capture seam. Wraps the client-side
// InMemoryTransport, recording every outgoing/incoming JSON-RPC message so the
// demo can print them (redacted) and tests can inspect the raw envelope.
export function createRecordingTransport(inner: Transport): {
  transport: Transport;
  records: JsonRpcRecord[];
} {
  const records: JsonRpcRecord[] = [];
  const wrapped: Transport = {
    start: () => inner.start(),
    send: (msg: JSONRPCMessage) => {
      records.push({ direction: "outgoing", message: msg });
      return inner.send(msg);
    },
    close: () => inner.close(),
    set onmessage(fn: ((message: JSONRPCMessage) => void) | undefined) {
      if (fn) {
        inner.onmessage = (msg) => {
          records.push({
            direction: "incoming",
            message: msg as JSONRPCMessage,
          });
          fn(msg as JSONRPCMessage);
        };
      } else {
        inner.onmessage = undefined;
      }
    },
    get onmessage() {
      return inner.onmessage as ((message: JSONRPCMessage) => void) | undefined;
    },
    set onclose(fn: (() => void) | undefined) {
      inner.onclose = fn;
    },
    get onclose() {
      return inner.onclose;
    },
    set onerror(fn: ((error: Error) => void) | undefined) {
      inner.onerror = fn;
    },
    get onerror() {
      return inner.onerror;
    },
    get sessionId() {
      return inner.sessionId;
    },
  };
  return { transport: wrapped, records };
}

// connect builds a fresh server + InMemoryTransport pair + recording-wrapped client.
// The SDK refuses to re-initialize an existing connection, so each distinct
// negotiation requires a fresh Client+Server+transport trio.
async function connect(opts?: {
  policyOverrides?: PolicyOverrides;
  jwksFetcher?: (uri: string) => Promise<unknown>;
  negotiate?: boolean;
}) {
  const idp = await createIdp(ISSUER_NAME);
  const { server } = createServer({
    jwksFetcher:
      opts?.jwksFetcher ?? ((() => Promise.resolve(idp.getJwks())) as any),
    trustedIssuers: [{ name: ISSUER_NAME, jwksUri: ISSUER_JWKS_URI }],
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const recording = createRecordingTransport(clientTransport);

  const clientOpts: { policyOverrides?: PolicyOverrides } = {};
  if (opts?.policyOverrides) clientOpts.policyOverrides = opts.policyOverrides;

  // If negotiate === false, don't send extension params (non-negotiated client).
  if (opts?.negotiate === false) {
    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );
    const bareClient = new Client(
      { name: "non-negotiated-client", version: "0.1.0" },
      { capabilities: {} }
    );
    await Promise.all([
      server.connect(serverTransport),
      bareClient.connect(recording.transport),
    ]);
    return { client: bareClient, records: recording.records, server, idp };
  }

  // Create the client but don't connect yet — we need to connect server and
  // client simultaneously so the initialize handshake completes.
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const extensionParams: Record<string, unknown> = {
    issuer: {
      name: ISSUER_NAME,
      jwksUri: ISSUER_JWKS_URI,
    },
  };
  if (opts?.policyOverrides) {
    extensionParams.policyOverrides = opts.policyOverrides;
  }
  const sdkClient = new Client(
    { name: "delegated-user-auth-client", version: "0.1.0" },
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

  // Now build the DelegatedClient wrapper around the connected SDK client.
  const delegatedClient = wrapClient(sdkClient);

  return {
    client: delegatedClient,
    records: recording.records,
    server,
    idp,
  };
}

function redactedJson(value: unknown): string {
  const str = JSON.stringify(
    value,
    (key, val) => {
      if (key === "_meta" && val && typeof val === "object") {
        const meta = val as Record<string, unknown>;
        if (meta[EXTENSION_KEY]) {
          meta[EXTENSION_KEY] = redactContext(
            meta[EXTENSION_KEY] as EndUserContext
          );
        }
        return meta;
      }
      return val;
    },
    2
  );
  return str;
}

function printPhase(title: string, records: JsonRpcRecord[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
  for (const r of records) {
    console.log(`  [${r.direction}] ${redactedJson(r.message)}`);
  }
}

export async function runDemo(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Delegated End-User Context — Reference Demo              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const phase1 = await connect();
  const dc1 = phase1.client as any;
  console.log("\n  Phase 1: First connect (no overrides)");
  console.log(
    "  effectivePolicies === defaultPolicies.levels:",
    JSON.stringify(dc1.serverCapabilities.effectivePolicies) ===
      JSON.stringify(dc1.serverCapabilities.defaultPolicies.levels)
  );
  printPhase("Phase 1 records", phase1.records);

  const phase2 = await connect({ policyOverrides: JANE_OVERRIDES });
  const dc2 = phase2.client as any;
  const claimedScopes =
    dc2.serverCapabilities.effectivePolicies.claimed.tools.lookup_orders
      .resourceScopes;
  const verifiedScopes =
    dc2.serverCapabilities.effectivePolicies.verified.tools.lookup_orders
      .resourceScopes;
  console.log("\n  Phase 2: JANE_OVERRIDES");
  console.log("  claimed.lookup_orders scopes:", claimedScopes, "(narrowed)");
  console.log(
    "  verified.lookup_orders scopes:",
    verifiedScopes,
    "(unchanged)"
  );
  printPhase("Phase 2 records", phase2.records);

  const phase3 = await connect({ policyOverrides: JANE_OVERRIDES });
  const dc3 = phase3.client as any;
  const listAnon = await dc3.listTools(buildMeta("anonymous"));
  console.log("\n  Phase 3: Anonymous");
  console.log("  tools/list count:", listAnon.tools.length, "(expected 1)");
  const searchResult = await dc3.callTool(
    "search_knowledge_base",
    { query: "track order" },
    buildMeta("anonymous")
  );
  console.log(
    "  search_knowledge_base result:",
    searchResult.content[0].text.slice(0, 60) + "..."
  );

  const listClaimed = await dc3.listTools(
    buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
  );
  console.log("\n  Phase 4: Claimed");
  console.log("  tools/list count:", listClaimed.tools.length, "(expected 2)");
  const claimedOrders = await dc3.callTool(
    "lookup_orders",
    {},
    buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
  );
  console.log("  lookup_orders (claimed):", claimedOrders.content[0].text);

  const assertion = await phase3.idp.mintAssertion({
    subject: "ben@example.com",
    verificationMethod: "magic-link",
  });
  const verifiedOrders = await dc3.callTool(
    "lookup_orders",
    {},
    buildMeta(
      "verified",
      { scheme: "email", value: "ben@example.com" },
      assertion
    )
  );
  console.log("\n  Phase 5: Verified");
  console.log("  lookup_orders (claimed)  :", claimedOrders.content[0].text);
  console.log("  lookup_orders (verified) :", verifiedOrders.content[0].text);
  console.log(
    "  ↑ verified includes financial fields (total, paymentMethod, billingAddress)"
  );

  const returnResult = await dc3.callTool(
    "initiate_return",
    { orderId: "ORD-1001" },
    buildMeta(
      "verified",
      { scheme: "email", value: "ben@example.com" },
      assertion
    )
  );
  console.log("  initiate_return:", returnResult.content[0].text);

  console.log("\n  Phase 6: Error scenarios");
  // (a) missing _meta when negotiated
  try {
    await dc3.client.request(
      { method: "tools/list", params: {} },
      (
        await import("@modelcontextprotocol/sdk/types.js")
      ).ListToolsResultSchema
    );
  } catch (e: any) {
    console.log("  (a) missing context:", e.code, e.message);
  }
  // (b) tool not allowed (initiate_return at claimed)
  try {
    const r = await dc3.callTool(
      "initiate_return",
      { orderId: "ORD-1001" },
      buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
    );
    console.log("  (b) tool not allowed: isError =", r.isError);
  } catch (e) {
    console.log("  (b) unexpected throw:", e);
  }
  // (c) cross-user / unknown order
  const crossUser = await dc3.callTool(
    "lookup_orders",
    { orderIds: ["ORD-2001"] },
    buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
  );
  console.log(
    "  (c) cross-user: isError =",
    crossUser.isError,
    "—",
    crossUser.content[0].text
  );
  // (d) expired JWT
  const expired = await phase3.idp.mintExpiredAssertion({
    subject: "ben@example.com",
    verificationMethod: "magic-link",
  });
  try {
    await dc3.callTool(
      "lookup_orders",
      {},
      buildMeta(
        "verified",
        { scheme: "email", value: "ben@example.com" },
        expired
      )
    );
  } catch (e: any) {
    console.log("  (d) expired JWT:", e.code, e.data?.reason);
  }
  // (e) unknown verification level
  try {
    await dc3.callTool(
      "search_knowledge_base",
      { query: "test" },
      buildMeta("superuser", { scheme: "email", value: "ben@example.com" })
    );
  } catch (e: any) {
    console.log("  (e) unknown level:", e.code, e.data?.reason);
  }
  // (f) widening override (adds a scope not in defaults) → server ignores it
  const widening: PolicyOverrides = {
    claimed: {
      tools: {
        lookup_orders: {
          resourceScopes: ["orders:summary", "orders:financial"],
        },
      },
    },
  };
  const phase6f = await connect({ policyOverrides: widening });
  const dc6f = phase6f.client as any;
  const effClaimed =
    dc6f.serverCapabilities.effectivePolicies.claimed.tools.lookup_orders
      .resourceScopes;
  console.log(
    "  (f) widening override effective:",
    effClaimed,
    "(orders:financial ignored — no widening)"
  );
  // (g) non-negotiated client → tools/list returns anonymous tool, no -32001
  const phase6g = await connect({ negotiate: false });
  const bareClient = phase6g.client as any;
  const bareList = await bareClient.request(
    { method: "tools/list", params: {} },
    (
      await import("@modelcontextprotocol/sdk/types.js")
    ).ListToolsResultSchema
  );
  console.log(
    "  (g) non-negotiated tools/list count:",
    bareList.tools.length,
    "(no -32001)"
  );

  console.log("\n  Phase 7: Two users back-to-back");
  const phase7 = await connect({ policyOverrides: JANE_OVERRIDES });
  const dc7 = phase7.client as any;
  const benOrders = await dc7.callTool(
    "lookup_orders",
    {},
    buildMeta("claimed", { scheme: "email", value: "ben@example.com" })
  );
  const janeOrders = await dc7.callTool(
    "lookup_orders",
    {},
    buildMeta("claimed", { scheme: "email", value: "jane@example.com" })
  );
  console.log("  Ben's orders:", benOrders.content[0].text);
  console.log("  Jane's orders:", janeOrders.content[0].text);
  console.log(
    "  ↑ different data for different users over the same connection"
  );

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Demo complete.                                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
}
