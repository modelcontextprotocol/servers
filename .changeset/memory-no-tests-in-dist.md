---
"@modelcontextprotocol/server-memory": patch
---

Stop shipping the compiled test helper `dist/__tests__/helpers.js` in the published package: the build now excludes everything under `__tests__/`, not just `*.test.ts`.
