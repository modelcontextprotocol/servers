/**
 * Template Tools for Sequential Thinking
 * 
 * This module implements the MCP tools for working with templates
 * in the Sequential Thinking server.
 */

import { Tool, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { TemplateManager, Template, setupTemplateManager } from './templates.js';

// Initialize the template manager
const templateManager = setupTemplateManager();

/**
 * Define the template tools
 */
export const LIST_TEMPLATES_TOOL: Tool = {
  name: "list_templates",
  description: "List available thinking templates",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Filter templates by category (optional)"
      },
      tag: {
        type: "string",
        description: "Filter templates by tag (optional)"
      }
    }
  }
};

export const GET_TAGS_TOOL: Tool = {
  name: "get_tags",
  description: "Get all unique tags across all templates",
  inputSchema: {
    type: "object",
    properties: {}
  }
};

export const GET_TEMPLATE_TOOL: Tool = {
  name: "get_template",
  description: "Get details of a specific template",
  inputSchema: {
    type: "object",
    properties: {
      templateId: {
        type: "string",
        description: "ID of the template to retrieve"
      }
    },
    required: ["templateId"]
  }
};

export const CREATE_FROM_TEMPLATE_TOOL: Tool = {
  name: "create_from_template",
  description: "Create a new thinking session from a template",
  inputSchema: {
    type: "object",
    properties: {
      templateId: {
        type: "string",
        description: "ID of the template to use"
      },
      parameters: {
        type: "object",
        description: "Template parameters (optional)"
      }
    },
    required: ["templateId"]
  }
};

export const SAVE_TEMPLATE_TOOL: Tool = {
  name: "save_template",
  description: "Save a custom template",
  inputSchema: {
    type: "object",
    properties: {
      template: {
        type: "object",
        description: "Template object to save"
      }
    },
    required: ["template"]
  }
};

export const DELETE_TEMPLATE_TOOL: Tool = {
  name: "delete_template",
  description: "Delete a custom template",
  inputSchema: {
    type: "object",
    properties: {
      templateId: {
        type: "string",
        description: "ID of the template to delete"
      }
    },
    required: ["templateId"]
  }
};

/**
 * Handle list templates request
 */
export function handleListTemplatesRequest(args: any) {
  try {
    let templates: Template[];
    
    if (args.category) {
      templates = templateManager.getTemplatesByCategory(args.category);
    } else if (args.tag) {
      templates = templateManager.getTemplatesByTag(args.tag);
    } else {
      templates = templateManager.getAllTemplates();
    }
    
    // Format the templates for display
    const formattedTemplates = templates.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      stepCount: template.steps.length,
      version: template.version,
      author: template.author || 'System',
      tags: template.tags || []
    }));
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedTemplates, null, 2)
      }]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Error listing templates: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle get tags request
 */
export function handleGetTagsRequest() {
  try {
    const tags = templateManager.getAllTags();
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(tags, null, 2)
      }]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Error getting tags: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle get template request
 */
export function handleGetTemplateRequest(args: any) {
  try {
    if (!args.templateId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Missing required parameter: templateId"
      );
    }
    
    const template = templateManager.getTemplate(args.templateId);
    if (!template) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Template not found: ${args.templateId}`
      );
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(template, null, 2)
      }]
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error getting template: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle create from template request
 */
export function handleCreateFromTemplateRequest(args: any, thinkingServer: any) {
  try {
    if (!args.templateId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Missing required parameter: templateId"
      );
    }
    
    const parameters = args.parameters || {};
    
    // Create thoughts from the template
    const thoughts = templateManager.createSessionFromTemplate(args.templateId, parameters);
    
    // Initialize a new session with the template thoughts
    // Note: This would need to be integrated with the SequentialThinkingServer class
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: `Created new session from template: ${args.templateId}`,
          thoughtCount: thoughts.length,
          sessionId: thinkingServer.sessionId
        }, null, 2)
      }]
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error creating from template: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle save template request
 */
export function handleSaveTemplateRequest(args: any) {
  try {
    if (!args.template) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Missing required parameter: template"
      );
    }
    
    // Try to save the template - this will internally validate it
    try {
      templateManager.saveUserTemplate(args.template);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid template format: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: `Template saved: ${args.template.name}`,
          templateId: args.template.id
        }, null, 2)
      }]
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error saving template: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle delete template request
 */
export function handleDeleteTemplateRequest(args: any) {
  try {
    if (!args.templateId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Missing required parameter: templateId"
      );
    }
    
    const success = templateManager.deleteUserTemplate(args.templateId);
    if (!success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Template not found or cannot be deleted: ${args.templateId}`
      );
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: `Template deleted: ${args.templateId}`
        }, null, 2)
      }]
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error deleting template: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
