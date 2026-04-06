Reference Implementation: Zero-Knowledge Secure Memory for MCP
Give any MCP-compatible agent a privacy-first, audit-ready memory layer in under 5 minutes.

PyPI License MCP Compatible

The Problem
MCP gives AI agents access to tools and data — but no standardized way to persist memory securely. When agents store context between sessions, sensitive information (PII, credentials, health data) often ends up in plaintext logs or unprotected vector stores.

This reference implementation solves that with two MCP tools backed by Synapse Layer:

Tool	Description
store_memory	Sanitize → validate → apply differential privacy → store
recall_memory	Semantic search with automatic self-healing of conflicting memories
Every memory operation is audit-ready and returns cryptographic integrity hashes, trust quotients, and full sanitization/privacy metadata.

Security Model
Raw Input ──► PII Sanitization ──► Intent Validation ──► DP Noise Injection ──► Encrypted Storage
                  │                       │                       │
                  ▼                       ▼                       ▼
            Names, emails,          Category +              ε-differential
            phones, SSNs           confidence              privacy guarantee
            auto-stripped          auto-classified          (configurable ε)
Properties
Property	Guarantee
PII Removal	Automatic detection and stripping of names, emails, phone numbers, SSNs, and other PII patterns before storage
Differential Privacy	Configurable ε-DP noise injection on embeddings — mathematically provable privacy bounds
Intent Validation	Every memory is classified by intent category with confidence scoring
Self-Healing	Conflicting memories with overlapping semantics are automatically reclassified via keyword consensus
Audit Trail	Every store returns: memory_id, content_hash (SHA-256), trust_quotient, and full sanitization/privacy details
Zero-Knowledge	The SDK processes all data locally — no external API calls, no telemetry, no data leaves your environment
Quick Start
Prerequisites
Python 3.10+
An MCP-compatible client (Claude Desktop, MCP Inspector, or any custom client)
1. Install
pip install synapse-layer "mcp[cli]"
2. Configure Environment
cp .env.example .env
# Edit .env to set your SYNAPSE_AGENT_ID and privacy epsilon
3. Run the Server
# Direct execution (stdio transport — default for Claude Desktop)
python server.py

# Or via MCP CLI
mcp run server.py
Integration Guides
Claude Desktop
Add to your Claude Desktop configuration file (claude_desktop_config.json):

{
  "mcpServers": {
    "synapse-secure-memory": {
      "command": "python",
      "args": ["path/to/examples/mcp-secure-memory/server.py"],
      "env": {
        "SYNAPSE_AGENT_ID": "claude-desktop",
        "SYNAPSE_PRIVACY_EPSILON": "0.5"
      }
    }
  }
}
Once configured, Claude can use natural language to store and recall memories:

"Remember that the user prefers dark mode and lives in Berlin."

→ store_memory is called automatically. PII (city name as location data) is sanitized. An audit payload is returned with memory_id and trust_quotient.

"What do I know about the user's preferences?"

→ recall_memory returns semantically similar memories with self-healing metadata.

LangChain
from langchain_mcp_adapters.client import MultiServerMCPClient

async with MultiServerMCPClient(
    {
        "synapse-memory": {
            "command": "python",
            "args": ["path/to/server.py"],
            "env": {
                "SYNAPSE_AGENT_ID": "langchain-agent",
                "SYNAPSE_PRIVACY_EPSILON": "0.5",
            },
        }
    }
) as client:
    tools = client.get_tools()
    # tools now includes store_memory and recall_memory
    # Use with any LangChain agent: create_react_agent, AgentExecutor, etc.
CrewAI
from crewai import Agent, Task, Crew
from crewai_tools import MCPServerAdapter

# Connect to the Synapse Layer MCP server
mcp_tools = MCPServerAdapter(
    server_params={
        "command": "python",
        "args": ["path/to/server.py"],
        "env": {"SYNAPSE_AGENT_ID": "crewai-agent"},
    }
)

researcher = Agent(
    role="Research Analyst",
    goal="Gather and securely persist research findings",
    tools=mcp_tools.tools,  # includes store_memory + recall_memory
)

crew = Crew(agents=[researcher], tasks=[...])
crew.kickoff()
MCP Inspector (Testing)
# Start the server
python server.py

# In another terminal — launch MCP Inspector
npx -y @modelcontextprotocol/inspector

# Connect to stdio://python server.py
# Test store_memory and recall_memory interactively
API Reference
store_memory
Parameter	Type	Default	Description
content	str	required	Raw text to memorize (PII auto-stripped)
confidence	float	0.9	Agent confidence in this memory (0.0–1.0)
metadata	str | null	null	Optional JSON string with extra key-value pairs
Returns:

{
  "memory_id": "a1b2c3d4...",
  "trust_quotient": 0.8234,
  "sanitized": true,
  "privacy_applied": true,
  "content_hash": "sha256:e5f6...",
  "timestamp": 1712345678.123
}
recall_memory
Parameter	Type	Default	Description
query	str	required	Natural-language query
top_k	int	5	Maximum memories to return
Returns:

[
  {
    "memory_id": "a1b2c3d4...",
    "content": "User prefers dark mode",
    "similarity": 0.9412,
    "trust_quotient": 0.8234,
    "self_healed": false,
    "timestamp": 1712345678.123
  }
]
Configuration
Environment Variable	Default	Description
SYNAPSE_AGENT_ID	mcp-secure-memory	Unique namespace for this agent's memories
SYNAPSE_PRIVACY_EPSILON	0.5	DP epsilon (lower = stronger privacy)
LOG_LEVEL	INFO	Server log verbosity
Architecture
┌──────────────────────────────────────────────────┐
│                  MCP Client                       │
│         (Claude / LangChain / CrewAI)             │
└─────────────────────┬────────────────────────────┘
                      │ JSON-RPC (stdio / SSE)
                      ▼
┌──────────────────────────────────────────────────┐
│            MCP Server (this file)                 │
│         store_memory  |  recall_memory            │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│            Synapse Layer SDK                      │
│  ┌────────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Sanitizer  │ │ Validator │ │ DP Privacy    │  │
│  │ (PII)      │ │ (Intent)  │ │ (ε-noise)     │  │
│  └────────────┘ └───────────┘ └───────────────┘  │
│  ┌────────────────────────────────────────────┐   │
│  │       Self-Healing Memory Engine           │   │
│  │   (conflict resolution + reclassification) │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
File Structure
examples/mcp-secure-memory/
├── server.py                  # MCP server — the only file you need to run
├── mcp_registry_config.json   # Claude Desktop configuration template
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
└── README.md                  # This file
Contributing
We welcome contributions! See CONTRIBUTING.md for guidelines.

If you build an integration with a new MCP client, please open a PR adding it to the Integration Guides section above.

License
Apache 2.0 — see LICENSE for details.

Built by Synapse Layer — Privacy-first cognitive infrastructure for AI agents.
