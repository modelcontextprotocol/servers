# Everything Server - Startup Process

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| Startup Process
| [Server Features](features.md)
| [Extension Points](extension.md)
| [How It Works](how-it-works.md)**

## 1. Everything Server Launcher

- Usage `node dist/index.js [stdio|sse|streamableHttp]`
- Runs the specified **transport manager** to handle client connections.
- Specify transport type on command line (default `stdio`)
  - `stdio` → `transports/stdio.js`
  - `sse` → `transports/sse.js`
  - `streamableHttp` → `transports/streamableHttp.js`

## 2. The Transport Manager

- Creates a server instance using `createServer()` from `server/index.ts`
  - Connects it to the chosen transport type from the MCP SDK.
- Handles communication according to the MCP specs for the chosen transport.
  - **STDIO**:
    - One simple, process‑bound connection.
    - Calls`clientConnect()` upon connection.
    - Closes and calls `cleanup()` on `SIGINT`.
  - **SSE**:
    - Supports multiple client connections.
    - Client transports are mapped to `sessionId`;
    - Calls `clientConnect(sessionId)` upon connection.
    - Hooks server’s `onclose` to clean and remove session.
    - Exposes
      - `/sse` **GET** (SSE stream)
      - `/message` **POST** (JSON‑RPC messages)
  - **Streamable HTTP**:
    - Supports multiple client connections.
    - Client transports are mapped to `sessionId`;
    - Calls `clientConnect(sessionId)` upon connection.
    - Exposes `/mcp` for
      - **POST** (JSON‑RPC messages)
      - **GET** (SSE stream)
      - **DELETE** (termination)
    - Uses an event store for resumability and stores transports by `sessionId`.
    - Calls `cleanup(sessionId)` on **DELETE**.

## 3. The Server Factory

- Invoke `createServer()` from `server/index.ts`
- Creates a new `McpServer` instance with
  - **Capabilities**:
    - `tools: {}`
    - `logging: {}`
    - `prompts: {}`
    - `resources: { subscribe: true }`
  - **Server Instructions**
    - Loaded from the docs folder (`server-instructions.md`).
  - **Registrations**
    - Registers **tools** via `registerTools(server)`.
    - Registers **resources** via `registerResources(server)`.
    - Registers **prompts** via `registerPrompts(server)`.
  - **Other Request Handlers**
    - Sets up resource subscription handlers via `setSubscriptionHandlers(server)`.
    - Roots list change handler is added post-connection via
  - **Returns**
    - The `McpServer` instance
    - A `clientConnect(sessionId)` callback that enables post-connection setup
    - A `cleanup(sessionId?)` callback that stops any active intervals and removes any session‑scoped state

## Enabling Multiple Clients

Some of the transport managers defined in the `transports` folder can support multiple clients.
In order to do so, they must map certain data to a session identifier.
