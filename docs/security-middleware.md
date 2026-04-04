# Security Middleware for Production MCP Deployments

> **Note:** The reference servers in this repository are educational examples, not production-ready solutions. This guide documents the security gap that exists in MCP deployments without middleware, and one open-source solution for closing it.

## The Security Gap

The MCP specification deliberately separates **capability** (what tools exist) from **authorization** (who can call them, under what constraints). This is by design — MCP servers define tools, and hosts/clients decide how to invoke them.

However, in practice, most MCP deployments bridge the gap with no controls at all:

```
Agent → MCP Client → MCP Server → Tool execution
         (no authz)    (no audit)   (no constraints)
```

This means:
- **No authentication** of which agent is calling a tool
- **No audit trail** of tool invocations for incident response
- **No rate limiting** to prevent runaway agents
- **No human-in-the-loop** for irreversible operations (file deletion, code execution)
- **No constraint enforcement** (e.g., preventing writes to system paths)

The MCP spec's warning — "Developers should evaluate their own security requirements" — is correct. This document shows one concrete approach.

## SINT PolicyGateway: Reference Security Middleware

[SINT Protocol](https://github.com/sint-ai/sint-protocol) is an open-source TypeScript security layer that sits between MCP clients and servers, enforcing:

1. **Capability tokens** — Ed25519-signed tokens scoping each agent to specific tools and actions
2. **Tier-based approval** — T0 (auto), T1 (audit), T2 (human review), T3 (explicit sign-off)
3. **Audit ledger** — SHA-256 hash-chained event log for every tool call
4. **Constraint enforcement** — rate limits, path allowlists, parameter bounds
5. **OWASP ASI coverage** — regression-tested against all 10 OWASP Agentic AI Top-10 threats

### How it fits MCP

```
Agent
  ↓  (Ed25519 capability token)
SintMCPServer (PolicyGateway choke point)
  ↓  only allowed tool calls pass through
MCP Server (filesystem, fetch, git, etc.)
  ↓
Tool execution
```

### Quickstart (5 minutes)

```bash
npm install @sint/bridge-mcp @sint/gate-policy-gateway @sint/gate-capability-tokens @sint/core
```

```typescript
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { MCPInterceptor } from "@sint/bridge-mcp";
import { generateKeypair, issueCapabilityToken } from "@sint/gate-capability-tokens";
import { ApprovalTier } from "@sint/core";

// 1. Issue a scoped capability token for your agent
const root = generateKeypair();
const agent = generateKeypair();
const token = issueCapabilityToken({
  issuer: root.publicKey,
  subject: agent.publicKey,
  resource: "mcp://filesystem/*",       // scope to filesystem server only
  actions: ["call"],
  constraints: { maxCallsPerMinute: 60 },
  expiresAt: "2026-12-31T23:59:59.000000Z",
  revocable: true,
}, root.privateKey);

// 2. Create the gateway
const gateway = new PolicyGateway({ tokenStore, ledger });

// 3. Wrap your MCP session
const interceptor = new MCPInterceptor({ gateway });
const sessionId = interceptor.createSession({
  agentId: agent.publicKey,
  tokenId: token.value.tokenId,
  serverName: "filesystem",
});

// 4. Intercept tool calls — denied calls never reach the MCP server
const result = interceptor.interceptToolCall(sessionId, {
  callId: "call-1",
  serverName: "filesystem",
  toolName: "writeFile",
  arguments: { path: "/tmp/output.txt", content: "hello" },
  timestamp: new Date().toISOString(),
});

if (result.action === "forward") {
  // safe — call the underlying MCP server
} else if (result.action === "deny") {
  // blocked — reason is in result.reason
} else if (result.action === "escalate") {
  // needs human approval — result.approvalToken contains the escalation ID
}
```

### Default tier assignments for MCP tools

| Tool | Default Tier | Requires Human Approval |
|------|-------------|------------------------|
| `readFile`, `readDirectory`, `getFileInfo` | T0 — auto-allow | No |
| `writeFile`, `createDirectory`, `searchFiles` | T1 — audit | No |
| `deleteFile`, `moveFile` | T2 — human review | Yes |
| `bash`, `exec`, `eval`, `run_command` | T3 — explicit sign-off | Yes (M-of-N quorum) |

Shell/exec tool names are **always classified T3** regardless of server context, addressing [OWASP ASI05](https://github.com/sint-ai/sint-protocol/blob/master/packages/conformance-tests/src/mcp-attack-surface.test.ts) (prompt injection via tool calls).

### Performance

Measured on the `src/filesystem` reference server:

| Metric | Value |
|--------|-------|
| p50 intercept overhead | < 2ms |
| p99 intercept overhead | < 10ms |
| Throughput | > 10,000 calls/sec |

### Resources

- **GitHub:** https://github.com/sint-ai/sint-protocol
- **Integration guide:** https://github.com/sint-ai/sint-protocol/blob/master/docs/guides/secure-mcp-deployments.md
- **OWASP ASI conformance suite:** https://github.com/sint-ai/sint-protocol/blob/master/packages/conformance-tests/src/mcp-attack-surface.test.ts
- **MCP Scanner CLI** (`@sint/mcp-scanner`): audits any MCP server's tool definitions for risk before deployment
