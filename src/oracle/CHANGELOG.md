## Change Log

### 2026-03-11
- **chore**: Bump server version to 1.0.7
  - Updated version to 1.0.7 across package.json, server.json, and server.ts
  - Migrated to `McpServer` API from deprecated `Server` class
  - Refactored resources into separate `resources.ts` for better modularity

### 2026-03-07
- **chore**: Bump server version to 1.0.6
  - Updated version to 1.0.6 across package.json, server.json, and server.ts
  - Refactored resources into separate `resources.ts` for better modularity.

 
### 2026-01-22
- **chore**: Bump server version to 1.0.5
  - Updated version to 1.0.5 across package.json, server.json, and server.ts
  - Refactored prompt names to be more descriptive for better CLI visibility

- **chore**: Bump server version to 1.0.4
  - Updated version to 1.0.4 across package.json, server.json, and server.ts

### 2026-01-07
- **feat**: Make initial connection string optional at startup
  - Modified `runServer` to allow server startup without a connection string
  - Added warning message when starting without a connection string
  - Updated error messages to guide users to use the `orcl-connect` tool
  - Updated README with documentation for optional connection string and `orcl-connect` tool usage

### 2025-12-12
- **chore**: Bump server version to 1.0.3
  - Updated version to 1.0.3 across package.json, server.json, and server.ts
  - Published package @marcelo-ochoa/server-oracle@1.0.3 to npm registry
  - Rebuilt Docker image mochoa/mcp-oracle with updated dependencies
  - Updated LICENSE link in README to point to GitHub repository

- **docs**: Add MIT License file
  - Added LICENSE file with MIT License text
  - Updated README with proper license link

### 2025-12-03
- **feat**: Upgrade MCP SDK and bump server version to 1.0.2
  - Updated version to 1.0.2 across package.json, server.json, and server.ts
  - Upgraded @modelcontextprotocol/sdk from ^1.19.1 to ^1.24.2
  - Maintained existing prompts/list functionality with 5 Oracle-specific prompt templates:
    - `orcl-query` - Example query execution
    - `orcl-explain` - Query execution plan analysis
    - `orcl-stats` - Table/object statistics retrieval
    - `orcl-connect` - Database connection instructions
    - `orcl-awr` - AWR performance report generation
  - Published package @marcelo-ochoa/server-oracle@1.0.2 to npm registry
  - Rebuilt Docker image mochoa/mcp-oracle with updated dependencies

### 2025-12-02
- **feat**: Add multi-architecture Oracle thick mode support and enhance stats tool to handle schema-prefixed table names
  - Updated version to 1.0.1
  - Added support for ARM64 and AMD64 architectures in Oracle thick mode
  - Enhanced `orcl-stats` tool to accept schema-prefixed table names (e.g., `HR.COUNTRIES`)
  - Modified stats handler to dynamically parse schema from table name
  - Updated all database views from `dba_*` to `all_*` for broader compatibility
  - Fixed LOB handling in resource handler for `dbms_developer.get_metadata` 
  - Added `json_serialize` to properly convert JSON metadata to text

- **refactor**: Move Oracle server usage examples from README to Demos.md
  - Extracted "Usage with Claude Desktop" section into separate Demos.md file
  - Improved documentation organization and modularity
  - Updated README with link to Demos.md

### 2025-12-01
- **feat**: Bump server version to 1.0.0
  - Updated version to 1.0.0 across package.json, server.json, and server.ts
  - Added AWR_example.md with comprehensive AWR report analysis
  - Added CHANGELOG.md for better change tracking
  - Renamed tools to use `orcl-` prefix for consistency (orcl-query, orcl-explain, orcl-stats, orcl-connect, orcl-awr)
  - Updated handlers and server prompts to reflect new tool names
  - Enhanced README with Oracle AWR in action section

### 2025-11-27
- **chore**: Bump patch version in server.json
  - Minor version update for server configuration

- **feat**: Add `ListResourceTemplates` handler to Oracle server
  - Enhanced server capabilities with resource template listing
  - Updated package dependencies

- **feat**: Add `server.json` to define Oracle MCP server, environment variables, and update related configurations
  - Added server.json with MCP server metadata and schema
  - Updated version to 0.7.5
  - Added mcpName field to package.json
  - Configured environment variables (ORACLE_USER, ORACLE_PASSWORD) in server definition
  - Updated .gitignore for better file management

### 2025-11-27
- **feat**: Add `server.json` to define Oracle MCP server, environment variables, and update related configurations
  - Added server.json with MCP server metadata and schema
  - Updated version to 0.7.5
  - Added mcpName field to package.json
  - Configured environment variables (ORACLE_USER, ORACLE_PASSWORD) in server definition

### 2025-11-25
- **docs**: Add change logs to Oracle and Postgres READMEs
  - Detailed new features such as secure Postgres authentication
  - Documented Toon format encoding integration
  - Added Antigravity Code Editor integration instructions

### 2025-11-20
- **feat**: Add Docker image build for postgres service and remove oracle test script
- **feat**: Add initial Postgres server implementation, integrate ModelContextProtocol SDK, and update Oracle tools
  - Enhanced Oracle tools integration with new MCP SDK features

### 2025-11-19
- **feat**: Encode query and explain plan results using Toon format and add MIME type to stats output
  - Improved data serialization using `toon-format` library for better JSON handling
  - Added MIME type support for stats output
- **docs**: Add instruction for `mcp_config.json` placement in README
  - Clarified configuration file location for Antigravity Code Editor
- **feat**: Add Antigravity Code Editor section to README with image and configuration example
  - Added comprehensive setup instructions for Antigravity integration

### 2025-11-05
- **docs**: Set Oracle MCP server link

### 2025-11-04
- **docs**: Added article about AI pair programming

### 2025-10-30
- **feat**: Added keywords and Gemini Code Assist setting
- **fix**: Fix dependencies
- **docs**: Update README with Gemini CLI prompts demo
- **release**: New release with better tools information

### 2025-07-02
- **chore**: Update version to 0.7.0 and enhance AWR documentation in Oracle server

### 2025-07-01
- **chore**: Update version to 0.6.4 and add AWR functionality in Oracle server
  - Implemented Automatic Workload Repository (AWR) report generation

### 2025-06-17
- **feat**: Update Oracle server package name and instructions for clarity

### 2025-06-13
- **fix**: Correct README and Dockerfile for consistency and clarity

### 2025-06-09
- **feat**: Update Oracle README and configuration for improved clarity and functionality

### 2025-03-20
- **docs**: Correct typo in README and update Docker configuration for local usage

### 2025-03-19
- **docs**: Update README to include stats retrieval and improved execution plan visualization
- **docs**: Update README to include stats functionality and sample Docker configuration
- **feat**: Add stats endpoint for SQL object and update README with Docker AI usage
  - Implemented comprehensive table statistics retrieval

### 2025-03-14
- **docs**: Update README with explain functionality and demo prompts for Oracle MCP server

### 2025-03-13
- **refactor**: Remove inactivity timer and enhance server shutdown handling
- **feat**: Add Oracle MCP server with Docker support and configuration
  - Initial release of Oracle MCP server
