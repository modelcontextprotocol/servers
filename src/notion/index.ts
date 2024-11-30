#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Type definitions for tool arguments
// Blocks
interface AppendBlockChildrenArgs {
  block_id: string;
  children: any[];
}

interface RetrieveBlockArgs {
  block_id: string;
}

interface RetrieveBlockChildrenArgs {
  block_id: string;
  start_cursor?: string;
  page_size?: number;
}

interface DeleteBlockArgs {
  block_id: string;
}

// Pages
interface RetrievePageArgs {
  page_id: string;
}

interface UpdatePagePropertiesArgs {
  page_id: string;
  properties: any;
}

// Databases
interface CreateDatabaseArgs {
  parent: any;
  title: any[];
  properties: any;
}

interface QueryDatabaseArgs {
  database_id: string;
  filter?: any;
  sorts?: any;
  start_cursor?: string;
  page_size?: number;
}

interface RetrieveDatabaseArgs {
  database_id: string;
}

interface UpdateDatabaseArgs {
  database_id: string;
  title?: any[];
  description?: any[];
  properties?: any;
}

// Tool definitions
// Blocks
const appendBlockChildrenTool: Tool = {
  name: "notion_append_block_children",
  description: "Append blocks to a parent block in Notion",
  inputSchema: {
    type: "object",
    properties: {
      block_id: {
        type: "string",
        description: "The ID of the parent block",
      },
      children: {
        type: "array",
        description: "Array of block objects to append",
      },
    },
    required: ["block_id", "children"],
  },
};

const retrieveBlockTool: Tool = {
  name: "notion_retrieve_block",
  description: "Retrieve a block from Notion",
  inputSchema: {
    type: "object",
    properties: {
      block_id: {
        type: "string",
        description: "The ID of the block to retrieve",
      },
    },
    required: ["block_id"],
  },
}

const retrieveBlockChildrenTool: Tool = {
  name: "notion_retrieve_block_children",
  description: "Retrieve the children of a block",
  inputSchema: {
    type: "object",
    properties: {
      block_id: {
        type: "string",
        description: "The ID of the block",
      },
      start_cursor: {
        type: "string",
        description: "Pagination cursor for next page of results",
      },
      page_size: {
        type: "number",
        description: "Number of results per page (max 100)",
      },
    },
    required: ["block_id"],
  },
};

const deleteBlockTool: Tool = {
  name: "notion_delete_block",
  description: "Delete a block in Notion",
  inputSchema: {
    type: "object",
    properties: {
      block_id: {
        type: "string",
        description: "The ID of the block to delete",
      },
    },
    required: ["block_id"],
  },
};

// Pages
const retrievePageTool: Tool = {
  name: "notion_retrieve_page",
  description: "Retrieve a page from Notion",
  inputSchema: {
    type: "object",
    properties: {
      page_id: {
        type: "string",
        description: "The ID of the page to retrieve",
      },
    },
    required: ["page_id"],
  },
};

const updatePagePropertiesTool: Tool = {
  name: "notion_update_page_properties",
  description: "Update properties of a page in Notion",
  inputSchema: {
    type: "object",
    properties: {
      page_id: {
        type: "string",
        description: "The ID of the page to update",
      },
      properties: {
        type: "object",
        description: "Properties to update",
      },
    },
    required: ["page_id", "properties"],
  },
};

// Databases
const createDatabaseTool: Tool = {
  name: "notion_create_database",
  description: "Create a database in Notion",
  inputSchema: {
    type: "object",
    properties: {
      parent: {
        type: "object",
        description: "Parent object of the database",
      },
      title: {
        type: "array",
        description: "Title of database as it appears in Notion. An array of rich text objects.",
      },
      properties: {
        type: "object",
        description: "Property schema of database. The keys are the names of properties as they appear in Notion and the values are property schema objects.",
      },
    },
    required: ["parent", "properties"],
  },
};

