import { z } from "zod";
/**
 * Register a prompt with arguments
 * - Two arguments, one required and one optional
 * - Combines argument values in the returned prompt
 *
 * @param server
 */
export const registerArgumentsPrompt = (server) => {
    // Prompt arguments
    const promptArgsSchema = {
        city: z.string().describe("Name of the city"),
        state: z.string().describe("Name of the state").optional(),
    };
    // Register the prompt
    server.registerPrompt("args-prompt", {
        title: "Arguments Prompt",
        description: "A prompt with two arguments, one required and one optional",
        argsSchema: promptArgsSchema,
    }, (args) => {
        const location = `${args?.city}${args?.state ? `, ${args?.state}` : ""}`;
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `What's weather in ${location}?`,
                    },
                },
            ],
        };
    });
};
