import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const superagentsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_superagents",
      description: "List AI Superagents with name, status, type, and last activity.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_superagent_details",
      description: "Get full Superagent configuration: prompts, knowledge base, channels, handoff settings.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Superagent name to retrieve" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_superagent",
      description: "Create a new AI Superagent with name and description.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Superagent name" },
          description: { type: "string", description: "Superagent description/purpose" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_update_superagent",
      description: "Update a Superagent's system prompt, tone, or configuration.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Superagent name to update" },
          systemPrompt: { type: "string", description: "New system prompt text" },
          tone: { type: "string", description: "Tone: friendly, professional, casual" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_superagent_logs",
      description: "Get recent conversation logs for a Superagent.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Superagent name" },
        },
        required: ["name"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_superagents: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "superagents-list", async () => {
          await gotoGhl(page, "/ai/superagents");
          await waitForAppReady(page);
          const agents = await page.evaluate(() => {
            const rows: Array<{ name: string; status: string; type: string; lastActivity: string }> = [];
            document
              .querySelectorAll('tr, [class*="agent"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], a, td:first-child');
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    name: nameEl.textContent?.trim() ?? "",
                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    type: el.querySelector('[class*="type"], [class*="category"]')?.textContent?.trim() ?? "",
                    lastActivity: el.querySelector('[class*="activity"], [class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { count: agents.length, agents };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_superagent_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "superagent-details", async () => {
          await gotoGhl(page, "/ai/superagents");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="agent"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const fields: Record<string, string> = {};
            document
              .querySelectorAll('[class*="field"], [class*="detail"], [class*="info"], dl, [class*="row"]')
              .forEach((el) => {
                const labelEl = el.querySelector('[class*="label"], dt, [class*="key"]');
                const valueEl = el.querySelector('[class*="value"], dd, [class*="data"]');
                const label = labelEl?.textContent?.trim() ?? "";
                const value = valueEl?.textContent?.trim() ?? "";
                if (label.length > 1 && value.length > 0) fields[label] = value;
              });
            const promptEl = document.querySelector('[class*="prompt"], [class*="system"], textarea');
            return {
              fields,
              systemPrompt: promptEl?.textContent?.trim()?.slice(0, 500) ?? "",
            };
          });
          return { name, ...details };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_superagent: async (args) => {
      const name = String(args.name);
      const description = (args.description as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "superagent-create", async () => {
          await gotoGhl(page, "/ai/superagents");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page.locator('input[name="name"], input[placeholder*="name"], input[type="text"]').first();
          await nameInput.fill(name);
          if (description) {
            const descInput = page.locator('textarea, input[name="description"]').first();
            await descInput.fill(description).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, description, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_superagent: async (args) => {
      const name = String(args.name);
      const systemPrompt = (args.systemPrompt as string) || "";
      const tone = (args.tone as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "superagent-update", async () => {
          await gotoGhl(page, "/ai/superagents");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="agent"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          if (systemPrompt) {
            const promptInput = page.locator('textarea, [class*="prompt"], [contenteditable]').first();
            await promptInput.fill(systemPrompt).catch(async () => {
              await promptInput.click();
              await page.keyboard.press("Control+A");
              await page.keyboard.type(systemPrompt);
            });
          }
          if (tone) {
            const toneSelect = page.locator('select, [role="combobox"]').first();
            await toneSelect.click();
            await page.locator(`[role="option"]:has-text("${tone}")`).first().click({ timeout: 3000 }).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, updated: true, systemPrompt: !!systemPrompt, tone: tone || null };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_superagent_logs: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "superagent-logs", async () => {
          await gotoGhl(page, "/ai/superagents");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="agent"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const logsTab = page
            .locator('[role="tab"]:has-text("Logs"), button:has-text("Logs"), a:has-text("Logs")')
            .first();
          await logsTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const logs = await page.evaluate(() => {
            const items: Array<{ contact: string; channel: string; message: string; time: string }> = [];
            document
              .querySelectorAll('[class*="log"], [class*="conversation"], tr, [role="row"]')
              .forEach((el) => {
                const contactEl = el.querySelector('[class*="contact"], [class*="name"]');
                if (contactEl && (contactEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    contact: contactEl.textContent?.trim() ?? "",
                    channel: el.querySelector('[class*="channel"], [class*="type"]')?.textContent?.trim() ?? "",
                    message: el.querySelector('[class*="message"], [class*="text"]')?.textContent?.trim()?.slice(0, 200) ?? "",
                    time: el.querySelector('[class*="time"], [class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { name, logCount: logs.length, logs };
        });
      } finally {
        await close();
      }
    },
  },
};
