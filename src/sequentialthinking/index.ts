#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Get the directory path of the current module and load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { getEmbeddings } from './embeddings.js';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { ThoughtData, ClaudeResponse, OptimizedPrompt } from './types.js';
import { PromptOptimizer } from './prompt-optimizer.js';
import fetch, { Response } from 'node-fetch';
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
// Fixed chalk import for ESM
import { ChalkInstance } from 'chalk';
import chalk from 'chalk';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Define directories for saving thought processes and templates
const SAVE_DIR = path.join(os.homedir(), '.sequential-thinking');
const TEMPLATE_DIR = path.join(SAVE_DIR, 'templates');

// Ensure the save directory exists
if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

// ThoughtData interface is imported from types.ts

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

   // Call Gemini API via OpenRouter
   private async callGeminiAPI(prompt: string): Promise<any> {
     const apiKey = process.env.OPENROUTER_API_KEY;
     if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          'model': 'google/gemini-2.5-pro-exp-03-25:free', 
          'messages': [
            { 'role': 'user', 'content': prompt }
          ],
          'max_tokens': 5000,
        }),
      });

      const data = await response.json() as ClaudeResponse;
      const text = data.choices[0]?.message?.content ?? 'No content in response';
      return { analysis: text.trim() };
    } catch (error) {
       return { analysis: `Gemini API call failed: ${error instanceof Error ? error.message : String(error)}` };
     }
   }

   // Call Claude API via OpenRouter
   private async callClaudeAPI(prompt: string): Promise<any> {
     const apiKey = process.env.OPENROUTER_API_KEY;
     if (!apiKey) {
       throw new Error('OPENROUTER_API_KEY environment variable is required');
     }

     try {
       const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${apiKey}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           'model': 'anthropic/claude-3.7-sonnet', // Target Claude model
           'messages': [
             { 'role': 'user', 'content': prompt }
           ],
           'max_tokens': 3000, // Adjust as needed for Claude
         }),
       });

       const data = await response.json() as ClaudeResponse;
       const text = data.choices[0]?.message?.content ?? 'No content in response';
       return { analysis: text.trim() };
     } catch (error) {
       return { analysis: `Claude API call failed: ${error instanceof Error ? error.message : String(error)}` };
     }
   }

   // Generate structured analysis from Claude's response
   private generateAnalysis(thought: ThoughtData, optimizedPrompt: OptimizedPrompt | undefined, claudeAnalysis: string): { keyPoints: string; claudeAnalysis: string; metrics: { originalTokens: number; optimizedTokens: number; compressionRatio: string; } } {
     // Use the original thought for Key Points
    const keyPoints = thought.thought; 
    const originalTokens = optimizedPrompt ? optimizedPrompt.compressionStats.originalTokens : this.estimateTokens(thought.thought);
    const optimizedTokens = optimizedPrompt ? optimizedPrompt.compressionStats.optimizedTokens : this.estimateTokens(thought.thought);
    const compressionRatio = optimizedPrompt ? (optimizedPrompt.compressionStats.compressionRatio).toFixed(1) : "0";

    return {
      keyPoints: keyPoints,
      claudeAnalysis: claudeAnalysis, // Raw analysis from Claude
      metrics: {
        originalTokens: originalTokens,
        optimizedTokens: optimizedTokens,
        compressionRatio: `${compressionRatio}%`
      }
    };
  }

  private estimateTokens(text: string): number {
    // Extremely simple token estimation: return character count divided by 4
    const chars = text ? text.length : 0;
     return Math.max(1, Math.ceil(chars / 4));
   }

   public async processThought(
     input: unknown, 
     disableEmbeddings: boolean = false, 
     dynamicContextWindowSize?: number,
     // Add IDE context parameters
     fileStructure?: string, 
     openFiles?: string[] 
   ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
     console.log("Entering processThought function"); // Added debug log
     try {
       const validatedInput = this.validateThoughtData(input);

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      let embeddings: number[] | null = null;
      if (disableEmbeddings) {
        // Get embeddings for the thought
        embeddings = await getEmbeddings(validatedInput.thought);
        console.log("Generated embeddings:", embeddings);
       }

       // Process with PromptOptimizer, passing dynamic context size and IDE context
       const optimizedPrompt = PromptOptimizer.optimizeThought(
         validatedInput, 
         this.thoughtHistory, 
         dynamicContextWindowSize,
         fileStructure, // Pass file structure
          openFiles      // Pass open files
        );
       
       // --- Stage 1: Call Gemini ---
       let geminiPrompt = optimizedPrompt.prompt;
       let geminiResponse = await this.callGeminiAPI(geminiPrompt);
       let geminiAnalysis = geminiResponse.analysis;

       // --- Stage 2: Construct Prompt for Claude & Call Claude ---
       // Combine original thought and Gemini's analysis for Claude's context
       let claudePrompt = `
Original Thought: ${validatedInput.thought}

Gemini's Initial Analysis:
${geminiAnalysis}

Based on the original thought and Gemini's analysis, provide a final, refined analysis or response. Focus on the core request and synthesize the information.
       `.trim();
       
       let claudeResponse = await this.callClaudeAPI(claudePrompt);
       let claudeAnalysis = claudeResponse.analysis;
       let claudeTokens = this.estimateTokens(claudePrompt); // Estimate tokens for the Claude call

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
       console.error(formattedThought); // Ensure formattedThought is logged

       // Create structured analysis using Claude's final response
       const analysisDetails = this.generateAnalysis(validatedInput, optimizedPrompt, claudeAnalysis); // Use claudeAnalysis here

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
             mergeBranchPoint: validatedInput.mergeBranchPoint,
             // Include Gemini's intermediate analysis for verification
             geminiAnalysis: geminiAnalysis, 
             // Structured Claude analysis
             analysisDetails: analysisDetails,
             enhancementRatio: analysisDetails.metrics.compressionRatio,
             claudeTokens: claudeTokens
           }, null, 2)
        }]
      };
    } catch (error) {
      console.error("Error processing thought:", error);
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
- Supports explicit Chain of Thought reasoning with dedicated steps`,
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
      },
      // Add dynamicContextWindowSize to the schema
      dynamicContextWindowSize: {
        type: "integer",
        description: "Optional dynamic context window size for analysis",
        minimum: 1
      },
      // Add IDE context parameters
      fileStructure: {
        type: "string",
        description: "Optional JSON string representing the file structure of the relevant project directory."
      },
      openFiles: {
        type: "array",
        description: "Optional array of strings listing the paths of currently open files in the IDE.",
        items: {
          type: "string"
        }
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
      tools: {
        [SEQUENTIAL_THINKING_TOOL.name]: SEQUENTIAL_THINKING_TOOL
      },
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
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.log("CallToolRequestSchema handler CALLED"); // Debug log - handler called
  try {
    console.log(`Tool requested: ${request.params.name}`); // Log requested tool name
    if (request.params.name === "sequentialthinking") {
      console.log("sequentialthinking tool handler logic START"); // Log before processThought call
      if (!request.params.arguments) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments for sequentialthinking"
        );
      }
       // Extract dynamicContextWindowSize and IDE context if provided
       const args = request.params.arguments as any;
       const dynamicContextWindowSize = args.dynamicContextWindowSize as number | undefined;
       const fileStructure = args.fileStructure as string | undefined;
       const openFiles = args.openFiles as string[] | undefined;
       
       const result = await thinkingServer.processThought(
         args, 
         false, 
         dynamicContextWindowSize, 
         fileStructure, // Pass file structure
         openFiles      // Pass open files
       ); 
       console.log("sequentialthinking tool handler logic END"); // Log after processThought call
       return result;
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
    console.error(`Error handling tool request for ${request.params.name}:`, error); // Error logging
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

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
