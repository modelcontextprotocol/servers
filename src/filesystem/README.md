# Filesystem MCP Server

Node.js server implementing Model Context Protocol (MCP) for filesystem operations.

Published on npm as [`@modelcontextprotocol/server-filesystem`](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem).

## Features

- Read/write files
- Create/list/delete directories
- Move files/directories
- Search files
- Get file metadata
- Dynamic directory access control via [Roots](https://modelcontextprotocol.io/docs/learn/client-concepts#roots)

## Directory Access Control

The server uses a flexible directory access control system. Allowed directories can be configured either statically via command-line arguments or dynamically via the [MCP Roots protocol](https://modelcontextprotocol.io/docs/learn/client-concepts#roots).

### Method 1: Argless Configuration via MCP Roots (Recommended)

When `mcp-server-filesystem` is launched **without directory arguments**, directory scoping is fully delegated to the MCP client:

```bash
mcp-server-filesystem
```

In this mode:
- **Automatic Root Discovery**: Upon connection, the server requests the client's workspace roots via `roots/list`.
- **Dynamic Updates**: When workspace folders are added or removed in the client, the client sends a `notifications/roots/list_changed` notification. The server automatically queries `roots/list` and updates its allowed directory list at runtime without requiring a server restart.
- **Client Requirements**: The client must support the roots capability (`capabilities.roots`) and provide at least one valid root directory. If started without arguments and the client does not support roots (or returns an empty roots list), the server will throw an error during initialization.

This is the recommended setup for IDEs and clients with workspace support (such as VS Code), as it avoids hardcoded directory paths and adapts dynamically to the user's active workspace.

### Method 2: Command-line Arguments (Static Scope)

Specify allowed directories explicitly when starting the server:

```bash
mcp-server-filesystem /path/to/dir1 /path/to/dir2
```

In this mode:
- The server uses the specified directories as its allowed scope.
- If the connected client also supports the MCP Roots protocol, client-provided roots will take precedence and replace the command-line directories upon initialization.
- If the client does not support roots, the server will continue using the static command-line directories.

### How It Works

The server's directory access control follows this lifecycle:

1. **Server Startup**
   - **With arguments**: Server initializes with the paths passed as command-line arguments.
   - **Without arguments (Argless)**: Server starts with an empty allowed directory list, waiting for the client to provide roots during initialization.

2. **Client Connection & Initialization**
   - Client connects and sends the `initialize` request with declared capabilities.
   - Server checks if the client declares roots capability (`capabilities.roots`).

3. **Roots Protocol Handling** (When client supports roots)
   - **On initialization (`roots/list`)**: Server requests the client's configured root directories. The received roots replace all server-side allowed directories.
   - **On runtime updates (`notifications/roots/list_changed`)**: When roots change in the client, the client emits a notification. The server re-fetches roots via `roots/list` and updates allowed directories in real time.

4. **Fallback & Error Behavior**
   - **Started with arguments & client lacks roots support**: Server continues operating with the static command-line directories.
   - **Started without arguments & client lacks roots support (or provides empty roots)**: Server throws an initialization error (`Server cannot operate: No allowed directories available...`) since at least one allowed directory is required to operate.

5. **Access Control & Path Validation**
   - All filesystem operations are strictly validated against the active allowed directories (including symlink resolution).
   - Use the `list_allowed_directories` tool to inspect the active allowed directories at any time.



## API

### Tools

- **read_text_file**
  - Read complete contents of a file as text
  - Inputs:
    - `path` (string)
    - `head` (number, optional): First N lines
    - `tail` (number, optional): Last N lines
  - Always treats the file as UTF-8 text regardless of extension
  - Cannot specify both `head` and `tail` simultaneously

- **read_media_file**
  - Read a file and return it as a base64-encoded content block with its MIME type
  - Inputs:
    - `path` (string)
  - Streams the file and returns base64 data with the corresponding MIME type. Image and
    audio files are returned as `image`/`audio` content; any other file type is returned as
    an embedded `resource` (a valid MCP content block for arbitrary binary data)

- **read_multiple_files**
  - Read multiple files simultaneously
  - Input: `paths` (string[])
  - Failed reads won't stop the entire operation

- **write_file**
  - Create new file or overwrite existing (exercise caution with this)
  - Inputs:
    - `path` (string): File location
    - `content` (string): File content

- **edit_file**
  - Make selective edits using advanced pattern matching and formatting
  - Features:
    - Line-based and multi-line content matching
    - Whitespace normalization with indentation preservation
    - Multiple simultaneous edits with correct positioning
    - Indentation style detection and preservation
    - Git-style diff output with context
    - Preview changes with dry run mode
  - Inputs:
    - `path` (string): File to edit
    - `edits` (array): List of edit operations
      - `oldText` (string): Text to search for (can be substring)
      - `newText` (string): Text to replace with
    - `dryRun` (boolean): Preview changes without applying (default: false)
  - Returns detailed diff and match information for dry runs, otherwise applies changes
  - Best Practice: Always use dryRun first to preview changes before applying them

- **create_directory**
  - Create new directory or ensure it exists
  - Input: `path` (string)
  - Creates parent directories if needed
  - Succeeds silently if directory exists

- **list_directory**
  - List directory contents with [FILE] or [DIR] prefixes
  - Input: `path` (string)

- **list_directory_with_sizes**
  - List directory contents with [FILE] or [DIR] prefixes, including file sizes
  - Inputs:
    - `path` (string): Directory path to list
    - `sortBy` (string, optional): Sort entries by "name" or "size" (default: "name")
  - Returns detailed listing with file sizes and summary statistics
  - Shows total files, directories, and combined size

- **move_file**
  - Move or rename files and directories
  - Inputs:
    - `source` (string)
    - `destination` (string)
  - Fails if destination exists

- **search_files**
  - Recursively search for files/directories that match or do not match patterns
  - Inputs:
    - `path` (string): Starting directory
    - `pattern` (string): Search pattern
    - `excludePatterns` (string[]): Exclude any patterns.
  - Glob-style pattern matching
  - Returns full paths to matches

- **directory_tree**
  - Get recursive JSON tree structure of directory contents
  - Inputs:
    - `path` (string): Starting directory
    - `excludePatterns` (string[]): Exclude any patterns. Glob formats are supported.
  - Returns:
    - JSON array where each entry contains:
      - `name` (string): File/directory name
      - `type` ('file'|'directory'): Entry type
      - `children` (array): Present only for directories
        - Empty array for empty directories
        - Omitted for files
  - Output is formatted with 2-space indentation for readability
    
- **get_file_info**
  - Get detailed file/directory metadata
  - Input: `path` (string)
  - Returns:
    - Size
    - Creation time
    - Modified time
    - Access time
    - Type (file/directory)
    - Permissions

- **list_allowed_directories**
  - List all directories the server is allowed to access
  - No input required
  - Returns:
    - Directories that this server can read/write from

### Tool annotations (MCP hints)

This server sets [MCP ToolAnnotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#toolannotations)
on each tool so clients can:

- Distinguish **read‑only** tools from write‑capable tools.
- Understand which write operations are **idempotent** (safe to retry with the same arguments).
- Highlight operations that may be **destructive** (overwriting or heavily mutating data).
- Signal that a tool does **not** reach an open or external world (every filesystem tool sets `openWorldHint: false`).

The mapping for filesystem tools is:

| Tool                        | readOnlyHint | idempotentHint | destructiveHint | Notes                                            |
|-----------------------------|--------------|----------------|-----------------|--------------------------------------------------|
| `read_text_file`            | `true`       | –              | –               | Pure read                                       |
| `read_media_file`           | `true`       | –              | –               | Pure read                                       |
| `read_multiple_files`       | `true`       | –              | –               | Pure read                                       |
| `list_directory`            | `true`       | –              | –               | Pure read                                       |
| `list_directory_with_sizes` | `true`       | –              | –               | Pure read                                       |
| `directory_tree`            | `true`       | –              | –               | Pure read                                       |
| `search_files`              | `true`       | –              | –               | Pure read                                       |
| `get_file_info`             | `true`       | –              | –               | Pure read                                       |
| `list_allowed_directories`  | `true`       | –              | –               | Pure read                                       |
| `create_directory`          | `false`      | `true`         | `false`         | Re‑creating the same dir is a no‑op             |
| `write_file`                | `false`      | `true`         | `true`          | Overwrites existing files                       |
| `edit_file`                 | `false`      | `false`        | `true`          | Re‑applying edits can fail or double‑apply      |
| `move_file`                 | `false`      | `false`        | `true`          | Deletes source file                             |

> Note: `idempotentHint` and `destructiveHint` are meaningful only when `readOnlyHint` is `false`, as defined by the MCP spec. Every tool also sets `openWorldHint: false` — this server only accesses the local filesystem within its allowed directories, never an open or external world.

## Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:

Note: you can provide sandboxed directories to the server by mounting them to `/projects`. Adding the `ro` flag will make the directory readonly by the server.

### Docker
Note: all directories must be mounted to `/projects` by default.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=/Users/username/Desktop,dst=/projects/Desktop",
        "--mount", "type=bind,src=/path/to/other/allowed/dir,dst=/projects/other/allowed/dir,ro",
        "--mount", "type=bind,src=/path/to/file.txt,dst=/projects/path/to/file.txt",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### NPX

**Argless Configuration (MCP Roots Delegation - Recommended):**

If your client supports the MCP Roots protocol, omit directory arguments so the server dynamically discovers and updates allowed directories from client roots:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem"
      ]
    }
  }
}
```

**Static Configuration (Explicit Directories):**

Specify explicit directory paths to restrict the server to fixed folders:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

On Windows, use `cmd /c` to launch `npx`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

## Usage with VS Code

For quick installation, click the installation buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-filesystem%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-filesystem%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fprojects%2Fworkspace%22%2C%22mcp%2Ffilesystem%22%2C%22%2Fprojects%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fprojects%2Fworkspace%22%2C%22mcp%2Ffilesystem%22%2C%22%2Fprojects%22%5D%7D&quality=insiders)

For manual installation, you can configure the MCP server using one of these methods:

**Method 1: User Configuration (Recommended)**
Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`. This will open your user `mcp.json` file where you can add the server configuration.

**Method 2: Workspace Configuration**
Alternatively, you can add the configuration to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

You can provide sandboxed directories to the server by mounting them to `/projects`. Adding the `ro` flag will make the directory readonly by the server.

### Docker
Note: all directories must be mounted to `/projects` by default. 

```json
{
  "servers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=${workspaceFolder},dst=/projects/workspace",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### NPX

**Argless Configuration (MCP Roots Delegation - Recommended):**

VS Code supports the MCP Roots protocol and automatically passes open workspace folders as roots to the server. Omitting directory arguments allows the server to adapt dynamically as you switch or add workspace folders:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem"
      ]
    }
  }
}
```

**Explicit Workspace Directory:**

Alternatively, you can explicitly pass the VS Code `${workspaceFolder}` variable:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "${workspaceFolder}"
      ]
    }
  }
}
```

On Windows, use `cmd /c` to launch `npx`:

```json
{
  "servers": {
    "filesystem": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem"
      ]
    }
  }
}
```

## Build

Docker build:

```bash
docker build -t mcp/filesystem -f src/filesystem/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
