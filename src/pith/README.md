# PITH v2 MCP Server

An MCP server that compresses inter-agent payloads to eliminate token waste in multi-agent pipelines. Uses **Shannon local information scoring** (I(w) = log2(total) − LOG_CACHE[count(w)]) validated by Benford's Law structural integrity check. SIZE_GATE = 10 000 chars ensures Benford statistical stability (≥100 sentences) and positive compute ROI. Zero external dependencies beyond the MCP SDK.

> **Core logic and full documentation:** [github.com/VjAlbert/pith-skill](https://github.com/VjAlbert/pith-skill)

---

## Overview

In multi-agent AI pipelines, agents pass verbose outputs — tool results, reasoning traces, search summaries — to downstream agents without compression. PITH fills this gap: it compresses those inter-agent payloads aggressively while preserving all structured content (code, JSON, URLs, file paths, numbers).

```
AGENT A — verbose output (487 tokens)
    ↓
[PITH MCP Server]
    ↓
AGENT B — compressed payload (284 tokens, -42%)
[PITH | ✓ | -42% tokens | benford:4.3% | compressed]
```

This module is the packaged MCP implementation, part of the [Anthropic MCP reference server monorepo](https://github.com/modelcontextprotocol/servers). It is published to PyPI as `mcp-server-pith` and registered with the Claude Desktop and Claude Code MCP clients.

---

## MCP Tools

### `compress`

Compress a verbose payload. Returns compressed text with a metadata header.

**Input:**
- `payload` (string, required): Text to compress
- `ratio` (number, optional, default: `0.6`): Fraction of sentences to keep (0.1–1.0)

**Output:**
```
[PITH | ✓ | -42% tokens | benford:4.3% | compressed]
<compressed text here>
```

Header fields: `✓`/`⚠` = Benford gate passed/warned, `-%` = token reduction, `benford:X%` = MAD from ideal distribution, `compressed`/`passthrough` = action taken.

### `compress_with_metadata`

Same compression, returns a JSON object with full metadata for programmatic pipelines.

**Output:**
```json
{
  "compressed": "...",
  "meta": {
    "action": "compressed",
    "original_tokens": 487,
    "compressed_tokens": 284,
    "ratio": 0.583,
    "saved_pct": 41.7,
    "sentences_original": 22,
    "sentences_kept": 13,
    "original_benford_mad": 4.1,
    "compressed_benford_mad": 4.3,
    "benford_ok": true,
    "preserved_blocks": 0
  }
}
```

---

## Compression Ratios

| Ratio | Mode | Best For |
|-------|------|----------|
| `0.8` | Conservative | Sensitive reasoning traces |
| `0.6` | Default | Most agent tool results |
| `0.4` | Aggressive | Bulk search results, summaries |
| `0.3` | Maximum | Context window critical |

---

## What is Always Preserved

Code blocks, inline code, JSON objects/arrays, URLs, file paths, XML/HTML tags. Extracted before compression, reinserted after — never touched by the scorer.

---

## Installation

### Claude Desktop

```json
{
  "mcpServers": {
    "pith": {
      "command": "uvx",
      "args": ["mcp-server-pith"]
    }
  }
}
```

On Windows:
```json
{
  "mcpServers": {
    "pith": {
      "command": "cmd",
      "args": ["/c", "uvx", "mcp-server-pith"]
    }
  }
}
```

### Direct

```bash
uvx mcp-server-pith          # recommended — no install
pip install mcp-server-pith
python -m mcp_server_pith
```

---

## How it Works

1. **Extract** — code, JSON, URLs, paths quarantined before processing
2. **Score** — each sentence scored by Zipf density (word length ≥ 7 chars as rarity proxy)
3. **Filter** — top N% sentences by density selected (default: 60%)
4. **Benford Gate** — if compression increases MAD vs Benford's Law by > 2×, relax ratio and retry (max 3 attempts)
5. **Reassemble** — original sentence order restored, preserved blocks reinserted

Full algorithm documentation, theory (Nash equilibrium, Zipf's Law, Benford's Law), comparison matrix, and benchmarks are in the [standalone repository](https://github.com/VjAlbert/pith-skill).

---

## Windows Encoding

At startup, both `sys.stdout` and `sys.stdin` are reconfigured to UTF-8 with `hasattr`-guarded calls, preventing `UnicodeEncodeError` on Windows CP1252 terminals. The guards ensure the calls are no-ops on non-standard streams (e.g., `StringIO` in test suites).

---

## Development

```bash
cd src/pith
uv sync --locked --all-extras --dev
uv run pytest            # run eval suite
uv run --frozen pyright  # type check
uv build                 # package
```

---

## License

MIT
