import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const resellerModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_reseller_overview",
      description: "Get reseller program overview: plan, commission rate, active clients, revenue.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_reseller_clients",
      description: "List reseller clients with name, plan, status, and monthly revenue.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter: active, trial, cancelled" },
        },
      },
    },
    {
      name: "ghl_browser_get_reseller_client_details",
      description: "Get detailed info for a specific reseller client.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Client name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_reseller_pricing",
      description: "Get reseller pricing tiers and commission structure.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_reseller_invoices",
      description: "List reseller invoices with date, amount, status, and client.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_reseller_overview: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reseller-overview", async () => {
          await gotoGhl(page, "/reselling");
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
              plan: getVal("plan") || getKpi("plan"),
              commissionRate: getVal("commission") || getKpi("commission"),
              activeClients: getKpi("active") || getKpi("clients"),
              totalRevenue: getKpi("revenue") || getKpi("total"),
              monthlyRecurring: getKpi("monthly") || getKpi("mrr"),
              trialClients: getKpi("trial"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_reseller_clients: async (args) => {
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reseller-clients", async () => {
          await gotoGhl(page, "/reselling");
          await waitForAppReady(page);
          const clientsTab = page
            .locator('a:has-text("Clients"), button:has-text("Clients"), [class*="tab"]:has-text("Client")')
            .first();
          await clientsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const clients = await page.evaluate((st) => {
            const items: Array<{
              name: string;
              plan: string;
              status: string;
              revenue: string;
              joined: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="client"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  const rowStatus =
                    el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "";
                  if (st && !rowStatus.toLowerCase().includes(st.toLowerCase())) return;
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    plan:
                      el.querySelector('[class*="plan"]')?.textContent?.trim() ?? "",
                    status: rowStatus,
                    revenue:
                      el.querySelector('[class*="revenue"], [class*="amount"]')?.textContent?.trim() ?? "",
                    joined:
                      el.querySelector('[class*="date"], [class*="joined"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, status);
          return { status, count: clients.length, clients };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_reseller_client_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reseller-client-details", async () => {
          await gotoGhl(page, "/reselling");
          await waitForAppReady(page);
          const row = page
            .locator(
              `tr:has-text("${name}"), [class*="client"]:has-text("${name}"), a:has-text("${name}")`,
            )
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
              plan: getVal("plan"),
              status: getVal("status"),
              monthlyFee: getVal("monthly") || getVal("fee"),
              commission: getVal("commission"),
              totalPaid: getVal("total paid") || getVal("total"),
              startDate: getVal("start") || getVal("joined"),
              domain: getVal("domain"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_reseller_pricing: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reseller-pricing", async () => {
          await gotoGhl(page, "/reselling");
          await waitForAppReady(page);
          const pricingTab = page
            .locator('a:has-text("Pricing"), button:has-text("Pricing"), [class*="tab"]:has-text("Pricing")')
            .first();
          await pricingTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const tiers = await page.evaluate(() => {
            const items: Array<{
              name: string;
              price: string;
              commission: string;
              features: string;
            }> = [];
            document
              .querySelectorAll('[class*="tier"], [class*="plan"], [class*="card"], tr, [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    price:
                      el.querySelector('[class*="price"], [class*="amount"]')?.textContent?.trim() ?? "",
                    commission:
                      el.querySelector('[class*="commission"], [class*="percent"]')?.textContent?.trim() ?? "",
                    features:
                      el.querySelector('[class*="feature"], ul, p')?.textContent?.trim()?.slice(0, 200) ?? "",
                  });
                }
              });
            return items;
          });
          return { count: tiers.length, tiers };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_reseller_invoices: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reseller-invoices", async () => {
          await gotoGhl(page, "/reselling");
          await waitForAppReady(page);
          const invoicesTab = page
            .locator('a:has-text("Invoices"), button:has-text("Invoices"), [class*="tab"]:has-text("Invoice")')
            .first();
          await invoicesTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const invoices = await page.evaluate(() => {
            const items: Array<{
              id: string;
              client: string;
              amount: string;
              status: string;
              date: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="invoice"], [role="row"]')
              .forEach((el) => {
                const idEl = el.querySelector(
                  '[class*="id"], [class*="number"], td:first-child',
                );
                if (idEl && (idEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    id: idEl.textContent?.trim() ?? "",
                    client:
                      el.querySelector('[class*="client"], [class*="customer"]')?.textContent?.trim() ?? "",
                    amount:
                      el.querySelector('[class*="amount"], [class*="total"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    date:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: invoices.length, invoices };
        });
      } finally {
        await close();
      }
    },
  },
};
