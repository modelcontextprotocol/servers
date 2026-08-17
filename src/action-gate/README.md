# Action Gate MCP Server

<!-- mcp-name: io.github.modelcontextprotocol/server-action-gate -->

A Model Context Protocol server that provides deterministic Gate/Prove policy boundaries, Simulation Mode, and append-only hash-chained action ledgers for agent tool execution.

Source: https://github.com/modelcontextprotocol/servers/tree/main/src/action-gate

### Problem & Invariants

As autonomous agents and MCP clients gain write and shell execution capabilities, treating raw LLM probability or tool-call intent as authorization introduces severe production and compliance risks.

This server enforces a zero-trust execution boundary:
1. **Never Equate Intent to Approval:** High model confidence (`model_confidence: 0.99`) is explicitly rejected as authorization for destructive or provision operations.
2. **Tiered Tool Governance:**
   - `READ`: Allowed and logged.
   - `WRITE`: Defaults to non-destructive simulation mode unless approved.
   - `DESTRUCTIVE` / `PROVISION` / `DECOMMISSION`: Hard `DENY` unless accompanied by an authorized human-in-the-loop (HITL) prove token.
3. **Immutable Action Ledger:** Every evaluation and decision is recorded in an append-only JSONL ledger with SHA-256 hash-chain verification.
4. **Atomic Kill-Switch:** Immediate tool freeze via environment variable (`AAG_KILL_SWITCH=1`) or file sentinel (`artifacts/KILL`).

### Available Tools

- `gate_check` - Evaluate a proposed agent/MCP tool call under Gate/Prove rules. Never executes the tool.
  - Required arguments:
    - `tool` (string): Tool name the agent intends to invoke.
  - Optional arguments:
    - `tier` (string): `read`, `write`, `destructive`, `provision`, `decommission`
    - `arguments` (object): Proposed tool arguments
    - `thought` (string): Agent rationale
    - `model_confidence` (number): LLM confidence score (0.0 to 1.0)
    - `approved` (boolean): Human HITL approval flag
    - `prove_token` (string): Cryptographic token matching `AAG_PROVE_TOKEN`
    - `simulate` (boolean): Force non-destructive simulation mode
    - `actor_id` (string): Agent or session identifier
    - `idempotency_key` (string): Unique request key to detect replays

- `ledger_verify` - Verify the SHA-256 hash chain of the Action Ledger for audit diligence evidence.

## Installation

### Using uv (recommended)

```bash
uvx mcp-server-action-gate
```

### Using PIP

```bash
pip install mcp-server-action-gate
```

After installation, run via:

```bash
python -m mcp_server_action_gate serve
```

## Configuration

### Configure for Claude Desktop / Agent Runner

Add to your MCP settings:

```json
{
  "mcpServers": {
    "action-gate": {
      "command": "uvx",
      "args": ["mcp-server-action-gate", "serve"],
      "env": {
        "AAG_PROVE_TOKEN": "your-hitl-secret-token",
        "AAG_KILL_SWITCH": "0"
      }
    }
  }
}
```

## Testing & Validation

```bash
python -m unittest discover -s tests -p "test_*.py"
```

## License

MIT
