import { MikroTikApi } from "./tools/api.js";

let api: MikroTikApi | null = null;
let connectionConfig: any = null;

export function setApi(newApi: MikroTikApi | null, config: any) {
    if (api) {
        api.close();
    }
    api = newApi;
    connectionConfig = config;
}

export function getApi(): MikroTikApi | null {
    return api;
}

export async function initializeApi(host: string, user?: string, password?: string, secure: boolean = false) {
    const dbUser = user || process.env.MK_USER;
    const dbPassword = password || process.env.MK_PASSWORD;

    if (!dbUser || !dbPassword) {
        throw new Error("Environment variables MK_USER and MK_PASSWORD must be set.");
    }

    const newApi = new MikroTikApi({ debug: false });
    try {
        await newApi.connect(host, undefined, secure);
        const loggedIn = await newApi.login(dbUser, dbPassword);
        if (!loggedIn) {
            newApi.close();
            throw new Error("Login failed: invalid username or password");
        }
        setApi(newApi, { host, user: dbUser, secure });
    } catch (error: any) {
        newApi.close();
        throw error;
    }
}
