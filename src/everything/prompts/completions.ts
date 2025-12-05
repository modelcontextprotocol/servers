import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";

export const addPromptWithCompletions = (server: McpServer) => {
  const promptArgsSchema = {
    department: completable(z.string(), (value) => {
      return ["Engineering", "Sales", "Marketing", "Support"].filter((d) =>
        d.startsWith(value)
      );
    }),
    name: completable(z.string(), (value, context) => {
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
    }),
  };

  server.registerPrompt(
    "completable-prompt",
    {
      title: "Team Management",
      description: "Choose a team member to lead their specific department.",
      argsSchema: promptArgsSchema,
    },
    async ({ department, name }) => ({
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
