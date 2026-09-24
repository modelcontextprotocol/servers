import { ListResourcesRequest, ReadResourceRequest, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { getNasHost, getNasSid, fetchWithTimeout } from "./tools/connect.js";
import { parseDiskHealth, parseStorageInfo } from "./tools/report.js";

const getHostPort = (host: string): string => {
    return host.replace(/^https?:\/\//, '');
};

export const listResourcesHandler = async (request: ListResourcesRequest) => {
    const host = getNasHost();
    const sid = getNasSid();

    if (!host || !sid) {
        return { resources: [] };
    }

    const hostPort = getHostPort(host);

    try {
        // 1. Fetch Disk Info
        const diskParams = new URLSearchParams({
            func: 'all_hd_data',
            sid: sid
        });
        const diskUrl = `${host}/cgi-bin/disk/qsmart.cgi?${diskParams.toString()}`;
        const diskResp = await fetchWithTimeout(diskUrl);
        const diskXml = await diskResp.text();
        const disks = parseDiskHealth(diskXml);

        // 2. Fetch Storage Info
        const storageParams = new URLSearchParams({
            chart_func: 'disk_usage',
            disk_select: 'all',
            include: 'all',
            sid: sid
        });
        const storageUrl = `${host}/cgi-bin/management/chartReq.cgi?${storageParams.toString()}`;
        const storageResp = await fetchWithTimeout(storageUrl);
        const storageXml = await storageResp.text();
        const storageInfo = parseStorageInfo(storageXml);

        const resources: any[] = [];

        // Disks
        disks.forEach((d) => {
            const diskId = encodeURIComponent(d.Alias);
            resources.push({
                uri: `qnap://${hostPort}/disk/${diskId}`,
                mimeType: "application/json",
                name: `Disk ${d.Alias}`,
                description: `QNAP Disk ${d.Alias} (${d.Model}) - Health: ${d.Health}`,
            });
        });

        // Volumes
        storageInfo.forEach((v) => {
            const volumeId = encodeURIComponent(v.Id || v.Name);
            resources.push({
                uri: `qnap://${hostPort}/volume/${volumeId}`,
                mimeType: "application/json",
                name: `Volume ${v.Name}`,
                description: `QNAP Volume ${v.Name} - Usage: ${v.Usage}`,
            });
        });

        return { resources };
    } catch (error: any) {
        throw new Error(`Error listing resources: ${error.message}`);
    }
};

export const readResourceHandler = async (request: ReadResourceRequest) => {
    const { uri } = request.params;
    const host = getNasHost();
    const sid = getNasSid();

    if (!host || !sid) {
        throw new McpError(ErrorCode.InvalidRequest, "Not connected to QNAP. Use qnap-connect first.");
    }

    const hostPort = getHostPort(host);

    try {
        // Handle disk resource
        const diskMatch = uri.match(/^qnap:\/\/[^\/]+\/disk\/(.+)$/);
        if (diskMatch) {
            const alias = decodeURIComponent(diskMatch[1]);
            const diskParams = new URLSearchParams({
                func: 'all_hd_data',
                sid: sid
            });
            const diskUrl = `${host}/cgi-bin/disk/qsmart.cgi?${diskParams.toString()}`;
            const diskResp = await fetchWithTimeout(diskUrl);
            const diskXml = await diskResp.text();
            const disks = parseDiskHealth(diskXml);
            const item = disks.find(d => d.Alias === alias);

            if (!item) throw new Error(`Disk not found: ${alias}`);
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(item, null, 2) }],
            };
        }

        // Handle volume resource
        const volumeMatch = uri.match(/^qnap:\/\/[^\/]+\/volume\/(.+)$/);
        if (volumeMatch) {
            const idOrName = decodeURIComponent(volumeMatch[1]);
            const storageParams = new URLSearchParams({
                chart_func: 'disk_usage',
                disk_select: 'all',
                include: 'all',
                sid: sid
            });
            const storageUrl = `${host}/cgi-bin/management/chartReq.cgi?${storageParams.toString()}`;
            const storageResp = await fetchWithTimeout(storageUrl);
            const storageXml = await storageResp.text();
            const storageInfo = parseStorageInfo(storageXml);
            const item = storageInfo.find(v => v.Id === idOrName || v.Name === idOrName);

            if (!item) throw new Error(`Volume not found: ${idOrName}`);
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(item, null, 2) }],
            };
        }

        throw new Error(`Invalid resource URI: ${uri}`);
    } catch (error: any) {
        throw new Error(`Error reading resource: ${error.message}`);
    }
};
