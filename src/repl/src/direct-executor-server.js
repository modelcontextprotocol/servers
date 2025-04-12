#!/usr/bin/env node
// Simple Node.js direct executor server using MCP SDK

import * as path from 'node:path';
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js"; 
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from 'child_process';

// Get the working directory from command line or use current directory
const workingDir = process.argv[2] 
    ? path.resolve(process.argv[2]) 
    : process.cwd();

console.log(`Starting direct executor with working directory: ${workingDir}`);

// Initialize the MCP server
const server = new McpServer(
  {
    name: "direct-node-executor", 
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}, // Enable tool support
    },
  }
);

// List available tools
const listToolsHandler = async () => {
  return {
    tools: [
      {
        name: "execute",
        description: "Execute JavaScript code directly with Node.js - supports ESM imports and all Node.js features",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript code to execute"
            },
            timeout: {
              type: "number",
              description: "Optional timeout in milliseconds (default: 5000)"
            },
            workingDir: {
              type: "string",
              description: "Optional working directory override"
            }
          },
          required: ["code"]
        }
      }
    ],
  };
};

// Execute code function - simplified to pipe code into Node instead of using temp files
const executeCode = async (code, timeout = 5000, customWorkingDir = null) => {
  const startTime = Date.now();
  const executionWorkingDir = customWorkingDir || workingDir;
  
  try {
    return new Promise((resolve) => {
      // Spawn Node.js process with stdin piping instead of a temp file
      const nodeProcess = spawn('node', ['--input-type=module'], { 
        cwd: executionWorkingDir,
        timeout,
        env: process.env
      });
      
      let stdout = '';
      let stderr = '';
      
      nodeProcess.stdout.on('data', (data) => {
        stdout += data;
      });
      
      nodeProcess.stderr.on('data', (data) => {
        stderr += data;
      });
      
      nodeProcess.on('close', (code) => {
        // Calculate execution time
        const executionTimeMs = Date.now() - startTime;
        
        resolve({
          success: code === 0,
          stdout,
          stderr,
          executionTimeMs,
          code
        });
      });
      
      nodeProcess.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
          executionTimeMs: Date.now() - startTime
        });
      });
      
      // Write code to stdin and close
      nodeProcess.stdin.write(code);
      nodeProcess.stdin.end();
    });
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};

// Handle code execution requests
const callToolHandler = async (request) => {
  try {
    const { name, arguments: args = {} } = request.params;
    
    if (name === 'execute' || name === 'mcp_mcp_repl_execute') {
      const { code, timeout = 5000, workingDir: customWorkingDir = null } = args;
      
      if (!code) {
        throw new Error("Missing code argument for execute tool");
      }
      
      // Execute the code with Node.js
      const result = await executeCode(code, timeout, customWorkingDir);
      
      // Create content array with output
      const outputLines = [];
      
      // Add stdout if any
      if (result.stdout) {
        outputLines.push({
          type: 'text',
          text: result.stdout.trim()
        });
      }
      
      // Add stderr if any
      if (result.stderr) {
        outputLines.push({
          type: 'text',
          text: `ERROR: ${result.stderr.trim()}`
        });
      }
      
      // Add error message if execution failed
      if (!result.success && result.error) {
        outputLines.push({
          type: 'text',
          text: `ERROR: ${result.error}`
        });
      }
      
      // Add execution summary
      outputLines.push({
        type: 'text',
        text: `Execution completed in ${result.executionTimeMs}ms with exit code ${result.code || 0}`
      });
      
      return {
        content: outputLines
      };
    }
    
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `ERROR: ${error.message}`
        }
      ]
    };
  }
};

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, listToolsHandler);
server.setRequestHandler(CallToolRequestSchema, callToolHandler);

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error(`UNCAUGHT EXCEPTION: ${err.message}`);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error(`UNHANDLED REJECTION: ${reason}`);
});

// Start the server
async function main() {
  try {
    // Create transport and connect
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    
    console.error('Direct Node.js executor server started. Waiting for MCP requests...');
  } catch (error) {
    console.error(`Error starting server: ${error.message}`);
    process.exit(1);
  }
}

// Run the server
main(); 
