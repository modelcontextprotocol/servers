#!/usr/bin/env node

/**
 * Simple test script for the Sequential Thinking server MCP protocol
 * 
 * This script sends MCP requests to the server to test the sequential thinking
 * and visualization tools without requiring user interaction.
 */

// Function to send a request to the server
function sendRequest(request) {
  console.log(`Sending request: ${JSON.stringify(request, null, 2)}`);
  process.stdout.write(JSON.stringify(request) + '\n');
}

// Function to create a sequential thinking request
function createSequentialThinkingRequest(thought, thoughtNumber, totalThoughts, nextThoughtNeeded) {
  return {
    jsonrpc: '2.0',
    id: thoughtNumber,
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
    id: 4,
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
    id: 0,
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
process.stdin.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString().trim());
    console.log('Received response:');
    console.log(JSON.stringify(response, null, 2));
    
    // Process the response based on the request ID
    if (response.id === 0) {
      // Response to list_tools request
      console.log('Available tools:');
      response.result.tools.forEach(tool => {
        console.log(`- ${tool.name}: ${tool.description}`);
      });
      
      // Send the first thought
      setTimeout(() => {
        sendRequest(createSequentialThinkingRequest(
          thoughts[0].thought,
          thoughts[0].thoughtNumber,
          thoughts[0].totalThoughts,
          thoughts[0].nextThoughtNeeded
        ));
      }, 1000);
    } else if (response.id === 1) {
      // Response to first thought
      console.log('First thought processed.');
      
      // Send the second thought
      setTimeout(() => {
        sendRequest(createSequentialThinkingRequest(
          thoughts[1].thought,
          thoughts[1].thoughtNumber,
          thoughts[1].totalThoughts,
          thoughts[1].nextThoughtNeeded
        ));
      }, 1000);
    } else if (response.id === 2) {
      // Response to second thought
      console.log('Second thought processed.');
      
      // Send the third thought
      setTimeout(() => {
        sendRequest(createSequentialThinkingRequest(
          thoughts[2].thought,
          thoughts[2].thoughtNumber,
          thoughts[2].totalThoughts,
          thoughts[2].nextThoughtNeeded
        ));
      }, 1000);
    } else if (response.id === 3) {
      // Response to third thought
      console.log('Third thought processed.');
      
      // Send the visualization request
      setTimeout(() => {
        sendRequest(createVisualizationRequest('mermaid'));
      }, 1000);
    } else if (response.id === 4) {
      // Response to visualization request
      console.log('Visualization generated:');
      console.log(response.result.content[0].text);
      
      // Exit after a short delay
      setTimeout(() => {
        console.log('Test completed successfully!');
        process.exit(0);
      }, 1000);
    }
  } catch (error) {
    console.error('Error processing response:', error);
  }
});

// Start the test
console.log('Starting simple MCP test...');

// First, list the available tools
sendRequest(createListToolsRequest());
