# Security Evaluation Guide for MCP Servers

This guide helps MCP server developers and enterprise adopters evaluate the security posture of MCP servers before connecting them to AI agents in production environments.

## Why Security Evaluation Matters

MCP servers grant AI agents access to external systems — databases, APIs, file systems, payment processors, and cloud infrastructure. A compromised or poorly designed MCP server can enable:

- **Data exfiltration** through tool calls that transmit sensitive data to unintended endpoints
- **Injection attacks** via tool arguments (SQL injection, command injection, path traversal)
- **Privilege escalation** when servers connect with overly broad credentials
- **Resource exhaustion** from agents making unbounded tool calls
- **Supply chain compromise** when server dependencies contain vulnerabilities

## Evaluation Dimensions

When evaluating an MCP server — whether your own or a third-party server — consider these security dimensions:

### 1. Tool Safety

**What to check:** Can any tool cause irreversible harm?

- Identify all tools that perform write, delete, or modify operations
- Check if destructive tools require confirmation or support undo/rollback
- Verify that read-only use cases don't require write permissions
- Consider the blast radius: what's the worst case if a tool is misused?

**Questions to ask:**
- Does the server offer a read-only mode?
- Are destructive operations (DELETE, DROP, TERMINATE) behind confirmation gates?
- Can tool actions be rolled back or undone?

### 2. Input Validation

**What to check:** Are tool arguments validated before execution?

- Test string parameters for SQL injection (`'; DROP TABLE --`)
- Test file path parameters for path traversal (`../../etc/passwd`)
- Test command parameters for shell injection (`; rm -rf /`)
- Test with oversized inputs, null bytes, and malformed Unicode
- Check if the server uses parameterized queries for database operations

**Questions to ask:**
- Does the server sanitize all tool arguments before passing to backend systems?
- Are file paths sandboxed to specific directories?
- Does it use parameterized queries (not string concatenation) for database access?

### 3. Permission Scope

**What to check:** Does the server follow the principle of least privilege?

- Review what credentials the server uses to connect to backend systems
- Check if the server can be configured with restricted permissions
- Verify that the server doesn't request broader access than its tools require
- Check `host_permissions` and API scopes

**Questions to ask:**
- Can I configure the server with a read-only database user?
- Does it support scoped API keys (not admin keys)?
- Can I restrict which tools are exposed to the agent?

### 4. Authentication & Secrets

**What to check:** How does the server handle credentials?

- Check how API keys, database passwords, and tokens are stored
- Verify credentials aren't hardcoded in source code or config files
- Check if the server supports credential rotation
- Verify TLS is enforced for all external connections

**Questions to ask:**
- Are credentials stored in environment variables or a secrets manager (not in code)?
- Does the server support credential rotation without restart?
- Are all external connections over TLS?

### 5. Rate Limiting & Resource Protection

**What to check:** Can a runaway agent exhaust resources?

- Check if tool calls are rate-limited
- Verify there are limits on result set sizes (database queries, file listings)
- Check for timeout enforcement on long-running operations
- Consider cost implications (API calls, cloud resource creation)

**Questions to ask:**
- Is there a maximum number of tool calls per minute?
- Are database query results capped (e.g., LIMIT clause enforced)?
- Is there a timeout for tool execution?
- Are there cost controls for resource-creating tools (e.g., max instances)?

### 6. Audit Trail

**What to check:** Are tool calls logged for review?

- Check if the server logs all tool invocations with timestamps
- Verify logs include the agent/user context (who requested the action)
- Check if logs capture both successful and failed tool calls
- Verify logs don't contain sensitive data (credentials, PII)

**Questions to ask:**
- Can I see a history of all tool calls made through this server?
- Do logs include enough context to reconstruct what happened?
- Are logs stored securely and retained for a reasonable period?

### 7. Network Isolation

**What to check:** Can the server be used for SSRF or lateral movement?

- Check if the server blocks requests to internal/private IP ranges
- Verify it can't be used to access cloud metadata endpoints (169.254.169.254)
- Check if egress is filtered to only the server's declared backend

**Questions to ask:**
- Does the server prevent access to internal network resources?
- Is the metadata endpoint (cloud credentials) blocked?
- Can I configure an egress allowlist?

### 8. Dependency Security

**What to check:** Are the server's dependencies secure?

- Run `npm audit` or `pip audit` on the server's dependencies
- Check for known CVEs in direct and transitive dependencies
- Verify dependencies are from trusted sources
- Check if the project has automated dependency updates (Dependabot, Renovate)

**Questions to ask:**
- Are there known vulnerabilities in the dependency tree?
- Is the project actively maintained with recent commits?
- Are dependencies updated regularly?

## Evaluation Checklist

Use this checklist when evaluating an MCP server for production use:

```
[ ] Read-only mode available or destructive tools gated
[ ] Tool arguments validated (injection testing passed)
[ ] Credentials stored securely (env vars / secrets manager)
[ ] Least-privilege credentials configured
[ ] Rate limiting enabled
[ ] Result set sizes capped
[ ] All tool calls logged with context
[ ] TLS enforced on all connections
[ ] No access to internal network / metadata endpoints
[ ] Dependencies audited (no known critical CVEs)
[ ] Server actively maintained (recent commits, responsive maintainers)
```

## For Server Developers

If you're building an MCP server, consider these practices:

1. **Default to read-only.** Offer write operations as opt-in, not default.
2. **Validate all inputs.** Never pass tool arguments directly to SQL, shell, or file system operations.
3. **Use scoped credentials.** Document the minimum permissions your server needs.
4. **Log tool calls.** Include timestamps, tool name, arguments (sanitized), and result status.
5. **Set timeouts.** Don't let a single tool call run indefinitely.
6. **Document your security model.** Publish what data your server accesses, what permissions it needs, and what it logs.
7. **Run dependency audits.** Add `npm audit` or equivalent to your CI pipeline.

## Resources

- [MCP Specification — Security Considerations](https://modelcontextprotocol.io/specification/draft/security)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [NIST AI Risk Management Framework](https://www.nist.gov/artificial-intelligence/executive-order-safe-secure-and-trustworthy-artificial-intelligence)
- [TrustModel MCP Server Rankings](https://trustmodel.ai/mcp-servers) — Independent trust evaluation of 91 MCP servers across these dimensions
