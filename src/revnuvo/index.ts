/**
 * Revnuvo x402 MCP Server
 * =======================
 *
 * A Model Context Protocol (MCP) server that exposes the Revnuvo x402 paid
 * API services as MCP tools, so AI assistants (Claude Desktop, Cursor, etc.)
 * can call them directly. Each tool transparently handles the x402 v2 payment
 * flow:
 *
 *   1. Client sends a POST request to the Revnuvo endpoint.
 *   2. Server responds with 402 Payment Required + WWW-Authenticate header.
 *   3. We use @revnuvo/x402 SDK to pay the requested USDC amount on Base.
 *   4. We retry the original request with an X-Payment header.
 *   5. Server verifies the payment via the facilitator and returns 200 OK.
 *
 * Tools exposed:
 *   - verify_domain      ($0.001  USDC)  -> https://revnuvo-resource.revnuvo.workers.dev/domain/verify
 *   - dns_lookup         ($0.002  USDC)  -> https://revnuvo-resource.revnuvo.workers.dev/domain/dns
 *   - assess_domain      ($0.005  USDC)  -> https://revnuvo-resource.revnuvo.workers.dev/domain/assess
 *   - assess_domain_full ($0.05   USDC)  -> https://assess.revnuvo.site/assess/domain
 *
 * Configuration (environment variables):
 *   - WALLET_PRIVATE_KEY   EVM private key (hex, with or without 0x prefix)
 *                          of the wallet that holds USDC on Base. REQUIRED.
 *   - REVNUVO_FACILITATOR  Override the x402 facilitator URL
 *                          (default: https://facilitator.xpay.sh).
 *   - REVNUVO_NETWORK      Override the settlement network (default: base).
 *
 * Usage (stdio transport, standard MCP):
 *   build/index.js           # reads WALLET_PRIVATE_KEY from env
 *
 * Usage (HTTP transport, Smithery):
 *   build/index.js --http --port 8080
 *
 * Author: Revnuvo Technologies Ltd
 * License: MIT
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  wrapFetchWithPayment,
  type PaymentMiddlewareOptions,
  // @revnuvo/x402 exposes both a fetch wrapper and a lower-level client.
  // The fetch wrapper is the simplest API and is what we use here.
} from "@revnuvo/x402";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const FACILITATOR_URL =
  process.env.REVNUVO_FACILITATOR ?? "https://facilitator.xpay.sh";
const NETWORK = (process.env.REVNUVO_NETWORK ?? "base") as
  | "base"
  | "base-sepolia";

if (!WALLET_PRIVATE_KEY) {
  // We log to stderr so we don't corrupt the MCP stdio JSON-RPC stream.
  console.error(
    "[revnuvo-mcp] ERROR: WALLET_PRIVATE_KEY environment variable is required."
  );
  console.error(
    "[revnuvo-mcp]        Set it to the hex private key of the wallet that"
  );
  console.error(
    "[revnuvo-mcp]        holds USDC on Base. Example:"
  );
  console.error(
    '[revnuvo-mcp]          export WALLET_PRIVATE_KEY="0xabc123..."'
  );
  process.exit(1);
}

// Normalize the private key (accept with or without 0x prefix).
const privateKey = WALLET_PRIVATE_KEY.startsWith("0x")
  ? WALLET_PRIVATE_KEY
  : `0x${WALLET_PRIVATE_KEY}`;

// Build the payment-enabled fetch client once and reuse it for every tool call.
// @revnuvo/x402 handles: 402 detection -> payment signing -> retry with header.
const paymentOptions: PaymentMiddlewareOptions = {
  privateKey,
  facilitatorUrl: FACILITATOR_URL,
  network: NETWORK,
};
const paidFetch = wrapFetchWithPayment(fetch, paymentOptions);

// ---------------------------------------------------------------------------
// Endpoint registry
// ---------------------------------------------------------------------------

interface RevnuvoEndpoint {
  /** Stable tool name surfaced to the MCP client. */
  toolName: string;
  /** Human-readable title shown in tool listings. */
  title: string;
  /** Plain-English description of what the endpoint returns. */
  description: string;
  /** Full HTTPS URL of the upstream Revnuvo x402 endpoint. */
  url: string;
  /** Per-request price in USDC, as a human-readable string. */
  priceUsdc: string;
  /** Raw USDC atomic units (6 decimals) used inside the x402 protocol. */
  priceAtomic: string;
}

