/**
 * Register a simple prompt with no arguments
 * - Returns the fixed text of the prompt with no modifications
 *
 * @param server
 */
export const registerSimplePrompt = (server) => {
    // Register the prompt
    server.registerPrompt("simple-prompt", {
        title: "Simple Prompt",
        description: "A prompt with no arguments",
    }, () => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: "This is a simple prompt without arguments.",
                },
            },
        ],
    }));
};
