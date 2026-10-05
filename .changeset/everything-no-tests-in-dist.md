---
"@modelcontextprotocol/server-everything": patch
---

Stop shipping the compiled test suite and Vitest config in the published package: the build now excludes `__tests__/`, `*.test.ts`, `*.spec.ts` and `vitest.config.ts`, as the other TypeScript servers' builds do.
