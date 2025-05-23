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
interface SearchNewsArgs {
    query: string;
    from?: string;
    to?: string;
    language?: string;
    sortBy?: string;
    pageSize?: number;
    page?: number;
}

interface TopHeadlinesArgs {
    country?: string;
    category?: string;
    sources?: string;
    pageSize?: number;
    page?: number;
}

interface GetSourcesArgs {
    category?: string;
    language?: string;
    country?: string;
}

// Tool definitions
const searchNewsTool: Tool = {
    name: "news_search",
    description: "Search for news articles by keywords, date range, and other filters",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Keywords or phrases to search for in the article title and body",
            },
            from: {
                type: "string",
                description: "The oldest article allowed (format: YYYY-MM-DD)",
            },
            to: {
                type: "string",
                description: "The newest article allowed (format: YYYY-MM-DD)",
            },
            language: {
                type: "string",
                description: "The 2-letter ISO-639-1 code of the language (e.g., en, es, fr)",
            },
            sortBy: {
                type: "string",
                description: "Sort order: relevancy, popularity, publishedAt",
                enum: ["relevancy", "popularity", "publishedAt"],
            },
            pageSize: {
                type: "number",
                description: "Number of results to return per page (default: 20, max: 100)",
                default: 20,
            },
            page: {
                type: "number",
                description: "Page number for paginated results (default: 1)",
                default: 1,
            },
        },
        required: ["query"],
    },
};

const topHeadlinesTool: Tool = {
    name: "news_top_headlines",
    description: "Get top headlines by country, category, or sources",
    inputSchema: {
        type: "object",
        properties: {
            country: {
                type: "string",
                description: "The 2-letter ISO 3166-1 code of the country (e.g., us, gb, jp)",
            },
            category: {
                type: "string",
                description: "News category",
                enum: ["business", "entertainment", "general", "health", "science", "sports", "technology"],
            },
            sources: {
                type: "string",
                description: "Comma-separated string of news source IDs (cannot be mixed with country or category)",
            },
            pageSize: {
                type: "number",
                description: "Number of results to return per page (default: 20, max: 100)",
                default: 20,
            },
            page: {
                type: "number",
                description: "Page number for paginated results (default: 1)",
                default: 1,
            },
        },
    },
};

const getSourcesTool: Tool = {
    name: "news_sources",
    description: "Get news sources available in the News API",
    inputSchema: {
        type: "object",
        properties: {
            category: {
                type: "string",
                description: "News category to filter sources by",
                enum: ["business", "entertainment", "general", "health", "science", "sports", "technology"],
            },
            language: {
                type: "string",
                description: "The 2-letter ISO-639-1 code of the language (e.g., en, es, fr)",
            },
            country: {
                type: "string",
                description: "The 2-letter ISO 3166-1 code of the country (e.g., us, gb, jp)",
            },
        },
    },
};

class NewsAPIClient {
    private baseUrl = "https://newsapi.org/v2";
    private headers: { "X-Api-Key": string };

    constructor(apiKey: string) {
        this.headers = { "X-Api-Key": apiKey };
    }

    async searchNews(args: SearchNewsArgs): Promise<any> {
        const params = new URLSearchParams({
            q: args.query,
        });

        if (args.from) params.append("from", args.from);
        if (args.to) params.append("to", args.to);
        if (args.language) params.append("language", args.language);
        if (args.sortBy) params.append("sortBy", args.sortBy);
        if (args.pageSize) params.append("pageSize", args.pageSize.toString());
        if (args.page) params.append("page", args.page.toString());

        const response = await fetch(`${this.baseUrl}/everything?${params}`, {
            headers: this.headers,
        });

        return response.json();
    }

    async getTopHeadlines(args: TopHeadlinesArgs): Promise<any> {
        const params = new URLSearchParams();

        if (args.country) params.append("country", args.country);
        if (args.category) params.append("category", args.category);
        if (args.sources) params.append("sources", args.sources);
        if (args.pageSize) params.append("pageSize", args.pageSize.toString());
        if (args.page) params.append("page", args.page.toString());

        const response = await fetch(`${this.baseUrl}/top-headlines?${params}`, {
            headers: this.headers,
        });

        return response.json();
    }

    async getSources(args: GetSourcesArgs): Promise<any> {
        const params = new URLSearchParams();

        if (args.category) params.append("category", args.category);
        if (args.language) params.append("language", args.language);
        if (args.country) params.append("country", args.country);

        const response = await fetch(`${this.baseUrl}/sources?${params}`, {
            headers: this.headers,
        });

        return response.json();
    }
}

async function main() {
    const apiKey = process.env.NEWS_API_KEY;

    if (!apiKey) {
        console.error("Please set NEWS_API_KEY environment variable");
        process.exit(1);
    }

    console.error("Starting News API MCP Server...");
    const server = new Server(
        {
            name: "News API MCP Server",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    const newsClient = new NewsAPIClient(apiKey);

    server.setRequestHandler(
        CallToolRequestSchema,
        async (request: CallToolRequest) => {
            console.error("Received CallToolRequest:", request);
            try {
                if (!request.params.arguments) {
                    throw new Error("No arguments provided");
                }

                switch (request.params.name) {
                    case "news_search": {
                        const args = request.params.arguments as unknown as SearchNewsArgs;
                        if (!args.query) {
                            throw new Error("Missing required argument: query");
                        }
                        const response = await newsClient.searchNews(args);
                        return {
                            content: [{ type: "text", text: JSON.stringify(response) }],
                        };
                    }
                    case "news_top_headlines": {
                        const args = request.params.arguments as unknown as TopHeadlinesArgs;
                        const response = await newsClient.getTopHeadlines(args);
                        return {
                            content: [{ type: "text", text: JSON.stringify(response) }],
                        };
                    }
                    case "news_sources": {
                        const args = request.params.arguments as unknown as GetSourcesArgs;
                        const response = await newsClient.getSources(args);
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
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.error("Received ListToolsRequest");
        return {
            tools: [searchNewsTool, topHeadlinesTool, getSourcesTool],
        };
    });

    const transport = new StdioServerTransport();
    console.error("Connecting server to transport...");
    await server.connect(transport);
    console.error("News API MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
