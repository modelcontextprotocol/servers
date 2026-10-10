# @modelcontextprotocol/server-sequential-thinking

## 2.0.0

### Major Changes

- [#5063](https://github.com/modelcontextprotocol/servers/pull/5063) [`b5af226`](https://github.com/modelcontextprotocol/servers/commit/b5af22668592700c02236d737f9836c42654edb6) Thanks [@cliffhall](https://github.com/cliffhall)! - Move to the TypeScript SDK v2 packages (`@modelcontextprotocol/server`) from `@modelcontextprotocol/sdk` 1.x ([#4856](https://github.com/modelcontextprotocol/servers/issues/4856)). Breaking for clients: the server now requires Node.js 20 or later; over stdio, a single incoming JSON-RPC message larger than 10 MiB now closes the connection (the SDK v2 default read-buffer cap; SDK 1.x buffered without a limit); an unknown tool name is rejected with JSON-RPC error `-32602` instead of returning an `isError` result; error messages no longer carry the `MCP error <code>: ` prefix, and input-validation messages name the field first (`field: message`); tool schemas in `tools/list` declare JSON Schema 2020-12 instead of draft-07; and tools no longer advertise `execution.taskSupport`.

### Patch Changes

- [#5015](https://github.com/modelcontextprotocol/servers/pull/5015) [`8a4139c`](https://github.com/modelcontextprotocol/servers/commit/8a4139c3d71b66e95d2f7cd2bc485d4781ecf1d7) Thanks [@cliffhall](https://github.com/cliffhall)! - Advertise the `sequentialthinking` tool as `readOnlyHint: false` and `idempotentHint: false`. Every call appends to the server's thought history, and a call with both `branchFromThought` and `branchId` also appends to that branch, so the tool was never read-only or idempotent. `destructiveHint` and `openWorldHint` stay `false`. ([#4721](https://github.com/modelcontextprotocol/servers/issues/4721))

- [#4970](https://github.com/modelcontextprotocol/servers/pull/4970) [`86806cc`](https://github.com/modelcontextprotocol/servers/commit/86806cc3870a112f56870e86cd36bae8239edb02) Thanks [@cliffhall](https://github.com/cliffhall)! - Build the server with an exported `createServer()` factory and attach stdio only when `index.js` runs as the binary, so the server can be tested in-process. No change to the tool, its schemas or its results.

- [#5031](https://github.com/modelcontextprotocol/servers/pull/5031) [`bc52d0e`](https://github.com/modelcontextprotocol/servers/commit/bc52d0e07a1d9dca505746165b30f4c99f8cc79b) Thanks [@cliffhall](https://github.com/cliffhall)! - The thought log on stderr no longer prints "undefined" in its headers: a revision with no `revisesThought` reads "Revision N/M", and a branch with no `branchId` reads "(from thought N)" with no ID. The box border is sized from the header's visible text, so colour escape codes no longer make it wider than its text.

- [#5053](https://github.com/modelcontextprotocol/servers/pull/5053) [`c63255a`](https://github.com/modelcontextprotocol/servers/commit/c63255ae9616b110d6089fa343fcfdf3f5def534) Thanks [@cliffhall](https://github.com/cliffhall)! - Stop shipping the compiled test helper `dist/__tests__/helpers.js` in the published package: the build now excludes everything under `__tests__/`, not just `*.test.ts`.

- [#5036](https://github.com/modelcontextprotocol/servers/pull/5036) [`b5c5ccc`](https://github.com/modelcontextprotocol/servers/commit/b5c5cccb79a5d43b41247065fb9efd174363e799) Thanks [@cliffhall](https://github.com/cliffhall)! - A `branchId` that names an `Object.prototype` key, such as `"constructor"` or `"__proto__"`, now creates and lists its branch like any other id instead of failing the call. A call that fails no longer adds its thought to the history first, so `thoughtHistoryLength` counts only thoughts that were accepted.
