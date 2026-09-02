---
description: A Model Context Protocol server that provides read-only access to Oracle, MySQL, PostgreSQL, QNAP NAS and MikroTik RouterOS
applyTo: "src/{oracle,mysql,postgres,qnap,mikrotik}/**"
---
# AI Agent Project Instructions: MCP Servers

## Overview
This project is part of a modular AI Agent system, with each module providing a specific capability. The `src/` directory implements various MCP servers, enabling the AI Agent to interact with databases (Oracle, MySQL, PostgreSQL), storage (QNAP NAS), and network devices (MikroTik RouterOS).

## Technology Stack

- **Programming Language:** TypeScript (Node.js)
- **Package Management:** npm (Node Package Manager)
- **Build System:** TypeScript compiler (`tsc`)
- **Containerization:** Docker (see `Dockerfile`)
- **Configuration:** Project-specific configuration files (e.g., `tsconfig.json`, `package.json`, `server.json`)

## TypeScript Guidelines
- Use TypeScript for all new code
- Follow functional programming principles where possible
- Use interfaces for data structures and type definitions
- Prefer immutable data (const, readonly)
- Use optional chaining (?.) and nullish coalescing (??) operators

### Key Files

#### Oracle Server (`src/oracle/`)
- `index.ts`: Main entry point for the Oracle server logic
- `server.ts`: Server initialization and MCP protocol setup
- `db.ts`: Database connection and query execution logic
- `handlers.ts`: Request handlers for tools and resources
- `tools.ts`: Tool definitions (query, explain, stats, connect, awr)
- `tools/`: Individual tool implementations

#### MySQL Server (`src/mysql/`)
- `index.ts`: Main entry point for the MySQL server logic
- `server.ts`: Server initialization and MCP protocol setup
- `db.ts`: Database connection and query execution logic
- `handlers.ts`: Request handlers for tools and resources
- `tools.ts`: Tool definitions (mysql-query, mysql-explain, mysql-stats, mysql-connect, mysql-awr)
- `tools/`: Individual tool implementations

#### PostgreSQL Server (`src/postgres/`)
- `index.ts`: Main entry point for the PostgreSQL server logic
- `server.ts`: Server initialization and MCP protocol setup
- `db.ts`: Database connection and query execution logic
- `handlers.ts`: Request handlers for tools and resources
- `tools.ts`: Tool definitions (pg-query, pg-explain, pg-stats, pg-connect, pg-awr)
- `tools/`: Individual tool implementations

#### QNAP Server (`src/qnap/`)
- `index.ts`: Main entry point for the QNAP server logic
- `server.ts`: Server initialization and MCP protocol setup
- `handlers.ts`: Request handlers for tools and resources
- `tools.ts`: Tool definitions (qnap-connect, qnap-report, qnap-dir, qnap-file-info)
- `tools/`: Individual tool implementations

#### MikroTik Server (`src/mikrotik/`)
- `index.ts`: Main entry point for the MikroTik server logic
- `server.ts`: Server initialization and MCP protocol setup
- `handlers.ts`: Request handlers for tools and resources
- `tools.ts`: Tool definitions (mk-connect, mk-report, mk-get, mk-awr)
- `tools/`: Individual tool implementations

## How It Works
- The servers are written in TypeScript and are designed to be run as Node.js applications.
- They can be built and run locally or inside a Docker container for deployment.
- Each server uses the Model Context Protocol (MCP) to expose tools and resources to AI Agents.

## Development Workflow
1. **Install Dependencies:**
   ```sh
   cd src/[module]
   npm install
   ```
2. **Build the Project:**
   ```sh
   npm run build
   ```
3. **Run the Server (Locally):**
   ```sh
   npx -y @marcelo-ochoa/server-oracle localhost:1521/freepdb1
   npx -y @marcelo-ochoa/server-mysql localhost:3306/mydb
   npx -y @marcelo-ochoa/server-postgres localhost:5432/postgres
   npx -y @marcelo-ochoa/server-qnap http://nas-ip:8080
   npx -y @marcelo-ochoa/server-mikrotik 192.168.88.1
   ```
4. **Build with Docker:**
   Build the Docker image and run the container:
   ```sh
   docker build -t mochoa/mcp-oracle -f src/oracle/Dockerfile .
   docker build -t mochoa/mcp-mysql -f src/mysql/Dockerfile .
   docker build -t mochoa/mcp-postgres -f src/postgres/Dockerfile .
   docker build -t mochoa/mcp-qnap -f src/qnap/Dockerfile .
   docker build -t mochoa/mcp-mikrotik -f src/mikrotik/Dockerfile .
   ```
5. **Publish to ModelContextProtocol:**
   ```sh
   mcp-publisher login github
   mcp-publisher publish
   ```
6. **Publish to npm:**
   ```sh
   npm login
   npm publish
   ```
7. **Test with Antigravity Code Editor:**
   Build with Docker as is described in step 4.
   ```sh
   docker build -t mochoa/mcp-oracle -f src/oracle/Dockerfile .
   # manually wait until user reloads MCP servers
   ```
   If antigravity is running, MCP Servers need to be reloaded.

## Notes
- Ensure you have Node.js and npm installed for local development.
- For Docker-based workflows, ensure Docker is installed and running.
- Each server may require specific environment variables for credentials (e.g., `QNAP_USER`, `MK_PASSWORD`, `PG_PASSWORD`).

## Additional Resources
- See the `README.md` in each module directory for specific usage, configuration, and advanced options.
- Refer to the root project `README.md` for information about the overall system.
