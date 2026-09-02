import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const walletKitModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_wallet_passes",
      description: "List digital wallet passes (Apple Wallet, Google Pay) with name, type, status.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by pass name" },
        },
      },
    },
    {
      name: "ghl_browser_get_wallet_pass_details",
      description: "Get details of a wallet pass: design, fields, distribution.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Wallet pass name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_wallet_pass",
      description: "Create a new wallet pass with name, type, and branding.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Pass name" },
          passType: { type: "string", description: "Pass type: coupon, membership, event, generic" },
          primaryColor: { type: "string", description: "Primary brand color (hex)" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_wallet_analytics",
      description: "Get wallet pass analytics: installs, opens, engagement.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Wallet pass name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_wallet_pass",
      description: "Delete a wallet pass by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Pass name to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_wallet_passes: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wallet-list", async () => {
          await gotoGhl(page, "/wallet-kit");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const passes = await page.evaluate(() => {
            const items: Array<{
              name: string;
              type: string;
              status: string;
              installs: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="wallet"], [class*="pass"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    type:
                      el.querySelector('[class*="type"], [class*="badge"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"]')?.textContent?.trim() ?? "",
                    installs:
                      el.querySelector('[class*="install"], [class*="count"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, count: passes.length, walletPasses: passes };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_wallet_pass_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wallet-details", async () => {
          await gotoGhl(page, "/wallet-kit");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="pass"]:has-text("${name}"), a:has-text("${name}")`)
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
              passType: getVal("type") || getVal("pass type"),
              primaryColor: getVal("color") || getVal("primary"),
              installs: getVal("installs") || getVal("added"),
              distribution: getVal("distribution") || getVal("share"),
              created: getVal("created") || getVal("date"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_wallet_pass: async (args) => {
      const name = String(args.name);
      const passType = (args.passType as string) || "generic";
      const primaryColor = (args.primaryColor as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wallet-create", async () => {
          await gotoGhl(page, "/wallet-kit");
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
          if (passType) {
            const typeSelect = page
              .locator('select, [role="listbox"], [class*="dropdown"]')
              .first();
            await typeSelect.click({ timeout: 3000 }).catch(() => {});
            const option = page
              .locator(`[role="option"]:has-text("${passType}"), option:has-text("${passType}")`)
              .first();
            await option.click({ timeout: 3000 }).catch(() => {});
          }
          if (primaryColor) {
            const colorInput = page.locator('input[type="color"]').first();
            await colorInput.fill(primaryColor).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, passType, primaryColor, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_wallet_analytics: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wallet-analytics", async () => {
          await gotoGhl(page, "/wallet-kit");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="pass"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const analyticsTab = page
            .locator('a:has-text("Analytics"), button:has-text("Analytics"), [class*="tab"]:has-text("Analytic")')
            .first();
          await analyticsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getKpi = (label: string): string => {
              const el = Array.from(
                document.querySelectorAll('[class*="kpi"], [class*="metric"], [class*="stat"], [class*="card"]'),
              ).find((k) => k.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                el?.querySelector('[class*="value"], [class*="number"], strong')?.textContent?.trim() ?? ""
              );
            };
            return {
              totalInstalls: getKpi("install") || getKpi("added"),
              totalOpens: getKpi("open") || getKpi("view"),
              uniqueUsers: getKpi("unique"),
              appleWallet: getKpi("apple"),
              googlePay: getKpi("google"),
            };
          });
          return { name, analytics: data };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_wallet_pass: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this wallet pass" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wallet-delete", async () => {
          await gotoGhl(page, "/wallet-kit");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="pass"]:has-text("${name}")`)
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
