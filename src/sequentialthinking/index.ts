#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as os from 'os';
import * as path from 'path';
import fs from 'fs';
import fetch, { Response } from 'node-fetch';
// import chalk, { ChalkInstance } from 'chalk'; // Removed unused chalk import

// Get the directory path of the current module and load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// MCP SDK Imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

// Local Module Imports
import { getEmbeddings } from './embeddings.js';
import { ThoughtData, ClaudeResponse, OptimizedPrompt, ExtendedThoughtData } from './types.js'; // Import ExtendedThoughtData as well
import { get as getConfigValue } from './config/index.js'; // Import config getter
import { callOpenRouterGemini, callOpenRouterClaude } from './api-connector.js'; // Import new API connector functions
import { SessionManagementService } from './session-management-service.js'; // Import Session Management Service
import { validateThoughtData, validateChainOfThought } from './validation.js'; // Import Validation Utilities
import { formatThoughtForConsole } from './formatting.js'; // Import Formatting Utilities
import { generateAnalysisDetails } from './analysis.js'; // Import Analysis Utilities
import { analyzeProject, formatProjectStructure } from './file-analyzer.js';
import { readOpenFiles, prepareFileContentForPrompt, OpenFileInfo } from './file-content-reader.js';
import { memorySystem } from './advanced-memory.js';
import { semanticAnalyzer } from './semantic-analyzer.js';
import { PromptOptimizer } from './prompt-optimizer.js';
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

// Define directories for saving thought processes and templates
const SAVE_DIR = path.join(os.homedir(), '.sequential-thinking');
const TEMPLATE_DIR = path.join(SAVE_DIR, 'templates');

// Ensure the save directory exists
if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

class SequentialThinkingServer {
  // Make these properties public so they can be accessed by the visualization tool
  public thoughtHistory: ThoughtData[] = [];
  public branches: Record<string, ThoughtData[]> = {};
  public sessionId: string;
   
   private sessionName: string;
   private templateManager: any;
   private sessionService: SessionManagementService; // Add service instance
 
