import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
import { getNasHost, getNasSid, fetchWithTimeout } from "./connect.js";

/**
 * Parses disk health information from QNAP XML response.
 */
export function parseDiskHealth(xml: string): any[] {
    const disks: any[] = [];
    const entryRegex = /<entry>(.*?)<\/entry>/gs;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        const alias = entry.match(/<Disk_Alias><!\[CDATA\[(.*?)\]\]><\/Disk_Alias>/)?.[1] || "";
        const health = entry.match(/<Health><!\[CDATA\[(.*?)\]\]><\/Health>/)?.[1] || "";
        const capacity = entry.match(/<Capacity><!\[CDATA\[(.*?)\]\]><\/Capacity>/)?.[1] || "";
        const tempC = entry.match(/<oC><!\[CDATA\[(.*?)\]\]><\/oC>/)?.[1] || "";
        const model = entry.match(/<Model><!\[CDATA\[(.*?)\]\]><\/Model>/)?.[1] || "";
        const serial = entry.match(/<Serial><!\[CDATA\[(.*?)\]\]><\/Serial>/)?.[1] || "";

        if (alias) {
            disks.push({
                Alias: alias,
                Model: model || "-",
                Serial: serial || "-",
                Capacity: capacity || "-",
                Health: health || "Unknown",
                Temperature: tempC ? `${tempC}°C` : "-"
            });
        }
    }
    return disks;
}

/**
 * Parses resource usage information from QNAP XML response.
 */
export function parseResourceUsage(xml: string): any {
    const cpuUsage = xml.match(/<cpu_usage><!\[CDATA\[(.*?)\]\]><\/cpu_usage>/)?.[1]?.trim() || "";
    const memTotalStr = xml.match(/<total_memory><!\[CDATA\[(.*?)\]\]><\/total_memory>/)?.[1];
    const memFreeStr = xml.match(/<free_memory><!\[CDATA\[(.*?)\]\]><\/free_memory>/)?.[1];

    let memory: any = null;
    if (memTotalStr && memFreeStr) {
        const total = parseFloat(memTotalStr);
        const free = parseFloat(memFreeStr);
        const used = total - free;
        const usedPct = total > 0 ? (used / total) * 100 : 0;
        memory = {
            totalMB: total,
            freeMB: free,
            usedMB: used,
            usedPercent: usedPct.toFixed(1) + "%"
        };
    }

    const day = xml.match(/<uptime_day><!\[CDATA\[(.*?)\]\]><\/uptime_day>/)?.[1];
    const hour = xml.match(/<uptime_hour><!\[CDATA\[(.*?)\]\]><\/uptime_hour>/)?.[1];
    const min = xml.match(/<uptime_min><!\[CDATA\[(.*?)\]\]><\/uptime_min>/)?.[1];

    let uptime = "";
    if (day !== undefined && hour !== undefined && min !== undefined) {
        uptime = `${day} days, ${hour} hours, ${min} minutes`;
    }

    const sysTemp = xml.match(/<sys_tempc>([^<]+)<\/sys_tempc>/)?.[1];

    return {
        cpuUsage,
        memory,
        uptime,
        systemTemperature: sysTemp ? `${sysTemp}°C` : ""
    };
}

/**
 * Parses storage/volume information from QNAP XML response.
 */
export function parseStorageInfo(xml: string): any[] {
    const volumes: any[] = [];
    const volLabels: Record<string, string> = {};
    const volRegex = /<volume>(.*?)<\/volume>/gs;
    let volMatch;
    while ((volMatch = volRegex.exec(xml)) !== null) {
        const vol = volMatch[1];
        const val = vol.match(/<volumeValue><!\[CDATA\[(.*?)\]\]><\/volumeValue>/)?.[1];
        const label = vol.match(/<volumeLabel><!\[CDATA\[(.*?)\]\]><\/volumeLabel>/)?.[1];
        if (val && label) {
            volLabels[val] = label;
        }
    }

    const useRegex = /<volumeUse>(.*?)<\/volumeUse>/gs;
    let useMatch;
    while ((useMatch = useRegex.exec(xml)) !== null) {
        const volUse = useMatch[1];
        const val = volUse.match(/<volumeValue><!\[CDATA\[(.*?)\]\]><\/volumeValue>/)?.[1];
        const totalStr = volUse.match(/<total_size><!\[CDATA\[(.*?)\]\]><\/total_size>/)?.[1];
        const freeStr = volUse.match(/<free_size><!\[CDATA\[(.*?)\]\]><\/free_size>/)?.[1];

        if (val) {
            const name = volLabels[val] || `Volume ${val}`;
            let usage: any = { Id: val, Name: name };

            if (totalStr && freeStr) {
                try {
                    const total = parseFloat(totalStr);
                    const free = parseFloat(freeStr);
                    const used = total - free;
                    const usedPct = total > 0 ? (used / total) * 100 : 0;

                    usage = {
                        ...usage,
                        Total: (total / (1024 ** 3)).toFixed(2) + " GB",
                        Used: (used / (1024 ** 3)).toFixed(2) + " GB",
                        Free: (free / (1024 ** 3)).toFixed(2) + " GB",
                        Usage: usedPct.toFixed(1) + "%"
                    };
                } catch {
                    usage = { ...usage, Total: totalStr, Free: freeStr };
                }
            }
            volumes.push(usage);
        }
    }
    return volumes;
}

/**
 * Handle qnap-report tool call.
 */
export async function reportHandler(request: CallToolRequest) {
    const host = getNasHost();
    const sid = getNasSid();

    if (!host || !sid) {
        return {
            content: [{ type: "text", text: "Not connected to QNAP. Use qnap-connect first." }],
            isError: true
        };
    }

    try {
        // 1. Disk Health
        const diskParams = new URLSearchParams({
            func: 'all_hd_data',
            sid: sid
        });
        const diskUrl = `${host}/cgi-bin/disk/qsmart.cgi?${diskParams.toString()}`;
        const diskResp = await fetchWithTimeout(diskUrl);
        const diskXml = await diskResp.text();
        const diskHealth = parseDiskHealth(diskXml);

        // 2. Resource Usage
        const resParams = new URLSearchParams({
            subfunc: 'sysinfo',
            hd: 'no',
            multicpu: '1',
            sid: sid
        });
        const resUrl = `${host}/cgi-bin/management/manaRequest.cgi?${resParams.toString()}`;
        const resResp = await fetchWithTimeout(resUrl);
        const resXml = await resResp.text();
        const resourceUsage = parseResourceUsage(resXml);

        // 3. Storage Info
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

        // Format the output as a readable Markdown report
        let output = `# QNAP System Report\n`;
        output += `**Timestamp:** ${new Date().toLocaleString()}\n`;
        output += `**Host:** ${host}\n\n`;

        output += `## Resource Usage\n`;
        output += `- **CPU Usage:** ${resourceUsage.cpuUsage}\n`;
        if (resourceUsage.memory) {
            output += `- **Memory:** ${resourceUsage.memory.usedMB.toFixed(0)}MB / ${resourceUsage.memory.totalMB.toFixed(0)}MB (${resourceUsage.memory.usedPercent} used)\n`;
        }
        output += `- **Uptime:** ${resourceUsage.uptime}\n`;
        output += `- **System Temperature:** ${resourceUsage.systemTemperature}\n\n`;

        output += `## Disk Health\n`;
        output += encode(diskHealth) + "\n\n";

        output += `## Storage Information\n`;
        output += encode(storageInfo);

        return {
            content: [{ type: "text", text: output }],
            isError: false,
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error generating report: ${error.message}` }],
            isError: true
        };
    }
}
