<!-- mcp-name: io.github.richard-ewing/exogram -->
# Exogram MCP Server

[![PyPI](https://img.shields.io/pypi/v/mcp-server-exogram)](https://pypi.org/project/mcp-server-exogram/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)

A Model Context Protocol (MCP) server providing tools to evaluate, commit, and audit agentic actions through the **Exogram Authority Runtime**.

This server enables AI models (like Claude Desktop) to request cryptographic authorization before executing state-changing tools and securely store/retrieve records in the Exogram vault.

## Features

- **Action Evaluation** — Request cryptographic authorization before executing state-changing operations
- **Audit Ledger** — Commit executed actions to an immutable, tamper-proof audit trail
- **Encrypted Vault** — Store facts/records with encryption, PII scrubbing, and conflict detection
- **Semantic Search** — Search stored records using vector similarity

## Tools

| Tool | Description |
|------|-------------|
| `exogram_evaluate_action` | Request authorization for a tool call. Returns a token if ALLOWED, or blocks execution if it violates policy constraints. |
| `exogram_commit_action` | Commit an executed action token to the immutable audit ledger. |
| `exogram_store_record` | Store a fact/record in the encrypted trust vault (scrubs PII, matches conflicts). |
| `exogram_search_records` | Search vault records using semantic similarity. |

## Installation

### Using uv (recommended)

```bash
uv pip install mcp-server-exogram
```

### Using pip

```bash
pip install mcp-server-exogram
```

## Configuration

### Claude Desktop

Add this to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "exogram": {
      "command": "uv",
      "args": [
        "run",
        "--package",
        "mcp-server-exogram",
        "mcp-server-exogram"
      ],
      "env": {
        "EXOGRAM_API_URL": "https://api.exogram.ai",
        "EXOGRAM_BEARER_TOKEN": "<YOUR_EXOGRAM_BEARER_TOKEN>"
      }
    }
  }
}
```

### Using uvx

```bash
EXOGRAM_API_URL=https://api.exogram.ai \
EXOGRAM_BEARER_TOKEN=your-token \
uvx mcp-server-exogram
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EXOGRAM_BEARER_TOKEN` | Yes | — | Your Exogram API bearer token |
| `EXOGRAM_API_URL` | No | `https://api.exogram.ai` | Exogram API base URL |

## Development

```bash
# Clone and setup
git clone https://github.com/Richard-Ewing/servers.git
cd servers/src/exogram

# Install dependencies
uv sync --all-extras --dev

# Run type checking
uv run pyright

# Run linting
uv run ruff check .

# Run tests
uv run pytest tests/

# Build package
uv build
```

## License

MIT — see [LICENSE](LICENSE) for details.