   constructor() {
     this.thoughtHistory = [];
     this.branches = {};
     this.sessionId = this.generateSessionId();
     this.sessionName = `Session ${new Date().toLocaleString()}`;
     this.templateManager = setupTemplateManager();
     // Instantiate the session service with the correct save directory
     this.sessionService = new SessionManagementService(SAVE_DIR); 
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
      
       // Save the session using the service
       // Note: saveSession is async but we don't await it here as initializeFromTemplate is synchronous
       this.sessionService.saveSession({
         id: this.sessionId,
         name: this.sessionName,
         // createdAt and updatedAt are handled by the service
         thoughtHistory: this.thoughtHistory,
         branches: this.branches
       }).catch(err => console.error("Error saving session after template init:", err)); // Log potential error
       
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
 
   // Removed validateThoughtData method - now imported from validation.ts

   // Public method to load session using the service (if needed externally)
   public async loadSession(sessionId: string): Promise<boolean> {
      const sessionData = await this.sessionService.loadSession(sessionId);
      if (sessionData) {
          this.sessionId = sessionData.id;
          this.sessionName = sessionData.name;
          this.thoughtHistory = sessionData.thoughtHistory;
          this.branches = sessionData.branches;
          console.error(`Session ${sessionId} loaded successfully.`);
          return true;
      }
      return false;
   }
 
   // Public method to list sessions using the service (if needed externally)
   public async listSessions(): Promise<{ id: string; name: string; createdAt: string }[]> {
        return this.sessionService.listSessions();
     }
   
    // Merge branches (internal helper)
   private _mergeBranches(sourceBranchId: string, targetBranchId: string, mergePoint: number): boolean {
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
  
   // Removed formatThought method - now imported from formatting.ts

   // Removed _callGeminiAPI and _callClaudeAPI methods as they are now handled by api-connector.ts

   // Removed _generateAnalysis method - now imported from analysis.ts

   // Removed _estimateTokens method - now handled internally by analysis.ts or _executeLLMChain
   private _estimateTokens(text: string): number { // Keep this internal one for _executeLLMChain for now
    // Extremely simple token estimation: return character count divided by 4
    const chars = text ? text.length : 0;
    return Math.max(1, Math.ceil(chars / 4));
  }
 
   /**
    * Executes the dual LLM chain (Gemini -> Claude) for analysis.
      */
    private async _executeLLMChain(
      validatedInput: ThoughtData, // Original validated input for Claude prompt
       optimizedPrompt: OptimizedPrompt
     ): Promise<{ geminiAnalysis: string; claudeAnalysis: string; claudeTokens: number }> {
       // Call Gemini using imported function
       let geminiPrompt = optimizedPrompt.prompt;
       // Assuming the new functions return an object with a 'text' property like CompletionResponse
       let geminiResponse = await callOpenRouterGemini(geminiPrompt); 
       let geminiAnalysis = geminiResponse.text; // Use .text property
   
       // Construct prompt for and call Claude using imported function
     let claudePrompt = `
**Objective:** Synthesize the original thought and Gemini's initial analysis into a final, refined response. Critically evaluate Gemini's points and build upon them where appropriate, ensuring the final output directly addresses the core request of the original thought.

**Original Thought:**
${validatedInput.thought}

**Gemini's Initial Analysis:**
${geminiAnalysis}

**Your Task:**
1.  Identify the key goal or question in the "Original Thought".
2.  Review "Gemini's Initial Analysis". Does it directly address the goal? Are there gaps or areas for improvement?
3.  Provide a comprehensive and refined final analysis or response that integrates the strengths of both inputs and directly fulfills the original request. If Gemini's analysis is insufficient or off-track, prioritize addressing the original thought directly.
          `.trim();
       let claudeResponse = await callOpenRouterClaude(claudePrompt); 
       let claudeAnalysis = claudeResponse.text; // Use .text property
       let claudeTokens = this._estimateTokens(claudePrompt); // Keep using internal estimate for now
   
       return { geminiAnalysis, claudeAnalysis, claudeTokens };
   }
 
   /**
    * Initializes the thought number for the first thought or increments it based on history.
    * Also adjusts totalThoughts if necessary.
    */
   private _initializeOrIncrementThoughtNumber(thoughtData: ThoughtData): void {
     if (this.thoughtHistory.length > 0) {
       const highestThoughtNumber = Math.max(...this.thoughtHistory.map(t => t.thoughtNumber || 0));
       const mainStepMatch = thoughtData.thought?.match(/^\s*Step\s+(\d+)\.(\d+):/i);
       if (mainStepMatch) {
         const mainStep = parseInt(mainStepMatch[1]);
         const subStep = parseInt(mainStepMatch[2]);
         thoughtData.thoughtNumber = mainStep + (subStep / 10);
         console.log(`[DEBUG] Detected substep format ${mainStep}.${subStep}, using thought number ${thoughtData.thoughtNumber}`);
       } else {
         thoughtData.thoughtNumber = highestThoughtNumber + 1;
       }
     } else {
       thoughtData.thoughtNumber = 1;
       thoughtData.totalThoughts = Math.max(thoughtData.totalThoughts || 0, 5); // Encourage multi-step for first thought
       console.log(`[DEBUG] Initial thought - setting up for multi-step process (${thoughtData.thoughtNumber}/${thoughtData.totalThoughts})`);
     }
     // Ensure total thoughts is at least the current thought number
     if (thoughtData.thoughtNumber > thoughtData.totalThoughts) {
       thoughtData.totalThoughts = thoughtData.thoughtNumber;
     }
   }
 
   /**
    * Updates the session state after processing a thought.
    * Handles CoT validation, branch merging, history updates, and saving.
       */
     private async _updateSessionState(processedThought: ExtendedThoughtData): Promise<void> { // Made async
       // Perform CoT validation using imported function
       if (processedThought.isChainOfThought && !processedThought.validationStatus) {
        const validation = validateChainOfThought(processedThought); // Use imported function
        processedThought.validationStatus = validation.isValid ? 'valid' : 'invalid';
        processedThought.validationReason = validation.reason;
      }
  
      // Handle branch merging
      if (processedThought.mergeBranchId && processedThought.branchId && processedThought.mergeBranchPoint) {
        this._mergeBranches( // Use the renamed private method
          processedThought.mergeBranchId,
          processedThought.branchId,
          processedThought.mergeBranchPoint
       );
     }
  
     // Add the processed thought (including context) to history
     this.thoughtHistory.push(processedThought);
  
     // Update branches if necessary
     if (processedThought.branchFromThought && processedThought.branchId) {
       if (!this.branches[processedThought.branchId]) {
         this.branches[processedThought.branchId] = [];
       }
       this.branches[processedThought.branchId].push(processedThought);
     }
  
      // Save session using the service
       await this.sessionService.saveSession({ 
         id: this.sessionId,
         name: this.sessionName,
         // createdAt and updatedAt are handled by the service
         thoughtHistory: this.thoughtHistory, // Already updated before calling this method
         branches: this.branches
      });
    }
  
   /**
    * Formats the final response object for the MCP tool call.
    */
   private _formatResponse(
     processedThought: ExtendedThoughtData,
     geminiAnalysis: string,
     analysisDetails: ReturnType<typeof generateAnalysisDetails>, // Use imported function type
     claudeTokens: number // Pass claudeTokens explicitly
   ): { content: Array<{ type: string; text: string }> } {
     return {
       content: [{
         type: "text",
         text: JSON.stringify({
           thoughtNumber: processedThought.thoughtNumber,
           totalThoughts: processedThought.totalThoughts,
           nextThoughtNeeded: processedThought.nextThoughtNeeded,
           branches: Object.keys(this.branches),
           thoughtHistoryLength: this.thoughtHistory.length,
           sessionId: this.sessionId,
           sessionName: this.sessionName,
           isChainOfThought: processedThought.isChainOfThought,
           isHypothesis: processedThought.isHypothesis,
           isVerification: processedThought.isVerification,
           chainOfThoughtStep: processedThought.chainOfThoughtStep,
           totalChainOfThoughtSteps: processedThought.totalChainOfThoughtSteps,
           confidenceLevel: processedThought.confidenceLevel,
           hypothesisId: processedThought.hypothesisId,
           validationStatus: processedThought.validationStatus,
           validationReason: processedThought.validationReason,
           mergeBranchId: processedThought.mergeBranchId,
           mergeBranchPoint: processedThought.mergeBranchPoint,
           geminiAnalysis: geminiAnalysis, // Include Gemini's intermediate analysis
           analysisDetails: analysisDetails, // Include structured Claude analysis
           enhancementRatio: analysisDetails.metrics.compressionRatio,
           claudeTokens: claudeTokens // Use the explicitly passed value
         }, null, 2)
       }]
     };
   }
 
   /**
    * Gathers contextual data including file structure, open files,
    * semantic analysis, and memory insights.
      */
     private async _gatherContextualData(
       validatedInput: ThoughtData, // This parameter is already validated
       providedFileStructure?: string,
       providedOpenFiles?: string[]
   ): Promise<{
     fileStructure: string | undefined;
     openFiles: string[] | undefined;
     fileData: OpenFileInfo[];
     fileContentPrompt: string;
     semanticAnalysisPrompt: string;
     memoryInsightsPrompt: string;
   }> {
     let fileStructure = providedFileStructure;
     let openFiles = providedOpenFiles;
     let fileData: OpenFileInfo[] = [];
     let fileContentPrompt = "";
     let semanticAnalysisPrompt = "";
     let memoryInsightsPrompt = "";
 
     // Auto-analyze project structure if not provided
     if (!fileStructure) {
       try {
         console.log("Project structure not provided - auto-analyzing...");
         const projectDir = process.cwd();
         const projectAnalysis = await analyzeProject(projectDir, 3);
         fileStructure = formatProjectStructure(projectAnalysis);
         console.log("Auto-analysis complete.");
       } catch (error) {
         console.error("Error auto-analyzing project structure:", error);
       }
     }
 
     // Auto-analyze open files if not provided
     if (!openFiles || openFiles.length === 0) {
       console.log("Open files not provided - using important files as fallback.");
       try {
         const projectDir = process.cwd();
         const projectAnalysis = await analyzeProject(projectDir, 3);
         openFiles = projectAnalysis.importantFiles.map(file => file.path);
       } catch (error) {
         console.error("Error creating fallback open files list:", error);
       }
     }
 
     // Read full file contents for open files
     console.log("Reading full content of open files...");
     try {
       const filesToRead = openFiles || [];
       const readResult = await readOpenFiles(filesToRead, process.cwd());
       fileData = readResult.fileData;
 
       const stepNumber = validatedInput.thoughtNumber || 1;
       const mainStep = Math.floor(stepNumber);
       const subStep = Math.round((stepNumber - mainStep) * 10);
        const stepInfo = { mainStep, subStep };
 
        const thoughtText = validatedInput.thought || '';
        // Use the static method from PromptOptimizer
        const contextFileNames = PromptOptimizer.extractCodeEntitiesFromThought(thoughtText); 
        if (contextFileNames.length > 0) {
          console.log(`[CONTEXT] Found ${contextFileNames.length} context-relevant terms for file prioritization:`, contextFileNames);
        }
 
       fileContentPrompt = prepareFileContentForPrompt(fileData, 4000, stepInfo, contextFileNames);
       console.log(`Prepared file content prompt with context-aware prioritization. Step: ${mainStep}.${subStep} (${fileData.length} total files)`);
     } catch (error) {
       console.error("Error reading open file contents:", error);
     }
 
     // Perform semantic analysis on code files
     console.log("Performing semantic analysis on code files...");
     try {
       const codeFiles = fileData.filter(file =>
         file.path.endsWith('.ts') || file.path.endsWith('.js') ||
         file.path.endsWith('.tsx') || file.path.endsWith('.jsx')
       );
       console.log(`[DEBUG] Found ${codeFiles.length} code files for semantic analysis`);
 
       const stepNumber = validatedInput.thoughtNumber || 1;
       console.log(`[DEBUG] Current step number: ${stepNumber}`);
       let filesToProcess: string[] = [];
 
       if (typeof stepNumber === 'number') {
         const mainStep = Math.floor(stepNumber);
         const subStep = Math.round((stepNumber - mainStep) * 10);
         if (codeFiles.length > 0) {
           if (subStep === 0) {
             filesToProcess = [codeFiles[0].path];
             console.log(`[DEBUG] Main step ${mainStep} - analyzing primary file: ${codeFiles[0].path}`);
           } else {
             const startIdx = (subStep - 1) % codeFiles.length;
             const fileIdx = Math.min(startIdx, codeFiles.length - 1);
             filesToProcess = [codeFiles[fileIdx].path];
             console.log(`[DEBUG] Sub-step ${mainStep}.${subStep} - analyzing file index ${fileIdx}: ${codeFiles[fileIdx].path}`);
           }
         }
       } else if (codeFiles.length > 0) {
         filesToProcess = [codeFiles[0].path];
       }
 
       if (filesToProcess.length > 0) {
         const targetFile = filesToProcess[0];
         console.log(`Analyzing target file: ${targetFile}`);
         try {
           const analysis = await semanticAnalyzer.analyzeFile(targetFile);
           semanticAnalysisPrompt = semanticAnalyzer.summarizeAnalysis(analysis);
           console.log(`Completed semantic analysis of ${targetFile} (${semanticAnalysisPrompt.length} chars)`);
           console.log(`[DEBUG] Analysis preview: ${semanticAnalysisPrompt.substring(0, 100)}...`);
         } catch (innerError) {
           console.error(`[DEBUG] Failed to analyze ${targetFile}:`, innerError);
         }
       } else {
         console.log(`[DEBUG] No suitable code files found for semantic analysis.`);
       }
     } catch (error) {
       console.error("Error performing semantic analysis:", error);
     }
 
     // Check memory system for relevant insights
     console.log("Querying memory system for relevant insights...");
     try {
       await memorySystem.loadMemories();
       console.log("[DEBUG] Memory system initialized");
       const codeContext = { files: fileData.map(file => file.path), symbols: [] };
       console.log(`[DEBUG] Code context created with ${codeContext.files.length} files`);
 
       const thoughtNumbers = [validatedInput.thoughtNumber || 1];
       console.log(`[DEBUG] Getting insights for thought number ${thoughtNumbers[0]}`);
       console.log(`[DEBUG] Current thought history length: ${this.thoughtHistory.length}`);
 
       const insights = await memorySystem.generateInsights(this.thoughtHistory, codeContext);
       console.log(`[DEBUG] Memory system returned ${insights.length} insights`);
 
       if (insights.length > 0) {
         memoryInsightsPrompt = "\n\n## Insights From Previous Similar Problems:\n" +
           insights.map(insight => `- ${insight}`).join("\n");
         console.log(`Found ${insights.length} relevant insights from memory`);
         console.log(`[DEBUG] First insight: ${insights[0].substring(0, 100)}...`);
       } else {
         console.log(`[DEBUG] No insights found in memory system for this thought`);
       }
 
       if (validatedInput.thought && validatedInput.thought.length > 0) {
         console.log(`[DEBUG] Storing new insight for thought: "${validatedInput.thought.substring(0, 50)}..."`);
         memorySystem.storeInsight(
           validatedInput.thought,
           thoughtNumbers,
           ["sequential-thinking", "reasoning"],
           0.7,
           codeContext
         ).then(id => console.log(`Stored new memory with ID: ${id}`));
       } else {
         console.log(`[DEBUG] No valid thought content to store in memory`);
       }
     } catch (error) {
       console.error("Error working with memory system:", error);
     }
 
     return {
       fileStructure,
       openFiles,
       fileData,
       fileContentPrompt,
       semanticAnalysisPrompt,
       memoryInsightsPrompt
     };
   }
 
   public async processThought(
     input: unknown,
     disableEmbeddings: boolean = false,
     dynamicContextWindowSize?: number,
     // Add IDE context parameters
     // fileStructure?: string, // Removed duplicate parameter
     providedFileStructure?: string, // Renamed for clarity
     providedOpenFiles?: string[]   // Renamed for clarity
   ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
     console.log("Entering processThought function");
 
       try {
         // --- Stage 1: Validate Input & Initialize ---
         const validatedInput = validateThoughtData(input); // Use imported function
 
         // --- Stage 2: Gather Contextual Data ---
       const {
         fileStructure,
         openFiles,
         fileData, // Keep fileData if needed later, otherwise remove
         fileContentPrompt,
         semanticAnalysisPrompt,
         memoryInsightsPrompt
       } = await this._gatherContextualData(validatedInput, providedFileStructure, providedOpenFiles);
 
       // --- Stage 3: Initialize or Increment Thought Number ---
       this._initializeOrIncrementThoughtNumber(validatedInput);
 
       // --- Stage 4: Prepare Enhanced Input for LLM ---
       // (Optional: Generate embeddings - logic remains the same)
       let embeddings: number[] | null = null;
       if (disableEmbeddings) {
         embeddings = await getEmbeddings(validatedInput.thought);
         console.log("Generated embeddings:", embeddings);
       }
 
       // Combine validated input with gathered context
       const enhancedInput: ExtendedThoughtData = { // Use ExtendedThoughtData type
         ...validatedInput,
         fileContentPrompt,
         semanticAnalysisPrompt,
         memoryInsightsPrompt
         // embeddings could be added here if needed by optimizer
       };
 
       // --- Stage 5: Optimize Prompt & Execute LLM Chain ---
       const optimizedPrompt = PromptOptimizer.optimizeThought(
         enhancedInput,
         this.thoughtHistory,
         dynamicContextWindowSize,
         fileStructure,
         openFiles
       );
 
       const { geminiAnalysis, claudeAnalysis, claudeTokens } = await this._executeLLMChain(
         validatedInput, // Pass original validated input for Claude prompt context
         optimizedPrompt
       ); 
 
        // --- Stage 6: Update Session State ---
        await this._updateSessionState(enhancedInput); // Await the async save
 
        // --- Stage 7: Format and Return Response ---
       const formattedThought = formatThoughtForConsole(enhancedInput); // Use imported function
        console.error(formattedThought);
 
        const analysisDetails = generateAnalysisDetails(enhancedInput, optimizedPrompt, claudeAnalysis); // Call imported function
 
        // Use the new helper method to format the final JSON response
       return this._formatResponse(enhancedInput, geminiAnalysis, analysisDetails, claudeTokens);
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
       console.log("Attempting to analyze current project structure...");
       // Auto-analyze project structure
       let autoFileStructure: string | undefined;
       let autoOpenFiles: string[] | undefined;
       
       try {
         // Get the current working directory
         const projectDir = process.cwd();
         console.log(`Analyzing project directory: ${projectDir}`);
         const projectAnalysis = await analyzeProject(projectDir, 3);
         autoFileStructure = formatProjectStructure(projectAnalysis);
         // Use important files as proxy for "open files"
         autoOpenFiles = projectAnalysis.importantFiles.map(file => file.path);
         console.log(`Auto-analysis complete. Found ${projectAnalysis.fileCount} files.`);
       } catch (error) {
         console.error("Error during auto-analysis:", error);
       }
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
        // Use provided values or fall back to auto-analyzed ones
        const fileStructure = (args.fileStructure as string | undefined) || autoFileStructure;
        const openFiles = (args.openFiles as string[] | undefined) || autoOpenFiles;
         
         // Correctly pass arguments matching the processThought signature
         const result = await thinkingServer.processThought(
           args,                     // input
           false,                    // disableEmbeddings
           dynamicContextWindowSize, // dynamicContextWindowSize
           fileStructure,            // providedFileStructure
           openFiles                 // providedOpenFiles
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
