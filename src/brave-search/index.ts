#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent"; // Newly added

const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:10809'; // You can modify the port as needed
const agent = new HttpsProxyAgent(proxyUrl); // Newly added

const WEB_SEARCH_TOOL = {
    name: "brave_web_search",
    description: "Performs a web search using the Brave Search API, ideal for general queries, news, articles, and online content. " +
        "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
        "Supports pagination, content filtering, and freshness controls. " +
        "Maximum 20 results per request, with offset for pagination. ",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Search query (max 400 chars, 50 words)"
            },
            count: {
                type: "number",
                description: "Number of results (1-20, default 10)",
                default: 10
            },
            offset: {
                type: "number",
                description: "Pagination offset (max 9, default 0)",
                default: 0
            },
        },
        required: ["query"],
    },
};
const LOCAL_SEARCH_TOOL = {
    name: "brave_local_search",
    description: "Searches for local businesses and places using Brave's Local Search API. " +
        "Best for queries related to physical locations, businesses, restaurants, services, etc. " +
        "Returns detailed information including:\n" +
        "- Business names and addresses\n" +
        "- Ratings and review counts\n" +
        "- Phone numbers and opening hours\n" +
        "Use this when the query implies 'near me' or mentions specific locations. " +
        "Automatically falls back to web search if no local results are found.",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Local search query (e.g. 'pizza near Central Park')"
            },
            count: {
                type: "number",
                description: "Number of results (1-20, default 5)",
                default: 5
            },
        },
        required: ["query"]
    }
};

// Server implementation
const server = new Server({
    name: "example-servers/brave-search",
    version: "0.1.0",
}, {
    capabilities: {
        tools: {},
    },
});

// Check for API key
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
if (!BRAVE_API_KEY) {
    console.error("Error: BRAVE_API_KEY environment variable is required");
    process.exit(1);
}

const RATE_LIMIT = {
    perSecond: 1,
    perMonth: 15000
};

let requestCount = {
    second: 0,
    month: 0,
    lastReset: Date.now()
};

function checkRateLimit() {
    const now = Date.now();
    if (now - requestCount.lastReset > 1000) {
        requestCount.second = 0;
        requestCount.lastReset = now;
    }
    if (requestCount.second >= RATE_LIMIT.perSecond ||
        requestCount.month >= RATE_LIMIT.perMonth) {
        throw new Error('Rate limit exceeded');
    }
    requestCount.second++;
    requestCount.month++;
}

function isBraveWebSearchArgs(args) {
    return (typeof args === "object" &&
        args !== null &&
        "query" in args &&
        typeof args.query === "string");
}

function isBraveLocalSearchArgs(args) {
    return (typeof args === "object" &&
        args !== null &&
        "query" in args &&
        typeof args.query === "string");
}

async function performWebSearch(query, count = 10, offset = 0) {
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
        },
        agent // Add proxy
    });

    if (!response.ok) {
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
    }
    const data = await response.json();
    const results = (data.web?.results || []).map(result => ({
        title: result.title || '',
        description: result.description || '',
        url: result.url || ''
    }));
    return results.map(r => `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`).join('\n\n');
}

async function performLocalSearch(query, count = 5) {
    checkRateLimit();
    const webUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    webUrl.searchParams.set('q', query);
    webUrl.searchParams.set('search_lang', 'en');
    webUrl.searchParams.set('result_filter', 'locations');
    webUrl.searchParams.set('count', Math.min(count, 20).toString());

    const webResponse = await fetch(webUrl, {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_API_KEY
        },
        agent // Add proxy
    });

    if (!webResponse.ok) {
        throw new Error(`Brave API error: ${webResponse.status} ${webResponse.statusText}\n${await webResponse.text()}`);
    }

    const webData = await webResponse.json();
    const locationIds = webData.locations?.results?.filter((r) => r.id != null).map(r => r.id) || [];

    if (locationIds.length === 0) {
        return performWebSearch(query, count); // Fallback to web search
    }

    const [poisData, descriptionsData] = await Promise.all([
        getPoisData(locationIds),
        getDescriptionsData(locationIds)
    ]);
    return formatLocalResults(poisData, descriptionsData);
}

async function getPoisData(ids) {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/local/pois');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_API_KEY
        },
        agent // Add proxy
    });

    if (!response.ok) {
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
    }
    const poisResponse = await response.json();
    return poisResponse;
}

async function getDescriptionsData(ids) {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/local/descriptions');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_API_KEY
        },
        agent // Add proxy
    });

    if (!response.ok) {
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
    }
    const descriptionsData = await response.json();
    return descriptionsData;
}

function formatLocalResults(poisData, descData) {
    return (poisData.results || []).map(poi => {
        const address = [
            poi.address?.streetAddress ?? '',
            poi.address?.addressLocality ?? '',
            poi.address?.addressRegion ?? '',
            poi.address?.postalCode ?? ''
        ].filter(part => part !== '').join(', ') || 'N/A';
        return `Name: ${poi.name}
Address: ${address}
Phone: ${poi.phone || 'N/A'}
Rating: ${poi.rating?.ratingValue ?? 'N/A'} (${poi.rating?.ratingCount ?? 0} reviews)
Price Range: ${poi.priceRange || 'N/A'}
Hours: ${(poi.openingHours || []).join(', ') || 'N/A'}
Description: ${descData.descriptions[poi.id] || 'No description available'}
`;
    }).join('\n---\n') || 'No local results found';
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [WEB_SEARCH_TOOL, LOCAL_SEARCH_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const { name, arguments: args } = request.params;
        if (!args) {
            throw new Error("No arguments provided");
        }
        switch (name) {
            case "brave_web_search": {
                if (!isBraveWebSearchArgs(args)) {
                    throw new Error("Invalid arguments for brave_web_search");
                }
                const { query, count = 10 } = args;
                const results = await performWebSearch(query, count);
                return {
                    content: [{ type: "text", text: results }],
                    isError: false,
                };
            }
            case "brave_local_search": {
                if (!isBraveLocalSearchArgs(args)) {
                    throw new Error("Invalid arguments for brave_local_search");
                }
                const { query, count = 5 } = args;
                const results = await performLocalSearch(query, count);
                return {
                    content: [{ type: "text", text: results }],
                    isError: false,
                };
            }
            default:
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});

async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Brave Search MCP Server running on stdio");
}

runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
