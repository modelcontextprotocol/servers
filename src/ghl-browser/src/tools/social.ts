import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const socialModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_social_compose",
      description: "Compose and publish a social post to one or more connected accounts.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          accounts: {
            type: "array",
            items: { type: "string" },
            description: "Account names or IDs to post to",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "ghl_browser_social_schedule",
      description: "Schedule a social post for a specific date/time.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          scheduleAt: { type: "string", description: "ISO8601 or human-readable datetime" },
          accounts: { type: "array", items: { type: "string" } },
        },
        required: ["text", "scheduleAt"],
      },
    },
    {
      name: "ghl_browser_social_list_posts",
      description: "List recent social posts with status (published/scheduled/failed).",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status" },
        },
      },
    },
  ],
  handlers: {
    ghl_browser_social_compose: async (args) => {
      const text = String(args.text);
      const accounts = (args.accounts as string[] | undefined) || [];
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "social-compose", async () => {
          await gotoGhl(page, "/social-media/planner");
          await waitForAppReady(page);
          const composeBtn = page.locator('button:has-text("Compose"), button:has-text("New Post")').first();
          await composeBtn.click();
          await page.waitForTimeout(500);
          const textarea = page.locator('textarea, [contenteditable="true"]').first();
          await textarea.fill(text);
          for (const acct of accounts) {
            try {
              await page.locator(`label:has-text("${acct}"), [data-account="${acct}"]`).first().click({ timeout: 2000 });
            } catch {
              // account not found; skip
            }
          }
          const publishBtn = page.locator('button:has-text("Post"), button:has-text("Publish")').first();
          await publishBtn.click();
          await waitForAppReady(page);
          return { text, accounts, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_social_schedule: async (args) => {
      const text = String(args.text);
      const scheduleAt = String(args.scheduleAt);
      const accounts = (args.accounts as string[] | undefined) || [];
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "social-schedule", async () => {
          await gotoGhl(page, "/social-media/planner");
          await waitForAppReady(page);
          const composeBtn = page.locator('button:has-text("Compose"), button:has-text("New Post")').first();
          await composeBtn.click();
          await page.waitForTimeout(500);
          const textarea = page.locator('textarea, [contenteditable="true"]').first();
          await textarea.fill(text);
          const scheduleToggle = page.locator('button:has-text("Schedule"), [class*="schedule"]').first();
          await scheduleToggle.click();
          const dateInput = page.locator('input[type="datetime-local"], input[placeholder*="date"]').first();
          await dateInput.fill(scheduleAt);
          const confirmBtn = page.locator('button:has-text("Schedule"), button:has-text("Save")').first();
          await confirmBtn.click();
          await waitForAppReady(page);
          return { text, scheduleAt, accounts, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_social_list_posts: async (args) => {
      const filterStatus = args.status as string | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "social-list", async () => {
          await gotoGhl(page, "/social-media/planner");
          await waitForAppReady(page);
          const rows = await page.evaluate(() => {
            const items: Array<{ text: string; status: string; scheduledAt: string; account: string }> = [];
            document
              .querySelectorAll('[class*="post"], [data-testid*="post"]')
              .forEach((el) => {
                const textEl = el.querySelector('[class*="content"], p');
                const statusEl = el.querySelector('[class*="status"], [class*="Status"]');
                const dateEl = el.querySelector('[class*="date"], time');
                const accountEl = el.querySelector('[class*="account"], [class*="Account"]');
                items.push({
                  text: textEl?.textContent?.slice(0, 120).trim() || "",
                  status: statusEl?.textContent?.trim() || "",
                  scheduledAt: dateEl?.textContent?.trim() || dateEl?.getAttribute("datetime") || "",
                  account: accountEl?.textContent?.trim() || "",
                });
              });
            return items;
          });
          const filtered = filterStatus ? rows.filter((r) => r.status.toLowerCase().includes(filterStatus.toLowerCase())) : rows;
          return { count: filtered.length, rows: filtered };
        });
      } finally {
        await close();
      }
    },
  },
};
