import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

let nas_host: string | null = null;
let nas_sid: string | null = null;

export function getNasHost(): string | null {
    return nas_host;
}

export function getNasSid(): string | null {
    return nas_sid;
}

export function setNasConnection(host: string, sid: string): void {
    nas_host = host;
    nas_sid = sid;
}

export function clearNasConnection(): void {
    nas_host = null;
    nas_sid = null;
}

export async function initializeApi(host: string, username?: string, password?: string) {
    const user = username || process.env.QNAP_USER;
    const pwd = password || process.env.QNAP_PASSWORD;

    if (!user || !pwd) {
        throw new Error("Credentials not provided and QNAP_USER/QNAP_PASSWORD env variables not set.");
    }

    // Directly perform the connection logic
    const b64_pwd = Buffer.from(pwd).toString('base64');
    const url = `${host}/cgi-bin/authLogin.cgi?user=${user}&pwd=${b64_pwd}`;

    try {
        const response = await fetchWithTimeout(url);
        const text = await response.text();

        // Extract SID using regex
        const sidMatch = text.match(/<authSid><!\[CDATA\[([^\]]*)\]\]><\/authSid>/);
        const sid = sidMatch ? sidMatch[1] : null;

        if (sid) {
            setNasConnection(host, sid);
        } else {
            throw new Error(`Login failed. Response: ${text}`);
        }
    } catch (error: any) {
        throw new Error(`Error connecting to QNAP: ${error.message}`);
    }
}

async function fetchWithTimeout(url: string, options: any = {}, timeout = 60000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const headers = {
        ...options.headers,
        'Referer': nas_host ? `${nas_host}/cgi-bin/index.cgi` : '',
    };

    if (nas_sid) {
        (headers as any)['Cookie'] = `NAS_SID=${nas_sid}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

export async function connectHandler(request: CallToolRequest) {
    const { host, username, password } = request.params.arguments || {};

    if (
        typeof host !== "string" || !host ||
        typeof username !== "string" || !username ||
        typeof password !== "string" || !password
    ) {
        return {
            content: [{ type: "text", text: "Missing or invalid host, username, or password argument." }],
            isError: true,
        };
    }

    const b64_pwd = Buffer.from(password).toString('base64');
    const params = new URLSearchParams({
        user: username,
        pwd: b64_pwd
    });
    const url = `${host}/cgi-bin/authLogin.cgi?${params.toString()}`;

    try {
        const response = await fetchWithTimeout(url);
        const text = await response.text();

        // Extract SID using regex
        const sidMatch = text.match(/<authSid><!\[CDATA\[([^\]]*)\]\]><\/authSid>/);
        const sid = sidMatch ? sidMatch[1] : null;

        if (sid) {
            setNasConnection(host, sid);
            return {
                content: [{ type: "text", text: `Connected successfully to ${host}.` }],
                isError: false,
            };
        } else {
            return {
                content: [{ type: "text", text: "Login failed. Please check your credentials." }],
                isError: true
            };
        }
    } catch (error: any) {
        return {
            content: [{ type: "text", text: "Error connecting to QNAP NAS. Please verify the host and network connectivity." }],
            isError: true
        };
    }
}

export { fetchWithTimeout };
