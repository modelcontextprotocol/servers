import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClient } from 'redis';

// Get Redis URL from command line args or use default
const REDIS_URL = process.argv[2] || "redis://localhost:6379";
const redisClient = createClient({
    url: REDIS_URL
});

// Define Zod schemas for validation
const SetArgumentsSchema = z.object({
    key: z.string(),
    value: z.string(),
    expireSeconds: z.number().optional(),
});

const GetArgumentsSchema = z.object({
    key: z.string(),
});

const DeleteArgumentsSchema = z.object({
    key: z.string().or(z.array(z.string())),
});

const ListArgumentsSchema = z.object({
    pattern: z.string().default("*"),
});

// Create server instance
const server = new Server(
    {
        name: "redis",
        version: "1.0.0"
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "set",
                description: "Set a Redis key-value pair with optional expiration",
                inputSchema: {
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "Redis key",
                        },
                        value: {
                            type: "string",
                            description: "Value to store",
                        },
                        expireSeconds: {
                            type: "number",
                            description: "Optional expiration time in seconds",
                        },
                    },
                    required: ["key", "value"],
                },
            },
            {
                name: "get",
                description: "Get value by key from Redis",
                inputSchema: {
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "Redis key to retrieve",
                        },
                    },
                    required: ["key"],
                },
            },
            {
                name: "delete",
                description: "Delete one or more keys from Redis",
                inputSchema: {
                    type: "object",
                    properties: {
                        key: {
                            oneOf: [
                                { type: "string" },
                                { type: "array", items: { type: "string" } }
                            ],
                            description: "Key or array of keys to delete",
                        },
                    },
                    required: ["key"],
                },
            },
            {
                name: "list",
                description: "List Redis keys matching a pattern",
                inputSchema: {
                    type: "object",
                    properties: {
                        pattern: {
                            type: "string",
                            description: "Pattern to match keys (default: *)",
                        },
                    },
                },
            },
        ],
    };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "set") {
            const { key, value, expireSeconds } = SetArgumentsSchema.parse(args);
            
            if (expireSeconds) {
                await redisClient.setEx(key, expireSeconds, value);
            } else {
                await redisClient.set(key, value);
            }

            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully set key: ${key}`,
                    },
                ],
            };
        } else if (name === "get") {
            const { key } = GetArgumentsSchema.parse(args);
            const value = await redisClient.get(key);

            if (value === null) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Key not found: ${key}`,
                        },
                    ],
                };
            }

            return {
                content: [
                    {
                        type: "text",
                        text: `${value}`,
                    },
                ],
            };
        } else if (name === "delete") {
            const { key } = DeleteArgumentsSchema.parse(args);
            
            if (Array.isArray(key)) {
                await redisClient.del(key);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully deleted ${key.length} keys`,
                        },
                    ],
                };
            } else {
                await redisClient.del(key);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully deleted key: ${key}`,
                        },
                    ],
                };
            }
        } else if (name === "list") {
            const { pattern } = ListArgumentsSchema.parse(args);
            const keys = await redisClient.keys(pattern);

            return {
                content: [
                    {
                        type: "text",
                        text: keys.length > 0 
                            ? `Found keys:\n${keys.join('\n')}`
                            : "No keys found matching pattern",
                    },
                ],
            };
        } else {
            throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(
                `Invalid arguments: ${error.errors
                    .map((e) => `${e.path.join(".")}: ${e.message}`)
                    .join(", ")}`
            );
        }
        throw error;
    }
});

// Start the server
async function main() {
    try {
        // Connect to Redis
        redisClient.on('error', (err: Error) => console.error('Redis Client Error', err));
        await redisClient.connect();
        console.error(`Connected to Redis successfully at ${REDIS_URL}`);

        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Redis MCP Server running on stdio");
    } catch (error) {
        console.error("Error during startup:", error);
        await redisClient.quit();
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    redisClient.quit().finally(() => process.exit(1));
});