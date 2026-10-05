---
"@modelcontextprotocol/server-sequential-thinking": patch
---

A `branchId` that names an `Object.prototype` key, such as `"constructor"` or `"__proto__"`, now creates and lists its branch like any other id instead of failing the call. A call that fails no longer adds its thought to the history first, so `thoughtHistoryLength` counts only thoughts that were accepted.
