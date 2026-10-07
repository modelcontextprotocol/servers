import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { getNasHost, getNasSid, fetchWithTimeout } from "./connect.js";

export async function fileInfoHandler(request: CallToolRequest) {
    const { path, filename } = request.params.arguments || {};
    const nas_host = getNasHost();
    const nas_sid = getNasSid();

    if (!nas_host || !nas_sid) {
        return {
            content: [{ type: "text", text: "Not connected to QNAP. Use qnap-connect first." }],
            isError: true
        };
    }

    if (typeof path !== "string" || !path || typeof filename !== "string" || !filename) {
        return {
            content: [{ type: "text", text: "Missing or invalid path or filename argument." }],
            isError: true,
        };
    }

    try {
        const params = new URLSearchParams({
            func: 'stat',
            sid: nas_sid,
            path: path,
            file_total: '1',
            file_name: filename
        });
        const url = `${nas_host}/cgi-bin/filemanager/utilRequest.cgi?${params.toString()}`;
        const response = await fetchWithTimeout(url);
        const text = await response.text();

        return {
            content: [{ type: "text", text: text }],
            isError: false,
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error getting file info: ${error.message}` }],
            isError: true
        };
    }
}
