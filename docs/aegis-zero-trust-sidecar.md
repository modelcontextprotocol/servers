# Enterprise Production Deployment: The Aegis Zero-Trust Sidecar

Deploying Model Context Protocol (MCP) servers in a local development environment is straightforward. However, exposing MCP servers to production networks—where autonomous agents have direct access to internal databases, APIs, and file systems—presents a massive security and compliance liability.

To pass enterprise security audits (SOC2, HIPAA), MCP servers should **never** be exposed directly to agentic traffic. Instead, they must be shielded by a mathematically bounded IAM network layer.

This guide outlines the recommended deployment architecture using the open-source **[Aegis MCP Sidecar](https://github.com/Yash-0620/aegis-mcp-sidecar.git)**.

## The Architecture: "The Switzerland Moat"

Instead of trusting the LLM's internal "safety alignment" to not drop a database or hallucinate a massive financial transaction, we deploy a Zero-Trust Proxy Container (Sidecar) directly alongside the MCP server.

1. **Isolation:** The target MCP Server is bound exclusively to the internal Docker network. It exposes no external ports.
2. **Cryptographic Authentication:** Agents must pass an `X-Aegis-IBCT` (Invocation-Bound Capability Token) signed via Ed25519 cryptography.
3. **Mathematical Bounding:** The Sidecar intercepts the JSON-RPC payload. If the LLM hallucinates an unauthorized tool call (e.g., trying to execute a `$50,000` transaction when the limit is `$500`), the proxy mathematically drops the connection before it ever reaches the MCP server.

## Quickstart Deployment (Docker Compose)

The Aegis Sidecar is framework-agnostic and sits next to any standard MCP server. 

```yaml
version: '3.8'

services:
  # 1. The Vulnerable Target (Isolated)
  target-mcp:
    image: supabase/mcp-server:latest # Replace with any official MCP server
    networks:
      - aegis_secure_net

  # 2. The Shield (Publicly Exposed)
  aegis-sidecar:
    image: aegisprotocol/mcp-sidecar:latest
    ports:
      - "8080:8080"
    environment:
      - TARGET_MCP_URL=http://target-mcp:8000
    networks:
      - aegis_secure_net
    depends_on:
      - target-mcp

networks:
  aegis_secure_net:
    driver: bridge
