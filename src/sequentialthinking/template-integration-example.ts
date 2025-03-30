/**
 * Example of integrating Templates and Patterns with the Sequential Thinking server
 * 
 * This file demonstrates how to integrate the Templates and Patterns enhancement
 * with the existing Sequential Thinking server.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

import {
  LIST_TEMPLATES_TOOL,
  GET_TEMPLATE_TOOL,
  CREATE_FROM_TEMPLATE_TOOL,
  SAVE_TEMPLATE_TOOL,
  DELETE_TEMPLATE_TOOL,
  handleListTemplatesRequest,
  handleGetTemplateRequest,
  handleCreateFromTemplateRequest,
  handleSaveTemplateRequest,
  handleDeleteTemplateRequest
} from './template-tools.js';

/**
 * Example of how to integrate Templates and Patterns with the Sequential Thinking server
 */
export function integrateTemplatesWithServer(server: Server, thinkingServer: any) {
  // Add the template tools to the list of tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // Existing tools
      // SEQUENTIAL_THINKING_TOOL,
      // VISUALIZATION_TOOL,
      
      // Template tools
      LIST_TEMPLATES_TOOL,
      GET_TEMPLATE_TOOL,
      CREATE_FROM_TEMPLATE_TOOL,
      SAVE_TEMPLATE_TOOL,
      DELETE_TEMPLATE_TOOL
    ],
  }));

  // Handle template tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Handle existing tools
    // if (request.params.name === "sequentialthinking") {
    //   return thinkingServer.processThought(request.params.arguments);
    // } else if (request.params.name === "visualize_thinking") {
    //   return handleVisualizationRequest(
    //     request.params.arguments,
    //     SAVE_DIR,
    //     thinkingServer.sessionId,
    //     thinkingServer.thoughtHistory,
    //     thinkingServer.branches
    //   );
    // }
    
    // Handle template tools
    if (request.params.name === "list_templates") {
      return handleListTemplatesRequest(request.params.arguments);
    } else if (request.params.name === "get_template") {
      return handleGetTemplateRequest(request.params.arguments);
    } else if (request.params.name === "create_from_template") {
      return handleCreateFromTemplateRequest(request.params.arguments, thinkingServer);
    } else if (request.params.name === "save_template") {
      return handleSaveTemplateRequest(request.params.arguments);
    } else if (request.params.name === "delete_template") {
      return handleDeleteTemplateRequest(request.params.arguments);
    }

    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${request.params.name}`
    );
  });
}

/**
 * Example of how to use the Templates and Patterns enhancement
 * 
 * This is a simplified example of how to use the Templates and Patterns enhancement
 * in a real application. In a real implementation, you would need to:
 * 
 * 1. Modify the SequentialThinkingServer class to support initializing a session from a template
 * 2. Update the server's request handler to handle the template tools
 * 3. Add UI components for selecting templates and providing template parameters
 */
export function exampleUsage() {
  // Example: List all available templates
  console.log("Listing all available templates...");
  const listResult = handleListTemplatesRequest({});
  console.log(listResult.content[0].text);

  // Example: Get details of a specific template
  console.log("\nGetting details of the Scientific Method template...");
  const getResult = handleGetTemplateRequest({ templateId: "scientific-method" });
  console.log(getResult.content[0].text);

  // Example: Create a new session from a template
  console.log("\nCreating a new session from the Scientific Method template...");
  const createResult = handleCreateFromTemplateRequest(
    { 
      templateId: "scientific-method",
      parameters: {
        problem_domain: "Physics",
        time_constraint: "1 week"
      }
    },
    { sessionId: "example-session-id" }
  );
  console.log(createResult.content[0].text);

  // Example: Save a custom template
  console.log("\nSaving a custom template...");
  const saveResult = handleSaveTemplateRequest({
    template: {
      id: "custom-template",
      name: "Custom Template",
      description: "A custom template for demonstration purposes.",
      category: "Custom",
      steps: [
        {
          stepNumber: 1,
          title: "Step 1",
          description: "The first step",
          promptText: "This is the first step of the custom template."
        },
        {
          stepNumber: 2,
          title: "Step 2",
          description: "The second step",
          promptText: "This is the second step of the custom template."
        }
      ],
      parameters: [],
      version: "1.0.0",
      author: "User"
    }
  });
  console.log(saveResult.content[0].text);

  // Example: Delete a custom template
  console.log("\nDeleting the custom template...");
  const deleteResult = handleDeleteTemplateRequest({ templateId: "custom-template" });
  console.log(deleteResult.content[0].text);
}
