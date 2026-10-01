# Knowledge Graph Memory Server

A basic implementation of persistent memory using a local knowledge graph. This lets Claude remember information about the user across chats.

Published on npm as [`@modelcontextprotocol/server-memory`](https://www.npmjs.com/package/@modelcontextprotocol/server-memory).

## Core Concepts

### Entities
Entities are the primary nodes in the knowledge graph. Each entity has:
- A unique name (identifier)
- An entity type (e.g., "person", "organization", "event")
- A list of observations

Example:
```json
{
  "name": "John_Smith",
  "entityType": "person",
  "observations": ["Speaks fluent Spanish"]
}
```

### Relations
Relations define directed connections between entities. They are always stored in active voice and describe how entities interact or relate to each other.

Example:
```json
{
  "from": "John_Smith",
  "to": "Anthropic",
  "relationType": "works_at"
}
```
### Observations
Observations are discrete pieces of information about an entity. They are:

- Stored as strings
- Attached to specific entities
- Can be added or removed independently
- Should be atomic (one fact per observation)

Example:
```json
{
  "entityName": "John_Smith",
  "observations": [
    "Speaks fluent Spanish",
    "Graduated in 2019",
    "Prefers morning meetings"
  ]
}
```

## API

### Tools
- **create_entities**
  - Create multiple new entities in the knowledge graph
  - Input: `entities` (array of objects)
    - Each object contains:
      - `name` (string): Entity identifier
      - `entityType` (string): Type classification
      - `observations` (string[]): Associated observations
  - Ignores entities with existing names

- **create_relations**
  - Create multiple new relations between entities
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type in active voice
  - Skips duplicate relations
  - Fails if either the source or target entity doesn't exist

- **add_observations**
  - Add new observations to existing entities
  - Input: `observations` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `contents` (string[]): New observations to add
  - Returns added observations per entity
  - Fails if entity doesn't exist

- **delete_entities**
  - Remove entities and their relations
  - Input: `entityNames` (string[])
  - Cascading deletion of associated relations
  - No error if an entity doesn't exist; the response reports which names were not found

- **delete_observations**
  - Remove specific observations from entities
  - Input: `deletions` (array of objects)
    - Each object contains:
      - `entityName` (string): Target entity
      - `observations` (string[]): Observations to remove
  - No error if an observation doesn't exist; the response reports how many were deleted

- **delete_relations**
  - Remove specific relations from the graph
  - Input: `relations` (array of objects)
    - Each object contains:
      - `from` (string): Source entity name
      - `to` (string): Target entity name
      - `relationType` (string): Relationship type
  - No error if a relation doesn't exist; the response reports how many were deleted

- **read_graph**
  - Read the entire knowledge graph
  - No input required
  - Returns complete graph structure with all entities and relations

- **search_nodes**
  - Search for nodes based on query
  - Input: `query` (string)
  - Searches across:
    - Entity names
    - Entity types
    - Observation content
  - Returns matching entities and their relations

- **open_nodes**
  - Retrieve specific nodes by name
  - Input: `names` (string[])
  - Returns:
    - Requested entities
    - Relations between requested entities
  - Silently skips non-existent nodes

### Resources

- **knowledge-graph** (`memory://knowledge-graph`)
  - The full knowledge graph as a readable MCP Resource
  - MIME type: `application/json`
  - Returns the same shape as `read_graph` (entities and relations)
  - Mutation tools (`create_entities`, `create_relations`, `add_observations`, `delete_entities`, `delete_observations`, `delete_relations`) emit `notifications/resources/updated` for this URI, so subscribed clients see live changes

## Concurrent access and recovery

Multiple server processes can share the same memory file. Mutations first queue
within each process, then acquire the adjacent `<memory-file>.lock` directory
before loading, changing, and atomically replacing the graph. Read-only tools
continue to read complete snapshots without taking the write lease. No additional
locking dependency is required.

A writer prepares a private directory containing a uniquely named owner marker,
then atomically renames that nonempty directory to `<memory-file>.lock`.
Publication cannot replace another nonempty generation. Recovery and release
unlink only the observed generation's marker before removing the empty directory;
a delayed remover cannot remove a successor's nonempty directory. Ownership
checks use the writer's own marker, not a snapshot adopted from the shared path.

The holder refreshes its owner marker's modification time every 10 seconds. A lease
with no visible refresh for 60 seconds can be reclaimed by another writer, so a
crashed or forcibly killed holder does not require manual lock cleanup. Contenders
use randomized exponential backoff, capped at 250 milliseconds. Acquisition
timeout or cancellation fails the mutation instead of writing unlocked.

### Request lifetime

Each tool call and resource read gets one request budget
(`MEMORY_REQUEST_TIMEOUT_MS`, default 30 seconds). The budget starts when the call
enters the server. Queueing, lease acquisition, loading and preparing the new
graph all spend it, and it is never restarted. Client cancellation, including the
client's own request timeout, also ends the request. The default is below the
TypeScript SDK's 60-second client timeout, so clients need no timeout
configuration.

The caller awaits the real execution of its mutation. Outcomes are labelled at
the throw site, so success means success and failure means failure:

- Resolved: the graph file was replaced. A signal that aborts after the final
  pre-rename check does not recall the rename; the call resolves with the real
  result, although an MCP client that already cancelled never receives it (see
  below).
- `NOT_COMMITTED`: the graph file was definitely not replaced, so retrying is
  safe. Causes: a full write queue, cancellation or expiry before or while
  queued, lock acquisition timeout or abort, lease loss detected before the
  rename, or an I/O failure before the rename (load, temporary-file write).
- `COMMIT_UNKNOWN`: only when the rename itself rejects. Read the graph before
  retrying.
- Business errors (for example `Entity with name X not found`) propagate
  unchanged and unlabelled.

After a killed lease holder, early calls return `NOT_COMMITTED` and a retry
succeeds once the 60-second stale threshold passes; the AI's retries complete
recovery, so no call needs to wait through it. A call whose client cancelled or
timed out receives no response at all (the MCP SDK drops it), so the AI should
read the graph before replaying it. A caller queued behind a writer stuck in
issued I/O can wait past its budget, and only its client timeout ends that wait.
A dispatched replacement is not recalled: the lease stays held and renewed until
issued I/O settles, and the next queued mutation starts only afterwards. Each
process admits up to 256 pending mutations; further mutations fail immediately
with `NOT_COMMITTED` until the queue drains.

If the operation already resolved (the rename succeeded after a passing
ownership check), a lease loss or cleanup failure found at release is logged and
the successful result is returned.

Before publishing a new graph, the server checks that it still owns the lease.
Detected lease loss fails the operation. This is a cooperative, time-based lease,
**not storage-enforced fencing**: checking ownership and renaming the data file
are separate operations. Arbitrarily long process pauses, network partitions,
or delayed I/O can therefore permit an old writer to resume after takeover.
Atomic replacement does not eliminate that limitation, and a failed/timed-out
call must not be assumed to have rolled back an already submitted filesystem
operation.

All writers must use this generation-based lock protocol, the same data/lock
directory, and the same timing policy. Do not mix it with older non-locking servers
or empty-directory lock implementations. Writers need permission to create,
inspect, update, and delete both lock directories and their owner markers; shared
Unix deployments need compatible ownership/group permissions. Do not manually
delete or touch a live lease. Access through different symlink aliases is not
supported. Stable wall clocks are required even locally: a large forward clock
adjustment can make a live lease appear expired.

A crash before publication may leave an unused `<memory-file>.lock.<random>.tmp`
candidate directory. It does not block later acquisitions and is not the active
lock. Normal completion and handled failures clean up their candidates; crash-only
orphans can be removed after all writers have stopped.

NFS/SMB deployments additionally require atomic directory renames that reject a
nonempty destination, coherent data and metadata visibility (including owner
markers), working timestamp updates, sufficiently synchronized client clocks,
and cache/latency bounds comfortably below the stale interval. The stale timeout
alone is not an NFS/SMB safety guarantee. Validate the actual client, server,
protocol and mount settings with independent clients before relying on this
mode. The bundled local multi-process tests do **not** validate NFS/SMB, and no
network-filesystem configuration has been validated by this change. FUSE is
outside the supported scope. Resource-update notifications remain local to the
server process performing the mutation; leases do not broadcast notifications
between processes.

# Usage with Claude Desktop

### Setup

Add this to your claude_desktop_config.json:

#### Docker

```json
{
  "mcpServers": {
    "memory": {
      "command": "docker",
      "args": ["run", "-i", "-v", "claude-memory:/app/dist", "--rm", "mcp/memory"]
    }
  }
}
```

#### NPX
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

On Windows, use `cmd /c` to launch `npx`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

#### NPX with custom setting

The server can be configured using the following environment variables:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ],
      "env": {
        "MEMORY_FILE_PATH": "/path/to/custom/memory.jsonl"
      }
    }
  }
}
```

On Windows, use:

```json
{
  "mcpServers": {
    "memory": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-memory"
      ],
      "env": {
        "MEMORY_FILE_PATH": "/path/to/custom/memory.jsonl"
      }
    }
  }
}
```

- `MEMORY_FILE_PATH`: Path to the memory storage JSONL file (default: `memory.jsonl` in the server directory)
- `MEMORY_REQUEST_TIMEOUT_MS`: Per-request budget in milliseconds, covering queueing, lease acquisition and processing (default: `30000`). Must be a positive integer; invalid values stop startup. The default fits the TypeScript SDK's 60-second client timeout, so no client change is needed; see [Request lifetime](#request-lifetime).

# VS Code Installation Instructions

For quick installation, use one of the one-click installation buttons below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-memory%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-memory%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22-v%22%2C%22claude-memory%3A%2Fapp%2Fdist%22%2C%22--rm%22%2C%22mcp%2Fmemory%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22-v%22%2C%22claude-memory%3A%2Fapp%2Fdist%22%2C%22--rm%22%2C%22mcp%2Fmemory%22%5D%7D&quality=insiders)

For manual installation, you can configure the MCP server using one of these methods:

**Method 1: User Configuration (Recommended)**
Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`. This will open your user `mcp.json` file where you can add the server configuration.

