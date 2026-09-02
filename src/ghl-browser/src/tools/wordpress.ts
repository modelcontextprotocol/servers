import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const wordpressModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_wordpress_sites",
      description: "List connected WordPress sites with domain, status, and last sync.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_wordpress_site_details",
      description: "Get details of a connected WordPress site: URL, plugin version, sync status.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "WordPress site domain" },
        },
        required: ["domain"],
      },
    },
    {
      name: "ghl_browser_connect_wordpress_site",
      description: "Connect a new WordPress site by entering the site URL and API credentials.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "WordPress site URL" },
          username: { type: "string", description: "WordPress admin username" },
        },
        required: ["url"],
      },
    },
    {
      name: "ghl_browser_sync_wordpress_forms",
      description: "Sync GHL forms to a connected WordPress site.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "WordPress site domain to sync to" },
        },
        required: ["domain"],
      },
    },
    {
      name: "ghl_browser_list_wordpress_plugins",
      description: "List GHL WordPress plugins: chat widget, forms, calendar embeds.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_list_wordpress_sites: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wp-sites", async () => {
          await gotoGhl(page, "/settings/wordpress");
          await waitForAppReady(page);
          const sites = await page.evaluate(() => {
            const items: Array<{
              domain: string;
              status: string;
              plugin: string;
              lastSync: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="site"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const domainEl = el.querySelector(
                  '[class*="domain"], [class*="url"], [class*="name"], a, td:first-child',
                );
                if (domainEl && (domainEl.textContent?.trim().length ?? 0) > 3) {
                  items.push({
                    domain: domainEl.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    plugin:
                      el.querySelector('[class*="plugin"], [class*="version"]')?.textContent?.trim() ?? "",
                    lastSync:
                      el.querySelector('[class*="sync"], [class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: sites.length, sites };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_wordpress_site_details: async (args) => {
      const domain = String(args.domain);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wp-site-details", async () => {
          await gotoGhl(page, "/settings/wordpress");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${domain}"), [class*="site"]:has-text("${domain}"), a:has-text("${domain}")`)
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
              url: getVal("url") || getVal("domain"),
              status: getVal("status"),
              pluginVersion: getVal("plugin") || getVal("version"),
              apiKey: getVal("api key") ? "****" : "",
              lastSync: getVal("last sync") || getVal("synced"),
              formsCount: getVal("forms"),
              calendarsCount: getVal("calendars"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_connect_wordpress_site: async (args) => {
      const url = String(args.url);
      const username = (args.username as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wp-connect", async () => {
          await gotoGhl(page, "/settings/wordpress");
          await waitForAppReady(page);
          const addBtn = page
            .locator('button:has-text("Connect"), button:has-text("Add"), button:has-text("New")')
            .first();
          await addBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const urlInput = page
            .locator('input[placeholder*="url"], input[placeholder*="domain"], input[name="url"]')
            .first();
          await urlInput.fill(url);
          if (username) {
            const userInput = page
              .locator('input[placeholder*="username"], input[name="username"]')
              .first();
            await userInput.fill(username).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Connect"), button:has-text("Save"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { url, username, connected: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_sync_wordpress_forms: async (args) => {
      const domain = String(args.domain);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wp-sync-forms", async () => {
          await gotoGhl(page, "/settings/wordpress");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${domain}"), [class*="site"]:has-text("${domain}")`)
            .first();
          const syncBtn = row
            .locator('button:has-text("Sync"), button:has-text("Push"), [class*="sync"]')
            .first();
          await syncBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { domain, synced: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_wordpress_plugins: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "wp-plugins", async () => {
          await gotoGhl(page, "/settings/wordpress");
          await waitForAppReady(page);
          const plugins = await page.evaluate(() => {
            const items: Array<{
              name: string;
              version: string;
              description: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('[class*="plugin"], [class*="card"], tr, [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    version:
                      el.querySelector('[class*="version"]')?.textContent?.trim() ?? "",
                    description:
                      el.querySelector('[class*="desc"], p')?.textContent?.trim()?.slice(0, 200) ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: plugins.length, plugins };
        });
      } finally {
        await close();
      }
    },
  },
};
