#!/usr/bin/env node

/**
 * Test script for the Sequential Thinking server MCP protocol
 * 
 * This script sends MCP requests to the server to test the sequential thinking
 * and visualization tools.
 */

import readline from 'readline';

// Create readline interface for stdin/stdout
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to send a request to the server
function sendRequest(request) {
  console.log(`Sending request: ${JSON.stringify(request)}`);
  process.stdout.write(JSON.stringify(request) + '\n');
}

// Function to create a sequential thinking request
function createSequentialThinkingRequest(thought, thoughtNumber, totalThoughts, nextThoughtNeeded) {
  return {
    jsonrpc: '2.0',
    id: 1,
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
    id: 2,
    method: 'call_tool',
    params: {
      name: 'visualize_thinking',
      arguments: {
        format
      }
    }
  };
}

// Function to list available tools
function createListToolsRequest() {
  return {
    jsonrpc: '2.0',
    id: 3,
    method: 'list_tools',
    params: {}
  };
}

// Create some thoughts
const thoughts = [
  {
    thought: 'This is the first thought in our MCP test.',
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

// Listen for responses from the server
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('Received response:');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('Error parsing response:', error);
  }
});

// Start the test
console.log('Starting MCP test...');

// First, list the available tools
sendRequest(createListToolsRequest());

// Wait for user input before sending the first thought
rl.question('Press Enter to send the first thought...', () => {
  sendRequest(createSequentialThinkingRequest(
    thoughts[0].thought,
    thoughts[0].thoughtNumber,
    thoughts[0].totalThoughts,
    thoughts[0].nextThoughtNeeded
  ));
  
  // Wait for user input before sending the second thought
  rl.question('Press Enter to send the second thought...', () => {
    sendRequest(createSequentialThinkingRequest(
      thoughts[1].thought,
      thoughts[1].thoughtNumber,
      thoughts[1].totalThoughts,
      thoughts[1].nextThoughtNeeded
    ));
    
    // Wait for user input before sending the third thought
    rl.question('Press Enter to send the third thought...', () => {
      sendRequest(createSequentialThinkingRequest(
        thoughts[2].thought,
        thoughts[2].thoughtNumber,
        thoughts[2].totalThoughts,
        thoughts[2].nextThoughtNeeded
      ));
      
      // Wait for user input before sending the visualization request
      rl.question('Press Enter to send the visualization request...', () => {
        sendRequest(createVisualizationRequest('mermaid'));
        
        // Wait for user input before exiting
        rl.question('Press Enter to exit...', () => {
          rl.close();
          process.exit(0);
        });
      });
    });
  });
});
