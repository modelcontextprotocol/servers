import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const countdownTimerModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_countdown_timers",
      description: "List countdown timers with name, target date, and status.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by timer name" },
        },
      },
    },
    {
      name: "ghl_browser_get_countdown_timer_details",
      description: "Get details of a countdown timer: target date, design, embed code.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Timer name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_countdown_timer",
      description: "Create a new countdown timer with target date/time.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Timer name" },
          targetDate: { type: "string", description: "Target date/time (ISO 8601)" },
          style: { type: "string", description: "Timer style: classic, flip, minimal" },
        },
        required: ["name", "targetDate"],
      },
    },
    {
      name: "ghl_browser_get_countdown_embed_code",
      description: "Get embed HTML code for a countdown timer.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Timer name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_countdown_timer",
      description: "Delete a countdown timer by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Timer name to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_countdown_timers: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "countdown-list", async () => {
          await gotoGhl(page, "/countdown-timer");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const timers = await page.evaluate(() => {
            const items: Array<{
              name: string;
              targetDate: string;
              status: string;
              created: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="timer"], [class*="countdown"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    targetDate:
                      el.querySelector('[class*="date"], [class*="target"], time')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    created:
                      el.querySelector('[class*="created"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, count: timers.length, countdownTimers: timers };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_countdown_timer_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "countdown-details", async () => {
          await gotoGhl(page, "/countdown-timer");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="timer"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], span")?.textContent?.trim() ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              targetDate: getVal("target") || getVal("date") || getVal("end"),
              style: getVal("style") || getVal("design"),
              timezone: getVal("timezone") || getVal("tz"),
              embedCode:
                document.querySelector('textarea, code, pre')?.textContent?.trim() ?? "",
              usedIn: getVal("used in") || getVal("funnels") || getVal("pages"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_countdown_timer: async (args) => {
      const name = String(args.name);
      const targetDate = String(args.targetDate);
      const style = (args.style as string) || "classic";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "countdown-create", async () => {
          await gotoGhl(page, "/countdown-timer");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page
            .locator('input[name="name"], input[placeholder*="name"]')
            .first();
          await nameInput.fill(name).catch(() => {});
          const dateInput = page
            .locator('input[type="datetime-local"], input[placeholder*="date"], input[name="date"]')
            .first();
          await dateInput.fill(targetDate).catch(() => {});
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, targetDate, style, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_countdown_embed_code: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "countdown-embed", async () => {
          await gotoGhl(page, "/countdown-timer");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="timer"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const embedBtn = page
            .locator('button:has-text("Embed"), button:has-text("Code"), button:has-text("Share")')
            .first();
          await embedBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const code = await page.evaluate(() => {
            return (
              document.querySelector('textarea, code, pre, [class*="code"]')?.textContent?.trim() ?? ""
            );
          });
          return { name, embedCode: code };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_countdown_timer: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this countdown timer" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "countdown-delete", async () => {
          await gotoGhl(page, "/countdown-timer");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="timer"]:has-text("${name}")`)
            .first();
          const deleteBtn = row
            .locator('button:has-text("Delete"), [class*="delete"]')
            .first();
          await deleteBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