const ENDPOINTS: Record<string, RevnuvoEndpoint> = {
  verify_domain: {
    toolName: "verify_domain",
    title: "Verify Domain (x402, $0.001)",
    description:
      "Verifies that a domain is reachable and returns basic registration / " +
      "reachability metadata. Costs $0.001 USDC on Base per call. Uses the " +
      "Revnuvo Resource service at revnuvo-resource.revnuvo.workers.dev.",
    url: "https://revnuvo-resource.revnuvo.workers.dev/domain/verify",
    priceUsdc: "$0.001",
    priceAtomic: "1000", // 0.001 USDC = 1000 atomic units (6 decimals)
  },
  dns_lookup: {
    toolName: "dns_lookup",
    title: "DNS Lookup (x402, $0.002)",
    description:
      "Returns a full DNS record dump (A, AAAA, MX, NS, TXT, CNAME, SOA) " +
      "for the requested domain. Costs $0.002 USDC on Base per call. Uses " +
      "the Revnuvo Resource service at revnuvo-resource.revnuvo.workers.dev.",
    url: "https://revnuvo-resource.revnuvo.workers.dev/domain/dns",
    priceUsdc: "$0.002",
    priceAtomic: "2000", // 0.002 USDC = 2000 atomic units
  },
  assess_domain: {
    toolName: "assess_domain",
    title: "Assess Domain — Quick (x402, $0.005)",
    description:
      "Runs a quick domain assessment — combines verification + DNS lookup + " +
      "lightweight scoring into a compact risk/opportunity snapshot. Costs " +
      "$0.005 USDC on Base per call. Uses the Revnuvo Resource service at " +
      "revnuvo-resource.revnuvo.workers.dev.",
    url: "https://revnuvo-resource.revnuvo.workers.dev/domain/assess",
    priceUsdc: "$0.005",
    priceAtomic: "5000", // 0.005 USDC = 5000 atomic units
  },
  assess_domain_full: {
    toolName: "assess_domain_full",
    title: "Assess Domain — Full Report (x402, $0.05)",
    description:
      "Returns the FULL Revnuvo domain assessment report — trust score, " +
      "security posture (SPF/DKIM/DMARC/DNSSEC), MX validity, threat-intel " +
      "reputation, revenue intelligence signals, and a recommended action " +
      "plan. Costs $0.05 USDC on Base per call. Uses the Revnuvo Assess " +
      "service at assess.revnuvo.site.",
    url: "https://assess.revnuvo.site/assess/domain",
    priceUsdc: "$0.05",
    priceAtomic: "50000", // 0.05 USDC = 50000 atomic units
  },
};

// ---------------------------------------------------------------------------
// MCP tool schemas
// ---------------------------------------------------------------------------

/**
 * Per the MCP spec, ToolSchema is the JSON-Schema describing the arguments
 * a tool accepts. All four Revnuvo tools take a single `domain` string.
 */
const domainArgumentSchema = {
  type: "object",
  properties: {
    domain: {
      type: "string",
      description:
        "The domain to query (e.g. 'example.com'). Do not include a scheme " +
        "or path — bare hostname only.",
      pattern: "^(?!https?://)[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)+$",
      examples: ["example.com", "revnuvo.site", "sub.example.co.uk"],
    },
  },
  required: ["domain"],
  additionalProperties: false,
} as const;

const TOOL_DEFINITIONS: Tool[] = Object.values(ENDPOINTS).map((ep) => ({
  name: ep.toolName,
  title: ep.title,
  description: ep.description,
  inputSchema: domainArgumentSchema,
}));

// ---------------------------------------------------------------------------
// Tool invocation logic
// ---------------------------------------------------------------------------

interface DomainArgs {
  domain: string;
}

