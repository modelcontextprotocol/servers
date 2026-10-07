import { ListResourcesRequest, ReadResourceRequest, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { getApi } from "./db.js";

export const listResourcesHandler = async (request: ListResourcesRequest) => {
    const currentApi = getApi();
    if (!currentApi) {
        return { resources: [] };
    }

    try {
        const intReplies = await currentApi.talk(["/interface/print"]);
        const bridgeReplies = await currentApi.talk(["/interface/bridge/print"]);
        const portReplies = await currentApi.talk(["/interface/bridge/port/print"]);
        const routeReplies = await currentApi.talk(["/ip/route/print"]);

        const interfaces = intReplies.filter((r) => r.command === "!re").map((r) => r.attributes);
        const bridges = bridgeReplies.filter((r) => r.command === "!re").map((r) => r.attributes);
        const bridgePorts = portReplies.filter((r) => r.command === "!re").map((r) => r.attributes);
        const routes = routeReplies.filter((r) => r.command === "!re").map((r) => r.attributes);

        const resources: any[] = [];

        // Regular interfaces
        interfaces.forEach((i) => {
            resources.push({
                uri: `mikrotik://interface/${i.name}`,
                mimeType: "application/json",
                name: `Interface ${i.name}`,
                description: `MikroTik interface ${i.name} (${i.type})`,
            });
        });

        // Bridges
        bridges.forEach((b) => {
            resources.push({
                uri: `mikrotik://bridge/${b.name}`,
                mimeType: "application/json",
                name: `Bridge ${b.name}`,
                description: `MikroTik bridge ${b.name}`,
            });
        });

        // Bridge ports
        bridgePorts.forEach((p) => {
            resources.push({
                uri: `mikrotik://bridge/${p.bridge}/${p.interface}`,
                mimeType: "application/json",
                name: `Port ${p.interface} on ${p.bridge}`,
                description: `MikroTik bridge port ${p.interface} assigned to bridge ${p.bridge}`,
            });
        });

        // IP Routes
        routes.forEach((r) => {
            const id = r[".id"].startsWith('*') ? r[".id"].slice(1) : r[".id"];
            resources.push({
                uri: `mikrotik://route/${id}`,
                mimeType: "application/json",
                name: `Route to ${r["dst-address"]}`,
                description: `MikroTik IP route to ${r["dst-address"]} via ${r["gateway"] || "unknown"}`,
            });
        });

        return { resources };
    } catch (error: any) {
        throw new Error(`Error listing resources: ${error.message}`);
    }
};

export const readResourceHandler = async (request: ReadResourceRequest) => {
    const { uri } = request.params;
    const currentApi = getApi();
    if (!currentApi) {
        throw new McpError(ErrorCode.InvalidRequest, "Not connected to MikroTik. Use mk-connect first.");
    }

    try {
        // Handle interface resource
        const ifaceMatch = uri.match(/^mikrotik:\/\/interface\/(.+)$/);
        if (ifaceMatch) {
            const name = decodeURIComponent(ifaceMatch[1]);
            const replies = await currentApi.talk(["/interface/print"]);
            const item = replies.filter((r) => r.command === "!re").map((r) => r.attributes).find(i => i.name === name);
            if (!item) throw new Error(`Interface not found: ${name}`);
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(item, null, 2) }],
            };
        }

        // Handle bridge port resource (check this first because it's more specific than bridge)
        const portMatch = uri.match(/^mikrotik:\/\/bridge\/([^\/]+)\/(.+)$/);
        if (portMatch) {
            const bridgeName = decodeURIComponent(portMatch[1]);
            const portName = decodeURIComponent(portMatch[2]);
            const replies = await currentApi.talk(["/interface/bridge/port/print"]);
            const item = replies.filter((r) => r.command === "!re").map((r) => r.attributes).find(i => i.bridge === bridgeName && i.interface === portName);
            if (!item) throw new Error(`Bridge port not found: ${portName} on ${bridgeName}`);
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(item, null, 2) }],
            };
        }

        // Handle bridge resource
        const bridgeMatch = uri.match(/^mikrotik:\/\/bridge\/(.+)$/);
        if (bridgeMatch) {
            const name = decodeURIComponent(bridgeMatch[1]);
            const replies = await currentApi.talk(["/interface/bridge/print"]);
            const item = replies.filter((r) => r.command === "!re").map((r) => r.attributes).find(i => i.name === name);
            if (!item) throw new Error(`Bridge not found: ${name}`);
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(item, null, 2) }],
            };
        }

        // Handle route resource
        const routeMatch = uri.match(/^mikrotik:\/\/route\/(.+)$/);
        if (routeMatch) {
            const rawId = decodeURIComponent(routeMatch[1]);
            const id = rawId.startsWith('*') ? rawId : '*' + rawId;
            const replies = await currentApi.talk(["/ip/route/print"]);
            const item = replies.filter((r) => r.command === "!re").map((r) => r.attributes).find(r => r[".id"] === id);
            if (!item) throw new Error(`Route not found: ${id}`);
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(item, null, 2) }],
            };
        }

        throw new Error(`Invalid resource URI: ${uri}`);
    } catch (error: any) {
        throw new Error(`Error reading resource: ${error.message}`);
    }
};
