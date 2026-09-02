## Change Log

### 2026-03-11
- **chore**: Bump server version to 1.0.6
  - Updated version to 1.0.6 across package.json, server.json, and server.ts
  - Migrated to `McpServer` API from deprecated `Server` class
  - Implemented `ResourceTemplate` for dynamic resource discovery


### 2026-03-07
- **chore**: Bump server version to 1.0.5
  - Updated version to 1.0.5 across package.json, server.json, and server.ts
  - Refactored error handling in `resources.ts` to throw `McpError` when connection is not established.


### 2026-01-22
- **chore**: Bump server version to 1.0.4
  - Updated version to 1.0.4 across package.json, server.json, and server.ts
  - Refactored prompt names to be more descriptive for better CLI visibility
- **feat**: Implemented `listResourcesHandler` and `readResourceHandler` for MikroTik interfaces as `mikrotik://interface/{name}`.
- **feat**: Added bridge and bridge port resources as `mikrotik://bridge/{name}` and `mikrotik://bridge/{name}/{port}`.
- **feat**: Added IP route resources as `mikrotik://route/{id}`.
- **refactor**: Structured tool handlers and resources into separate modules for better readability and maintenance.

### 2026-01-16
- **feat**: Added `mk-awr` tool for automated performance and security reports including log auditing.
- **refactor**: Renamed `mk-print` tool to `mk-get` for better alignment with other MCP segments.
- **docs**: Added `Demos.md` with usage examples for Claude Desktop, Gemini CLI, and Antigravity.
- **chore**: Updated version to 1.0.2 and synchronized `server.json` and `package.json`.

### 2026-01-08
- **feat**: Improved login handling to correctly detect `!trap` responses
- **docs**: Updated documentation with Docker examples and License information

### 2026-01-07
- **feat**: Initial MikroTik MCP server implementation
  - Added support for connecting to MikroTik routers via RouterOS API
  - Implemented `mk-connect`, `mk-report`, and `mk-print` tools
  - Added support for optional host/secure startup arguments
  - Integrated with `MK_USER` and `MK_PASSWORD` environment variables
  - Implemented basic and secure (TLS) connection modes