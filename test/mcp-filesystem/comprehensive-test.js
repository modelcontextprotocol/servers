#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Configuration
const testDir = './test/mcp-filesystem/test-files';
const serverPath = './src/filesystem/index.ts';

// Test operations
const testOperations = [
  {
    name: 'create_directory',
    args: { path: 'test-dir' }
  },
  {
    name: 'write_file',
    args: {
      path: 'test-dir/test.txt',
      content: 'Hello, MCP!'
    }
  },
  {
    name: 'read_file',
    args: { path: 'test-dir/test.txt' }
  },
  {
    name: 'list_directory',
    args: { path: 'test-dir' }
  },
  {
    name: 'get_file_info',
    args: { path: 'test-dir/test.txt' }
  }
];

async function runTests() {
  // Create test directory
  await mkdir(testDir, { recursive: true });

  // Start the MCP filesystem server
  const server = spawn('node', [serverPath, testDir], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Create readline interface for reading server output
  const rl = createInterface({
    input: server.stdout,
    output: process.stdout
  });

  // Handle server errors
  server.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });

  // Handle server exit
  server.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
  });

  // Handle server responses
  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      console.log('Server response:', response);
    } catch (error) {
      console.error('Error parsing server response:', error);
    }
  });

  // Run test operations
  for (const operation of testOperations) {
    const request = {
      type: 'call_tool',
      params: {
        name: operation.name,
        arguments: operation.args
      }
    };

    console.log(`\nExecuting operation: ${operation.name}`);
    server.stdin.write(`${JSON.stringify(request)}\n`);

    // Add a small delay between operations
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Cleanup on exit
  process.on('SIGINT', () => {
    server.kill();
    process.exit();
  });
}

runTests().catch(console.error);