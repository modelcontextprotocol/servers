# @modelcontextprotocol/server-sequential-thinking

## 1.0.0

The first semantic version, resuming semver after the date-stamped releases (last `2026.8.31`). It describes everything since `2026.8.31`, and is the last release of the legacy-era server, on the 1.x MCP SDK.

### Patch Changes

- [#5015](https://github.com/modelcontextprotocol/servers/pull/5015) [`8a4139c`](https://github.com/modelcontextprotocol/servers/commit/8a4139c3d71b66e95d2f7cd2bc485d4781ecf1d7) [@cliffhall](https://github.com/cliffhall) - Advertise the `sequentialthinking` tool as `readOnlyHint: false` and `idempotentHint: false`. Every call appends to the server's thought history, and a call with both `branchFromThought` and `branchId` also appends to that branch, so the tool was never read-only or idempotent. `destructiveHint` and `openWorldHint` stay `false`. ([#4721](https://github.com/modelcontextprotocol/servers/issues/4721))

- [#4970](https://github.com/modelcontextprotocol/servers/pull/4970) [`86806cc`](https://github.com/modelcontextprotocol/servers/commit/86806cc3870a112f56870e86cd36bae8239edb02) [@cliffhall](https://github.com/cliffhall) - Build the server with an exported `createServer()` factory and attach stdio only when `index.js` runs as the binary, so the server can be tested in-process. No change to the tool, its schemas or its results.

- [#5031](https://github.com/modelcontextprotocol/servers/pull/5031) [`bc52d0e`](https://github.com/modelcontextprotocol/servers/commit/bc52d0e07a1d9dca505746165b30f4c99f8cc79b) [@cliffhall](https://github.com/cliffhall) - The thought log on stderr no longer prints "undefined" in its headers: a revision with no `revisesThought` reads "Revision N/M", and a branch with no `branchId` reads "(from thought N)" with no ID. The box border is sized from the header's visible text, so colour escape codes no longer make it wider than its text.

- [#5053](https://github.com/modelcontextprotocol/servers/pull/5053) [`c63255a`](https://github.com/modelcontextprotocol/servers/commit/c63255ae9616b110d6089fa343fcfdf3f5def534) [@cliffhall](https://github.com/cliffhall) - Stop shipping the compiled test helper `dist/__tests__/helpers.js` in the published package: the build now excludes everything under `__tests__/`, not just `*.test.ts`.

- [#5036](https://github.com/modelcontextprotocol/servers/pull/5036) [`b5c5ccc`](https://github.com/modelcontextprotocol/servers/commit/b5c5cccb79a5d43b41247065fb9efd174363e799) [@cliffhall](https://github.com/cliffhall) - A `branchId` that names an `Object.prototype` key, such as `"constructor"` or `"__proto__"`, now creates and lists its branch like any other id instead of failing the call. A call that fails no longer adds its thought to the history first, so `thoughtHistoryLength` counts only thoughts that were accepted.

- [#5087](https://github.com/modelcontextprotocol/servers/pull/5087) [`09edf63`](https://github.com/modelcontextprotocol/servers/commit/09edf633b93cdaf094ba43622294d587afcd1023) [@cliffhall](https://github.com/cliffhall) - Require `@modelcontextprotocol/sdk` 1.31.0 or later (was `^1.30.0`), so an install can no longer resolve an SDK version affected by GHSA-6qxp-vccf-f47h. The advisory concerns the SDK's OAuth client, which this server does not use.
