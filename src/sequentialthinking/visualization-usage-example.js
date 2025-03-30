#!/usr/bin/env node

/**
 * Example usage of the Sequential Thinking Visualization features
 * 
 * This script demonstrates how to use the visualization capabilities
 * to generate visual representations of sequential thinking processes.
 * 
 * To run this example:
 * 1. Start the Sequential Thinking server with visualization capabilities
 * 2. Run this script with Node.js
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateMermaidFlowchart, generateD3Json, generateVisualizationHtml } from './visualization-example.js';

// Path to the Sequential Thinking sessions directory
const SESSIONS_DIR = path.join(os.homedir(), '.sequential-thinking');

// Function to list available sessions
function listSessions() {
  console.log('Available Sessions:');
  
  const files = fs.readdirSync(SESSIONS_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const filePath = path.join(SESSIONS_DIR, file);
        const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`- ${sessionData.id}: ${sessionData.name} (Created: ${new Date(sessionData.createdAt).toLocaleString()})`);
      } catch (error) {
        console.error(`Error reading session file ${file}: ${error.message}`);
      }
    }
  }
}

// Function to visualize a session
function visualizeSession(sessionId, format, outputPath) {
  // Load the session data
  const sessionFilePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(sessionFilePath)) {
    console.error(`Session not found: ${sessionId}`);
    return;
  }
  
  try {
    const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
    
    // Generate the visualization based on the requested format
    let visualization;
    
    switch (format) {
      case 'html':
        visualization = generateVisualizationHtml(sessionData);
        break;
      case 'mermaid':
        visualization = generateMermaidFlowchart(sessionData.thoughtHistory, sessionData.branches);
        break;
      case 'json':
        visualization = JSON.stringify(generateD3Json(sessionData.thoughtHistory, sessionData.branches), null, 2);
        break;
      default:
        console.error(`Invalid format: ${format}. Must be one of: html, mermaid, json`);
        return;
    }
    
    // Save the visualization to a file if an output path is provided
    if (outputPath) {
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, visualization);
      console.log(`Visualization saved to: ${outputPath}`);
    } else {
      // Print the visualization to the console (except for HTML which would be too large)
      if (format !== 'html') {
        console.log(visualization);
      } else {
        console.log('HTML visualization generated. Please provide an output path to save it.');
      }
    }
  } catch (error) {
    console.error(`Error generating visualization: ${error.message}`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
Sequential Thinking Visualization Example

Usage:
  node visualization-usage-example.js list
  node visualization-usage-example.js visualize <sessionId> <format> [outputPath]

Commands:
  list                        List available sessions
  visualize                   Generate a visualization for a session

Arguments:
  sessionId                   ID of the session to visualize
  format                      Visualization format (html, mermaid, json)
  outputPath                  Path to save the visualization output (optional)

Examples:
  node visualization-usage-example.js list
  node visualization-usage-example.js visualize abc123 html ./visualization.html
  node visualization-usage-example.js visualize abc123 mermaid ./visualization.md
  node visualization-usage-example.js visualize abc123 json ./visualization.json
  `);
} else if (command === 'list') {
  listSessions();
} else if (command === 'visualize') {
  const sessionId = args[1];
  const format = args[2];
  const outputPath = args[3];
  
  if (!sessionId || !format) {
    console.error('Missing required arguments: sessionId and format');
    process.exit(1);
  }
  
  visualizeSession(sessionId, format, outputPath);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
