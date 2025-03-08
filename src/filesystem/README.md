# Filesystem MCP Server

## What is this?

The Filesystem MCP Server is a tool that allows AI assistants like Claude to access files on your computer. It enables Claude to read, write, and manage files within specific directories that you choose to share.

Think of it as a secure bridge between Claude and your computer files - Claude can only access the folders you explicitly allow.

## Why would I want this?

- Have Claude help you organize your files
- Let Claude read and analyze documents on your computer
- Allow Claude to create or edit files for you
- Enable Claude to search through your documents

## Prerequisites

Before you begin, you'll need:

- **Node.js** (version 14 or higher) installed on your computer
  - [Download Node.js here](https://nodejs.org/)
- **Docker** (optional, only if using the Docker method)
  - [Download Docker here](https://www.docker.com/products/docker-desktop/)
- **Claude Desktop** application installed
  - [Download Claude Desktop here](https://claude.ai/desktop)

## Installation

### Option 1: Using NPX (Easiest)

NPX comes with Node.js, so if you have Node.js installed, you already have NPX!

1. No additional installation needed - we'll run the server directly from NPX when needed.

### Option 2: Using Docker

1. Install Docker from the link in Prerequisites
2. Build the Docker image (optional, as you can use the pre-built image):
   ```bash
   docker build -t mcp/filesystem -f src/filesystem/Dockerfile .
   ```

## Quick Start Guide

### Step 1: Decide which folders you want to share with Claude

Think carefully about what directories you want Claude to access. For security, only share what you need Claude to work with.

Examples:
- A project folder: `/Users/yourusername/Documents/my-project`
- Your desktop: `/Users/yourusername/Desktop`

### Step 2: Configure Claude Desktop

1. Open Claude Desktop
2. Click on Settings (gear icon)
3. Navigate to the "Advanced" section
4. Locate the `claude_desktop_config.json` file (or create it if it doesn't exist)
5. Add the configuration for the Filesystem MCP Server (see examples below)
6. Save the file and restart Claude Desktop

#### Configuration Example (NPX Method):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/yourusername/Documents/my-project",
        "/Users/yourusername/Desktop"
      ]
    }
  }
}
```

#### Configuration Example (Docker Method):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=/Users/yourusername/Documents/my-project,dst=/projects/my-project",
        "--mount", "type=bind,src=/Users/yourusername/Desktop,dst=/projects/Desktop",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### Step 3: Test the connection

1. Restart Claude Desktop after saving your configuration
2. In a conversation with Claude, ask it to list the contents of one of your shared directories:
   "Can you list the contents of my Desktop folder?"

## Understanding the Configuration

### NPX Configuration Breakdown:

```json
"args": [
  "-y",                                      // Automatically say yes to installation prompts
  "@modelcontextprotocol/server-filesystem", // The package to run
  "/Users/yourusername/Documents/my-project", // First directory to share (add your actual path)
  "/Users/yourusername/Desktop"              // Second directory to share (add your actual path)
]
```

### Docker Configuration Breakdown:

```json
"args": [
  "run",
  "-i",                                       // Interactive mode
  "--rm",                                     // Remove container when done
  "--mount", "type=bind,src=/Users/yourusername/Documents/my-project,dst=/projects/my-project", // Mount your project folder
  "--mount", "type=bind,src=/Users/yourusername/Desktop,dst=/projects/Desktop",                 // Mount your Desktop
  "mcp/filesystem",                           // Docker image to use
  "/projects"                                 // The container directory containing all mounted folders
]
```

#### Read-Only Access:

To make a directory read-only (Claude can't modify files), add `,ro` to the mount:

```
"--mount", "type=bind,src=/Users/yourusername/Documents/my-project,dst=/projects/my-project,ro"
```

## What Claude Can Do With Your Files

Once configured, Claude can:

- **Read files**: View the contents of text files
- **Write files**: Create new files or change existing ones
- **Create folders**: Make new directories
- **List directories**: See what files are in a folder
- **Move files**: Relocate or rename files
- **Search files**: Find files matching a pattern
- **Get file info**: View details about a file (size, dates, etc.)

## Troubleshooting

### Common Issues:

**Claude can't see my files**
- Check that the paths in your configuration are correct
- Verify that Claude Desktop was restarted after changing the configuration
- Make sure the directories exist and you have permission to access them

**Permission errors**
- Ensure your user account has permission to access the directories
- For Docker, make sure Docker has permission to access those locations

**Server won't start**
- Check that Node.js or Docker is properly installed
- Look for error messages in the Claude Desktop console

## Security Considerations

- The server will only allow operations within directories you specify
- Never share sensitive directories containing passwords or private information
- Consider using read-only access for directories where you don't want changes

## Getting Help

If you're experiencing problems:
- Check the [Claude Desktop documentation](https://claude.ai/docs)
- Visit the [Anthropic support site](https://support.anthropic.com)

## Glossary

- **MCP (Model Context Protocol)**: A protocol that allows AI models like Claude to interact with external tools and systems
- **Claude Desktop**: The desktop application version of Claude AI assistant
- **Node.js**: A JavaScript runtime environment that allows executing JavaScript code outside a web browser
- **Docker**: A platform that enables developers to package applications into containers
- **NPX**: A package runner tool that comes with npm (Node Package Manager)

## Features

- Read/write files
- Create/list/delete directories
- Move files/directories
- Search files
- Get file metadata

## API Details (For Technical Users)

### Resources

- `file://system`: File system operations interface

### Tools

- **read_file**
  - Read complete contents of a file
  - Input: `path` (string)
  - Reads complete file contents with UTF-8 encoding

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
    - Fuzzy matching with confidence scoring
    - Multiple simultaneous edits with correct positioning
    - Indentation style detection and preservation
    - Git-style diff output with context
    - Preview changes with dry run mode
    - Failed match debugging with confidence scores
  - Inputs:
    - `path` (string): File to edit
    - `edits` (array): List of edit operations
      - `oldText` (string): Text to search for (can be substring)
      - `newText` (string): Text to replace with
    - `dryRun` (boolean): Preview changes without applying (default: false)
    - `options` (object): Optional formatting settings
      - `preserveIndentation` (boolean): Keep existing indentation (default: true)
      - `normalizeWhitespace` (boolean): Normalize spaces while preserving structure (default: true)
      - `partialMatch` (boolean): Enable fuzzy matching (default: true)
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

- **move_file**
  - Move or rename files and directories
  - Inputs:
    - `source` (string)
    - `destination` (string)
  - Fails if destination exists

- **search_files**
  - Recursively search for files/directories
  - Inputs:
    - `path` (string): Starting directory
    - `pattern` (string): Search pattern
    - `excludePatterns` (string[]): Exclude any patterns. Glob formats are supported.
  - Case-insensitive matching
  - Returns full paths to matches

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

## Version Information

- Current version: 1.0.0
- Compatible with Claude Desktop version: 1.0.0 and above
- Node.js compatibility: v14.x and above

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
