# @modelcontextprotocol/server-sequential-thinking

## 2.0.0

### Major Changes

- [#5118](https://github.com/modelcontextprotocol/servers/pull/5118) [`5b400a6`](https://github.com/modelcontextprotocol/servers/commit/5b400a6ec05bd883522665ebeae110bf1a2744ff) [@cliffhall](https://github.com/cliffhall) - Move to the TypeScript SDK v2 packages (`@modelcontextprotocol/server`) from `@modelcontextprotocol/sdk` 1.x ([#4856](https://github.com/modelcontextprotocol/servers/issues/4856)). Breaking for clients: the server now requires Node.js 24 or later; over stdio, a single incoming JSON-RPC message larger than 10 MiB now closes the connection (the SDK v2 default read-buffer cap; SDK 1.x buffered without a limit); an unknown tool name is rejected with JSON-RPC error `-32602` instead of returning an `isError` result; error messages no longer carry the `MCP error <code>: ` prefix, and input-validation messages name the field first (`field: message`); tool schemas in `tools/list` declare JSON Schema 2020-12 instead of draft-07; and tools no longer advertise `execution.taskSupport`.

### Minor Changes

- [#5131](https://github.com/modelcontextprotocol/servers/pull/5131) [`419200b`](https://github.com/modelcontextprotocol/servers/commit/419200b8a4d1e66c294575930ac7be29d4b37330) [@cliffhall](https://github.com/cliffhall) - Serve the 2026-07-28 protocol revision alongside the 2025 era on stdio, through the SDK's `serveStdio` entry ([#4852](https://github.com/modelcontextprotocol/servers/issues/4852)). The thought history lasts as long as the client's connection, on either era.

### Patch Changes

- [#5144](https://github.com/modelcontextprotocol/servers/pull/5144) [`d6fd666`](https://github.com/modelcontextprotocol/servers/commit/d6fd666467c4615828067f3bc2ab4e6d08c3e4a3) [@cliffhall](https://github.com/cliffhall) - Pad the header row of the thought box logged to stderr to the border's width, so its right edge lines up with the rest of the box ([#5108](https://github.com/modelcontextprotocol/servers/issues/5108)).

## 1.0.0

The first semantic version, resuming semver after the date-stamped releases (last `2026.8.31`). It describes everything since `2026.8.31`, and is the last release of the legacy-era server, on the 1.x MCP SDK.

### Patch Changes

- [#5015](https://github.com/modelcontextprotocol/servers/pull/5015) [`8a4139c`](https://github.com/modelcontextprotocol/servers/commit/8a4139c3d71b66e95d2f7cd2bc485d4781ecf1d7) [@cliffhall](https://github.com/cliffhall) - Advertise the `sequentialthinking` tool as `readOnlyHint: false` and `idempotentHint: false`. Every call appends to the server's thought history, and a call with both `branchFromThought` and `branchId` also appends to that branch, so the tool was never read-only or idempotent. `destructiveHint` and `openWorldHint` stay `false`. ([#4721](https://github.com/modelcontextprotocol/servers/issues/4721))

- [#4970](https://github.com/modelcontextprotocol/servers/pull/4970) [`86806cc`](https://github.com/modelcontextprotocol/servers/commit/86806cc3870a112f56870e86cd36bae8239edb02) [@cliffhall](https://github.com/cliffhall) - Build the server with an exported `createServer()` factory and attach stdio only when `index.js` runs as the binary, so the server can be tested in-process. No change to the tool, its schemas or its results.

- [#5031](https://github.com/modelcontextprotocol/servers/pull/5031) [`bc52d0e`](https://github.com/modelcontextprotocol/servers/commit/bc52d0e07a1d9dca505746165b30f4c99f8cc79b) [@cliffhall](https://github.com/cliffhall) - The thought log on stderr no longer prints "undefined" in its headers: a revision with no `revisesThought` reads "Revision N/M", and a branch with no `branchId` reads "(from thought N)" with no ID. The box border is sized from the header's visible text, so colour escape codes no longer make it wider than its text.

- [#5053](https://github.com/modelcontextprotocol/servers/pull/5053) [`c63255a`](https://github.com/modelcontextprotocol/servers/commit/c63255ae9616b110d6089fa343fcfdf3f5def534) [@cliffhall](https://github.com/cliffhall) - Stop shipping the compiled test helper `dist/__tests__/helpers.js` in the published package: the build now excludes everything under `__tests__/`, not just `*.test.ts`.

- [#5036](https://github.com/modelcontextprotocol/servers/pull/5036) [`b5c5ccc`](https://github.com/modelcontextprotocol/servers/commit/b5c5cccb79a5d43b41247065fb9efd174363e799) [@cliffhall](https://github.com/cliffhall) - A `branchId` that names an `Object.prototype` key, such as `"constructor"` or `"__proto__"`, now creates and lists its branch like any other id instead of failing the call. A call that fails no longer adds its thought to the history first, so `thoughtHistoryLength` counts only thoughts that were accepted.

- [#5087](https://github.com/modelcontextprotocol/servers/pull/5087) [`09edf63`](https://github.com/modelcontextprotocol/servers/commit/09edf633b93cdaf094ba43622294d587afcd1023) [@cliffhall](https://github.com/cliffhall) - Require `@modelcontextprotocol/sdk` 1.31.0 or later (was `^1.30.0`), so an install can no longer resolve an SDK version affected by GHSA-6qxp-vccf-f47h. The advisory concerns the SDK's OAuth client, which this server does not use.