**Method 2: Workspace Configuration**
Alternatively, you can add the configuration to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

#### NPX

```json
{
  "servers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

On Windows, use:

```json
{
  "servers": {
    "memory": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

#### Docker

```json
{
  "servers": {
    "memory": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "-v",
        "claude-memory:/app/dist",
        "--rm",
        "mcp/memory"
      ]
    }
  }
}
```

### System Prompt

The prompt for utilizing memory depends on the use case. Changing the prompt will help the model determine the frequency and types of memories created.

Here is an example prompt for chat personalization. You could use this prompt in the "Custom Instructions" field of a [Claude.ai Project](https://www.anthropic.com/news/projects). 

```
Follow these steps for each interaction:

1. User Identification:
   - You should assume that you are interacting with default_user
   - If you have not identified default_user, proactively try to do so.

2. Memory Retrieval:
   - Always begin your chat by saying only "Remembering..." and retrieve all relevant information from your knowledge graph
   - Always refer to your knowledge graph as your "memory"

3. Memory
   - While conversing with the user, be attentive to any new information that falls into these categories:
     a) Basic Identity (age, gender, location, job title, education level, etc.)
     b) Behaviors (interests, habits, etc.)
     c) Preferences (communication style, preferred language, etc.)
     d) Goals (goals, targets, aspirations, etc.)
     e) Relationships (personal and professional relationships up to 3 degrees of separation)

4. Memory Update:
   - If any new information was gathered during the interaction, update your memory as follows:
     a) Create entities for recurring organizations, people, and significant events
     b) Connect them to the current entities using relations
     c) Store facts about them as observations
```

## Building

Docker:

```sh
docker build -t mcp/memory -f src/memory/Dockerfile . 
```

For Awareness: a prior mcp/memory volume contains an index.js file that could be overwritten by the new container. If you are using a docker volume for storage, delete the old docker volume's `index.js` file before starting the new container.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
