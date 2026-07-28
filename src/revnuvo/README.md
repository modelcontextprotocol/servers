# Revnuvo x402 MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the **Revnuvo x402 paid APIs** as AI-callable tools. Each tool call transparently
performs the [x402 v2](https://x402.org) payment flow — signing a USDC payment
on Base, retrying the request with the `X-Payment` header, and returning the
unlocked JSON payload.

> **One sentence:** Claude Desktop / Cursor can verify a domain, dump its DNS,
> or run a full domain assessment by paying $0.001–$0.05 in USDC per call,
> without you writing a line of payment code.

---

## Tools Exposed

| Tool | Upstream Endpoint | Price | Returns |
|------|-------------------|-------|---------|
| `verify_domain` | `POST https://revnuvo-resource.revnuvo.workers.dev/domain/verify` | **$0.001** USDC | Reachability + registration metadata |
| `dns_lookup` | `POST https://revnuvo-resource.revnuvo.workers.dev/domain/dns` | **$0.002** USDC | Full DNS record dump (A / AAAA / MX / NS / TXT / CNAME / SOA) |
| `assess_domain` | `POST https://revnuvo-resource.revnuvo.workers.dev/domain/assess` | **$0.005** USDC | Quick trust-score snapshot (verification + DNS + scoring) |
| `assess_domain_full` | `POST https://assess.revnuvo.site/assess/domain` | **$0.05** USDC | Full Revnuvo assessment report (security, email, threat-intel, revenue-intel, recommendations) |

All four tools take a single argument:

```jsonc
{ "domain": "example.com" }  // bare hostname, no scheme or path
```

---

## Prerequisites

1. **Node.js ≥ 20** installed locally.
2. **An EVM wallet** that holds USDC on Base. You need the wallet's **private
   key** (hex, with or without `0x` prefix). Each tool call deducts the
   per-call price from this wallet. To fund a wallet with USDC on Base, see
   [Coinbase Wallet](https://wallet.coinbase.com) or any Base-compatible
   bridge.
3. **MCP client** — Claude Desktop, Cursor, or any other client that speaks
   MCP over stdio.

> **Security note:** Your private key never leaves your machine. All payment
> signing happens locally inside `@revnuvo/x402` using `viem`. The key is
> only used to sign the x402 payment payload; it is never transmitted to
> Revnuvo or to Smithery.

---

## Installation

### Option A — Build from source (recommended for local development)

```bash
# 1. Clone or copy the four files into a working directory:
#    revnuvo-mcp-server.ts
#    package.json
#    smithery.yaml
#    README.md

# 2. Install dependencies
npm install

# 3. Compile the TypeScript
npm run build
# -> emits build/index.js

# 4. Verify the binary runs (needs WALLET_PRIVATE_KEY in env)
export WALLET_PRIVATE_KEY="0xYOUR_PRIVATE_KEY_HERE"
node build/index.js
# Should print to stderr:
#   [revnuvo-mcp] Server started on stdio. Network=base ...
```

### Option B — Install as an npm package (once published)

```bash
npm install -g revnuvo-x402-mcp
```

### Option C — Run on Smithery.ai (zero local install)

Use the `smithery.yaml` in this directory. Push the repo to GitHub, then import
it into Smithery. Smithery will install deps, build, and host the server over
HTTP for you. You'll be prompted for `WALLET_PRIVATE_KEY` in the Smithery UI
(it's marked `secret: true` so it's never logged).

---

## Configure in Claude Desktop

Claude Desktop reads its MCP servers from a JSON config file:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Open (or create) that file and add the `revnuvo-x402-mcp` entry:

```jsonc
{
  "mcpServers": {
    "revnuvo-x402-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/revnuvo-x402-mcp/build/index.js"],
      "env": {
        "WALLET_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY_HERE",
        "REVNUVO_FACILITATOR": "https://facilitator.xpay.sh",
        "REVNUVO_NETWORK": "base"
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/...` with the real absolute path to
your `build/index.js`. Relative paths will not work.

**Restart Claude Desktop** completely (not just reload). After restart, you
should see four new tools available in any chat:

- `verify_domain`
- `dns_lookup`
- `assess_domain`
- `assess_domain_full`

Try it with a prompt like:

> *"Use the assess_domain_full tool to assess stripe.com and summarize the
> trust score and security posture."*

Claude will invoke the tool, the MCP server will pay $0.05 USDC on Base from
your wallet, and Claude will summarize the returned JSON.

---

## Configure in Cursor

Cursor supports MCP servers via `~/.cursor/mcp.json` (global) or
`.cursor/mcp.json` (per-project):

```jsonc
{
  "mcpServers": {
    "revnuvo-x402-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/revnuvo-x402-mcp/build/index.js"],
      "env": {
        "WALLET_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY_HERE",
        "REVNUVO_FACILITATOR": "https://facilitator.xpay.sh",
        "REVNUVO_NETWORK": "base"
      }
    }
  }
}
```

After saving, open Cursor Settings → MCP → click the refresh icon next to
`revnuvo-x402-mcp`. The four tools become available to Cursor Chat and
Cursor Agent.

---

## Configure in any MCP-compatible client (generic stdio)

The server speaks MCP over stdio. Any client that supports the standard
`command` + `args` + `env` MCP launcher pattern can launch it:

```yaml
# pseudocode
command: node
args:
  - /absolute/path/to/build/index.js
env:
  WALLET_PRIVATE_KEY: 0x...
  REVNUVO_FACILITATOR: https://facilitator.xpay.sh
  REVNUVO_NETWORK: base
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WALLET_PRIVATE_KEY` | **Yes** | — | Hex private key of the wallet that pays per call. Accepts `0x`-prefixed or bare hex. |
| `REVNUVO_FACILITATOR` | No | `https://facilitator.xpay.sh` | x402 facilitator URL that verifies payments server-side. Override for testnet or self-hosted facilitators. |
| `REVNUVO_NETWORK` | No | `base` | Settlement network. Use `base` for mainnet or `base-sepolia` for testnet. |

---

## How the x402 Payment Flow Works

Every tool call follows the same five-step dance — handled automatically by
the `@revnuvo/x402` SDK:

```
┌──────────────┐                                  ┌──────────────────┐
│  MCP client  │                                  │  Revnuvo API     │
│  (Claude /   │                                  │  (Cloudflare)    │
│   Cursor)    │                                  │                  │
└──────┬───────┘                                  └────────┬─────────┘
       │ POST /domain/verify {"domain":"example.com"}      │
       │ ─────────────────────────────────────────────────>│
       │                                                  │
       │  402 Payment Required                            │
       │  WWW-Authenticate: x402 ...                      │
       │<─────────────────────────────────────────────────│
       │                                                  │
       │  SDK signs USDC payment on Base locally          │
       │  (no key ever leaves the process)                │
       │                                                  │
       │ POST /domain/verify {"domain":"example.com"}     │
       │ X-Payment: <signed-payload>                      │
       │ ─────────────────────────────────────────────────>│
       │                                                  │
       │  Server verifies payment via facilitator         │
       │  https://facilitator.xpay.sh                     │
       │                                                  │
       │  200 OK + JSON result                            │
       │  X-Payment-Response: <receipt>                   │
       │<─────────────────────────────────────────────────│
       │                                                  │
       │  Result returned to MCP client as tool output    │
```

---

## Development

```bash
# Install deps
npm install

# Watch mode
npm run dev

# Run locally with hot reload (skip the build step)
WALLET_PRIVATE_KEY=0x... npx tsx revnuvo-mcp-server.ts

# Type-check without emitting
npx tsc --noEmit
```

### Project layout

```
revnuvo-x402-mcp/
├── revnuvo-mcp-server.ts   # source — single-file MCP server
├── package.json            # deps, scripts, MCP launcher metadata
├── smithery.yaml           # Smithery.ai deployment config
├── README.md               # this file
├── tsconfig.json           # (you should add this; see below)
└── build/
    └── index.js            # emitted by `npm run build`
```

### Recommended `tsconfig.json`

If you don't already have one, drop this in:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "build",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  },
  "include": ["revnuvo-mcp-server.ts"]
}
```

---

## Troubleshooting

**`WALLET_PRIVATE_KEY environment variable is required`**
The server exits immediately if the env var is missing. Set it before
launching the MCP server (in `claude_desktop_config.json` `env` block, in
your shell, or in the Smithery UI).

**`Insufficient USDC balance` / transaction reverts**
Top up your wallet with USDC on Base. Each `assess_domain_full` call costs
$0.05; a $5 USDC balance gives you ~100 calls. Cheaper tools (`verify_domain`
at $0.001) let you stretch that to ~5,000 calls.

**Claude Desktop doesn't see the tools**
1. Confirm the absolute path in `args` is correct.
2. Confirm `build/index.js` actually exists (`npm run build`).
3. Fully quit Claude Desktop (Cmd+Q on macOS) and reopen.
4. Check Claude Desktop's MCP logs at
   `~/Library/Logs/Claude/mcp*.log` (macOS).

**Tool returns `402 Payment Required` after retry**
The facilitator may be unreachable. Verify
`curl https://facilitator.xpay.sh/health` returns 200. If you're running
against a custom facilitator, set `REVNUVO_FACILITATOR` accordingly.

**Tool returns `401` / `403` after retry**
The signature is being rejected — most commonly because the wallet address
derived from `WALLET_PRIVATE_KEY` doesn't match the payment sender expected by
the facilitator. Re-check the key.

---

## Privacy & Security

- **Your private key never leaves your machine.** The `@revnuvo/x402` SDK uses
  `viem` to sign the x402 payment payload locally; only the signed payload is
  transmitted.
- **Domain queries are sent to Revnuvo.** The domain you ask about is
  transmitted to the Revnuvo API over HTTPS. Revnuvo logs the query for
  billing and abuse prevention.
- **Payments are public on Base.** Every USDC transfer settles on-chain and is
  visible on Basescan.

---

## License

MIT © Revnuvo Technologies Ltd. See [LICENSE](./LICENSE).

## Links

- **Website:** https://revnuvo.site
- **x402 protocol:** https://x402.org
- **MCP spec:** https://modelcontextprotocol.io
- **Smithery.ai:** https://smithery.ai
- **Facilitator:** https://facilitator.xpay.sh
