---
"@modelcontextprotocol/server-filesystem": patch
---

Move `minimatch` to `^11.0.4`. Every 10.x release is affected by GHSA-g3hv-75wg-m249 (denial of service through glob-part amplification), and the `search_files` patterns and the `excludePatterns` of `search_files` and `directory_tree` reach it from the client. The fix is outside the old `^10.0.1` range, so neither a fresh install nor `npm update` could pick it up.
