import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { checkRateLimit } from "../rateLimit.js";
import { BRAVE_API_KEY } from "../env.js";

export const DESCRIPTION: Tool = {
    name: "brave_web_search",
    description:
        "Performs a web search using the Brave Search API, ideal for general queries, news, articles, and online content. " +
        "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
        "Supports pagination, content filtering, and freshness controls. " +
        "Maximum 20 results per request, with offset for pagination. ",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Search query (max 400 chars, 50 words)",
            },
            count: {
                type: "number",
                description: "Number of results (1-20, default 10)",
                default: 10,
            },
            offset: {
                type: "number",
                description: "Pagination offset (max 9, default 0)",
                default: 0,
            },
        },
        required: ["query"],
    },
};

export interface Response {
    web?: {
        results?: Array<{
            title: string;
            description: string;
            url: string;
            language?: string;
            published?: string;
            rank?: number;
        }>;
    };
    locations?: {
        results?: Array<{
            id: string; // Required by API
            title?: string;
        }>;
    };
}

export async function handleRequest(args: unknown) {
    if (!checkArgs(args)) {
        throw new Error("Invalid arguments for brave_web_search");
    }
    const { query, count = 10 } = args;
    const results = await search(query, count);
    return {
        content: [{ type: "text", text: results }],
        isError: false,
    };
}

function checkArgs(args: unknown): args is { query: string; count?: number } {
    return (
        typeof args === "object" &&
        args !== null &&
        "query" in args &&
        typeof (args as { query: string }).query === "string"
    );
}

async function search(query: string, count: number = 10, offset: number = 0) {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', Math.min(count, 20).toString()); // API limit
    url.searchParams.set('offset', offset.toString());

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
    }

    const data = await response.json() as Response;

    // Extract just web results
    const results = (data.web?.results || []).map(result => ({
        title: result.title || '',
        description: result.description || '',
        url: result.url || ''
    }));

    return results.map(r =>
        `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`
    ).join('\n\n');
}
