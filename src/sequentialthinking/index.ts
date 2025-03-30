#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { VISUALIZATION_TOOL, handleVisualizationRequest } from './visualization.js';
import { setupTemplateManager } from './templates.js';
import {
  LIST_TEMPLATES_TOOL,
  GET_TAGS_TOOL,
  GET_TEMPLATE_TOOL,
  CREATE_FROM_TEMPLATE_TOOL,
  SAVE_TEMPLATE_TOOL,
  DELETE_TEMPLATE_TOOL,
  handleListTemplatesRequest,
  handleGetTagsRequest,
  handleGetTemplateRequest,
  handleCreateFromTemplateRequest,
  handleSaveTemplateRequest,
  handleDeleteTemplateRequest
} from './template-tools.js';
import {
  VALIDATE_THINKING_TOOL,
  GENERATE_THOUGHT_TOOL,
  GET_COACHING_TOOL,
  GET_AI_ADVICE_TOOL,
  handleValidateThinkingRequest,
  handleGenerateThoughtRequest,
  handleGetCoachingRequest,
  handleGetAIAdviceRequest
} from './ai-tools.js';
import { preprocessForGemini } from './geminiPreprocessing.js'; // Import the new function
// Fixed chalk import for ESM
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

// Define directories for saving thought processes and templates
const SAVE_DIR = path.join(os.homedir(), '.sequential-thinking');
const TEMPLATE_DIR = path.join(SAVE_DIR, 'templates');

// Ensure the save directory exists
if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
  // Chain of Thought specific fields
  isChainOfThought?: boolean;
  isHypothesis?: boolean;
  isVerification?: boolean;
  chainOfThoughtStep?: number;
  totalChainOfThoughtSteps?: number;
  // New fields for enhancements
  confidenceLevel?: number; // 0-100 confidence level for hypotheses
  hypothesisId?: string; // For multiple hypotheses support
  mergeBranchId?: string; // For merging branches
  mergeBranchPoint?: number; // The thought number where branches merge
  validationStatus?: 'valid' | 'invalid' | 'uncertain'; // For Chain of Thought validation
  validationReason?: string; // Reason for validation status
}

// Interface for session data (for persistence)
interface SessionData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thoughtHistory: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
}

class SequentialThinkingServer {
  // Make these properties public so they can be accessed by the visualization tool
  public thoughtHistory: ThoughtData[] = [];
  public branches: Record<string, ThoughtData[]> = {};
  public sessionId: string;
  
  private sessionName: string;
  private templateManager: any;

  constructor() {
    this.thoughtHistory = [];
    this.branches = {};
    this.sessionId = this.generateSessionId();
    this.sessionName = `Session ${new Date().toLocaleString()}`;
    this.templateManager = setupTemplateManager();
  }

