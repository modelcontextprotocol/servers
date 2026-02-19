import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  TextContent,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const FileOperationsSchema = z.object({
  operation: z
    .enum(["read", "write", "delete", "list", "create-dir"])
    .describe("File operation to perform"),
  path: z.string().describe("File path for the operation"),
  content: z
    .string()
    .optional()
    .describe("Content for write operations"),
  recursive: z
    .boolean()
    .default(false)
    .describe("Recursive flag for list operations"),
});

// Tool configuration
const name = "file-operations";
const config = {
  title: "File Operations Tool",
  description: "Perform basic file operations with proper error handling and validation",
  inputSchema: FileOperationsSchema,
};

/**
 * Registers file-operations tool.
 *
 * Provides comprehensive file operations with validation, error handling,
 * and proper response formatting according to MCP standards.
 *
 * @param {McpServer} server - The MCP server instance
 */
export const registerFileOperationsTool = (server: McpServer) => {
  server.registerTool(name, config, async (args: any): Promise<CallToolResult> => {
    try {
      const { operation, path, content, recursive } = args;

      // Validate inputs
      if (!path || path.trim() === '') {
        return {
          content: [{
            type: "text",
            text: "Error: Path cannot be empty",
            annotations: {
              priority: 0.9,
              audience: ["user"],
            },
          }],
          isError: true,
        };
      }

      switch (operation) {
        case "read":
          return await handleReadOperation(path);

        case "write":
          if (!content) {
            return {
              content: [{
                type: "text",
                text: "Error: Content required for write operation",
                annotations: { priority: 0.8, audience: ["user"] },
              }],
              isError: true,
            };
          }
          return await handleWriteOperation(path, content);

        case "delete":
          return await handleDeleteOperation(path);

        case "list":
          return await handleListOperation(path, recursive);

        case "create-dir":
          return await handleCreateDirOperation(path);

        default:
          return {
            content: [{
              type: "text",
              text: `Error: Unknown operation '${operation}'`,
              annotations: { priority: 0.8, audience: ["user"] },
            }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          annotations: { priority: 0.9, audience: ["user"] },
        }],
        isError: true,
      };
    }
  });
};

// Helper functions for file operations
async function handleReadOperation(path: string): Promise<CallToolResult> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');

    return {
      content: [{
        type: "text",
        text: content,
        annotations: {
          priority: 0.5,
          audience: ["user", "assistant"],
        },
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Read error: ${error instanceof Error ? error.message : String(error)}`,
        annotations: { priority: 0.8, audience: ["user"] },
      }],
      isError: true,
    };
  }
}

async function handleWriteOperation(path: string, content: string): Promise<CallToolResult> {
  try {
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    // Ensure directory exists
    const dir = pathModule.dirname(path);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(path, content, 'utf-8');

    return {
      content: [{
        type: "text",
        text: `Successfully wrote ${content.length} characters to ${path}`,
        annotations: { priority: 0.3, audience: ["user"] },
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Write error: ${error instanceof Error ? error.message : String(error)}`,
        annotations: { priority: 0.8, audience: ["user"] },
      }],
      isError: true,
    };
  }
}

async function handleDeleteOperation(path: string): Promise<CallToolResult> {
  try {
    const fs = await import('fs/promises');
    await fs.unlink(path);

    return {
      content: [{
        type: "text",
        text: `Successfully deleted ${path}`,
        annotations: { priority: 0.3, audience: ["user"] },
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Delete error: ${error instanceof Error ? error.message : String(error)}`,
        annotations: { priority: 0.8, audience: ["user"] },
      }],
      isError: true,
    };
  }
}

async function handleListOperation(path: string, recursive: boolean): Promise<CallToolResult> {
  try {
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    const stats = await fs.stat(path);
    if (!stats.isDirectory()) {
      throw new Error('Path must be a directory for list operation');
    }

    const entries = await fs.readdir(path, { withFileTypes: true });
    let items = entries.map(entry => {
      const fullPath = pathModule.join(path, entry.name);
      return `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`;
    });

    if (recursive) {
      // Add recursive listing logic here if needed
      items.push('\n[INFO] Recursive listing not fully implemented');
    }

    return {
      content: [{
        type: "text",
        text: items.join('\n'),
        annotations: { priority: 0.3, audience: ["user"] },
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `List error: ${error instanceof Error ? error.message : String(error)}`,
        annotations: { priority: 0.8, audience: ["user"] },
      }],
      isError: true,
    };
  }
}

async function handleCreateDirOperation(path: string): Promise<CallToolResult> {
  try {
    const fs = await import('fs/promises');
    await fs.mkdir(path, { recursive: true });

    return {
      content: [{
        type: "text",
        text: `Successfully created directory: ${path}`,
        annotations: { priority: 0.3, audience: ["user"] },
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Create directory error: ${error instanceof Error ? error.message : String(error)}`,
        annotations: { priority: 0.8, audience: ["user"] },
      }],
      isError: true,
    };
  }
}
