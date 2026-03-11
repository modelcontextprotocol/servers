import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/http.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const server = new McpServer({
    name: "High Story",
    version: "1.0.0"
});

async function authenticate(authHeader: string | null) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    
    if (!token) throw new Error("Missing Authorization token");

    if (token.startsWith('hs_live_')) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
        const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const { data: keyRecord, error } = await supabaseAdmin
            .from('user_api_keys')
            .select('user_id')
            .eq('key_hash', hash)
            .is('revoked_at', null)
            .single();

        if (error || !keyRecord) throw new Error("Invalid or revoked API key");
        
        return { userId: keyRecord.user_id, authHeader };
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) throw new Error("Invalid session token");
    
    return { userId: user.id, authHeader };
}

server.tool(
    "execute_campaign",
    "Create and execute an AI content campaign for a brand.",
    {
        brand_url: z.string().optional(),
        campaign_objective: z.string(),
        workspace_id: z.string().optional()
    },
    async (args) => {
        return { content: [{ type: "text", text: "Campaign execution logic triggered via High Story Cloud." }] };
    }
);

export default server;