  /**
   * Initialize a session from a template
   */
  public initializeFromTemplate(templateId: string, parameters: Record<string, any> = {}): boolean {
    try {
      // Get thoughts from the template
      const thoughts = this.templateManager.createSessionFromTemplate(templateId, parameters);
      
      // Clear existing thoughts and branches
      this.thoughtHistory = [];
      this.branches = {};
      
      // Add template thoughts to the session
      for (const thought of thoughts) {
        this.thoughtHistory.push(thought);
      }
      
      // Save the session
      this.saveSession();
      
      return true;
    } catch (error) {
      console.error(`Error initializing from template: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    // Validate confidence level if provided
    if (data.confidenceLevel !== undefined && 
        (typeof data.confidenceLevel !== 'number' || 
         data.confidenceLevel < 0 || 
         data.confidenceLevel > 100)) {
      throw new Error('Invalid confidenceLevel: must be a number between 0 and 100');
    }

    // Validate validation status if provided
    if (data.validationStatus !== undefined && 
        !['valid', 'invalid', 'uncertain'].includes(data.validationStatus as string)) {
      throw new Error('Invalid validationStatus: must be "valid", "invalid", or "uncertain"');
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
      // Chain of Thought specific fields
      isChainOfThought: data.isChainOfThought as boolean | undefined,
      isHypothesis: data.isHypothesis as boolean | undefined,
      isVerification: data.isVerification as boolean | undefined,
      chainOfThoughtStep: data.chainOfThoughtStep as number | undefined,
      totalChainOfThoughtSteps: data.totalChainOfThoughtSteps as number | undefined,
      // New fields for enhancements
      confidenceLevel: data.confidenceLevel as number | undefined,
      hypothesisId: data.hypothesisId as string | undefined,
      mergeBranchId: data.mergeBranchId as string | undefined,
      mergeBranchPoint: data.mergeBranchPoint as number | undefined,
      validationStatus: data.validationStatus as 'valid' | 'invalid' | 'uncertain' | undefined,
      validationReason: data.validationReason as string | undefined,
    };
  }

  // Save the current session to a file
  private saveSession(): void {
    const sessionData: SessionData = {
      id: this.sessionId,
      name: this.sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thoughtHistory: this.thoughtHistory,
      branches: this.branches
    };

    const filePath = path.join(SAVE_DIR, `${this.sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
    console.error(`Session saved to ${filePath}`);
  }

  // Load a session from a file
  public loadSession(sessionId: string): boolean {
    const filePath = path.join(SAVE_DIR, `${sessionId}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`Session file not found: ${filePath}`);
      return false;
    }

    try {
      const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SessionData;
      this.sessionId = sessionData.id;
      this.sessionName = sessionData.name;
      this.thoughtHistory = sessionData.thoughtHistory;
      this.branches = sessionData.branches;
      console.error(`Session loaded from ${filePath}`);
      return true;
    } catch (error) {
      console.error(`Error loading session: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // List all saved sessions
  public listSessions(): { id: string; name: string; createdAt: string }[] {
    const sessions: { id: string; name: string; createdAt: string }[] = [];
    
    const files = fs.readdirSync(SAVE_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(SAVE_DIR, file);
          const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SessionData;
          sessions.push({
            id: sessionData.id,
            name: sessionData.name,
            createdAt: sessionData.createdAt
          });
        } catch (error) {
          console.error(`Error reading session file ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    return sessions;
  }

  // Validate Chain of Thought reasoning
  private validateChainOfThought(thought: ThoughtData): { isValid: boolean; reason: string } {
    // Simple validation: check if the thought is part of a Chain of Thought sequence
    if (!thought.isChainOfThought) {
      return { isValid: false, reason: 'Not part of a Chain of Thought sequence' };
    }

    // Check if the thought has a valid step number
    if (!thought.chainOfThoughtStep || !thought.totalChainOfThoughtSteps) {
      return { isValid: false, reason: 'Missing Chain of Thought step information' };
    }

    // Check if the step number is valid
    if (thought.chainOfThoughtStep > thought.totalChainOfThoughtSteps) {
      return { isValid: false, reason: 'Chain of Thought step number exceeds total steps' };
    }

    // More complex validation could be added here, such as checking for logical consistency
    // between steps, ensuring hypotheses are followed by verifications, etc.

    return { isValid: true, reason: 'Valid Chain of Thought step' };
  }

  // Merge branches
  private mergeBranches(sourceBranchId: string, targetBranchId: string, mergePoint: number): boolean {
    if (!this.branches[sourceBranchId] || !this.branches[targetBranchId]) {
      return false;
    }

    // Find the thought at the merge point in the target branch
    const targetThought = this.branches[targetBranchId].find(t => t.thoughtNumber === mergePoint);
    if (!targetThought) {
      return false;
    }

    // Add all thoughts from the source branch to the target branch, updating their branch ID
    for (const thought of this.branches[sourceBranchId]) {
      const mergedThought: ThoughtData = {
        ...thought,
        branchId: targetBranchId,
        mergeBranchId: sourceBranchId,
        mergeBranchPoint: mergePoint
      };
      this.branches[targetBranchId].push(mergedThought);
    }

    // Sort the target branch by thought number
    this.branches[targetBranchId].sort((a, b) => a.thoughtNumber - b.thoughtNumber);

    return true;
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { 
      thoughtNumber, 
      totalThoughts, 
      thought, 
      isRevision, 
      revisesThought, 
      branchFromThought, 
      branchId,
      isChainOfThought,
      isHypothesis,
      isVerification,
      chainOfThoughtStep,
      totalChainOfThoughtSteps,
      // New fields
      confidenceLevel,
      hypothesisId,
      mergeBranchId,
      mergeBranchPoint,
      validationStatus,
      validationReason
    } = thoughtData;

    let prefix = '';
    let context = '';
    let additionalInfo = '';

    if (isChainOfThought) {
      if (isHypothesis) {
        prefix = chalk.magenta('🧠 Hypothesis');
        context = chainOfThoughtStep && totalChainOfThoughtSteps 
          ? ` (CoT step ${chainOfThoughtStep}/${totalChainOfThoughtSteps})` 
          : '';
        
        // Add confidence level for hypotheses
        if (confidenceLevel !== undefined) {
          additionalInfo += `\n│ Confidence: ${confidenceLevel}% │`;
        }
        
        // Add hypothesis ID for multiple hypotheses
        if (hypothesisId) {
          additionalInfo += `\n│ Hypothesis ID: ${hypothesisId} │`;
        }
      } else if (isVerification) {
        prefix = chalk.cyan('✓ Verification');
        context = chainOfThoughtStep && totalChainOfThoughtSteps 
          ? ` (CoT step ${chainOfThoughtStep}/${totalChainOfThoughtSteps})` 
          : '';
        
        // Add validation status
        if (validationStatus) {
          const statusColor = 
            validationStatus === 'valid' ? chalk.green :
            validationStatus === 'invalid' ? chalk.red :
            chalk.yellow;
          
          additionalInfo += `\n│ Status: ${statusColor(validationStatus)} │`;
          
          if (validationReason) {
            additionalInfo += `\n│ Reason: ${validationReason} │`;
          }
        }
      } else {
        prefix = chalk.magenta('🔗 Chain of Thought');
        context = chainOfThoughtStep && totalChainOfThoughtSteps 
          ? ` (step ${chainOfThoughtStep}/${totalChainOfThoughtSteps})` 
          : '';
      }
    } else if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
      
      // Add merge information
      if (mergeBranchId && mergeBranchPoint) {
        additionalInfo += `\n│ Merged with branch ${mergeBranchId} at point ${mergeBranchPoint} │`;
      }
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length, additionalInfo.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │${additionalInfo}
└${border}┘`;
  }

  public async processThought(input: unknown): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> { // Make async and return Promise
    try {
      let validatedInput = this.validateThoughtData(input);

      // Preprocess the thought for Gemini (now async)
      const originalThought = validatedInput.thought;
      validatedInput.thought = await preprocessForGemini(originalThought); // Await the result

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      // Perform Chain of Thought validation if applicable
      if (validatedInput.isChainOfThought && !validatedInput.validationStatus) {
        const validation = this.validateChainOfThought(validatedInput);
        validatedInput.validationStatus = validation.isValid ? 'valid' : 'invalid';
        validatedInput.validationReason = validation.reason;
      }

      // Handle branch merging if requested
      if (validatedInput.mergeBranchId && validatedInput.branchId && validatedInput.mergeBranchPoint) {
        this.mergeBranches(
          validatedInput.mergeBranchId,
          validatedInput.branchId,
          validatedInput.mergeBranchPoint
        );
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      // Save the session after each thought
      this.saveSession();

      const formattedThought = this.formatThought(validatedInput);
      console.error(formattedThought);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber: validatedInput.thoughtNumber,
            totalThoughts: validatedInput.totalThoughts,
            nextThoughtNeeded: validatedInput.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length,
            sessionId: this.sessionId,
            sessionName: this.sessionName,
            // Include Chain of Thought specific fields in the response
            isChainOfThought: validatedInput.isChainOfThought,
            isHypothesis: validatedInput.isHypothesis,
            isVerification: validatedInput.isVerification,
            chainOfThoughtStep: validatedInput.chainOfThoughtStep,
            totalChainOfThoughtSteps: validatedInput.totalChainOfThoughtSteps,
            // Include new fields in the response
            confidenceLevel: validatedInput.confidenceLevel,
            hypothesisId: validatedInput.hypothesisId,
            validationStatus: validatedInput.validationStatus,
            validationReason: validatedInput.validationReason,
            mergeBranchId: validatedInput.mergeBranchId,
            mergeBranchPoint: validatedInput.mergeBranchPoint
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

const SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "sequentialthinking",
  description: `A detailed tool for dynamic and reflective problem-solving through thoughts and chain of thought reasoning.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out
- When explicit chain of thought reasoning would be beneficial

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis with confidence levels
- Supports multiple competing hypotheses
- Verifies the hypothesis based on the Chain of Thought steps
- Validates Chain of Thought reasoning automatically
- Supports merging branches for complex problem-solving
- Persists thought processes between sessions
- Repeats the process until satisfied
- Provides a correct answer
- Supports explicit Chain of Thought reasoning with dedicated steps

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
* Chain of Thought reasoning steps
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed
- is_chain_of_thought: A boolean indicating if this thought is part of a Chain of Thought sequence
- is_hypothesis: A boolean indicating if this thought is a hypothesis in the Chain of Thought
- is_verification: A boolean indicating if this thought is verifying a hypothesis in the Chain of Thought
- chain_of_thought_step: The step number in the Chain of Thought sequence
- total_chain_of_thought_steps: The total number of steps in the Chain of Thought sequence
- confidence_level: A number between 0 and 100 indicating confidence in a hypothesis
- hypothesis_id: An identifier for a specific hypothesis when working with multiple hypotheses
- merge_branch_id: The ID of a branch to merge with the current branch
- merge_branch_point: The thought number where branches should be merged
- validation_status: The validation status of a Chain of Thought step ('valid', 'invalid', or 'uncertain')
- validation_reason: The reason for the validation status

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate, with a confidence level
8. Consider multiple competing hypotheses for complex problems
9. Verify the hypothesis based on the Chain of Thought steps
10. Use explicit Chain of Thought reasoning for complex problems
11. Merge branches when different lines of thinking converge
12. Repeat the process until satisfied with the solution
13. Provide a single, ideally correct answer as the final output
14. Only set next_thought_needed to false when truly done and a satisfactory answer is reached`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current thinking step"
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought step is needed"
      },
      thoughtNumber: {
        type: "integer",
        description: "Current thought number",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total thoughts needed",
        minimum: 1
      },
      isRevision: {
        type: "boolean",
        description: "Whether this revises previous thinking"
      },
      revisesThought: {
        type: "integer",
        description: "Which thought is being reconsidered",
        minimum: 1
      },
      branchFromThought: {
        type: "integer",
        description: "Branching point thought number",
        minimum: 1
      },
      branchId: {
        type: "string",
        description: "Branch identifier"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more thoughts are needed"
      },
      // Chain of Thought specific fields
      isChainOfThought: {
        type: "boolean",
        description: "Whether this thought is part of a Chain of Thought sequence"
      },
      isHypothesis: {
        type: "boolean",
        description: "Whether this thought is a hypothesis in the Chain of Thought"
      },
      isVerification: {
        type: "boolean",
        description: "Whether this thought is verifying a hypothesis in the Chain of Thought"
      },
      chainOfThoughtStep: {
        type: "integer",
        description: "The step number in the Chain of Thought sequence",
        minimum: 1
      },
      totalChainOfThoughtSteps: {
        type: "integer",
        description: "The total number of steps in the Chain of Thought sequence",
        minimum: 1
      },
      // New fields for enhancements
      confidenceLevel: {
        type: "number",
        description: "Confidence level for a hypothesis (0-100)",
        minimum: 0,
        maximum: 100
      },
      hypothesisId: {
        type: "string",
        description: "Identifier for a specific hypothesis when working with multiple hypotheses"
      },
      mergeBranchId: {
        type: "string",
        description: "ID of a branch to merge with the current branch"
      },
      mergeBranchPoint: {
        type: "integer",
        description: "Thought number where branches should be merged",
        minimum: 1
      },
      validationStatus: {
        type: "string",
        description: "Validation status of a Chain of Thought step",
        enum: ["valid", "invalid", "uncertain"]
      },
      validationReason: {
        type: "string",
        description: "Reason for the validation status"
      }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

const server = new Server(
  {
    name: "sequential-thinking-server",
    version: "0.4.0", // Updated version to reflect new enhancements
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const thinkingServer = new SequentialThinkingServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    SEQUENTIAL_THINKING_TOOL, 
    VISUALIZATION_TOOL,
    // Template tools
    LIST_TEMPLATES_TOOL,
    GET_TAGS_TOOL,
    GET_TEMPLATE_TOOL,
    CREATE_FROM_TEMPLATE_TOOL,
    SAVE_TEMPLATE_TOOL,
    DELETE_TEMPLATE_TOOL,
    // AI tools
    VALIDATE_THINKING_TOOL,
    GENERATE_THOUGHT_TOOL,
    GET_COACHING_TOOL,
    GET_AI_ADVICE_TOOL
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "sequentialthinking") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for sequentialthinking"
        );
      }
      return thinkingServer.processThought(request.params.arguments);
    } else if (request.params.name === "visualize_thinking") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for visualize_thinking"
        );
      }
      return handleVisualizationRequest(
        request.params.arguments,
        SAVE_DIR,
        thinkingServer.sessionId,
        thinkingServer.thoughtHistory,
        thinkingServer.branches
      );
    } else if (request.params.name === "list_templates") {
      return handleListTemplatesRequest(request.params.arguments || {});
    } else if (request.params.name === "get_tags") {
      return handleGetTagsRequest();
    } else if (request.params.name === "get_template") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for get_template"
        );
      }
      return handleGetTemplateRequest(request.params.arguments);
    } else if (request.params.name === "create_from_template") {
      // Special handling for create_from_template to initialize the session
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for create_from_template"
        );
      }
      
