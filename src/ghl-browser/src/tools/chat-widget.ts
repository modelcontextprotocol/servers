import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const chatWidgetModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_chat_widget_config",
      description: "Get the current live chat widget configuration: enabled status, colors, position, greeting.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_update_chat_widget",
      description: "Update chat widget settings: greeting message, position, colors, availability.",
      inputSchema: {
        type: "object",
        properties: {
          greeting: { type: "string", description: "Greeting message displayed to visitors" },
          position: { type: "string", description: "Widget position: bottom-right, bottom-left" },
          primaryColor: { type: "string", description: "Primary color hex code" },
        },
      },
    },
    {
      name: "ghl_browser_toggle_chat_widget",
      description: "Enable or disable the live chat widget on the website.",
      inputSchema: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "true to enable, false to disable" },
        },
        required: ["enabled"],
      },
    },
    {
      name: "ghl_browser_get_chat_widget_code",
      description: "Get the embed code snippet for the chat widget.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_chat_widget_departments",
      description: "List chat widget departments/routing rules with name, agents, and hours.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_chat_widget_config: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "chat-widget-config", async () => {
          await gotoGhl(page, "/chat-widget");
          await waitForAppReady(page);
          const config = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th, [class*="field"]'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], input, select, span")?.textContent?.trim() ??
                (lbl?.parentElement?.querySelector("input") as HTMLInputElement)?.value ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            const toggle = document.querySelector(
              'input[type="checkbox"][class*="toggle"], [role="switch"]',
            );
            return {
              enabled:
                toggle?.getAttribute("aria-checked") === "true" ||
                (toggle as HTMLInputElement)?.checked === true,
              greeting: getVal("greeting"),
              position: getVal("position"),
              primaryColor: getVal("color"),
              availability: getVal("availability"),
              autoResponse: getVal("auto"),
              sound: getVal("sound"),
            };
          });
          return config;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_chat_widget: async (args) => {
      const greeting = args.greeting as string | undefined;
      const position = args.position as string | undefined;
      const primaryColor = args.primaryColor as string | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "chat-widget-update", async () => {
          await gotoGhl(page, "/chat-widget");
          await waitForAppReady(page);
          if (greeting) {
            const greetInput = page
              .locator('input[placeholder*="greeting"], textarea[placeholder*="greeting"], input[name*="greeting"]')
              .first();
            await greetInput.fill(greeting).catch(() => {});
          }
          if (position) {
            const posBtn = page
              .locator(`button:has-text("${position}"), [class*="position"]:has-text("${position}")`)
              .first();
            await posBtn.click({ timeout: 3000 }).catch(() => {});
          }
          if (primaryColor) {
            const colorInput = page.locator('input[type="color"]').first();
            await colorInput.fill(primaryColor).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { greeting, position, primaryColor, updated: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_toggle_chat_widget: async (args) => {
      const enabled = args.enabled === true;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "chat-widget-toggle", async () => {
          await gotoGhl(page, "/chat-widget");
          await waitForAppReady(page);
          const toggle = page
            .locator('input[type="checkbox"][class*="toggle"], [role="switch"], [class*="enable"] input')
            .first();
          const isChecked =
            (await toggle.getAttribute("aria-checked")) === "true" ||
            (await toggle.isChecked().catch(() => false));
          if (isChecked !== enabled) {
            await toggle.click({ timeout: 5000 });
            await waitForAppReady(page);
          }
          return { enabled, toggled: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_chat_widget_code: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "chat-widget-code", async () => {
          await gotoGhl(page, "/chat-widget");
          await waitForAppReady(page);
          const codeBtn = page
            .locator('button:has-text("Code"), button:has-text("Embed"), a:has-text("Code")')
            .first();
          await codeBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const code = await page.evaluate(() => {
            const codeEl = document.querySelector(
              'pre, code, textarea[readonly], [class*="code"], [class*="snippet"]',
            );
            return {
              embedCode: codeEl?.textContent?.trim() ?? "",
            };
          });
          return code;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_chat_widget_departments: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "chat-widget-depts", async () => {
          await gotoGhl(page, "/chat-widget");
          await waitForAppReady(page);
          const deptsTab = page
            .locator('a:has-text("Departments"), button:has-text("Departments"), [class*="tab"]:has-text("Department")')
            .first();
          await deptsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const departments = await page.evaluate(() => {
            const items: Array<{
              name: string;
              agents: string;
              hours: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="department"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    agents:
                      el.querySelector('[class*="agent"], [class*="member"]')?.textContent?.trim() ?? "",
                    hours:
                      el.querySelector('[class*="hour"], [class*="schedule"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: departments.length, departments };
        });
      } finally {
        await close();
      }
    },
  },
};
