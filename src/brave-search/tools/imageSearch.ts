import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { checkRateLimit } from "../rateLimit.js";
import { BRAVE_API_KEY } from "../env.js";

export const DESCRIPTION: Tool = {
    name: "brave_image_search",
    description:
        "Performs an image search using the Brave Search API, ideal for finding images, photos, and visual content. " +
        "Use this for looking up pictures, artwork, visual references, or when you need diverse image sources. " +
        "Maximum of 100 results per request, with the default count set to 50.\n\n" +
        "REQUIRED FORMAT FOR DISPLAYING RESULTS:\n" +
        "1. Present results as a simple Markdown list\n" +
        "2. Each result must follow this exact format on a new line:\n" +
        "  - [Brief descriptive title](image_url) - Source domain\n\n" +
        "Example correct formatting:\n" +
        "- [Brave Search Interface with Results](image_url) - brave.com\n" +
        "- [Close-up portrait of Brendan Eich](image_url) - brendaneich.com\n\n" +
        "Guidelines:\n" +
        "- Do not add extra formatting, line breaks, or nested information\n" +
        "- Keep titles brief (5-10 words) but descriptive\n" +
        "- Include all results returned by the API\n" +
        "- Present the list directly, with at most one brief introductory sentence\n" +
        "- Source domain should be the root domain only (e.g., 'nytimes.com' not " +
        "'www.nytimes.com/section')",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Search query (max 400 chars, 50 words)",
            },
            count: {
                type: "number",
                description: "Number of results (1-100, default 50)",
                default: 50,
            },
            safesearch: {
                type: "string",
                description: "Safe search level (off, strict)",
                default: "strict",
            }
        },
        required: ["query"],
    },
};

interface Response {
    type: "images";
    query: Query;
    results: Array<ImageResult>;
}

interface Query {
    original: string; // The original query that was requested
    altered?: string; // Altered by the spellchecker; the actual query used
    spellcheck_off?: boolean; // Whether spellcheck was disabled
    show_strict_warning?: boolean; // True if lack of results is due to strict filtering
}

interface ImageResult {
    type: "image_result"; // Type of the result. Always "image_result" for image search
    title?: string; // Title of the image
    url?: string; // The original page URL where the image was found
    source?: string; // The source domain where the image was found
    page_fetched?: string; // The ISO date time (YYYY-MM-DDTHH:MM:SSZ) when the page was last fetched
    thumbnail?: Thumbnail; // Thumbnail of the image
    properties?: Properties; // Metadata for the image
    meta_url?: MetaUrl; // Aggregated information on the url associated with the image search result
}

interface Thumbnail {
    src?: string; // URL of the thumbnail image
}

interface Properties {
    url?: string; // URL of the image
    placeholder?: string; // Lower resolution placeholder image URL
}

interface MetaUrl {
    scheme?: string; // URL scheme (http, https)
    netloc?: string; // Network location (domain)
    hostname?: string; // The lowercased domain name extracted from the url
    favicon?: string; // URL of the favicon for the domain
    path?: string; // Path of the URL
}

export async function handleRequest(args: unknown) {
    if (!checkArgs(args)) {
        throw new Error("Invalid input arguments");
    }

    const { query, count = 10, safesearch = "strict" } = args;
    const results = await search(query, count, safesearch);

    return {
        content: [{ type: "text", text: results }],
        isError: false,
    }
}

function checkArgs(args: unknown): args is { query: string; count?: number; safesearch?: string } {
    return (
        typeof args === "object" &&
        args !== null &&
        "query" in args &&
        typeof (args as { query: string }).query === "string"
    );
}

async function search(query: string, count: number = 50, safesearch: string = "strict") {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', Math.min(count, 100).toString()); // API limit
    url.searchParams.set('safesearch', safesearch);

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch image search results: ${response.statusText}`);
    }

    const data = await response.json() as Response;

    return data.results.map(result => [
        `Title: ${result.title}`,
        `Location: ${result.thumbnail?.src}`,
        `Source: ${result.meta_url?.hostname}`,
    ].join("\n")).join("\n\n");
}
