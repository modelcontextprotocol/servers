/**
 * Visualization Module for Sequential Thinking
 * 
 * This module adds visualization capabilities to the Sequential Thinking server.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import types
export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  // Chain of Thought specific fields
  isChainOfThought?: boolean;
  isHypothesis?: boolean;
  isVerification?: boolean;
  chainOfThoughtStep?: number;
  totalChainOfThoughtSteps?: number;
  // Enhanced fields
  confidenceLevel?: number;
  hypothesisId?: string;
  mergeBranchId?: string;
  mergeBranchPoint?: number;
  validationStatus?: 'valid' | 'invalid' | 'uncertain';
  validationReason?: string;
}

export interface SessionData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thoughtHistory: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
}

/**
 * Generates a Mermaid flowchart representation of a thought process
 */
export function generateMermaidFlowchart(
  thoughtHistory: ThoughtData[],
  branches: Record<string, ThoughtData[]>
): string {
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
 */
export function generateD3Json(
  thoughtHistory: ThoughtData[],
  branches: Record<string, ThoughtData[]>
): any {
  const nodes: any[] = [];
  const links: any[] = [];
  
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

/**
 * Define the visualization tool
 */
export const VISUALIZATION_TOOL: Tool = {
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
 */
export async function handleVisualizationRequest(
  args: any,
  sessionsDir: string,
  currentSessionId: string,
  thoughtHistory: ThoughtData[],
  branches: Record<string, ThoughtData[]>
) {
  // Validate arguments
  if (!args.format) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Missing required parameter: format"
    );
  }
  
  // Check if the format is valid
  if (!["mermaid", "json"].includes(args.format)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid format. Must be one of: mermaid, json"
    );
  }
  
  try {
    let sessionData: SessionData;
    
    // If a session ID is provided, load that session
    if (args.sessionId && args.sessionId !== currentSessionId) {
      const sessionFilePath = path.join(sessionsDir, `${args.sessionId}.json`);
      if (!fs.existsSync(sessionFilePath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Session not found: ${args.sessionId}`
        );
      }
      
      sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8')) as SessionData;
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
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unsupported format: ${args.format}`
        );
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
    throw new McpError(
      ErrorCode.InternalError,
      `Error generating visualization: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
