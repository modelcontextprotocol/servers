/**
 * Visualization Module for Sequential Thinking
 * 
 * This module provides functions to generate visual representations of thought processes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Define the visualization tool
export const VISUALIZATION_TOOL = {
  name: "visualize_thinking",
  description: "Generate visual representations of sequential thinking processes",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "ID of the session to visualize (optional, defaults to current session)"
      },
      format: {
        type: "string",
        description: "Visualization format",
        enum: ["mermaid", "json"]
      }
    },
    required: ["format"]
  }
};

/**
 * Handle visualization requests
 * @param {Object} args - The arguments for the visualization request
 * @param {string} sessionsDir - The directory where sessions are stored
 * @param {string} currentSessionId - The ID of the current session
 * @param {Array} thoughtHistory - The thought history of the current session
 * @param {Object} branches - The branches of the current session
 * @returns {Object} The visualization result
 */
export async function handleVisualizationRequest(
  args,
  sessionsDir,
  currentSessionId,
  thoughtHistory,
  branches
) {
  // Validate arguments
  if (!args.format) {
    throw new Error("Missing required parameter: format");
  }
  
  // Check if the format is valid
  if (!["mermaid", "json"].includes(args.format)) {
    throw new Error("Invalid format. Must be one of: mermaid, json");
  }
  
  try {
    let sessionData;
    
    // If a session ID is provided, load that session
    if (args.sessionId && args.sessionId !== currentSessionId) {
      const sessionFilePath = path.join(sessionsDir, `${args.sessionId}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        throw new Error(`Session not found: ${args.sessionId}`);
      }
      
      sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
    } else {
      // Use the current session
      sessionData = {
        id: currentSessionId,
        name: `Session ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        thoughtHistory,
        branches
      };
    }
    
    // Generate the visualization based on the requested format
    let visualization = "";
    
    switch (args.format) {
      case "mermaid":
        visualization = generateMermaidFlowchart(sessionData.thoughtHistory, sessionData.branches);
        break;
      case "json":
        visualization = JSON.stringify(generateD3Json(sessionData.thoughtHistory, sessionData.branches), null, 2);
        break;
      default:
        throw new Error(`Unsupported format: ${args.format}`);
    }
    
    // Return the visualization
    return {
      content: [
        {
          type: "text",
          text: visualization
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error generating visualization: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

// Define types for reference
/**
 * @typedef {Object} ThoughtData
 * @property {string} thought - The content of the thought
 * @property {number} thoughtNumber - The number of the thought in the sequence
 * @property {number} totalThoughts - The total number of thoughts in the sequence
 * @property {boolean} nextThoughtNeeded - Whether another thought is needed
 * @property {boolean} [isRevision] - Whether this thought revises a previous thought
 * @property {number} [revisesThought] - The number of the thought being revised
 * @property {number} [branchFromThought] - The number of the thought this branches from
 * @property {string} [branchId] - The identifier for this branch
 * @property {boolean} [isChainOfThought] - Whether this thought is part of a Chain of Thought
 * @property {boolean} [isHypothesis] - Whether this thought is a hypothesis
 * @property {boolean} [isVerification] - Whether this thought is a verification
 * @property {number} [chainOfThoughtStep] - The step number in the Chain of Thought
 * @property {number} [totalChainOfThoughtSteps] - The total number of steps in the Chain of Thought
 * @property {number} [confidenceLevel] - The confidence level (0-100) for a hypothesis
 * @property {string} [hypothesisId] - The identifier for a hypothesis
 * @property {string} [mergeBranchId] - The identifier of a branch to merge with
 * @property {number} [mergeBranchPoint] - The thought number where branches merge
 * @property {string} [validationStatus] - The validation status ('valid', 'invalid', 'uncertain')
 * @property {string} [validationReason] - The reason for the validation status
 */

/**
 * Generates a Mermaid flowchart representation of a thought process
 * @param {ThoughtData[]} thoughtHistory - Array of thoughts to visualize
 * @param {Object.<string, ThoughtData[]>} branches - Record of branch IDs to branch thoughts
 * @returns {string} Mermaid flowchart diagram as a string
 */
export function generateMermaidFlowchart(thoughtHistory, branches) {
  let mermaid = 'flowchart TD\n';
  
  // Add nodes for each thought
  for (const thought of thoughtHistory) {
    const nodeId = `T${thought.thoughtNumber}`;
    let nodeLabel = `Thought ${thought.thoughtNumber}`;
    let nodeStyle = '';
    
    // Style nodes based on thought type
    if (thought.isChainOfThought) {
      if (thought.isHypothesis) {
        nodeStyle = `style ${nodeId} fill:#f9f,stroke:#333,stroke-width:2px`;
        nodeLabel = `Hypothesis ${thought.thoughtNumber}`;
        if (thought.confidenceLevel !== undefined) {
          nodeLabel += `\\nConfidence: ${thought.confidenceLevel}%`;
        }
      } else if (thought.isVerification) {
        nodeStyle = `style ${nodeId} fill:#9ff,stroke:#333,stroke-width:2px`;
        nodeLabel += '\\nVerification';
      } else {
        nodeStyle = `style ${nodeId} fill:#bbf,stroke:#333,stroke-width:1px`;
        nodeLabel += '\\nChain of Thought';
      }
    } else if (thought.isRevision) {
      nodeStyle = `style ${nodeId} fill:#ff9,stroke:#333,stroke-width:1px`;
      nodeLabel += `\\nRevision of T${thought.revisesThought}`;
    }
    
    // Add node to diagram
    mermaid += `    ${nodeId}["${nodeLabel}"]\n`;
    if (nodeStyle) {
      mermaid += `    ${nodeStyle}\n`;
    }
  }
  
  // Add connections between thoughts
  for (let i = 0; i < thoughtHistory.length; i++) {
    const thought = thoughtHistory[i];
    
    // Connect to next thought if not a branch or revision
    if (i < thoughtHistory.length - 1 && 
        !thought.branchFromThought && 
        !thoughtHistory[i + 1].branchFromThought &&
        !thoughtHistory[i + 1].isRevision) {
      mermaid += `    T${thought.thoughtNumber} --> T${thoughtHistory[i + 1].thoughtNumber}\n`;
    }
    
    // Connect revisions to original thoughts
    if (thought.isRevision && thought.revisesThought) {
      mermaid += `    T${thought.revisesThought} -.-> T${thought.thoughtNumber}\n`;
    }
    
    // Connect branches to their origin
    if (thought.branchFromThought) {
      mermaid += `    T${thought.branchFromThought} -.-> T${thought.thoughtNumber}\n`;
    }
    
    // Connect merged branches
    if (thought.mergeBranchId && thought.mergeBranchPoint) {
      mermaid += `    T${thought.thoughtNumber} -.-> T${thought.mergeBranchPoint}\n`;
    }
  }
  
  return mermaid;
}

/**
 * Generates a JSON representation of a thought process for D3.js visualization
 * @param {ThoughtData[]} thoughtHistory - Array of thoughts to visualize
 * @param {Object.<string, ThoughtData[]>} branches - Record of branch IDs to branch thoughts
 * @returns {Object} JSON object for D3.js visualization
 */
export function generateD3Json(thoughtHistory, branches) {
  const nodes = [];
  const links = [];
  
  // Create nodes for each thought
  for (const thought of thoughtHistory) {
    let nodeType = 'thought';
    if (thought.isChainOfThought) {
      if (thought.isHypothesis) {
        nodeType = 'hypothesis';
      } else if (thought.isVerification) {
        nodeType = 'verification';
      } else {
        nodeType = 'chainOfThought';
      }
    } else if (thought.isRevision) {
      nodeType = 'revision';
    } else if (thought.branchFromThought) {
      nodeType = 'branch';
    }
    
    nodes.push({
      id: `T${thought.thoughtNumber}`,
      label: `Thought ${thought.thoughtNumber}`,
      type: nodeType,
      confidence: thought.confidenceLevel,
      branchId: thought.branchId,
      data: thought
    });
  }
  
  // Create links between thoughts
  for (let i = 0; i < thoughtHistory.length; i++) {
    const thought = thoughtHistory[i];
    
    // Connect to next thought if not a branch or revision
    if (i < thoughtHistory.length - 1 && 
        !thought.branchFromThought && 
        !thoughtHistory[i + 1].branchFromThought &&
        !thoughtHistory[i + 1].isRevision) {
      links.push({
        source: `T${thought.thoughtNumber}`,
        target: `T${thoughtHistory[i + 1].thoughtNumber}`,
        type: 'sequence'
      });
    }
    
    // Connect revisions to original thoughts
    if (thought.isRevision && thought.revisesThought) {
      links.push({
        source: `T${thought.revisesThought}`,
        target: `T${thought.thoughtNumber}`,
        type: 'revision'
      });
    }
    
    // Connect branches to their origin
    if (thought.branchFromThought) {
      links.push({
        source: `T${thought.branchFromThought}`,
        target: `T${thought.thoughtNumber}`,
        type: 'branch'
      });
    }
    
    // Connect merged branches
    if (thought.mergeBranchId && thought.mergeBranchPoint) {
      links.push({
        source: `T${thought.thoughtNumber}`,
        target: `T${thought.mergeBranchPoint}`,
        type: 'merge'
      });
    }
  }
  
  return { nodes, links };
}
