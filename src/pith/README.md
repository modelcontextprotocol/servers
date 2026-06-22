# PITH MCP Server

An MCP server that compresses inter-agent payloads to eliminate token waste in multi-agent pipelines. Uses Zipf word-density scoring validated by Benford's Law structural integrity check. Zero external dependencies beyond the MCP SDK.

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

## Tools

### `compress`

Compress a verbose payload. Returns compressed text with a metadata header.

**Input:**
- `payload` (string, required): Text to compress
- `ratio` (number, optional, default: `0.6`): Fraction of sentences to keep (0.1–1.0)

**Output example:**
```
[PITH | ✓ | -42% tokens | benford:4.3% | compressed]
<compressed text here>
```

### `compress_with_metadata`

Same as `compress` but returns a JSON object with full metadata including token counts and Benford MAD values. Useful for programmatic pipelines.

**Output example:**
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

## Compression Ratios

| Ratio | Mode | Best For |
|-------|------|----------|
| `0.8` | Conservative | Sensitive reasoning traces |
| `0.6` | Default | Most agent tool results |
| `0.4` | Aggressive | Bulk search results, summaries |
| `0.3` | Maximum | Context window critical |

## What is Always Preserved

Code blocks, inline code, JSON objects/arrays, URLs, file paths, XML/HTML tags, numbers. These are extracted before compression and reinserted after — never touched.

## How it Works

1. **Extract** — code, JSON, URLs, paths quarantined before processing
2. **Score** — each sentence scored by Zipf density (word length >= 7 chars as rarity proxy)
3. **Filter** — top N% sentences by density selected (default: 60%)
4. **Benford Gate** — if compression increases MAD vs Benford's Law by >2×, relax ratio and retry (max 3 attempts)
5. **Reassemble** — original sentence order restored, preserved blocks reinserted

Benford's Law is used as a structural integrity signal: natural text has sentence-length distributions approximating the logarithmic Benford distribution. Over-compressed text deviates. The gate prevents producing text more artificial than the input.

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
# With uvx (recommended)
uvx mcp-server-pith

# With pip
pip install mcp-server-pith
python -m mcp_server_pith
```

## Windows Encoding

`sys.stdout.reconfigure(encoding="utf-8", errors="replace")` is applied at startup, preventing `UnicodeEncodeError: 'charmap' codec can't encode character` errors common in Windows CP1252 terminals when handling Unicode characters in LLM outputs.

## Testing

```bash
cd src/pith
python tests/run_evals.py
```

All 7 eval cases cover: core compression, code preservation, passthrough (short payloads), JSON preservation, aggressive compression, URL preservation, and Benford metadata output.

## License

MIT
