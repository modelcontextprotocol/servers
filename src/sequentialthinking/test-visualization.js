#!/usr/bin/env node

/**
 * Test script for the visualization feature
 * 
 * This script creates a simple thought process and visualizes it using the
 * visualization module.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Import the visualization functions
import { generateMermaidFlowchart, generateD3Json } from './visualization.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple thought process
const thoughtHistory = [
  {
    thought: "This is the first thought in our test process.",
    thoughtNumber: 1,
    totalThoughts: 5,
    nextThoughtNeeded: true
  },
  {
    thought: "This is a Chain of Thought reasoning step.",
    thoughtNumber: 2,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    isChainOfThought: true,
    chainOfThoughtStep: 1,
    totalChainOfThoughtSteps: 3
  },
  {
    thought: "Based on the previous reasoning, I hypothesize that the solution is X.",
    thoughtNumber: 3,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    isChainOfThought: true,
    isHypothesis: true,
    chainOfThoughtStep: 2,
    totalChainOfThoughtSteps: 3,
    confidenceLevel: 75
  },
  {
    thought: "Let's explore a different approach to this problem.",
    thoughtNumber: 4,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    branchFromThought: 2,
    branchId: "branch-1"
  },
  {
    thought: "After exploring multiple approaches, I can confidently conclude that the answer is X.",
    thoughtNumber: 5,
    totalThoughts: 5,
    nextThoughtNeeded: false
  }
];

// Create branches
const branches = {
  "branch-1": [
    {
      thought: "Let's explore a different approach to this problem.",
      thoughtNumber: 4,
      totalThoughts: 5,
      nextThoughtNeeded: true,
      branchFromThought: 2,
      branchId: "branch-1"
    }
  ]
};

// Generate visualizations
console.log("Generating Mermaid flowchart...");
const mermaidFlowchart = generateMermaidFlowchart(thoughtHistory, branches);
console.log(mermaidFlowchart);

console.log("\nGenerating D3.js JSON...");
const d3Json = generateD3Json(thoughtHistory, branches);
console.log(JSON.stringify(d3Json, null, 2));

// Save visualizations to files
const outputDir = path.join(os.homedir(), '.sequential-thinking', 'visualizations');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(path.join(outputDir, 'test-flowchart.md'), mermaidFlowchart);
fs.writeFileSync(path.join(outputDir, 'test-graph.json'), JSON.stringify(d3Json, null, 2));

console.log(`\nVisualizations saved to ${outputDir}`);
