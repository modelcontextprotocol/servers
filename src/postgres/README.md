# MCP PostgreSQL Server (Dual Transport)

A Model Context Protocol (MCP) server that provides both HTTP and Stdio transports for interacting with PostgreSQL databases. This server exposes database resources and tools through both transport methods, allowing for flexible integration in different environments.

## Features

- **Dual Transport Support**: Both HTTP (StreamableHTTPServerTransport) and Stdio (StdioServerTransport)
- **Database Resources**: List tables and retrieve schema information
- **Query Tool**: Execute read-only SQL queries
- **Stateful Sessions**: HTTP transport supports session management
- **Docker Support**: Containerized deployments for both transports
- **Production Ready**: Graceful shutdown, error handling, and logging

## Project Structure

```
mcp-server/
├── docker/
│   ├── http/
│   │   └── Dockerfile
│   └── stdio/
│       └── Dockerfile
├── src/
│   ├── config/
│   │   ├── env.ts              # Environment configuration
│   │   └── database.ts         # Database connection setup
│   ├── resources/
│   │   ├── helloWorld.ts       # Simple greeting resource
│   │   ├── databaseTables.ts   # Database tables listing
│   │   └── databaseSchema.ts   # Table schema information
│   ├── tools/
│   │   └── queryTool.ts        # SQL query execution tool
│   ├── server/
│   │   └── server.ts           # Shared MCP server setup
│   ├── http/
│   │   ├── app.ts              # Express app configuration
│   │   └── httpHandler.ts      # HTTP request handlers
│   ├── stdio/
│   │   └── stdioServer.ts      # Stdio server implementation
│   ├── index.ts                # HTTP server entry point
│   └── stdioIndex.ts           # Stdio server entry point
├── .env.example
├── .dockerignore
├── docker-compose.yml
├── docker-compose.dev.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit your database credentials
nano .env
```

### 2. Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run HTTP server in development
npm run dev:http

# Run Stdio server in development
npm run dev:stdio
```

### 3. Production

```bash
# Build and start HTTP server
npm run build
npm run start:http

# Or start Stdio server
npm run start:stdio
```

## Docker Usage

### HTTP Server

```bash
# Build and start HTTP server
npm run docker:build
npm run docker:up

# View logs
npm run docker:logs:http

# Test the server
npm run test:http
```

### Stdio Server

```bash
# Run Stdio server (interactive)
npm run docker:up:stdio

# Or using docker-compose directly
docker-compose --profile stdio up mcp-stdio
```

### Development with Docker

```bash
# Start development environment with hot reload
npm run compose:dev
```

## Available Scripts

### Development
- `npm run dev:http` - Start HTTP server in development mode
- `npm run dev:stdio` - Start Stdio server in development mode
- `npm run watch` - Watch TypeScript files for changes
- `npm run build` - Build the project
- `npm run clean` - Clean build artifacts

### Production
- `npm run start:http` - Start HTTP server
- `npm run start:stdio` - Start Stdio server

### Podman Commands

```bash
podman machine start
make podman-up
```


### Testing
- `npm run test:http` - Test HTTP server endpoint
#### MCP Inspector

Install MCP Inspector: instructions: [here](https://modelcontextprotocol.io/docs/tools/inspector)

##### Check Stdio MCP Server
```bash
#from project directory
npx @modelcontextprotocol/inspector npx tsx src/stdioIndex.ts
```
![Stdio in MCP Inspector](images/stdio.png)

##### Check Streamable HTTP MCP Server
1. Install podman from [here](https://podman.io/docs/installation)
2. Install `uv` from [here](https://docs.astral.sh/uv/getting-started/installation/)
3. Install podman compose package: `uv sync` (will sync packages in `pyproject.toml`)
```bash
#get the environment variables
set -a
source .env
set +a
#start podman container (if running for the first time)
make podman-up #will construct the container of the MCP server
#if already exists: podman start <name_of_the_container>
npx @modelcontextprotocol/inspector
```
After selecting `Streamable HTTP` from drop down menu, insert `http://localhost:3000/mcp` into URL.

MCP tools:
![MCP Tools in MCP Inspector](images/http_tool.png)

MCP Resource:
![MCP Resource in MCP Inspector](images/http_resource.png)


## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POSTGRES_USERNAME` | PostgreSQL username | - | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | - | Yes |
| `POSTGRES_HOST` | PostgreSQL host | - | Yes |
| `POSTGRES_DATABASE` | PostgreSQL database name | - | Yes |
| `PORT` | HTTP server port | 3000 | No |
| `HOST` | HTTP server host | 0.0.0.0 | No |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | localhost:8080,localhost:3000 | No |
| `NODE_ENV` | Environment mode | development | No |

## API Endpoints (HTTP Transport)

### POST /mcp
Main MCP endpoint for JSON-RPC requests.

**Headers:**
- `Content-Type: application/json`
- `Mcp-Session-Id: <session-id>` (for existing sessions)

**Example Request:**
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"server/info","id":1}'
```

### DELETE /mcp
Close a specific session.

**Headers:**
- `Mcp-Session-Id: <session-id>`

### OPTIONS /mcp
CORS preflight handling.

## Resources

### Hello World (`hello://world`)
A simple greeting message for testing.

### Database Tables (`database://tables`)
Lists all tables in the public schema with their schema URIs.

### Database Schema (`database://tables/{tableName}/schema`)
Returns column information for a specific table.

## Tools

### query
Execute read-only SQL queries against the database.

**Parameters:**
- `sql` (string): The SQL query to execute

**Example:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "query",
    "arguments": {
      "sql": "SELECT * FROM users LIMIT 10"
    }
  },
  "id": 1
}
```

## Transport Differences

| Feature | HTTP Transport | Stdio Transport |
|---------|----------------|-----------------|
| Session Management | ✅ Stateful sessions | ❌ Stateless |
| Concurrent Connections | ✅ Multiple clients | ❌ Single process |
| Web Integration | ✅ REST API compatible | ❌ CLI only |
| Interactive Use | ✅ Via HTTP clients | ✅ Direct stdio |
| Docker Deployment | ✅ Web service | ✅ CLI container |

## Health Checks

The HTTP server includes a basic health check endpoint accessible at the `/mcp` endpoint with a GET request (returns 405 Method Not Allowed, confirming the server is responsive).

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Check your database credentials in .env
   # Ensure PostgreSQL is running and accessible
   ```

2. **Port Already in Use**
   ```bash
   # Change PORT in .env or stop conflicting services
   lsof -i :3000
   ```

3. **Docker Build Issues**
   ```bash
   # Clean Docker cache
   npm run docker:clean
   docker system prune -a
   ```

4. **Session Management (HTTP)**
   ```bash
   # Sessions are stored in memory and will reset on server restart
   # For production, consider implementing persistent session storage
   ```

## Development

### Adding New Resources

1. Create a new file in `src/resources/`
2. Implement the resource registration function
3. Add it to `src/server/server.ts`

### Adding New Tools

1. Create a new file in `src/tools/`
2. Implement the tool registration function
3. Add it to `src/server/server.ts`

## License

MIT

## Contributing

Please read the contributing guidelines and submit pull requests to the main repository.
