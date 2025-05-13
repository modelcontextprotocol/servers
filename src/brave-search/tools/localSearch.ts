import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { handleRequest as handleWebSearchRequest, type Response as WebSearchResponse } from "./webSearch.js";
import { checkRateLimit } from "../rateLimit.js";
import { BRAVE_API_KEY } from "../env.js";

export const DESCRIPTION: Tool = {
    name: "brave_local_search",
    description:
        "Searches for local businesses and places using Brave's Local Search API. " +
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
                description: "Local search query (e.g. 'pizza near Central Park')",
            },
            count: {
                type: "number",
                description: "Number of results (1-20, default 5)",
                default: 5,
            },
        },
        required: ["query"],
    },
};

interface BraveLocation {
    id: string;
    name: string;
    address: {
        streetAddress?: string;
        addressLocality?: string;
        addressRegion?: string;
        postalCode?: string;
    };
    coordinates?: {
        latitude: number;
        longitude: number;
    };
    phone?: string;
    rating?: {
        ratingValue?: number;
        ratingCount?: number;
    };
    openingHours?: string[];
    priceRange?: string;
}

interface BravePoiResponse {
    results: BraveLocation[];
}

interface BraveDescription {
    descriptions: { [id: string]: string };
}

export async function handleRequest(args: unknown) {
    if (!checkArgs(args)) {
        throw new Error("Invalid arguments for brave_local_search");
    }
    const { query, count = 5 } = args;
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

async function search(query: string, count: number = 5) {
    checkRateLimit();
    // Initial search to get location IDs
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
        }
    });

    if (!webResponse.ok) {
        throw new Error(`Brave API error: ${webResponse.status} ${webResponse.statusText}\n${await webResponse.text()}`);
    }

    const webData = await webResponse.json() as WebSearchResponse;
    const locationIds = webData.locations?.results?.filter((r): r is { id: string; title?: string } => r.id != null).map(r => r.id) || [];

    if (locationIds.length === 0) {
        return handleWebSearchRequest({ query, count }); // Fallback to web search
    }

    // Get POI details and descriptions in parallel
    const [poisData, descriptionsData] = await Promise.all([
        getPoisData(locationIds),
        getDescriptionsData(locationIds)
    ]);

    return formatLocalResults(poisData, descriptionsData);
}

async function getPoisData(ids: string[]): Promise<BravePoiResponse> {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/local/pois');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));
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

    const poisResponse = await response.json() as BravePoiResponse;
    return poisResponse;
}

async function getDescriptionsData(ids: string[]): Promise<BraveDescription> {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/local/descriptions');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));
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

    const descriptionsData = await response.json() as BraveDescription;
    return descriptionsData;
}

function formatLocalResults(poisData: BravePoiResponse, descData: BraveDescription): string {
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
