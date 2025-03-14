#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from 'zod-to-json-schema';

import * as projects from './operations/projects.js';
import * as items from './operations/items.js';
import * as fields from './operations/fields.js';
import * as views from './operations/views.js';
import {
  GitHubError,
  isGitHubError,
  formatGitHubError,
} from './common/errors.js';
import { VERSION } from "./common/version.js";

const server = new Server(
  {
    name: "github-projects-mcp-server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Projects
      {
        name: "list_projects",
        description: "List GitHub Projects (V2) for a user or organization",
        inputSchema: zodToJsonSchema(projects.ListProjectsSchema),
      },
      {
        name: "get_project",
        description: "Get details of a specific GitHub Project (V2)",
        inputSchema: zodToJsonSchema(projects.GetProjectSchema),
      },
      {
        name: "create_project",
        description: "Create a new GitHub Project (V2)",
        inputSchema: zodToJsonSchema(projects.CreateProjectSchema),
      },
      {
        name: "update_project",
        description: "Update an existing GitHub Project (V2)",
        inputSchema: zodToJsonSchema(projects.UpdateProjectSchema),
      },
      {
        name: "delete_project",
        description: "Delete a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(projects.DeleteProjectSchema),
      },
      
      // Items
      {
        name: "list_project_items",
        description: "List items in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(items.ListItemsSchema),
      },
      {
        name: "add_project_item",
        description: "Add an issue or pull request to a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(items.AddItemSchema),
      },
      {
        name: "create_draft_item",
        description: "Create a draft item in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(items.CreateDraftItemSchema),
      },
      {
        name: "remove_project_item",
        description: "Remove an item from a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(items.RemoveItemSchema),
      },
      {
        name: "get_project_item",
        description: "Get details of a specific item in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(items.GetItemSchema),
      },
      
      // Fields
      {
        name: "list_project_fields",
        description: "List fields in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(fields.ListFieldsSchema),
      },
      {
        name: "create_project_field",
        description: "Create a new field in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(fields.CreateFieldSchema),
      },
      {
        name: "update_project_field_value",
        description: "Update field value for an item in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(fields.UpdateFieldValueSchema),
      },
      {
        name: "delete_project_field",
        description: "Delete a field from a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(fields.DeleteFieldSchema),
      },
      
      // Views
      {
        name: "list_project_views",
        description: "List views in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(views.ListViewsSchema),
      },
      {
        name: "create_project_view",
        description: "Create a new view in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(views.CreateViewSchema),
      },
      {
        name: "update_project_view",
        description: "Update an existing view in a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(views.UpdateViewSchema),
      },
      {
        name: "delete_project_view",
        description: "Delete a view from a GitHub Project (V2)",
        inputSchema: zodToJsonSchema(views.DeleteViewSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, parameters } = request;
    
    switch (name) {
      // Projects
      case "list_projects":
        return await projects.listProjects(
          parameters.owner,
          parameters.type,
          parameters.first
        );
      
      case "get_project":
        return await projects.getProject(parameters.project_id);
      
      case "create_project":
        return await projects.createProject(
          parameters.owner,
          parameters.title,
          parameters.type,
          parameters.description
        );
      
      case "update_project":
        return await projects.updateProject(
          parameters.project_id,
          parameters.title,
          parameters.closed,
          parameters.description
        );
      
      case "delete_project":
        return await projects.deleteProject(parameters.project_id);
      
      // Items
      case "list_project_items":
        return await items.listItems(
          parameters.project_id,
          parameters.first,
          parameters.after
        );
      
      case "add_project_item":
        return await items.addItem(
          parameters.project_id,
          parameters.content_id
        );
      
      case "create_draft_item":
        return await items.createDraftItem(
          parameters.project_id,
          parameters.title,
          parameters.body
        );
      
      case "remove_project_item":
        return await items.removeItem(
          parameters.project_id,
          parameters.item_id
        );
      
      case "get_project_item":
        return await items.getItem(
          parameters.project_id,
          parameters.item_id
        );
      
      // Fields
      case "list_project_fields":
        return await fields.listFields(parameters.project_id);
      
      case "create_project_field":
        return await fields.createField(
          parameters.project_id,
          parameters.name,
          parameters.dataType,
          parameters.options
        );
      
      case "update_project_field_value":
        return await fields.updateFieldValue(
          parameters.project_id,
          parameters.item_id,
          parameters.field_id,
          parameters.value
        );
      
      case "delete_project_field":
        return await fields.deleteField(
          parameters.project_id,
          parameters.field_id
        );
      
      // Views
      case "list_project_views":
        return await views.listViews(parameters.project_id);
      
      case "create_project_view":
        return await views.createView(
          parameters.project_id,
          parameters.name,
          parameters.layout
        );
      
      case "update_project_view":
        return await views.updateView(
          parameters.project_id,
          parameters.view_id,
          parameters.name,
          parameters.layout
        );
      
      case "delete_project_view":
        return await views.deleteView(
          parameters.project_id,
          parameters.view_id
        );
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (isGitHubError(error)) {
      throw new Error(formatGitHubError(error as GitHubError));
    }
    throw error;
  }
});

async function runServer() {
  console.error(`Starting GitHub Projects MCP Server v${VERSION}...`);

  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    console.error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set.");
    console.error("This is required to authenticate with GitHub.");
    console.error("You can create a personal access token at https://github.com/settings/tokens");
    console.error("Make sure to give it the 'repo' and 'project' scopes.");
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.listen(transport);
}

runServer().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
}); 