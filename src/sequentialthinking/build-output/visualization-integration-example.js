/**
 * Example of integrating visualization capabilities into the Sequential Thinking server
 *
 * This file demonstrates how the visualization module could be integrated
 * into the main Sequential Thinking server to provide visualization tools.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateMermaidFlowchart, generateD3Json, generateVisualizationHtml } from './visualization-example.js';
// Example of how to extend the server with visualization capabilities
export function addVisualizationCapabilities(server, sessionsDir) {
    // Define the visualization tool
    const VISUALIZATION_TOOL = {
        name: "visualize_thinking",
        description: "Generate visual representations of sequential thinking processes",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: {
                    type: "string",
                    description: "ID of the session to visualize"
                },
                format: {
                    type: "string",
                    description: "Visualization format",
                    enum: ["html", "mermaid", "json"]
                },
                outputPath: {
                    type: "string",
                    description: "Path to save the visualization output (optional)"
                }
            },
            required: ["sessionId", "format"]
        }
    };
    // Add the visualization tool to the list of tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [VISUALIZATION_TOOL]
        };
    });
    // Handle visualization tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "visualize_thinking") {
            return handleVisualizationRequest(request.params.arguments, sessionsDir);
        }
        // For other tools, throw a method not found error
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    });
}
// Handle visualization requests
async function handleVisualizationRequest(args, sessionsDir) {
    // Validate arguments
    if (!args.sessionId || !args.format) {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameters: sessionId and format");
    }
    // Check if the format is valid
    if (!["html", "mermaid", "json"].includes(args.format)) {
        throw new McpError(ErrorCode.InvalidParams, "Invalid format. Must be one of: html, mermaid, json");
    }
    // Load the session data
    const sessionFilePath = path.join(sessionsDir, `${args.sessionId}.json`);
    if (!fs.existsSync(sessionFilePath)) {
        throw new McpError(ErrorCode.InvalidParams, `Session not found: ${args.sessionId}`);
    }
    try {
        const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
        // Generate the visualization based on the requested format
        let visualization = "";
        let mimeType = "text/plain";
        switch (args.format) {
            case "html":
                visualization = generateVisualizationHtml(sessionData);
                mimeType = "text/html";
                break;
            case "mermaid":
                visualization = generateMermaidFlowchart(sessionData.thoughtHistory, sessionData.branches);
                mimeType = "text/plain";
                break;
            case "json":
                visualization = JSON.stringify(generateD3Json(sessionData.thoughtHistory, sessionData.branches), null, 2);
                mimeType = "application/json";
                break;
            default:
                throw new McpError(ErrorCode.InvalidParams, `Unsupported format: ${args.format}`);
        }
        // Save the visualization to a file if an output path is provided
        if (args.outputPath) {
            const outputDir = path.dirname(args.outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            fs.writeFileSync(args.outputPath, visualization);
        }
        // Return the visualization
        return {
            content: [
                {
                    type: "text",
                    text: visualization,
                    mimeType
                }
            ]
        };
    }
    catch (error) {
        throw new McpError(ErrorCode.InternalError, `Error generating visualization: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// Example of how to use the visualization capabilities in the main server
export function setupVisualizationServer() {
    const server = new Server({
        name: "sequential-thinking-visualization-server",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    // Define the directory for saving thought processes
    const SAVE_DIR = path.join(os.homedir(), '.sequential-thinking');
    // Ensure the save directory exists
    if (!fs.existsSync(SAVE_DIR)) {
        fs.mkdirSync(SAVE_DIR, { recursive: true });
    }
    // Add visualization capabilities to the server
    addVisualizationCapabilities(server, SAVE_DIR);
    return server;
}