const queryDatabaseTool: Tool = {
  name: "notion_query_database",
  description: "Query a database in Notion",
  inputSchema: {
    type: "object",
    properties: {
      database_id: {
        type: "string",
        description: "The ID of the database to query",
      },
      filter: {
        type: "object",
        description: "Filter conditions",
      },
      sorts: {
        type: "array",
        description: "Sort conditions",
      },
      start_cursor: {
        type: "string",
        description: "Pagination cursor for next page of results",
      },
      page_size: {
        type: "number",
        description: "Number of results per page (max 100)",
      },
    },
    required: ["database_id"],
  },
};

const retrieveDatabaseTool: Tool = {
  name: "notion_retrieve_database",
  description: "Retrieve a database in Notion",
  inputSchema: {
    type: "object",
    properties: {
      database_id: {
        type: "string",
        description: "The ID of the database to retrieve",
      },
    },
    required: ["database_id"],
  },
};

const updateDatabaseTool: Tool = {
  name: "notion_update_database",
  description: "Update a database in Notion",
  inputSchema: {
    type: "object",
    properties: {
      database_id: {
        type: "string",
        description: "The ID of the database to update",
      },
      title: {
        type: "array",
        description: "An array of rich text objects that represents the title of the database that is displayed in the Notion UI.",
      },
      description: {
        type: "array",
        description: "An array of rich text objects that represents the description of the database that is displayed in the Notion UI.",
      },
      properties: {
        type: "object",
        description: "The properties of a database to be changed in the request, in the form of a JSON object.",
      },
    },
    required: ["database_id"],
  },
};

class NotionClientWrapper {
  private notionToken: string;
  private baseUrl: string = "https://api.notion.com/v1";
  private headers: { [key: string]: string };

  constructor(token: string) {
    this.notionToken = token;
    this.headers = {
      "Authorization": `Bearer ${this.notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };
  }

  async appendBlockChildren(block_id: string, children: any[]): Promise<any> {
    const body = { children };

    const response = await fetch(`${this.baseUrl}/blocks/${block_id}/children`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    return response.json();
  }

  async retrieveBlock(block_id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/blocks/${block_id}`, {
      method: "GET",
      headers: this.headers,
    });

    return response.json();
  }

  async retrieveBlockChildren(
    block_id: string,
    start_cursor?: string,
    page_size?: number,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (start_cursor) params.append("start_cursor", start_cursor);
    if (page_size) params.append("page_size", page_size.toString());

    const response = await fetch(`${this.baseUrl}/blocks/${block_id}/children?${params}`, {
      method: "GET",
      headers: this.headers,
    });

    return response.json();
  }

  async deleteBlock(block_id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/blocks/${block_id}`, {
      method: "DELETE",
      headers: this.headers,
    });

    return response.json();
  }

  async retrievePage(page_id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/pages/${page_id}`, {
      method: "GET",
      headers: this.headers,
    });

