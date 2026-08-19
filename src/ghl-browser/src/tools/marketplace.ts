import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const marketplaceModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_marketplace_apps",
      description: "List available apps in the GHL marketplace with name, category, rating.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by app name" },
          category: { type: "string", description: "Filter by category" },
        },
      },
    },
    {
      name: "ghl_browser_get_marketplace_app_details",
      description: "Get details of a marketplace app: description, pricing, reviews.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "App name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_list_installed_integrations",
      description: "List currently installed/connected integrations with status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_install_marketplace_app",
      description: "Install an app from the marketplace.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "App name to install" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_uninstall_marketplace_app",
      description: "Uninstall a marketplace app integration.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "App name to uninstall" },
          confirm: { type: "boolean", description: "Must be true to confirm" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_marketplace_apps: async (args) => {
      const search = (args.search as string) || "";
      const category = (args.category as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "mkt-list", async () => {
          await gotoGhl(page, "/marketplace");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          if (category) {
            const catBtn = page
              .locator(`button:has-text("${category}"), a:has-text("${category}"), [role="tab"]:has-text("${category}")`)
              .first();
            await catBtn.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const apps = await page.evaluate(() => {
            const items: Array<{
              name: string;
              category: string;
              rating: string;
              description: string;
              installed: boolean;
            }> = [];
            document
              .querySelectorAll('[class*="app"], [class*="integration"], [class*="card"], tr, [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, a',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    category:
                      el.querySelector('[class*="category"], [class*="tag"]')?.textContent?.trim() ?? "",
                    rating:
                      el.querySelector('[class*="rating"], [class*="star"]')?.textContent?.trim() ?? "",
                    description:
                      el.querySelector('[class*="desc"], [class*="detail"], p')?.textContent?.trim() ?? "",
                    installed:
                      (el.textContent?.toLowerCase() ?? "").includes("installed") ||
                      (el.textContent?.toLowerCase() ?? "").includes("connected"),
                  });
                }
              });
            return items;
          });
          return { search, category, count: apps.length, marketplaceApps: apps };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_marketplace_app_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "mkt-details", async () => {
          await gotoGhl(page, "/marketplace");
          await waitForAppReady(page);
          const row = page
            .locator(`[class*="app"]:has-text("${name}"), [class*="card"]:has-text("${name}"), a:has-text("${name}")`)
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
              description: getVal("description") || getVal("about"),
              category: getVal("category") || getVal("type"),
              rating: getVal("rating") || getVal("stars"),
              reviews: getVal("reviews"),
              pricing: getVal("pricing") || getVal("cost") || getVal("price"),
              developer: getVal("developer") || getVal("by"),
              status: getVal("status") || getVal("installed"),
              website: document.querySelector('[class*="website"] a')?.getAttribute("href") ?? "",
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_installed_integrations: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "mkt-installed", async () => {
          await gotoGhl(page, "/settings/integrations");
          await waitForAppReady(page);
          const integrations = await page.evaluate(() => {
            const items: Array<{
              name: string;
              status: string;
              lastSync: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="integration"], [class*="app"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    lastSync:
                      el.querySelector('[class*="sync"], [class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: integrations.length, integrations };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_install_marketplace_app: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "mkt-install", async () => {
          await gotoGhl(page, "/marketplace");
          await waitForAppReady(page);
          const row = page
            .locator(`[class*="app"]:has-text("${name}"), [class*="card"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const installBtn = page
            .locator('button:has-text("Install"), button:has-text("Connect"), button:has-text("Add")')
            .first();
          await installBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const confirmBtn = page
            .locator('button:has-text("Confirm"), button:has-text("Install"), button:has-text("Authorize")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, installed: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_uninstall_marketplace_app: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to uninstall this app" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "mkt-uninstall", async () => {
          await gotoGhl(page, "/settings/integrations");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="integration"]:has-text("${name}")`)
            .first();
          const uninstallBtn = row
            .locator('button:has-text("Remove"), button:has-text("Disconnect"), button:has-text("Uninstall")')
            .first();
          await uninstallBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Remove")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, uninstalled: true };
        });
      } finally {
        await close();
      }
    },
  },
};
