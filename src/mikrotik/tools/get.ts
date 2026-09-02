import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { getApi } from "../db.js";

export const getHandler = async (request: CallToolRequest) => {
    let { sentence } = request.params.arguments as any;
    if (!sentence.startsWith('/')) {
        sentence = '/' + sentence;
    }
    if (sentence.endsWith('/print')) {
        sentence = sentence.slice(0, -6);
    }
    const command = sentence + '/print';

    const currentApi = getApi();
    if (!currentApi) {
        return {
            content: [{ type: "text", text: "Not connected to MikroTik. Use mk-connect first." }],
            isError: true,
        };
    }
    try {
        const replies = await currentApi.talk([command]);
        const results = replies
            .filter((r) => r.command === "!re")
            .map((r) => r.attributes);
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error executing command: ${error.message}` }],
            isError: true,
        };
    }
};
