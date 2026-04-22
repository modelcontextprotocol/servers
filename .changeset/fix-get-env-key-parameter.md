---
"@modelcontextprotocol/server-everything": patch
---

Fix security issue in get-env tool: require a specific key parameter instead of returning the entire process.env object unfiltered. The tool now accepts a required `key` argument and returns only the value of that specific environment variable, preventing accidental exposure of sensitive data such as API keys, tokens, and credentials.