    return response.json();
  }

  async updatePageProperties(page_id: string, properties: any): Promise<any> {
    const body = { properties };

    const response = await fetch(`${this.baseUrl}/pages/${page_id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    return response.json();
  }

  async createDatabase(parent: any, title: any[], properties: any): Promise<any> {
    const body = { parent, title, properties };

    const response = await fetch(`${this.baseUrl}/databases`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    return response.json();
  }

  async queryDatabase(
    database_id: string,
    filter?: any,
    sorts?: any,
    start_cursor?: string,
    page_size?: number,
  ): Promise<any> {
    const body: any = {};
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    if (start_cursor) body.start_cursor = start_cursor;
    if (page_size) body.page_size = page_size;

    const response = await fetch(`${this.baseUrl}/databases/${database_id}/query`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    return response.json();
  }

  async retrieveDatabase(database_id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/databases/${database_id}`, {
      method: "GET",
      headers: this.headers,
    });

    return response.json();
  }

  async updateDatabase(database_id: string, title?: any[], description?: any[], properties?: any): Promise<any> {
    const body: any = {};
    if (title) body.title = title;
    if (description) body.description = description;
    if (properties) body.properties = properties;

    const response = await fetch(`${this.baseUrl}/databases/${database_id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    return response.json();
  }
}

async function main() {
  const notionToken = process.env.NOTION_API_TOKEN;

  if (!notionToken) {
    console.error("Please set NOTION_API_TOKEN environment variable");
    process.exit(1);
  }

  console.error("Starting Notion MCP Server...");
  const server = new Server(
    {
      name: "Notion MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const notionClient = new NotionClientWrapper(notionToken);

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        switch (request.params.name) {
          case "notion_append_block_children": {
            const args = request.params.arguments as unknown as AppendBlockChildrenArgs;
            if (!args.block_id || !args.children) {
              throw new Error(
                "Missing required arguments: block_id and children",
              );
            }
            const response = await notionClient.appendBlockChildren(
              args.block_id,
              args.children,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_retrieve_block": {
            const args = request.params.arguments as unknown as RetrieveBlockArgs;
            if (!args.block_id) {
              throw new Error("Missing required argument: block_id");
            }
            const response = await notionClient.retrieveBlock(args.block_id);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_retrieve_block_children": {
            const args = request.params
              .arguments as unknown as RetrieveBlockChildrenArgs;
            if (!args.block_id) {
              throw new Error("Missing required argument: block_id");
            }
            const response = await notionClient.retrieveBlockChildren(
              args.block_id,
              args.start_cursor,
              args.page_size,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_delete_block": {
            const args = request.params.arguments as unknown as DeleteBlockArgs;
            if (!args.block_id) {
              throw new Error("Missing required argument: block_id");
            }
            const response = await notionClient.deleteBlock(args.block_id);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_retrieve_page": {
            const args = request.params.arguments as unknown as RetrievePageArgs;
            if (!args.page_id) {
              throw new Error("Missing required argument: page_id");
            }
            const response = await notionClient.retrievePage(args.page_id);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_update_page_properties": {
            const args = request.params.arguments as unknown as UpdatePagePropertiesArgs;
            if (!args.page_id || !args.properties) {
              throw new Error(
                "Missing required arguments: page_id and properties",
              );
            }
            const response = await notionClient.updatePageProperties(
              args.page_id,
              args.properties,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_query_database": {
            const args = request.params
              .arguments as unknown as QueryDatabaseArgs;
            if (!args.database_id) {
              throw new Error("Missing required argument: database_id");
            }
            const response = await notionClient.queryDatabase(
              args.database_id,
              args.filter,
              args.sorts,
              args.start_cursor,
              args.page_size,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_create_database": {
            const args = request.params.arguments as unknown as CreateDatabaseArgs;
            const response = await notionClient.createDatabase(
              args.parent,
              args.title,
              args.properties,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_retrieve_database": {
            const args = request.params.arguments as unknown as RetrieveDatabaseArgs;
            const response = await notionClient.retrieveDatabase(args.database_id);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "notion_update_database": {
            const args = request.params.arguments as unknown as UpdateDatabaseArgs;
            const response = await notionClient.updateDatabase(
              args.database_id,
              args.title,
              args.description,
              args.properties,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        console.error("Error executing tool:", error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListToolsRequest");
    return {
      tools: [
        appendBlockChildrenTool,
        retrieveBlockTool,
        retrieveBlockChildrenTool,
        deleteBlockTool,
        retrievePageTool,
        updatePagePropertiesTool,
        createDatabaseTool,
        queryDatabaseTool,
        retrieveDatabaseTool,
        updateDatabaseTool,
      ],
    };
  });

  const transport = new StdioServerTransport();
  console.error("Connecting server to transport...");
  await server.connect(transport);

  console.error("Notion MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
