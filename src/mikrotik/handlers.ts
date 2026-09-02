import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { connectHandler } from "./tools/connect.js";
import { getHandler } from "./tools/get.js";
import { reportHandler } from "./tools/report.js";
import { awrHandler } from "./tools/awr.js";

export { initializeApi } from "./db.js";
export { listResourcesHandler, readResourceHandler } from "./resources.js";

const toolHandlers: Record<string, (request: CallToolRequest) => Promise<any>> = {
    "mk-connect": connectHandler,
    "mk-get": getHandler,
    "mk-report": reportHandler,
    "mk-awr": awrHandler,
};

export const callToolHandler = async (request: CallToolRequest) => {
    const handler = toolHandlers[request.params.name];
    if (handler) {
        return handler(request);
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
};
