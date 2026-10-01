# @modelcontextprotocol/server-memory

## 1.0.1

### Patch Changes

- [#4937](https://github.com/modelcontextprotocol/servers/pull/4937) [`478db6a`](https://github.com/modelcontextprotocol/servers/commit/478db6a5d5bc0bec3196e2c8c9461ec1597ded34) Thanks [@cliffhall](https://github.com/cliffhall)! - Internal: `ensureMemoryFilePath` accepts the directory its default files live in, so the server's tests no longer write into the package directory. No change to how the server chooses or migrates its memory file.
