import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const aiEmployeesModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_ai_employees",
      description: "List AI Employees with name, role, status, and assigned channels.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_ai_employee_details",
      description: "Get full AI Employee config: role, skills, knowledge base, channels, handoff rules.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "AI Employee name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_ai_employee",
      description: "Create a new AI Employee with name and role description.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "AI Employee name" },
          role: { type: "string", description: "Role description (e.g. 'Sales Rep', 'Support Agent')" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_update_ai_employee",
      description: "Update an AI Employee's prompt, knowledge base, or channel assignments.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "AI Employee name to update" },
          systemPrompt: { type: "string", description: "Updated system prompt" },
          role: { type: "string", description: "Updated role description" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_toggle_ai_employee",
      description: "Enable or disable an AI Employee.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "AI Employee name" },
          enabled: { type: "boolean" },
        },
        required: ["name", "enabled"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_ai_employees: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ai-employees-list", async () => {
          await gotoGhl(page, "/ai/employees");
          await waitForAppReady(page);
          const employees = await page.evaluate(() => {
            const rows: Array<{ name: string; role: string; status: string; channels: string }> = [];
            document
              .querySelectorAll('tr, [class*="employee"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], a, td:first-child');
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    name: nameEl.textContent?.trim() ?? "",
                    role: el.querySelector('[class*="role"], [class*="type"]')?.textContent?.trim() ?? "",
                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    channels: el.querySelector('[class*="channel"], [class*="assigned"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { count: employees.length, employees };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_ai_employee_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ai-employee-details", async () => {
          await gotoGhl(page, "/ai/employees");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="employee"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const fields: Record<string, string> = {};
            document
              .querySelectorAll('[class*="field"], [class*="detail"], [class*="info"], dl')
              .forEach((el) => {
                const labelEl = el.querySelector('[class*="label"], dt, [class*="key"]');
                const valueEl = el.querySelector('[class*="value"], dd, [class*="data"]');
                const label = labelEl?.textContent?.trim() ?? "";
                const value = valueEl?.textContent?.trim() ?? "";
                if (label.length > 1 && value.length > 0) fields[label] = value;
              });
            const promptEl = document.querySelector('[class*="prompt"], textarea, [class*="system"]');
            const knowledgeEl = document.querySelector('[class*="knowledge"], [class*="training"]');
            return {
              fields,
              systemPrompt: promptEl?.textContent?.trim()?.slice(0, 500) ?? "",
              knowledgeBase: knowledgeEl?.textContent?.trim()?.slice(0, 300) ?? "",
            };
          });
          return { name, ...details };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_ai_employee: async (args) => {
      const name = String(args.name);
      const role = (args.role as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ai-employee-create", async () => {
          await gotoGhl(page, "/ai/employees");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page.locator('input[name="name"], input[placeholder*="name"], input[type="text"]').first();
          await nameInput.fill(name);
          if (role) {
            const roleInput = page.locator('textarea, input[name="role"], input[placeholder*="role"]').first();
            await roleInput.fill(role).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, role, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_ai_employee: async (args) => {
      const name = String(args.name);
      const systemPrompt = (args.systemPrompt as string) || "";
      const role = (args.role as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ai-employee-update", async () => {
          await gotoGhl(page, "/ai/employees");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="employee"]:has-text("${name}")`)
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
          if (role) {
            const roleInput = page.locator('input[name="role"], input[placeholder*="role"]').first();
            await roleInput.fill(role).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, updated: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_toggle_ai_employee: async (args) => {
      const name = String(args.name);
      const enabled = Boolean(args.enabled);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ai-employee-toggle", async () => {
          await gotoGhl(page, "/ai/employees");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="employee"]:has-text("${name}")`)
            .first();
          const toggle = row
            .locator('input[type="checkbox"], [role="switch"], [role="checkbox"]')
            .first();
          const current = await toggle.isChecked().catch(() => false);
          if (current !== enabled) {
            await toggle.click();
            await waitForAppReady(page);
          }
          return { name, enabled, toggled: current !== enabled };
        });
      } finally {
        await close();
      }
    },
  },
};
