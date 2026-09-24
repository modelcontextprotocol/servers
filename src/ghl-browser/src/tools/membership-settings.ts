import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const membershipSettingsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_membership_settings",
      description: "Get membership configuration: branding, access control, login settings.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Membership name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_list_membership_products",
      description: "List membership offer products with name, price, access level, and status.",
      inputSchema: {
        type: "object",
        properties: {
          membership: { type: "string", description: "Membership name to filter by" },
        },
      },
    },
    {
      name: "ghl_browser_get_membership_analytics",
      description: "Get membership analytics: active members, revenue, churn, engagement.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Membership name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_list_membership_offers",
      description: "List membership offer/checkout pages with name, URL, and conversion rate.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_update_membership_branding",
      description: "Update membership branding: logo, colors, custom domain.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Membership name" },
          primaryColor: { type: "string", description: "Primary color hex code" },
          customDomain: { type: "string", description: "Custom domain for the membership portal" },
        },
        required: ["name"],
      },
    },
  ],
  handlers: {
    ghl_browser_get_membership_settings: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "membership-settings", async () => {
          await gotoGhl(page, "/memberships");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="membership"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const settingsTab = page
            .locator('a:has-text("Settings"), button:has-text("Settings"), [class*="tab"]:has-text("Setting")')
            .first();
          await settingsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], input, select, span")?.textContent?.trim() ??
                (lbl?.parentElement?.querySelector("input") as HTMLInputElement)?.value ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              url: getVal("url") || getVal("domain"),
              loginRedirect: getVal("redirect") || getVal("login"),
              accessControl: getVal("access"),
              dripContent: getVal("drip"),
              certificatesEnabled: getVal("certificate"),
              customDomain: getVal("custom domain"),
              primaryColor: getVal("color") || getVal("primary"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_membership_products: async (args) => {
      const membership = (args.membership as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "membership-products", async () => {
          await gotoGhl(page, "/memberships");
          await waitForAppReady(page);
          if (membership) {
            const memRow = page
              .locator(`a:has-text("${membership}"), [class*="membership"]:has-text("${membership}")`)
              .first();
            await memRow.click({ timeout: 5000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const productsTab = page
            .locator('a:has-text("Products"), button:has-text("Products"), [class*="tab"]:has-text("Product"), a:has-text("Offers")')
            .first();
          await productsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const products = await page.evaluate(() => {
            const items: Array<{
              name: string;
              price: string;
              accessLevel: string;
              members: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="product"], [class*="offer"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    price:
                      el.querySelector('[class*="price"], [class*="amount"]')?.textContent?.trim() ?? "",
                    accessLevel:
                      el.querySelector('[class*="access"], [class*="level"]')?.textContent?.trim() ?? "",
                    members:
                      el.querySelector('[class*="member"], [class*="count"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { membership, count: products.length, products };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_membership_analytics: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "membership-analytics", async () => {
          await gotoGhl(page, "/memberships");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="membership"]:has-text("${name}"), a:has-text("${name}")`)
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
              activeMembers: getKpi("active") || getKpi("members"),
              totalRevenue: getKpi("revenue") || getKpi("total"),
              mrr: getKpi("mrr") || getKpi("monthly"),
              churnRate: getKpi("churn"),
              avgEngagement: getKpi("engagement"),
              completionRate: getKpi("completion"),
              newSignups: getKpi("new") || getKpi("signups"),
            };
          });
          return { name, analytics: data };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_membership_offers: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "membership-offers", async () => {
          await gotoGhl(page, "/memberships");
          await waitForAppReady(page);
          const offersTab = page
            .locator('a:has-text("Offers"), button:has-text("Offers"), [class*="tab"]:has-text("Offer")')
            .first();
          await offersTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const offers = await page.evaluate(() => {
            const items: Array<{
              name: string;
              url: string;
              conversion: string;
              views: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="offer"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    url:
                      el.querySelector('[class*="url"], [class*="link"]')?.textContent?.trim() ?? "",
                    conversion:
                      el.querySelector('[class*="conversion"], [class*="rate"]')?.textContent?.trim() ?? "",
                    views:
                      el.querySelector('[class*="view"], [class*="visit"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: offers.length, offers };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_membership_branding: async (args) => {
      const name = String(args.name);
      const primaryColor = (args.primaryColor as string) || "";
      const customDomain = (args.customDomain as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "membership-branding", async () => {
          await gotoGhl(page, "/memberships");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="membership"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const settingsTab = page
            .locator('a:has-text("Settings"), button:has-text("Settings"), [class*="tab"]:has-text("Setting")')
            .first();
          await settingsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          if (primaryColor) {
            const colorInput = page.locator('input[type="color"]').first();
            await colorInput.fill(primaryColor).catch(() => {});
          }
          if (customDomain) {
            const domainInput = page
              .locator('input[placeholder*="domain"], input[name*="domain"]')
              .first();
            await domainInput.fill(customDomain).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, primaryColor, customDomain, updated: true };
        });
      } finally {
        await close();
      }
    },
  },
};
