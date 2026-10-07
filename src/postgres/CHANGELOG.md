## Change Log

### 2026-03-11
- **chore**: Bump server version to 1.0.8
  - Updated version to 1.0.8 across package.json, server.json, and server.ts
  - Migrated to `McpServer` API from deprecated `Server` class
  - Refactored resources into separate `resources.ts` for better modularity

### 2026-03-07
- **chore**: Bump server version to 1.0.7
  - Updated version to 1.0.7 across package.json, server.json, and server.ts
  - Refactored resources into separate `resources.ts` for better modularity.


### 2026-02-10
- **feat**: Add SSL/Encryption support to PostgreSQL connections
  - Modified `initializePool` in `db.ts` to support `sslmode` in connection strings
  - Added support for `PG_SSL=true` environment variable to enforce encryption
  - Updated `pg.Pool` configuration to allow self-signed certificates (`rejectUnauthorized: false`) for cloud compatibility
  - Updated `pg-connect` tool description and `README.md` with encryption setup instructions
- **chore**: Bump server version to 1.0.6
  - Updated version to 1.0.6 across package.json, server.json, and server.ts
 
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
  - Updated error messages to guide users to use the `pg-connect` tool
  - Updated README with documentation for optional connection string and `pg-connect` tool usage

### 2025-12-12
- **chore**: Bump server version to 1.0.3
  - Updated version to 1.0.3 across package.json, server.json, and server.ts
  - Added link to Demos.md in README for comprehensive usage examples
  - Published package @marcelo-ochoa/server-postgres@1.0.3 to npm registry
  - Rebuilt Docker image mochoa/mcp-postgres with updated functionality

- **chore**: Bump server version to 1.0.2
  - Updated version to 1.0.2 across package.json, server.json, and server.ts
  - Updated LICENSE link in README to point to GitHub repository
  - Published package @marcelo-ochoa/server-postgres@1.0.2 to npm registry

- **feat**: Enhanced pg-stats tool to support schema-prefixed table names
  - Modified `pg-stats` handler to accept `schema.table_name` syntax (e.g., `hr.employees`)
  - Added automatic schema parsing from table name
  - Defaults to 'public' schema if no schema prefix is provided
  - Updated all statistics queries to use dynamic schema parameter
  - Improved column statistics, index statistics, and table statistics retrieval

- **docs**: Add comprehensive demo documentation and HR sample schema
  - Added Demos.md with usage examples for:
    - Claude Desktop (Docker and NPX configurations)
    - Docker AI integration
    - Gemini CLI usage
    - Antigravity Code Editor setup
  - Added HR schema and data SQL scripts for PostgreSQL:
    - `hr_schema_postgres.sql` - Complete HR schema with tables (regions, countries, locations, departments, jobs, employees, job_history)
    - `hr_data_postgres.sql` - Sample data for HR schema
    - Schema-aware implementation using `hr` schema namespace
    - Foreign key constraints and indexes for performance
    - Comprehensive table documentation with comments
  - Enhanced README with better documentation organization
  - Added resource templates showing schema-aware table access patterns

### 2025-12-03
- **feat**: Add prompts capability and list handler to PostgreSQL server
  - Updated version to 1.0.1
  - Added `prompts: {}` capability to server configuration
  - Imported zod library for schema validation
  - Implemented `PromptsListRequestSchema` using zod for request validation
  - Added prompts array with 5 PostgreSQL-specific prompt templates:
    - `pg-query` - Example query execution
    - `pg-explain` - Query execution plan analysis
    - `pg-stats` - Table statistics retrieval
    - `pg-connect` - Database connection instructions
    - `pg-awr` - Performance report generation (requires pg_stat_statements extension)
  - Added request handler for `prompts/list` endpoint
  - Published package @marcelo-ochoa/server-postgres@1.0.1 to npm registry
  - Rebuilt Docker image mochoa/mcp-postgres with updated functionality

### 2025-12-01
- **feat**: Bump server version to 1.0.0
  - Updated version to 1.0.0 across package.json, server.json, and server.ts
  - Added AWR_example.md with comprehensive performance analysis for production Moodle database
  - Added CHANGELOG.md for better change tracking
  - Enhanced pg-awr tool with improved reporting capabilities
  - Updated README with PostgreSQL AWR in action section

### 2025-11-27
- **chore**: Bump patch version in server.json
  - Minor version update for server configuration

- **feat**: Add `ListResourceTemplates` handler to PostgreSQL server
  - Enhanced server capabilities with resource template listing
  - Updated package dependencies

- **feat**: Add server.json definitions and update versions for PostgreSQL server
  - Added server.json with MCP server metadata and schema
  - Updated version to 0.6.5
  - Added mcpName field to package.json
  - Configured environment variables (PG_USER, PG_PASSWORD) in server definition

### 2025-11-26
- **docs**: Update README to include recent server version bumps, URL simplification, and graceful shutdown
  - Updated documentation with latest changes and improvements

- **chore**: Bump PostgreSQL server version to 0.6.4
  - Updated package versions to reflect recent improvements
  - Synchronized package-lock.json with new versions

- **feat**: Simplify database resource URLs and add graceful server shutdown on stdin close
  - Simplified resource URL format from `postgres://dbname/table/schema` to cleaner format
  - Added graceful shutdown handling for improved stability
  - Enhanced db.ts with better connection management

### 2025-11-27
- **feat**: Add server.json definitions and update versions for MySQL and PostgreSQL servers
  - Added server.json with MCP server metadata and schema
  - Updated version to 0.6.5
  - Added mcpName field to package.json
  - Configured environment variables (POSTGRES_USER, POSTGRES_PASSWORD) in server definition

### 2025-11-26
- **docs**: Update READMEs to include recent server version bumps, URL simplification, and graceful shutdown
  - Updated documentation with latest changes and improvements

- **chore**: Bump MySQL and PostgreSQL server versions to 0.1.1 and 0.6.4
  - Updated package versions to reflect recent improvements
  - Synchronized package-lock.json with new versions

- **feat**: Simplify database resource URLs and add graceful server shutdown on stdin close
  - Simplified resource URL format for better usability
  - Added graceful shutdown handling for improved stability

### 2025-11-25
- **docs**: Add change logs to Oracle and Postgres READMEs
  - Detailed new features such as secure Postgres authentication
  - Documented Toon format encoding integration
  - Added Antigravity Code Editor integration instructions

### 2025-11-22
- **feat**: Implement secure PostgreSQL authentication via environment variables and update tool descriptions
  - Added `PG_USER` and `PG_PASSWORD` environment variables for secure credential management
  - Updated `pg-connect` tool to accept explicit user/password arguments
  - Enhanced tool descriptions for better clarity and documentation

### 2025-11-20
- **feat**: Add initial Postgres server implementation, integrate ModelContextProtocol SDK, and update Oracle tools
  - Complete refactoring of PostgreSQL MCP server
  - Modularized code structure with separate tool handlers
  - Implemented `pg-stats`, `pg-connect`, `pg-explain`, and `pg-awr` tools
  - Renamed query tool to `pg-query` to avoid naming collisions
  - Added Docker image build support for postgres service
