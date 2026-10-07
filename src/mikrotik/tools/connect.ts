import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { MikroTikApi } from "./api.js";
import { setApi } from "../db.js";

export const connectHandler = async (request: CallToolRequest) => {
    const { host, user, password, secure = false } = request.params.arguments as any;
    const newApi = new MikroTikApi({ debug: false });
    try {
        await newApi.connect(host, undefined, secure);
        const loggedIn = await newApi.login(user, password);
        if (!loggedIn) {
            newApi.close();
            return {
                content: [{ type: "text", text: "Login failed: invalid username or password" }],
                isError: true,
            };
        }
        setApi(newApi, { host, user, secure });
        return {
            content: [{ type: "text", text: `Connected successfully to ${host}` }],
        };
    } catch (error: any) {
        newApi.close();
        return {
            content: [{ type: "text", text: `Connection error: ${error.message}` }],
            isError: true,
        };
    }
};
