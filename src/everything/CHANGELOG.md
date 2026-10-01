# @modelcontextprotocol/server-everything

## 1.0.1

### Patch Changes

- [#4936](https://github.com/modelcontextprotocol/servers/pull/4936) [`feb251d`](https://github.com/modelcontextprotocol/servers/commit/feb251d2fd0057570125ba0ba25e98c84f8c5b5c) Thanks [@cliffhall](https://github.com/cliffhall)! - The HTTP+SSE transport no longer prints "Server is running" and stays up when its port is already in use: it reports the port and exits non-zero, as Streamable HTTP does. Streamable HTTP no longer prints its listening line before that error.
