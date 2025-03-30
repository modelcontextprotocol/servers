#!/usr/bin/env node

/**
 * Test script for the visualization feature in the Sequential Thinking server
 * 
 * This script directly tests the visualization module in the server.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the visualization functions
import { generateMermaidFlowchart, generateD3Json } from './visualization.js';

// We don't need to import these types since they're just for TypeScript
// and we're using JavaScript directly

// Create a test session
const sessionId = 'test-session-' + Math.random().toString(36).substring(2, 15);
const sessionName = 'Test Session';
const createdAt = new Date().toISOString();
const updatedAt = new Date().toISOString();

// Create some thoughts
const thoughtHistory = [
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
    nextThoughtNeeded: true,
    isChainOfThought: true,
    chainOfThoughtStep: 1,
    totalChainOfThoughtSteps: 2
  },
  {
    thought: 'This is the final thought with a conclusion.',
    thoughtNumber: 3,
    totalThoughts: 3,
    nextThoughtNeeded: false,
    isChainOfThought: true,
    isHypothesis: true,
    chainOfThoughtStep: 2,
    totalChainOfThoughtSteps: 2,
    confidenceLevel: 90
  }
];

// Create branches
const branches = {};

// Create the session data
const sessionData = {
  id: sessionId,
  name: sessionName,
  createdAt,
  updatedAt,
  thoughtHistory,
  branches
};

// Save the session to a file
const saveDir = path.join(os.homedir(), '.sequential-thinking');
if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir, { recursive: true });
}

const sessionFilePath = path.join(saveDir, `${sessionId}.json`);
fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
console.log(`Session saved to: ${sessionFilePath}`);

// Generate visualizations
console.log('Generating Mermaid flowchart...');
const mermaidFlowchart = generateMermaidFlowchart(thoughtHistory, branches);
console.log(mermaidFlowchart);

console.log('\nGenerating D3.js JSON...');
const d3Json = generateD3Json(thoughtHistory, branches);
console.log(JSON.stringify(d3Json, null, 2));

// Save visualizations to files
const outputDir = path.join(saveDir, 'visualizations');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const mermaidPath = path.join(outputDir, `${sessionId}-flowchart.md`);
fs.writeFileSync(mermaidPath, mermaidFlowchart);
console.log(`Mermaid flowchart saved to: ${mermaidPath}`);

const jsonPath = path.join(outputDir, `${sessionId}-graph.json`);
fs.writeFileSync(jsonPath, JSON.stringify(d3Json, null, 2));
console.log(`D3.js JSON saved to: ${jsonPath}`);

console.log('\nTest completed successfully!');