function isDomainArgs(value: unknown): value is DomainArgs {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { domain?: unknown };
  return typeof candidate.domain === "string" && candidate.domain.length > 0;
}

/**
 * Invoke a Revnuvo x402 endpoint with the payment flow handled automatically.
 *
 * Returns a JSON-stringified payload suitable for the MCP `content` array.
 */
async function callRevnuvoEndpoint(
  endpoint: RevnuvoEndpoint,
  domain: string
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const body = JSON.stringify({ domain });

  try {
    // The wrapped fetch transparently:
    //   - sends the initial POST (no X-Payment header)
    //   - receives 402 + WWW-Authenticate
    //   - signs the USDC payment on Base using our private key
    //   - retries the POST with X-Payment: <payload>
    //   - returns the final 200 OK response
    const response = await paidFetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        content: [
          {
            type: "text",
            text:
              `Revnuvo x402 call to ${endpoint.url} failed.\n` +
              `HTTP ${response.status} ${response.statusText}\n` +
              `Tool: ${endpoint.toolName}\n` +
              `Price: ${endpoint.priceUsdc} USDC on ${NETWORK}\n` +
              `Domain: ${domain}\n\n` +
              `Response body:\n${responseText}`,
          },
        ],
        isError: true,
      };
    }

    // Pretty-print the JSON if possible, otherwise return raw text.
    let formatted: string;
    try {
      formatted = JSON.stringify(JSON.parse(responseText), null, 2);
    } catch {
      formatted = responseText;
    }

    const paymentReceipt = response.headers.get("X-Payment-Response");

    return {
      content: [
        {
          type: "text",
          text:
            `Revnuvo x402 call succeeded.\n` +
            `Tool: ${endpoint.toolName}\n` +
            `Endpoint: ${endpoint.url}\n` +
            `Price paid: ${endpoint.priceUsdc} USDC on ${NETWORK}\n` +
            `Facilitator: ${FACILITATOR_URL}\n` +
            `Domain: ${domain}\n` +
            (paymentReceipt
              ? `Payment receipt: ${paymentReceipt}\n`
              : "") +
            `\nResponse:\n${formatted}`,
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text:
            `Revnuvo x402 call to ${endpoint.url} threw an error.\n` +
            `Tool: ${endpoint.toolName}\n` +
            `Domain: ${domain}\n\n` +
            `Error: ${message}\n\n` +
            `Troubleshooting:\n` +
            `  - Verify WALLET_PRIVATE_KEY is set and the wallet holds enough ` +
            `USDC on ${NETWORK}.\n` +
            `  - Verify the facilitator is reachable: ${FACILITATOR_URL}\n` +
            `  - Verify the domain is well-formed: ${domain}`,
        },
      ],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// MCP server wiring
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "revnuvo-x402-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ListToolsRequest — return the static tool list.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOL_DEFINITIONS,
  };
});

// CallToolRequest — dispatch to the appropriate endpoint.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const endpoint = ENDPOINTS[name];
  if (!endpoint) {
    return {
      content: [
        {
          type: "text",
          text:
            `Unknown tool: ${name}. Available tools: ` +
            Object.keys(ENDPOINTS).join(", "),
        },
      ],
      isError: true,
    };
  }

  if (!isDomainArgs(args)) {
    return {
      content: [
        {
          type: "text",
          text:
            `Invalid arguments for tool '${name}'. Expected: { "domain": ` +
            `"<hostname>" }. Received: ${JSON.stringify(args)}`,
        },
      ],
      isError: true,
    };
  }

  return callRevnuvoEndpoint(endpoint, args.domain);
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[revnuvo-mcp] Server started on stdio. ` +
      `Network=${NETWORK} Facilitator=${FACILITATOR_URL} ` +
      `Tools=${Object.keys(ENDPOINTS).join(", ")}`
  );
}

main().catch((error) => {
  console.error("[revnuvo-mcp] Fatal error during startup:", error);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Type re-export for downstream consumers
// ---------------------------------------------------------------------------

export type { ToolSchema };
export { ENDPOINTS, TOOL_DEFINITIONS };
