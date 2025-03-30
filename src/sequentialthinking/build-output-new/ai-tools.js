/**
 * AI Tools for Sequential Thinking
 *
 * This module implements the MCP tools for AI-driven capabilities
 * in the Sequential Thinking server.
 */
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { AIAdvisor } from './ai-advisor.js';
// Initialize the AI advisor
const aiAdvisor = new AIAdvisor();
/**
 * Define the AI tools
 */
export const VALIDATE_THINKING_TOOL = {
    name: "validate_thinking",
    description: "Perform a detailed validation of a thinking session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "ID of the session to validate"
            },
            validationDepth: {
                type: "string",
                enum: ["basic", "detailed", "comprehensive"],
                description: "Depth of validation to perform"
            }
        },
        required: ["sessionId"]
    }
};
export const GENERATE_THOUGHT_TOOL = {
    name: "generate_thought",
    description: "Generate a thought based on the current thinking session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "ID of the session"
            },
            currentThoughtNumber: {
                type: "number",
                description: "Current thought number"
            },
            generationStrategy: {
                type: "string",
                enum: ["continue", "alternative", "challenge", "deepen", "summarize"],
                description: "Strategy for generating the thought"
            },
            topicFocus: {
                type: "string",
                description: "Optional topic to focus on"
            },
            constraintDescription: {
                type: "string",
                description: "Optional constraints for the generated thought"
            }
        },
        required: ["sessionId", "currentThoughtNumber", "generationStrategy"]
    }
};
export const GET_COACHING_TOOL = {
    name: "get_coaching",
    description: "Get coaching suggestions for improving thinking",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "ID of the session"
            },
            coachingAspect: {
                type: "string",
                enum: ["structure", "depth", "breadth", "creativity", "critical", "overall"],
                description: "Aspect of thinking to get coaching on"
            },
            detailLevel: {
                type: "string",
                enum: ["brief", "detailed"],
                description: "Level of detail for coaching suggestions"
            }
        },
        required: ["sessionId", "coachingAspect"]
    }
};
export const GET_AI_ADVICE_TOOL = {
    name: "get_ai_advice",
    description: "Get AI advice on next steps in the thinking process",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "ID of the session"
            },
            focusArea: {
                type: "string",
                enum: ["next_steps", "issues", "patterns", "overall"],
                description: "Area to focus advice on"
            }
        },
        required: ["sessionId"]
    }
};
/**
 * Handle validate thinking request
 */
export function handleValidateThinkingRequest(args, thinkingServer) {
    try {
        if (!args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: sessionId");
        }
        // Check if the session exists
        if (thinkingServer.sessionId !== args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, `Session not found: ${args.sessionId}`);
        }
        // Validate the thinking
        const validationFeedback = aiAdvisor.validateChainOfThought(thinkingServer.thoughtHistory);
        // Adjust the level of detail based on validationDepth
        let result = validationFeedback;
        if (args.validationDepth === 'basic') {
            result = {
                overallScore: validationFeedback.overallScore,
                strengths: validationFeedback.strengths,
                improvementAreas: validationFeedback.improvementAreas
            };
        }
        else if (args.validationDepth === 'detailed') {
            // Return the full validation feedback
        }
        else if (args.validationDepth === 'comprehensive') {
            // Add additional analysis for comprehensive validation
            result = {
                ...validationFeedback,
                thoughtByThoughtAnalysis: thinkingServer.thoughtHistory.map((thought) => ({
                    thoughtNumber: thought.thoughtNumber,
                    analysis: `Analysis of thought ${thought.thoughtNumber}...` // Simplified for brevity
                }))
            };
        }
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }]
        };
    }
    catch (error) {
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Error validating thinking: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Handle generate thought request
 */
export function handleGenerateThoughtRequest(args, thinkingServer) {
    try {
        if (!args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: sessionId");
        }
        if (!args.currentThoughtNumber) {
            throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: currentThoughtNumber");
        }
        if (!args.generationStrategy) {
            throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: generationStrategy");
        }
        // Check if the session exists
        if (thinkingServer.sessionId !== args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, `Session not found: ${args.sessionId}`);
        }
        // Generate the thought
        const generatedThought = aiAdvisor.generateThought(thinkingServer.thoughtHistory, args.currentThoughtNumber, args.generationStrategy, args.topicFocus, args.constraintDescription);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify(generatedThought, null, 2)
                }]
        };
    }
    catch (error) {
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Error generating thought: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Handle get coaching request
 */
export function handleGetCoachingRequest(args, thinkingServer) {
    try {
        if (!args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: sessionId");
        }
        if (!args.coachingAspect) {
            throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: coachingAspect");
        }
        // Check if the session exists
        if (thinkingServer.sessionId !== args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, `Session not found: ${args.sessionId}`);
        }
        // Get coaching suggestions
        const coachingSuggestions = aiAdvisor.getCoachingSuggestions(thinkingServer.thoughtHistory, args.coachingAspect, args.detailLevel || 'brief');
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify(coachingSuggestions, null, 2)
                }]
        };
    }
    catch (error) {
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Error getting coaching: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Handle get AI advice request
 */
export function handleGetAIAdviceRequest(args, thinkingServer) {
    try {
        if (!args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: sessionId");
        }
        // Check if the session exists
        if (thinkingServer.sessionId !== args.sessionId) {
            throw new McpError(ErrorCode.InvalidParams, `Session not found: ${args.sessionId}`);
        }
        // Get the session data
        const sessionData = {
            id: thinkingServer.sessionId,
            name: thinkingServer.sessionName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            thoughtHistory: thinkingServer.thoughtHistory,
            branches: thinkingServer.branches
        };
        // Create an AI advisor and get advice
        const advice = aiAdvisor.analyzeSession(sessionData);
        // Filter advice based on focusArea if provided
        let filteredAdvice = advice;
        if (args.focusArea) {
            switch (args.focusArea) {
                case "next_steps":
                    filteredAdvice = { recommendedNextSteps: advice.recommendedNextSteps };
                    break;
                case "issues":
                    filteredAdvice = { identifiedIssues: advice.identifiedIssues };
                    break;
                case "patterns":
                    filteredAdvice = { patterns: aiAdvisor.identifyPatterns(sessionData.thoughtHistory) };
                    break;
                case "overall":
                    filteredAdvice = { overallAssessment: advice.overallAssessment };
                    break;
            }
        }
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify(filteredAdvice, null, 2)
                }]
        };
    }
    catch (error) {
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Error getting AI advice: ${error instanceof Error ? error.message : String(error)}`);
    }
}
