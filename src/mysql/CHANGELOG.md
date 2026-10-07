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
  - Modified `runServer` to allow server startup without a database URL
  - Added warning message when starting without a connection string
  - Updated error messages to guide users to use the `mysql-connect` tool
  - Updated README with documentation for optional connection string and `mysql-connect` tool usage

### 2025-12-12
- **chore**: Bump server version to 1.0.3
  - Updated version to 1.0.3 across package.json, server.json, and server.ts
  - Added link to Demos.md in README for comprehensive usage examples
  - Published package @marcelo-ochoa/server-mysql@1.0.3 to npm registry
  - Rebuilt Docker image mochoa/mcp-mysql with updated functionality

- **chore**: Bump server version to 1.0.2
  - Updated version to 1.0.2 across package.json, server.json, and server.ts
  - Updated LICENSE link in README to point to GitHub repository
  - Published package @marcelo-ochoa/server-mysql@1.0.2 to npm registry

- **docs**: Add comprehensive demo documentation and HR sample schema
  - Added Demos.md with usage examples for:
    - Claude Desktop (Docker and NPX configurations)
    - Docker AI integration
    - Gemini CLI usage
    - Antigravity Code Editor setup
  - Added HR schema and data SQL scripts for MySQL/MariaDB:
    - `hr_schema_mysql.sql` - Complete HR schema with tables (regions, countries, locations, departments, jobs, employees, job_history)
    - `hr_data_mysql.sql` - Sample data for HR schema
    - Comprehensive table documentation with comments
    - Foreign key constraints and indexes for performance
  - Enhanced README with better documentation organization

### 2025-12-03
- **feat**: Add prompts capability and list handler to MySQL server
  - Updated version to 1.0.1
  - Added `prompts: {}` capability to server configuration
  - Implemented `PromptsListRequestSchema` using zod for request validation
  - Added prompts array with 5 MySQL-specific prompt templates:
    - `mysql-query` - Example query execution
    - `mysql-explain` - Query execution plan analysis
    - `mysql-stats` - Table statistics retrieval
    - `mysql-connect` - Database connection instructions
    - `mysql-awr` - Performance report generation
  - Added request handler for `prompts/list` endpoint
  - Published package @marcelo-ochoa/server-mysql@1.0.1 to npm registry

### 2025-12-01
- **feat**: Bump server version to 1.0.0
  - Updated version to 1.0.0 across package.json, server.json, and server.ts
  - Added AWR_example.md with performance report examples for GLPI database
  - Added CHANGELOG.md for better change tracking
  - Enhanced mysql-awr tool with improved reporting capabilities
  - Updated README with MySQL AWR in action section

### 2025-11-27
- **chore**: Bump patch version in server.json
  - Minor version update for server configuration

- **feat**: Add `ListResourceTemplates` handler to MySQL server and enhance connection string parsing
  - Enhanced server capabilities with resource template listing
  - Improved connection string parsing in db.ts to support connection options
  - Updated package dependencies

- **docs**: Update README to document recent server.json definitions, version bumps, URL simplification, and graceful shutdown
  - Comprehensive documentation updates

- **feat**: Add server.json definitions and update versions for MySQL server
  - Added server.json with MCP server metadata and schema
  - Updated version to 0.1.2
  - Added mcpName field to package.json
  - Configured environment variables (MYSQL_USER, MYSQL_PASSWORD) in server definition

### 2025-11-26
- **docs**: Update README to include recent server version bumps, URL simplification, and graceful shutdown
  - Updated documentation with latest changes and improvements

- **chore**: Bump MySQL server version to 0.1.1
  - Updated package versions to reflect recent improvements
  - Synchronized package-lock.json with new versions

- **feat**: Simplify database resource URLs and add graceful server shutdown on stdin close
  - Simplified resource URL format from `mysql://database/table/schema` to cleaner format
  - Added graceful shutdown handling for improved stability
  - Enhanced db.ts with better connection management

### Recent Updates

- **2026-01-07** (762080d)
  - Impl optional argument on run and environtment variable setup for initial connect

- **2025-12-14** (d740363)
  - update CHANGELOG.md files

- **2025-12-12** (ba86d83)
  - unifi release version and link to demos on MySQL/PostgreSQL
  - Added server.json with MCP server metadata and schema
  - Updated version to 0.1.2
  - Added mcpName field to package.json
  - Configured environment variables (MYSQL_USER, MYSQL_PASSWORD) in server definition

- **2025-11-26** (6dade3b)
  - docs: Update READMEs to include recent server version bumps, URL simplification, and graceful shutdown

- **2025-11-26** (ca32105)
  - chore: Bump MySQL and PostgreSQL server versions to 0.1.1 and 0.6.4

- **2025-11-26** (d065d11)
  - feat: Simplify database resource URLs and add graceful server shutdown on stdin close

- **2025-11-25** (ca2c3fb)
  - feat: Add new MySQL service with AWR, query, explain, and stats tools, along with updated CI/CD workflow and dependencies
