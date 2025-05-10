#!/usr/bin/env node
// Direct Node.js executor server entry point
// This script provides a direct Node.js execution environment that properly supports imports

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the working directory from command line or use current directory
const workingDir = process.argv[2] || process.cwd();

console.log(`Starting direct Node.js executor with working directory: ${workingDir}`);

// Spawn the server process
const serverProcess = spawn('node', ['src/direct-executor-server.js', workingDir], {
  stdio: 'inherit',
  cwd: __dirname
});

// Handle process events
serverProcess.on('error', (err) => {
  console.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});

// Forward exit signals
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGTERM');
});

serverProcess.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
}); 