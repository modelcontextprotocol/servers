#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { MongoClient, Db, Collection, Document, AggregateOptions } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is required");
}

interface AggregateToolArguments {
  collection: string;
  pipeline: Document[];
  options?: AggregateOptions & {
    allowDiskUse?: boolean;
    maxTimeMS?: number;
    comment?: string;
  };
}

interface ExplainToolArguments {
  collection: string;
  pipeline: Document[];
  verbosity?: "queryPlanner" | "executionStats" | "allPlansExecution";
}

interface SampleDocumentsArguments {
  collection: string;
  count?: number;
}

class MongoDBServer {
  private server: Server;
  private client!: MongoClient;
  private db!: Db;

  constructor() {
    this.server = new Server(
      {
        name: "example-servers/mongodb",
        version: "0.1.0",
        description: "MongoDB MCP server providing secure access to MongoDB databases",
      },
      {
        capabilities: {
          resources: {
            description: "MongoDB collections and their schemas",
            mimeTypes: ["application/json"],
          },
          tools: {
            description: "MongoDB aggregation and analysis tools",
          },
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const collections = await this.db.listCollections().toArray();
      return {
        resources: collections.map((collection: Document) => ({
          uri: `mcp-mongodb://${collection.name}/schema`,
          mimeType: "application/json",
          name: `"${collection.name}" collection schema`,
          description: `Schema information for the ${collection.name} collection`,
        })),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const match = uri.match(/^mcp-mongodb:\/\/([^/]+)\/schema$/);
      
      if (!match) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          "Invalid resource URI"
        );
      }

      const collectionName = match[1];
      
      try {
        const sampleDoc = await this.db.collection(collectionName).findOne();
        
        if (!sampleDoc) {
          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: "application/json",
                text: JSON.stringify({ message: "Collection is empty" }, null, 2),
              },
            ],
          };
        }

        const documentSchema = Object.entries(sampleDoc).map(([key, value]) => ({
          field_name: key,
          field_type: typeof value,
          description: `Field ${key} of type ${typeof value}`,
        }));

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(documentSchema, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `MongoDB error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "aggregate",
          description: "Run a MongoDB aggregation pipeline",
          inputSchema: {
            type: "object",
            properties: {
              collection: { 
                type: "string",
                description: "Name of the collection to query",
              },
              pipeline: {
                type: "array",
                items: { type: "object" },
                description: "MongoDB aggregation pipeline stages (e.g., $match, $group, $sort)",
              },
              options: {
                type: "object",
                description: "Optional aggregation options",
                properties: {
                  allowDiskUse: { 
                    type: "boolean",
                    description: "Allow writing to temporary files",
                  },
                  maxTimeMS: { 
                    type: "number",
                    description: "Maximum execution time in milliseconds",
                  },
                  comment: { 
                    type: "string",
                    description: "Optional comment to help trace operations",
                  }
                }
              }
            },
            required: ["collection", "pipeline"],
          },
          examples: [
            {
              name: "Count documents by status",
              arguments: {
                collection: "orders",
                pipeline: [
                  { $group: { _id: "$status", count: { $sum: 1 } } },
                  { $sort: { count: -1 } }
                ]
              }
            }
          ]
        },
        {
          name: "explain",
          description: "Get the execution plan for an aggregation pipeline",
          inputSchema: {
            type: "object",
            properties: {
              collection: { 
                type: "string",
                description: "Name of the collection to analyze",
              },
              pipeline: {
                type: "array",
                items: { type: "object" },
                description: "MongoDB aggregation pipeline stages to analyze",
              },
              verbosity: {
                type: "string",
                enum: ["queryPlanner", "executionStats", "allPlansExecution"],
                default: "queryPlanner",
                description: "Level of detail in the execution plan",
              }
            },
            required: ["collection", "pipeline"],
          },
          examples: [
            {
              name: "Analyze index usage",
              arguments: {
                collection: "users",
                pipeline: [
                  { $match: { status: "active" } },
                  { $sort: { lastLogin: -1 } }
                ],
                verbosity: "executionStats"
              }
            }
          ]
        },
        {
          name: "sample",
          description: "Get random sample documents from a collection",
          inputSchema: {
            type: "object",
            properties: {
              collection: {
                type: "string",
                description: "Name of the collection to sample from",
              },
              count: {
                type: "number",
                description: "Number of documents to sample (default: 5, max: 10)",
                minimum: 1,
                maximum: 10,
                default: 5,
              }
            },
            required: ["collection"],
          },
          examples: [
            {
              name: "Get 5 random documents",
              arguments: {
                collection: "listings",
                count: 5
              }
            }
          ]
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "aggregate": {
          if (!this.isAggregateToolArguments(request.params.arguments)) {
            return {
              content: [{ type: "text", text: "Invalid arguments: expected collection and pipeline parameters" }],
              isError: true,
            };
          }

          const { collection, pipeline, options = {} } = request.params.arguments;
          
          try {
            const hasLimit = pipeline.some(stage => "$limit" in stage);
            const safePipeline = hasLimit ? pipeline : [...pipeline, { $limit: 1000 }];
            
            const result = await this.db
              .collection(collection)
              .aggregate(safePipeline, {
                ...options,
                maxTimeMS: options.maxTimeMS || 30000
              })
              .toArray();

            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              isError: false,
            };
          } catch (error) {
            return {
              content: [{ 
                type: "text", 
                text: `Aggregation error: ${error instanceof Error ? error.message : 'Unknown error'}` 
              }],
              isError: true,
            };
          }
        }

        case "explain": {
          if (!this.isExplainToolArguments(request.params.arguments)) {
            return {
              content: [{ type: "text", text: "Invalid arguments: expected collection and pipeline parameters" }],
              isError: true,
            };
          }

          const { collection, pipeline } = request.params.arguments;
          
          try {
            const result = await this.db
              .collection(collection)
              .aggregate(pipeline, { explain: true });

            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              isError: false,
            };
          } catch (error) {
            return {
              content: [{ 
                type: "text", 
                text: `Explain error: ${error instanceof Error ? error.message : 'Unknown error'}` 
              }],
              isError: true,
            };
          }
        }

        case "sample": {
          if (!this.isSampleDocumentsArguments(request.params.arguments)) {
            return {
              content: [{ type: "text", text: "Invalid arguments: expected collection name" }],
              isError: true,
            };
          }

          const { collection, count = 5 } = request.params.arguments;
          const safeCount = Math.min(Math.max(1, count), 10);

          try {
            const result = await this.db
              .collection(collection)
              .aggregate([
                { $sample: { size: safeCount } }
              ])
              .toArray();

            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              isError: false,
            };
          } catch (error) {
            return {
              content: [{ 
                type: "text", 
                text: `Sample error: ${error instanceof Error ? error.message : 'Unknown error'}` 
              }],
              isError: true,
            };
          }
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private isAggregateToolArguments(value: unknown): value is AggregateToolArguments {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.collection === 'string' &&
      Array.isArray(obj.pipeline) &&
      (!obj.options || typeof obj.options === 'object')
    );
  }

  private isExplainToolArguments(value: unknown): value is ExplainToolArguments {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.collection === 'string' &&
      Array.isArray(obj.pipeline) &&
      (!obj.verbosity || ["queryPlanner", "executionStats", "allPlansExecution"].includes(obj.verbosity as string))
    );
  }

  private isSampleDocumentsArguments(value: unknown): value is SampleDocumentsArguments {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.collection === 'string' &&
      (!obj.count || (typeof obj.count === 'number' && obj.count > 0 && obj.count <= 10))
    );
  }

  async connect(): Promise<void> {
    try {
      this.client = new MongoClient(MONGODB_URI!);
      await this.client.connect();
      this.db = this.client.db();
      console.log("Connected to MongoDB successfully");
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  async run(): Promise<void> {
    await this.connect();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("MongoDB MCP server running on stdio");
  }
}

const server = new MongoDBServer();
server.run().catch((error) => {
  console.error(error);
  server.close().catch(console.error);
  process.exit(1);
});