      const args = request.params.arguments as any;
      const result = handleCreateFromTemplateRequest(args, thinkingServer);
      
      // Initialize the session from the template
      if (args.templateId) {
        thinkingServer.initializeFromTemplate(
          args.templateId,
          args.parameters || {}
        );
      }
      
      return result;
    } else if (request.params.name === "save_template") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for save_template"
        );
      }
      return handleSaveTemplateRequest(request.params.arguments);
    } else if (request.params.name === "delete_template") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for delete_template"
        );
      }
      return handleDeleteTemplateRequest(request.params.arguments);
    } 
    // AI tools
    else if (request.params.name === "validate_thinking") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for validate_thinking"
        );
      }
      return handleValidateThinkingRequest(request.params.arguments, thinkingServer);
    } else if (request.params.name === "generate_thought") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for generate_thought"
        );
      }
      return handleGenerateThoughtRequest(request.params.arguments, thinkingServer);
    } else if (request.params.name === "get_coaching") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for get_coaching"
        );
      }
      return handleGetCoachingRequest(request.params.arguments, thinkingServer);
    } else if (request.params.name === "get_ai_advice") {
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for get_ai_advice"
        );
      }
      return handleGetAIAdviceRequest(request.params.arguments, thinkingServer);
    }
  } catch (error) {
    console.error(`Error handling tool request for ${request.params.name}:`, error);
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error processing request: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unknown tool: ${request.params.name}`
  );
});

import { fileURLToPath } from 'url'; // Needed for __dirname equivalent in ESM

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runServer() {
  try {
    // Load environment variables from .env file in the project root
    const envPath = path.resolve(process.cwd(), '.env');
    console.error(`Attempting to load .env from: ${envPath}`);
    if (fs.existsSync(envPath)) {
        const result = dotenv.config({ path: envPath });
        if (result.error) {
            console.error(chalk.red(`Error loading .env file from ${envPath}:`), result.error);
        } else {
            console.error(chalk.blue(`.env file loaded successfully from ${envPath}.`));
        }
    } else {
        console.warn(chalk.yellow(`.env file not found at ${envPath}.`));
    }

    // Check for API key
    if (!process.env.OPENROUTER_API_KEY) {
      console.error(chalk.yellow("OpenRouter API key not found in environment variables. Preprocessing requiring API calls will be skipped."));
    } else {
      console.error(chalk.green("OpenRouter API key found in environment."));
    }
  } catch (err) {
      console.error(chalk.red("Critical error during environment setup:"), err);
      // Decide if the server should exit or continue with limited functionality
      // For now, let it continue but log the error prominently.
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

// Function to append API key to .env file (to be called by the agent if needed)
// Note: This function runs in the server's process.
export function saveApiKeyToEnv(apiKey: string): boolean {
  // Resolve relative to the project root (CWD)
  const envFilePath = path.resolve(process.cwd(), '.env');
  console.error(`Attempting to save API key to: ${envFilePath}`); // Log path for debugging
  // Ensure the file exists, create if not
  if (!fs.existsSync(envFilePath)) {
    fs.writeFileSync(envFilePath, ''); // Create empty file
    console.error(`Created .env file at: ${envFilePath}`);
  }

  // Check if key already exists
  const envContent = fs.readFileSync(envFilePath, 'utf8');
  if (envContent.includes('OPENROUTER_API_KEY=')) {
     console.error('OPENROUTER_API_KEY already exists in .env file. Not appending.');
     // Optionally, update the existing key here if needed
     return false; // Indicate key was not appended (as it existed)
  }

  // Append the new key
  const envLine = `\nOPENROUTER_API_KEY=${apiKey}`;
  try {
    fs.appendFileSync(envFilePath, envLine);
    console.error(`API key appended to ${envFilePath}. Restart server for changes to take effect.`);
    // Reload dotenv after appending - this affects the *current* server process
    dotenv.config({ path: envFilePath, override: true });
    console.error(`Current process OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? 'Set' : 'Not Set'}`);
    return true;
  } catch (error) {
    console.error(`Error saving API key to ${envFilePath}:`, error);
    return false;
  }
}
