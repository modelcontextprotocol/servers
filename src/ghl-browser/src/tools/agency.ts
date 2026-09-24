import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const agencyModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_sub_accounts",
      description: "List all sub-accounts (locations) under the agency.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by sub-account name" },
        },
      },
    },
    {
      name: "ghl_browser_create_sub_account",
      description: "Create a new sub-account (location).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          zip: { type: "string" },
          country: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_agency_billing",
      description: "Get agency billing summary and plan details.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_list_agency_users",
      description: "List agency-level users and their roles.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_whitelabel_settings",
      description: "Get white-label configuration for the agency.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_list_snapshots_agency",
      description: "List available snapshots at the agency level.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  handlers: {
    ghl_browser_list_sub_accounts: async (args) => {
      const search = args.search as string | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agency-sub-accounts", async () => {
          await gotoGhl(page, "/agency/sub-accounts");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="Filter"]').first();
            await searchInput.fill(search);
            await page.waitForTimeout(1000);
          }
          const accounts = await page.evaluate(() => {
            const rows: Array<{ name: string; phone: string; email: string; status: string; url: string }> = [];
            document
              .querySelectorAll("table tbody tr, [class*='sub-account'], [class*='SubAccount'], [class*='location-row']")
              .forEach((el) => {
                const cells = el.querySelectorAll("td, [class*='cell']");
                const a = el.querySelector("a") as HTMLAnchorElement | null;
                const text = el.textContent || "";
                if (text.trim().length > 2) {
                  rows.push({
                    name: cells[0]?.textContent?.trim() || text.slice(0, 60).trim(),
                    phone: cells[1]?.textContent?.trim() || "",
                    email: cells[2]?.textContent?.trim() || "",
                    status: cells[3]?.textContent?.trim() || "",
                    url: a?.href || "",
                  });
                }
              });
            return rows;
          });
          return { count: accounts.length, accounts };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_sub_account: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agency-create-sub", async () => {
          await gotoGhl(page, "/agency/sub-accounts");
          await waitForAppReady(page);
          const createBtn = page.locator('button:has-text("Create"), button:has-text("Add Sub-Account"), button:has-text("New")').first();
          await createBtn.click();
          await waitForAppReady(page);
          const nameInput = page.locator('input[name="name"], input[placeholder*="Business Name"]').first();
          await nameInput.fill(name);
          const fieldMap: Record<string, string> = {
            phone: 'input[name="phone"], input[placeholder*="Phone"]',
            email: 'input[name="email"], input[type="email"]',
            address: 'input[name="address"], input[placeholder*="Address"]',
            city: 'input[name="city"], input[placeholder*="City"]',
            state: 'input[name="state"], select[name="state"]',
            zip: 'input[name="zip"], input[placeholder*="Zip"]',
            country: 'select[name="country"], input[name="country"]',
          };
          for (const [key, selector] of Object.entries(fieldMap)) {
            const val = args[key] as string | undefined;
            if (val) {
              await page.locator(selector).first().fill(val).catch(() => {});
            }
          }
          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').last();
          await saveBtn.click();
          await waitForAppReady(page);
          return { name, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_agency_billing: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agency-billing", async () => {
          await gotoGhl(page, "/agency/billing");
          await waitForAppReady(page);
          const billing = await page.evaluate(() => {
            const data: Record<string, string> = {};
            document.querySelectorAll('[class*="plan"], [class*="Plan"], [class*="billing"], [class*="Billing"]').forEach((el) => {
              const label = el.querySelector('[class*="label"], [class*="title"], h4, h5')?.textContent?.trim() || "";
              const value = el.querySelector('[class*="value"], [class*="amount"], [class*="price"]')?.textContent?.trim() || el.textContent?.trim().slice(0, 100) || "";
              if (label || value) data[label || "info_" + Object.keys(data).length] = value;
            });
            return { ...data, url: window.location.href };
          });
          return billing;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_agency_users: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agency-users", async () => {
          await gotoGhl(page, "/agency/users");
          await waitForAppReady(page);
          const users = await page.evaluate(() => {
            const rows: Array<{ name: string; email: string; role: string; status: string }> = [];
            document
              .querySelectorAll("table tbody tr, [class*='user-row'], [class*='UserRow']")
              .forEach((el) => {
                const cells = el.querySelectorAll("td, [class*='cell']");
                const text = el.textContent || "";
                if (text.trim().length > 2) {
                  rows.push({
                    name: cells[0]?.textContent?.trim() || text.slice(0, 40).trim(),
                    email: cells[1]?.textContent?.trim() || "",
                    role: cells[2]?.textContent?.trim() || "",
                    status: cells[3]?.textContent?.trim() || "",
                  });
                }
              });
            return rows;
          });
          return { count: users.length, users };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_whitelabel_settings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agency-whitelabel", async () => {
          await gotoGhl(page, "/agency/whitelabel");
          await waitForAppReady(page);
          const settings = await page.evaluate(() => {
            const data: Record<string, string> = {};
            document.querySelectorAll("input:not([type='hidden']), select, textarea").forEach((el) => {
              const input = el as HTMLInputElement;
              const label = input.name || input.placeholder || input.getAttribute("aria-label") || "";
              if (label) data[label] = input.value || "";
            });
            return { ...data, url: window.location.href };
          });
          return settings;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_snapshots_agency: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agency-snapshots", async () => {
          await gotoGhl(page, "/agency/snapshots");
          await waitForAppReady(page);
          const snapshots = await page.evaluate(() => {
            const rows: Array<{ name: string; assets: string; date: string; url: string }> = [];
            document
              .querySelectorAll("table tbody tr, [class*='snapshot'], [class*='Snapshot'], [class*='list-row']")
              .forEach((el) => {
                const cells = el.querySelectorAll("td, [class*='cell']");
                const a = el.querySelector("a") as HTMLAnchorElement | null;
                const text = el.textContent || "";
                if (text.trim().length > 2) {
                  rows.push({
                    name: cells[0]?.textContent?.trim() || text.slice(0, 60).trim(),
                    assets: cells[1]?.textContent?.trim() || "",
                    date: cells[2]?.textContent?.trim() || "",
                    url: a?.href || "",
                  });
                }
              });
            return rows;
          });
          return { count: snapshots.length, snapshots };
        });
      } finally {
        await close();
      }
    },
  },
};
