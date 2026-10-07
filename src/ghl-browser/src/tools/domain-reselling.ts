import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const domainResellingModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_resold_domains",
      description: "List domains sold through the reseller program with status and expiry.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by domain name" },
        },
      },
    },
    {
      name: "ghl_browser_get_resold_domain_details",
      description: "Get details of a resold domain: registration, DNS, expiry, auto-renew.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name" },
        },
        required: ["domain"],
      },
    },
    {
      name: "ghl_browser_search_available_domains",
      description: "Search for available domain names to register.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Domain name to search for" },
        },
        required: ["query"],
      },
    },
    {
      name: "ghl_browser_get_domain_reseller_pricing",
      description: "Get domain reseller pricing: registration, renewal, transfer costs.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_toggle_domain_auto_renew",
      description: "Toggle auto-renew for a resold domain.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name" },
          autoRenew: { type: "boolean", description: "True to enable, false to disable" },
        },
        required: ["domain", "autoRenew"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_resold_domains: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "resell-dom-list", async () => {
          await gotoGhl(page, "/domain-reselling");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const domains = await page.evaluate(() => {
            const items: Array<{
              domain: string;
              status: string;
              expiry: string;
              autoRenew: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="domain"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="domain"], [class*="name"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                  items.push({
                    domain: nameEl.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    expiry:
                      el.querySelector('[class*="expir"], [class*="date"], time')?.textContent?.trim() ?? "",
                    autoRenew:
                      el.querySelector('[class*="renew"], [class*="toggle"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, count: domains.length, domains };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_resold_domain_details: async (args) => {
      const domain = String(args.domain);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "resell-dom-details", async () => {
          await gotoGhl(page, "/domain-reselling");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${domain}"), [class*="domain"]:has-text("${domain}")`)
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
              domain:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              registrar: getVal("registrar"),
              registered: getVal("registered") || getVal("created"),
              expiry: getVal("expir"),
              autoRenew: getVal("auto renew") || getVal("renew"),
              nameServers: getVal("nameserver") || getVal("dns"),
              status: getVal("status"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_search_available_domains: async (args) => {
      const query = String(args.query);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "resell-dom-search", async () => {
          await gotoGhl(page, "/domain-reselling");
          await waitForAppReady(page);
          const searchInput = page
            .locator('input[type="search"], input[placeholder*="domain"], input[placeholder*="search"]')
            .first();
          await searchInput.fill(query).catch(() => {});
          const searchBtn = page
            .locator('button:has-text("Search"), button:has-text("Check"), button[type="submit"]')
            .first();
          await searchBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const results = await page.evaluate(() => {
            const items: Array<{
              domain: string;
              available: boolean;
              price: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="result"], [class*="domain"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="domain"], [class*="name"], td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                  items.push({
                    domain: nameEl.textContent?.trim() ?? "",
                    available:
                      (el.querySelector('[class*="available"], [class*="status"]')?.textContent?.toLowerCase() ?? "").includes("available"),
                    price:
                      el.querySelector('[class*="price"], [class*="cost"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { query, count: results.length, results };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_domain_reseller_pricing: async (_args) => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "resell-pricing", async () => {
          await gotoGhl(page, "/domain-reselling");
          await waitForAppReady(page);
          const pricingTab = page
            .locator('a:has-text("Pricing"), button:has-text("Pricing"), [class*="tab"]:has-text("Pric")')
            .first();
          await pricingTab.click({ timeout: 5000 }).catch(() => {});
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
              comRegistration: getKpi(".com") || getKpi("registration"),
              renewal: getKpi("renewal"),
              transfer: getKpi("transfer"),
              profitMargin: getKpi("margin") || getKpi("profit"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_toggle_domain_auto_renew: async (args) => {
      const domain = String(args.domain);
      const autoRenew = args.autoRenew === true;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "resell-autorenew", async () => {
          await gotoGhl(page, "/domain-reselling");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${domain}"), [class*="domain"]:has-text("${domain}")`)
            .first();
          const toggle = row
            .locator('[class*="toggle"], input[type="checkbox"], [role="switch"]')
            .first();
          await toggle.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { domain, autoRenew, updated: true };
        });
      } finally {
        await close();
      }
    },
  },
};
