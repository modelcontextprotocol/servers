import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/http.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const server = new McpServer({
    name: "High Story",
    version: "1.0.0"
});

const API_BASE_URL = "https://jeprtikkylotvcddrqvm.supabase.co/functions/v1";

/**
 * Helper to call High Story Edge Functions
 */
async function callHighStoryAPI(endpoint: string, payload: any) {
    const apiKey = process.env.HIGHSTORY_API_KEY;
    if (!apiKey) {
        throw new Error("Missing HIGHSTORY_API_KEY environment variable. Please generate one in your High Story settings.");
    }

    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `API Error: ${response.statusText}`);
    }

    return await response.json();
}

// --- Tools Implementation ---

server.tool(
    "execute_campaign",
    "Create and execute an AI content campaign for a brand. Generates social media posts based on brand analysis.",
    {
        brand_url: z.string().optional().describe("The brand website URL (optional)"),
        campaign_objective: z.string().describe("The campaign goal"),
        workspace_id: z.string().optional().describe("High Story workspace ID (optional)"),
    },
    async (args) => {
        try {
            const data = await callHighStoryAPI('execute-campaign', {
                ...args,
                is_onboarding: false
            });
            return { content: [{ type: "text", text: `Campaign started successfully! View it in your dashboard.` }] };
        } catch (e: any) {
            return { isError: true, content: [{ type: "text", text: `Error: ${e.message}` }] };
        }
    }
);

export default server;
