#!/usr/bin/env node

// Simple test script for the decision tree visualization
const { spawn } = require('child_process');

// Test data: simulate a thinking session with multiple thoughts
const testThoughts = [
  {
    "thought": "I need to analyze the architecture options for this system",
    "thoughtNumber": 1,
    "totalThoughts": 5,
    "nextThoughtNeeded": true,
    "confidence": 0.4,
    "tags": ["architecture", "analysis"],
    "evidence": ["Initial requirements gathered"],
    "assumptions": ["System will have moderate traffic", "Team has React experience"]
  },
  {
    "thought": "Let me evaluate microservices vs monolith approach",
    "thoughtNumber": 2,
    "totalThoughts": 5,
    "nextThoughtNeeded": true,
    "confidence": 0.7,
    "tags": ["architecture", "decision"],
    "evidence": ["Team size is small", "Deployment complexity matters", "Performance requirements defined"],
    "assumptions": ["Deployment resources are limited"],
    "references": [1]
  },
  {
    "thought": "Monolith seems better for our small team and quick deployment needs",
    "thoughtNumber": 3,
    "totalThoughts": 5,
    "nextThoughtNeeded": true,
    "confidence": 0.8,
    "tags": ["architecture", "decision", "monolith"],
    "evidence": ["Small team size", "Fast deployment priority", "Simple monitoring needs"],
    "assumptions": ["Team can handle monolith complexity"],
    "references": [2]
  },
  {
    "thought": "But I should consider the alternative of starting monolith and splitting later",
    "thoughtNumber": 4,
    "totalThoughts": 5,
    "nextThoughtNeeded": true,
    "confidence": 0.6,
    "tags": ["architecture", "alternative", "strategy"],
    "evidence": ["Evolution path exists", "Many successful examples"],
    "assumptions": ["Future scaling needs are predictable", "Refactoring effort is manageable"],
    "references": [2, 3],
    "branchFromThought": 3,
    "branchId": "alternative-path"
  },
  {
    "thought": "Given our constraints, I recommend starting with a modular monolith",
    "thoughtNumber": 5,
    "totalThoughts": 5,
    "nextThoughtNeeded": false,
    "confidence": 0.9,
    "tags": ["architecture", "recommendation", "final"],
    "evidence": ["Balances simplicity with future flexibility", "Proven approach for similar teams"],
    "assumptions": ["Team commitment to modular design"],
    "references": [3, 4]
  }
];

function runTest() {
  console.log('Testing Sequential Thinking Decision Tree Visualization...\n');
  
  // Start the server
  const server = spawn('node', ['dist/index.js'], {
    cwd: '/home/rpm/claude/mcp-servers/src/sequentialthinking',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let responses = [];
  let currentStep = 0;

  server.stdout.on('data', (data) => {
    try {
      const response = JSON.parse(data.toString());
      responses.push(response);
      
      if (currentStep < testThoughts.length) {
        // Send next thought
        const request = {
          jsonrpc: "2.0",
          id: currentStep + 1,
          method: "tools/call",
          params: {
            name: "sequentialthinking",
            arguments: testThoughts[currentStep]
          }
        };
        
        server.stdin.write(JSON.stringify(request) + '\n');
        currentStep++;
      } else if (currentStep === testThoughts.length) {
        // Now test the visualization
        const vizRequest = {
          jsonrpc: "2.0",
          id: currentStep + 1,
          method: "tools/call",
          params: {
            name: "visualize_decision_tree",
            arguments: {
              outputFormat: "both",
              showEvidence: true
            }
          }
        };
        
        server.stdin.write(JSON.stringify(vizRequest) + '\n');
        currentStep++;
      } else {
        // Test complete, show results
        console.log('Visualization Result:');
        console.log(JSON.stringify(response, null, 2));
        server.kill();
      }
    } catch (e) {
      // Ignore non-JSON output (like server startup messages)
    }
  });

  server.stderr.on('data', (data) => {
    const output = data.toString();
    if (!output.includes('running on stdio')) {
      console.error('Server error:', output);
    }
  });

  server.on('close', (code) => {
    console.log(`\nTest completed with code ${code}`);
    process.exit(code);
  });

  // Start by sending the initial handshake
  const initRequest = {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };
  
  server.stdin.write(JSON.stringify(initRequest) + '\n');
}

runTest();