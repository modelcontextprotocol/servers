#!/usr/bin/env node
// Simple Node.js direct executor server using MCP SDK

import * as path from 'node:path';
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js"; 
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs';
import { exec } from 'child_process';

// Get the working directory from command line or use current directory
const defaultWorkingDir = process.argv[2] 
    ? path.resolve(process.argv[2]) 
    : process.cwd();

console.log(`Starting direct executor with working directory: ${defaultWorkingDir}`);

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

// Execute code function - simplified to just execute and capture stdout/stderr
const executeCode = async (code, timeout = 5000, workingDir = defaultWorkingDir) => {
  const startTime = Date.now();
  
  // Create a temporary directory for execution
  const tempDir = path.join(workingDir, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Create a unique temporary file for execution
  const tempFile = path.join(tempDir, `node-exec-${Date.now()}-${Math.random().toString(36).substring(2)}.mjs`);
  
  try {
    // Write the code directly to the file - no wrapping
    fs.writeFileSync(tempFile, code, 'utf8');
    
    return new Promise((resolve) => {
      // Execute with Node.js and capture all output
      const nodeProcess = exec(
        `node --experimental-modules --no-warnings ${tempFile}`,
        { 
          cwd: workingDir,
          timeout,
          env: process.env
        }
      );
      
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
        
        // Clean up temporary file
        try {
          fs.unlinkSync(tempFile);
        } catch (err) {
          console.error(`Failed to clean up temporary file: ${err.message}`);
        }
        
        resolve({
          success: code === 0,
          stdout,
          stderr,
          executionTimeMs,
          code
        });
      });
      
      nodeProcess.on('error', (err) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupErr) {
          console.error(`Failed to clean up temporary file: ${cleanupErr.message}`);
        }
        
        resolve({
          success: false,
          error: err.message,
          executionTimeMs: Date.now() - startTime
        });
      });
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
      const { code, timeout = 5000, workingDir = defaultWorkingDir } = args;
      
      if (!code) {
        throw new Error("Missing code argument for execute tool");
      }
      
      // Execute the code with Node.js
      const result = await executeCode(code, timeout, workingDir);
      
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