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
        name: "executenodejs",
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
              description: "Optional timeout in milliseconds (default: 120000)"
            },
            workingDir: {
              type: "string",
              description: "Optional working directory override"
            }
          },
          required: ["code"]
        }
      },
      {
        name: "executedeno",
        description: "Execute JavaScript/TypeScript code with Deno - supports ESM imports and all Deno features",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript/TypeScript code to execute"
            },
            timeout: {
              type: "number",
              description: "Optional timeout in milliseconds (default: 120000)"
            },
            workingDir: {
              type: "string",
              description: "Optional working directory override"
            },
            permissions: {
              type: "array",
              description: "Optional array of Deno permissions to grant",
              items: {
                type: "string"
              }
            }
          },
          required: ["code"]
        }
      }
    ],
  };
};

// Execute code function - simplified to pipe code into Node instead of using temp files
const executeCode = async (code, timeout = 120000, customWorkingDir = null) => {
  const startTime = Date.now();
  const executionWorkingDir = customWorkingDir || workingDir;
  
  try {
    // More robust detection if the code is likely CJS or ESM
    // Look for explicit CJS markers: require, module.exports, __dirname, __filename
    const cjsMarkers = [
      'require(',
      'module.exports',
      '__dirname',
      '__filename',
      'exports.'
    ];
    
    // Check if the code contains any CJS markers
    const isCjs = cjsMarkers.some(marker => code.includes(marker));
    
    // If code is CJS, wrap it with the appropriate CommonJS wrapper
    if (isCjs) {
      // For CommonJS, create a temporary file since piping with --input-type=commonjs 
      // doesn't work reliably in all Node.js versions
      const fs = await import('fs');
      const tempDir = path.join(executionWorkingDir, 'temp');
      
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Create a unique temporary file for CJS execution
      const tempFile = path.join(tempDir, `node-exec-${Date.now()}-${Math.random().toString(36).substring(2)}.cjs`);
      
      // Write the code to the temp file
      fs.writeFileSync(tempFile, code, 'utf8');
      
      return new Promise((resolve) => {
        // Execute the file directly instead of piping for CJS
        const nodeProcess = spawn('node', [tempFile], { 
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
    } else {
      // For ESM code, continue using stdin piping
      return new Promise((resolve) => {
        // Spawn Node.js process with stdin piping for ESM
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
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};

// Execute code with Deno
const executeDenoCode = async (code, timeout = 120000, customWorkingDir = null, permissions = []) => {
  const startTime = Date.now();
  const executionWorkingDir = customWorkingDir || workingDir;
  
  try {
    // Create a temporary file for Deno execution
    const fs = await import('fs');
    const tempDir = path.join(executionWorkingDir, 'temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create a unique temporary file for Deno execution
    // Use .ts extension to allow TypeScript code
    const tempFile = path.join(tempDir, `deno-exec-${Date.now()}-${Math.random().toString(36).substring(2)}.ts`);
    
    // Write the code to the temp file
    fs.writeFileSync(tempFile, code, 'utf8');
    
    return new Promise((resolve) => {
      // Build Deno command with permissions
      const denoArgs = ['run'];
      
      // Add requested permissions
      if (permissions && permissions.length > 0) {
        permissions.forEach(perm => {
          denoArgs.push(`--allow-${perm}`);
        });
      } else {
        // Default permissions if none specified
        denoArgs.push('--allow-read');
        denoArgs.push('--allow-net');
      }
      
      // Add the temp file
      denoArgs.push(tempFile);
      
      // Execute with Deno
      const denoProcess = spawn('deno', denoArgs, { 
        cwd: executionWorkingDir,
        timeout,
        env: process.env
      });
      
      let stdout = '';
      let stderr = '';
      
      denoProcess.stdout.on('data', (data) => {
        stdout += data;
      });
      
      denoProcess.stderr.on('data', (data) => {
        stderr += data;
      });
      
      denoProcess.on('close', (code) => {
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
      
      denoProcess.on('error', (err) => {
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
    
    // Handle Node.js execution
    if (name === 'executenodejs' || name === 'execute' || name === 'mcp_mcp_repl_execute') {
      const { code, timeout = 120000, workingDir: customWorkingDir = null } = args;
      
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
    
    // Handle Deno execution
    if (name === 'executedeno' || name === 'mcp_mcp_repl_executedeno') {
      const { code, timeout = 120000, workingDir: customWorkingDir = null, permissions = [] } = args;
      
      if (!code) {
        throw new Error("Missing code argument for Deno execute tool");
      }
      
      // Execute the code with Deno
      const result = await executeDenoCode(code, timeout, customWorkingDir, permissions);
      
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
        text: `Deno execution completed in ${result.executionTimeMs}ms with exit code ${result.code || 0}`
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
