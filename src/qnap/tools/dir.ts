import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
import { getNasHost, getNasSid, fetchWithTimeout } from "./connect.js";

export async function dirHandler(request: CallToolRequest) {
    const { path } = request.params.arguments || {};
    const nas_host = getNasHost();
    const nas_sid = getNasSid();

    if (!nas_host || !nas_sid) {
        return {
            content: [{ type: "text", text: "Not connected to QNAP. Use qnap-connect first." }],
            isError: true
        };
    }

    if (typeof path !== "string" || !path) {
        return {
            content: [{ type: "text", text: "Missing or invalid path argument." }],
            isError: true,
        };
    }

    try {
        const params = new URLSearchParams({
            func: 'get_list',
            path: path,
            sid: nas_sid,
            limit: '100',
            start: '0'
        });
        const url = `${nas_host}/cgi-bin/filemanager/utilRequest.cgi?${params.toString()}`;
        const response = await fetchWithTimeout(url);
        const data = await response.json() as any;

        const files = Array.isArray(data.datas) ? data.datas : [];
        const sortedFiles = files.sort((a: any, b: any) => {
            const timeA = parseInt(a.filestamp || a.epochmt || "0");
            const timeB = parseInt(b.filestamp || b.epochmt || "0");
            return timeB - timeA;
        });

        const formattedFiles = sortedFiles.map((file: any) => {
            const isDir = file.isfolder === 1 || file.isfolder === "1" || file.is_dir === "1" || file.is_dir === 1;
            const sizeInBytes = parseInt(file.filesize || "0");
            let size = "-";
            if (!isDir) {
                if (sizeInBytes > 1024 * 1024 * 1024) {
                    size = (sizeInBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
                } else if (sizeInBytes > 1024 * 1024) {
                    size = (sizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
                } else {
                    size = (sizeInBytes / 1024).toFixed(2) + " KB";
                }
            }
            const timestamp = file.filestamp || file.epochmt;
            const modified = timestamp ? new Date(parseInt(timestamp) * 1000).toLocaleString() : "-";

            return {
                Name: file.filename,
                Type: isDir ? "DIR" : "FILE",
                Size: size,
                Modified: modified,
                Owner: file.owner || "-",
                Group: file.group || "-",
                Permissions: file.privilege || "-"
            };
        });

        return {
            content: [{ type: "text", text: encode(formattedFiles) }],
            isError: false,
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error listing directory: ${error.message}` }],
            isError: true
        };
    }
}
