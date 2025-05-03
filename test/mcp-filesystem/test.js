#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Create a test directory
const testDir = './test/mcp-filesystem/test-files';
const serverPath = './src/filesystem/index.ts';

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

// Example MCP request
const exampleRequest = {
  type: 'call_tool',
  params: {
    name: 'list_directory',
    arguments: {
      path: '.'
    }
  }
};

// Send request to server
server.stdin.write(`${JSON.stringify(exampleRequest)}\n`);

// Handle server responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('Server response:', response);
  } catch (error) {
    console.error('Error parsing server response:', error);
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  server.kill();
  process.exit();
});