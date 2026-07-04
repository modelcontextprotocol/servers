import { z } from "zod";
import { McpServer, completable } from "@modelcontextprotocol/server";

/**
 * Register a prompt with completable arguments
 * - Two required arguments, both with completion handlers
 * - First argument value will be included in context for second argument
 * - Allows second argument to depend on the first argument value
 *
 * @param server
 */
export const registerPromptWithCompletions = (server: McpServer) => {
  // Prompt arguments
  const promptArgsSchema = {
    department: completable(
      z.string().describe("Choose the department."),
      (value) => {
        return ["Engineering", "Sales", "Marketing", "Support"].filter((d) =>
          d.startsWith(value)
        );
      }
    ),
    name: completable(
      z
        .string()
        .describe("Choose a team member to lead the selected department."),
      (value, context) => {
        const department = context?.arguments?.["department"];
        if (department === "Engineering") {
          return ["Alice", "Bob", "Charlie"].filter((n) => n.startsWith(value));
        } else if (department === "Sales") {
          return ["David", "Eve", "Frank"].filter((n) => n.startsWith(value));
        } else if (department === "Marketing") {
          return ["Grace", "Henry", "Iris"].filter((n) => n.startsWith(value));
        } else if (department === "Support") {
          return ["John", "Kim", "Lee"].filter((n) => n.startsWith(value));
        }
        return [];
      }
    ),
  };

  // Register the prompt
  /* @mcp-codemod-error Could not verify `argsSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
  server.registerPrompt(
    "completable-prompt",
    {
      title: "Team Management",
      description: "First argument choice narrows values for second argument.",
      argsSchema: promptArgsSchema,
    },
    ({ department, name }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please promote ${name} to the head of the ${department} team.`,
          },
        },
      ],
    })
  );
};
