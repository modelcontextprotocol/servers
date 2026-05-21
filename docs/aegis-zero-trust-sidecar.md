# Enterprise Production Deployment: The Aegis Zero-Trust Sidecar

Deploying Model Context Protocol (MCP) servers in a local development environment is straightforward. However, exposing MCP servers to production networks—where autonomous agents have direct access to internal databases, APIs, and file systems—presents a massive security and compliance liability.

To pass enterprise security audits (SOC2, HIPAA), MCP servers should **never** be exposed directly to agentic traffic. Instead, they must be shielded by a mathematically bounded IAM network layer.

This guide outlines the recommended deployment architecture using the open-source **[Aegis MCP Sidecar](https://github.com/Yash-0620/aegis-mcp-sidecar.git)**.

## The Architecture: "The Switzerland Moat"

Instead of trusting the LLM's internal "safety alignment" to not drop a database or hallucinate a massive financial transaction, we deploy a Zero-Trust Proxy Container (Sidecar) directly alongside the target MCP server.

1. **Isolation:** The target MCP Server is bound exclusively to the internal Docker network. It exposes no external ports.
2. **Cryptographic Authentication:** Agents must pass an `X-Aegis-IBCT` (Invocation-Bound Capability Token) signed via Ed25519 cryptography.
3. **Mathematical Bounding:** The Sidecar intercepts the JSON-RPC payload. If the LLM hallucinates an unauthorized tool call, the proxy mathematically drops the connection before it ever reaches the MCP server.
4. **Cloud SIEM Telemetry:** When a threat is blocked at the network edge, the Sidecar asynchronously forwards the payload to the Aegis Cloud Control plane, updating the CISO's dashboard in real-time.

## Quickstart Deployment

### Step 0: Mint Your Agent Identity
Before you can run the sidecar, your agent needs a cryptographic identity to authenticate with the network layer.
1. Log in to the **[Aegis Cloud Control Plane](https://aegis-cloud-console.vercel.app/)**.
2. Register a new Agent Identity and configure its mathematical boundaries (e.g., set maximum financial transaction limits or restricted database operations).
3. Copy the generated **Agent ID (API Key)**.

### Step 1: The Sidecar Infrastructure
The Aegis Sidecar is framework-agnostic and acts as a pure, stateless proxy. You do not need to manage any database credentials.

```yaml
version: '3.8'

services:
  # 1. The Vulnerable Target (Isolated)
  target-mcp:
    image: supabase/mcp-server:latest # Replace with your official MCP server
    networks:
      - aegis_secure_net

  # 2. The Shield (Publicly Exposed)
  aegis-sidecar:
    image: aegisprotocol/mcp-sidecar:latest
    ports:
      - "8080:8080"
    environment:
      - TARGET_MCP_URL=http://target-mcp:8000
      - AEGIS_CONTROL_PLANE_URL=[https://aegis-live-node.onrender.com](https://aegis-live-node.onrender.com)
      - AEGIS_AGENT_ID=paste_your_generated_agent_id_here
    networks:
      - aegis_secure_net
    depends_on:
      - target-mcp

networks:
  aegis_secure_net:
    driver: bridge
