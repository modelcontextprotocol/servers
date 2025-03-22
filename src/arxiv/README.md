# mcp-arxiv

A Model Context Protocol server that provides arXiv paper search and retrieval capabilities. This server enables LLMs to search for academic papers on arXiv and get cleaned titles, abstracts, and content without dealing with complex HTML parsing.

### Available Tools

- `search` - Search arXiv for papers matching a query.

  - Required arguments:
    - `query` (string): Search query for arXiv papers (e.g., 'LLM', 'transformer architecture')

- `get` - Get the content of a specific arXiv paper.
  - Required arguments:
    - `url` (string): URL of the arXiv paper to retrieve

## Installation

### Using venv

```bash
cd mcp-arxiv
sourve .venv/bin/activate
pip install -r requirements.txt
```

### Using uv

```bash
cd mcp-arxiv
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

## Configuration

### Configure for Claude.app

Add to your Claude settings:

<details>
<summary>Using uv</summary>

```json
"mcpServers": {
  "arxiv": {
    "command": "uv",
    "args": [
        "--directory",
        "ABSOLUTE_PROJECT_PATH",
        "run",
        "arxiv-server.py"
      ]
  }
}
```

</details>
