---
"@modelcontextprotocol/server-everything": patch
---

`get-resource-links`: rename the misleading `isOdd` flag to `isText`, and say in its JSDoc and in `docs/features.md` that even IDs are Text resources and odd IDs are Blob resources. The JSDoc headers of `get-resource-links` and `trigger-long-running-operation` now name the tool their file registers. No behavior change.
