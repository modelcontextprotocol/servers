#!/usr/bin/env node

/**
 * Test script for the visualization tool in the Sequential Thinking server
 * 
 * This script uses the MCP protocol to communicate with the Sequential Thinking server
 * and test the visualization tool.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the path to the Sequential Thinking server
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Define the MCP messages
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'list_tools',
  params: {}
};

// Function to create a sequential thinking request
function createSequentialThinkingRequest(thought, thoughtNumber, totalThoughts, nextThoughtNeeded) {
  return {
    jsonrpc: '2.0',
    id: 2,
    method: 'call_tool',
    params: {
      name: 'sequentialthinking',
      arguments: {
        thought,
        thoughtNumber,
        totalThoughts,
        nextThoughtNeeded
      }
    }
  };
}

// Function to create a visualization request
function createVisualizationRequest(format) {
  return {
    jsonrpc: '2.0',
    id: 3,
    method: 'call_tool',
    params: {
      name: 'visualize_thinking',
      arguments: {
        format
      }
    }
  };
}

// Function to run the test
async function runTest() {
  // Start the Sequential Thinking server
  console.log('Starting Sequential Thinking server...');
  const server = spawn('node', [serverPath]);
  
  // Create readline interface for server communication
  const rl = createInterface({
    input: server.stdout,
    output: server.stdin,
    terminal: false
  });
  
  // Handle server output
  server.stderr.on('data', (data) => {
    console.log(`Server: ${data.toString()}`);
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send list_tools request
  console.log('Sending list_tools request...');
  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
  
  // Wait for response
  const listToolsResponse = await new Promise(resolve => {
    rl.once('line', (line) => {
      resolve(JSON.parse(line));
    });
  });
  
  console.log('List tools response:');
  console.log(JSON.stringify(listToolsResponse, null, 2));
  
  // Check if the visualization tool is available
  const tools = listToolsResponse.result.tools;
  const visualizationTool = tools.find(tool => tool.name === 'visualize_thinking');
  
  if (!visualizationTool) {
    console.error('Visualization tool not found!');
    server.kill();
    process.exit(1);
  }
  
  console.log('Visualization tool found!');
  
  // Create some thoughts
  const thoughts = [
    {
      thought: 'This is the first thought in our test process.',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true
    },
    {
      thought: 'This is the second thought with some analysis.',
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true
    },
    {
      thought: 'This is the final thought with a conclusion.',
      thoughtNumber: 3,
      totalThoughts: 3,
      nextThoughtNeeded: false
    }
  ];
  
  // Send thoughts to the server
  for (const thought of thoughts) {
    console.log(`Sending thought ${thought.thoughtNumber}...`);
    const request = createSequentialThinkingRequest(
      thought.thought,
      thought.thoughtNumber,
      thought.totalThoughts,
      thought.nextThoughtNeeded
    );
    
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Wait for response
    const response = await new Promise(resolve => {
      rl.once('line', (line) => {
        resolve(JSON.parse(line));
      });
    });
    
    console.log(`Thought ${thought.thoughtNumber} response:`);
    console.log(JSON.stringify(response, null, 2));
  }
  
  // Send visualization request
  console.log('Sending visualization request...');
  const visualizationRequest = createVisualizationRequest('mermaid');
  server.stdin.write(JSON.stringify(visualizationRequest) + '\n');
  
  // Wait for response
  const visualizationResponse = await new Promise(resolve => {
    rl.once('line', (line) => {
      resolve(JSON.parse(line));
    });
  });
  
  console.log('Visualization response:');
  console.log(JSON.stringify(visualizationResponse, null, 2));
  
  // Save the visualization to a file
  const outputDir = path.join(os.homedir(), '.sequential-thinking', 'visualizations');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, 'test-tool-flowchart.md');
  fs.writeFileSync(outputPath, visualizationResponse.result.content[0].text);
  console.log(`Visualization saved to: ${outputPath}`);
  
  // Close the server
  console.log('Test completed. Closing server...');
  server.kill();
}

// Run the test
runTest().catch(error => {
  console.error('Error running test:', error);
  process.exit(1);
});
