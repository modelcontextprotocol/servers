# Everything MCP Server

This MCP server attempts to exercise all the features of the MCP protocol. It is not intended to be a useful server, but rather a test server for builders of MCP clients. It implements prompts, tools, resources, sampling, and more to showcase MCP capabilities.

## Components

### Tools

1. `echo`
   - Simple tool to echo back input messages
   - Input:
     - `message` (string): Message to echo back
   - Returns: Text content with echoed message

2. `add`
   - Adds two numbers together
   - Inputs:
     - `a` (number): First number
     - `b` (number): Second number
   - Returns: Text result of the addition

3. `longRunningOperation`
   - Demonstrates progress notifications for long operations
   - Inputs:
     - `duration` (number, default: 10): Duration in seconds
     - `steps` (number, default: 5): Number of progress steps
   - Returns: Completion message with duration and steps
   - Sends progress notifications during execution

4. `sampleLLM`
   - Demonstrates LLM sampling capability using MCP sampling feature
   - Inputs:
     - `prompt` (string): The prompt to send to the LLM
     - `maxTokens` (number, default: 100): Maximum tokens to generate
   - Returns: Generated LLM response

5. `getTinyImage`
   - Returns a small test image
   - No inputs required
   - Returns: Base64 encoded PNG image data

6. `printEnv`
   - Prints all environment variables
   - Useful for debugging MCP server configuration
   - No inputs required
   - Returns: JSON string of all environment variables

7. `annotatedMessage`
   - Demonstrates how annotations can be used to provide metadata about content
   - Inputs:
     - `messageType` (enum: "error" | "success" | "debug"): Type of message to demonstrate different annotation patterns
     - `includeImage` (boolean, default: false): Whether to include an example image
   - Returns: Content with varying annotations:
     - Error messages: High priority (1.0), visible to both user and assistant
     - Success messages: Medium priority (0.7), user-focused
     - Debug messages: Low priority (0.3), assistant-focused
     - Optional image: Medium priority (0.5), user-focused
   - Example annotations:
     ```json
     {
       "priority": 1.0,
       "audience": ["user", "assistant"]
     }
     ```

8. `getResourceReference`
   - Returns a resource reference that can be used by MCP clients
   - Inputs:
     - `resourceId` (number, 1-100): ID of the resource to reference
   - Returns: A resource reference with:
     - Text introduction
     - Embedded resource with `type: "resource"`
     - Text instruction for using the resource URI

### Resources

The server provides 100 test resources in two formats:
- Even numbered resources:
  - Plaintext format
  - URI pattern: `test://static/resource/{even_number}`
  - Content: Simple text description

- Odd numbered resources:
  - Binary blob format
  - URI pattern: `test://static/resource/{odd_number}`
  - Content: Base64 encoded binary data

Resource features:
- Supports pagination (10 items per page)
- Allows subscribing to resource updates
- Demonstrates resource templates
- Auto-updates subscribed resources every 5 seconds

### Prompts

1. `simple_prompt`
   - Basic prompt without arguments
   - Returns: Single message exchange

2. `complex_prompt`
   - Advanced prompt demonstrating argument handling
   - Required arguments:
     - `temperature` (number): Temperature setting
   - Optional arguments:
     - `style` (string): Output style preference
   - Returns: Multi-turn conversation with images

3. `resource_prompt`
   - Demonstrates embedding resource references in prompts
   - Required arguments:
     - `resourceId` (number): ID of the resource to embed (1-100)
   - Returns: Multi-turn conversation with an embedded resource reference
   - Shows how to include resources directly in prompt messages

### Logging

The server sends random-leveled log messages every 15 seconds, e.g.:

```json
{
  "method": "notifications/message",
  "params": {
	"level": "info",
	"data": "Info-level message"
  }
}
```

## Usage with Claude Desktop (uses [stdio Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#stdio))

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "everything": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-everything"
      ]
    }
  }
}
```

## Usage with VS Code

For quick installation, use of of the one-click install buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everything%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everything%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverything%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverything%22%5D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

#### NPX

```json
{
  "mcp": {
    "servers": {
      "everything": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-everything"]
      }
    }
  }
}
```

## Running from source with [HTTP+SSE Transport](https://modelcontextprotocol.io/specification/2024-11-05/basic/transports#http-with-sse) (deprecated as of [2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports))

```shell
cd src/everything
npm install
npm run start:sse
```

## Run from source with [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)

```shell
cd src/everything
npm install
npm run start:streamableHttp
```

## Running as an installed package
### Install 
```shell
npm install -g @modelcontextprotocol/server-everything@latest
````

### Run the default (stdio) server
```shell
npx @modelcontextprotocol/server-everything
```

### Or specify stdio explicitly
```shell
npx @modelcontextprotocol/server-everything stdio
```

### Run the SSE server
```shell
npx @modelcontextprotocol/server-everything sse
```

### Run the streamable HTTP server
```shell
npx @modelcontextprotocol/server-everything streamableHttp
```

