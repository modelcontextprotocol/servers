import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const agentBuilderModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_agent_blueprints",
      description: "List agent blueprints/templates in the Agent Builder.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_agent_blueprint",
      description: "Get blueprint details: steps, triggers, actions, prompts, and configuration.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Blueprint name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_agent_from_blueprint",
      description: "Create a new agent from an existing blueprint.",
      inputSchema: {
        type: "object",
        properties: {
          blueprintName: { type: "string", description: "Blueprint to use" },
          agentName: { type: "string", description: "Name for the new agent" },
        },
        required: ["blueprintName", "agentName"],
      },
    },
    {
      name: "ghl_browser_get_agent_builder_config",
      description: "Open the Agent Builder and return the current configuration: prompts, tools, knowledge.",
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "Agent name to open in builder" },
        },
        required: ["agentName"],
      },
    },
    {
      name: "ghl_browser_publish_agent",
      description: "Publish/deploy an agent from the builder.",
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "Agent name to publish" },
        },
        required: ["agentName"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_agent_blueprints: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-blueprints-list", async () => {
          await gotoGhl(page, "/ai/agent-builder");
          await waitForAppReady(page);
          const blueprints = await page.evaluate(() => {
            const rows: Array<{ name: string; description: string; category: string }> = [];
            document
              .querySelectorAll('[class*="blueprint"], [class*="template"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], h3, h4, a');
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    name: nameEl.textContent?.trim() ?? "",
                    description:
                      el.querySelector('[class*="desc"], [class*="summary"], p')?.textContent?.trim()?.slice(0, 150) ?? "",
                    category:
                      el.querySelector('[class*="category"], [class*="tag"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { count: blueprints.length, blueprints };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_agent_blueprint: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-blueprint-details", async () => {
          await gotoGhl(page, "/ai/agent-builder");
          await waitForAppReady(page);
          const card = page
            .locator(`[class*="blueprint"]:has-text("${name}"), [class*="template"]:has-text("${name}"), [class*="card"]:has-text("${name}")`)
            .first();
          await card.click({ timeout: 5000 });
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const sections: Record<string, string> = {};
            document
              .querySelectorAll('[class*="section"], [class*="config"], [class*="step"]')
              .forEach((el) => {
                const titleEl = el.querySelector('[class*="title"], h3, h4, [class*="label"]');
                const bodyEl = el.querySelector('[class*="content"], [class*="body"], p');
                const title = titleEl?.textContent?.trim() ?? "";
                const body = bodyEl?.textContent?.trim()?.slice(0, 300) ?? "";
                if (title.length > 1) sections[title] = body;
              });
            return sections;
          });
          return { name, sections: details };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_agent_from_blueprint: async (args) => {
      const blueprintName = String(args.blueprintName);
      const agentName = String(args.agentName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-create-from-blueprint", async () => {
          await gotoGhl(page, "/ai/agent-builder");
          await waitForAppReady(page);
          const card = page
            .locator(`[class*="blueprint"]:has-text("${blueprintName}"), [class*="template"]:has-text("${blueprintName}")`)
            .first();
          const useBtn = card
            .locator('button:has-text("Use"), button:has-text("Create"), button:has-text("Apply")')
            .first();
          await useBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page.locator('input[name="name"], input[placeholder*="name"], input[type="text"]').first();
          await nameInput.fill(agentName);
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { blueprintName, agentName, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_agent_builder_config: async (args) => {
      const agentName = String(args.agentName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-builder-config", async () => {
          await gotoGhl(page, "/ai/agent-builder");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${agentName}"), [class*="agent"]:has-text("${agentName}"), a:has-text("${agentName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const config = await page.evaluate(() => {
            const sections: Record<string, string> = {};
            document
              .querySelectorAll('[class*="panel"], [class*="section"], [class*="config"], [class*="tab"]')
              .forEach((el) => {
                const titleEl = el.querySelector('[class*="title"], h3, h4, [class*="label"]');
                const title = titleEl?.textContent?.trim() ?? "";
                const body = el.textContent?.trim()?.slice(0, 300) ?? "";
                if (title.length > 1 && body.length > title.length) sections[title] = body;
              });
            const promptEl = document.querySelector('[class*="prompt"], textarea');
            return {
              sections,
              systemPrompt: promptEl?.textContent?.trim()?.slice(0, 500) ?? "",
            };
          });
          return { agentName, ...config };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_publish_agent: async (args) => {
      const agentName = String(args.agentName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-publish", async () => {
          await gotoGhl(page, "/ai/agent-builder");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${agentName}"), [class*="agent"]:has-text("${agentName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const publishBtn = page
            .locator('button:has-text("Publish"), button:has-text("Deploy"), button:has-text("Go Live")')
            .first();
          await publishBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Confirm"), button:has-text("Yes"), button[type="submit"]')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { agentName, published: true };
        });
      } finally {
        await close();
      }
    },
  },
};
