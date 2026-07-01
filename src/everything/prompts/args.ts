import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';

/**
 * Register a prompt with arguments
 * - Two arguments, one required and one optional
 * - Combines argument values in the returned prompt
 *
 * @param server
 */
export const registerArgumentsPrompt = (server: McpServer) => {
    // Prompt arguments
    const promptArgsSchema = {
        city: z.string().describe('Name of the city'),
        state: z.string().describe('Name of the state').optional()
    };

    // Register the prompt
    /* @mcp-codemod-error Could not verify `argsSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
    server.registerPrompt(
        'args-prompt',
        {
            title: 'Arguments Prompt',
            description: 'A prompt with two arguments, one required and one optional',
            argsSchema: promptArgsSchema
        },
        args => {
            const location = `${args?.city}${args?.state ? `, ${args?.state}` : ''}`;
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `What's weather in ${location}?`
                        }
                    }
                ]
            };
        }
    );
};
