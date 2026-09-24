import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { getApi } from "../db.js";

export const reportHandler = async (request: CallToolRequest) => {
    const currentApi = getApi();
    if (!currentApi) {
        return {
            content: [{ type: "text", text: "Not connected to MikroTik. Use mk-connect first." }],
            isError: true,
        };
    }

    try {
        const report: any = {};

        // 1. System Resources
        const resReplies = await currentApi.talk(["/system/resource/print"]);
        report.resources = resReplies.filter(r => r.command === "!re").map(r => r.attributes)[0] || {};

        // 2. Routerboard Info
        const rbReplies = await currentApi.talk(["/system/routerboard/print"]);
        report.routerboard = rbReplies.filter(r => r.command === "!re").map(r => r.attributes)[0] || {};

        // 3. System Health (might fail on some boards)
        try {
            const healthReplies = await currentApi.talk(["/system/health/print"]);
            report.health = healthReplies.filter(r => r.command === "!re").map(r => r.attributes);
        } catch (e) {
            report.health = "Not available or error: " + (e as Error).message;
        }

        // 4. Interfaces and Traffic
        const intReplies = await currentApi.talk(["/interface/print"]);
        const interfaces = intReplies.filter(r => r.command === "!re").map(r => r.attributes);
        report.interfaces = interfaces;

        const runningInterfaces = interfaces.filter(i => i.running === "true" && i.disabled === "false").map(i => i.name);

        if (runningInterfaces.length > 0) {
            report.traffic = {};
            for (const name of runningInterfaces) {
                try {
                    const trafficReplies = await currentApi.talk(["/interface/monitor-traffic", `=interface=${name}`, "=once="]);
                    report.traffic[name] = trafficReplies.filter(r => r.command === "!re").map(r => r.attributes)[0] || {};
                } catch (e) {
                    report.traffic[name] = "Error: " + (e as Error).message;
                }
            }
        }

        // 5. CPU Profile (brief snapshot if possible)
        try {
            const profileReplies = await currentApi.talk(["/tool/profile", "=once="]);
            report.cpuProfile = profileReplies.filter(r => r.command === "!re").map(r => r.attributes);
        } catch (e) {
            report.cpuProfile = "Not available or error: " + (e as Error).message;
        }

        return {
            content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error generating report: ${error.message}` }],
            isError: true,
        };
    }
};
