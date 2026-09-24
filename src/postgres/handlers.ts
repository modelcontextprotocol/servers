import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { queryHandler } from "./tools/query.js";
import { statsHandler } from "./tools/stats.js";
import { connectHandler } from "./tools/connect.js";
import { explainHandler } from "./tools/explain.js";
import { awrHandler } from "./tools/awr.js";

export { listResourcesHandler, readResourceHandler } from "./resources.js";

const toolHandlers: Record<string, (request: CallToolRequest) => Promise<any>> = {
    "pg-query": queryHandler,
    "pg-stats": statsHandler,
    "pg-explain": explainHandler,
    "pg-connect": connectHandler,
    "pg-awr": awrHandler,
};

export const callToolHandler = async (request: CallToolRequest) => {
    const handler = toolHandlers[request.params.name];
    if (handler) {
        return handler(request);
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
};

