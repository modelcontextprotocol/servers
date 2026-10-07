import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const saasModeModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_saas_overview",
      description: "Get SaaS mode overview: plan, pricing, active clients, MRR, trial count.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_saas_plans",
      description: "List SaaS subscription plans with name, price, features, and subscriber count.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_create_saas_plan",
      description: "Create a new SaaS subscription plan with pricing and feature set.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plan name" },
          price: { type: "number", description: "Monthly price" },
          features: { type: "string", description: "Comma-separated feature list" },
          trialDays: { type: "number", description: "Trial period in days (0 for no trial)" },
        },
        required: ["name", "price"],
      },
    },
    {
      name: "ghl_browser_list_saas_clients",
      description: "List SaaS clients/subscribers with name, plan, status, and billing.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter: active, trial, cancelled, past_due" },
        },
      },
    },
    {
      name: "ghl_browser_get_saas_billing_summary",
      description: "Get SaaS billing summary: MRR, ARR, churn rate, revenue by plan.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_saas_overview: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "saas-overview", async () => {
          await gotoGhl(page, "/saas");
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
              activeClients: getKpi("active") || getKpi("clients"),
              trialClients: getKpi("trial"),
              mrr: getKpi("mrr") || getKpi("monthly"),
              arr: getKpi("arr") || getKpi("annual"),
              churnRate: getKpi("churn"),
              totalRevenue: getKpi("revenue") || getKpi("total"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_saas_plans: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "saas-plans", async () => {
          await gotoGhl(page, "/saas");
          await waitForAppReady(page);
          const plansTab = page
            .locator('a:has-text("Plans"), button:has-text("Plans"), [class*="tab"]:has-text("Plan")')
            .first();
          await plansTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const plans = await page.evaluate(() => {
            const items: Array<{
              name: string;
              price: string;
              subscribers: string;
              features: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('[class*="plan"], [class*="card"], tr, [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    price:
                      el.querySelector('[class*="price"], [class*="amount"]')?.textContent?.trim() ?? "",
                    subscribers:
                      el.querySelector('[class*="subscriber"], [class*="client"], [class*="count"]')?.textContent?.trim() ?? "",
                    features:
                      el.querySelector('[class*="feature"], ul, p')?.textContent?.trim()?.slice(0, 200) ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: plans.length, plans };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_saas_plan: async (args) => {
      const name = String(args.name);
      const price = args.price as number;
      const features = (args.features as string) || "";
      const trialDays = (args.trialDays as number) || 0;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "saas-create-plan", async () => {
          await gotoGhl(page, "/saas");
          await waitForAppReady(page);
          const plansTab = page
            .locator('a:has-text("Plans"), button:has-text("Plans"), [class*="tab"]:has-text("Plan")')
            .first();
          await plansTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page
            .locator('input[name="name"], input[placeholder*="name"]')
            .first();
          await nameInput.fill(name);
          const priceInput = page
            .locator('input[name*="price"], input[placeholder*="price"], input[type="number"]')
            .first();
          await priceInput.fill(String(price));
          if (trialDays > 0) {
            const trialInput = page
              .locator('input[name*="trial"], input[placeholder*="trial"]')
              .first();
            await trialInput.fill(String(trialDays)).catch(() => {});
          }
          if (features) {
            const featuresInput = page
              .locator('textarea, input[placeholder*="feature"]')
              .first();
            await featuresInput.fill(features).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, price, features, trialDays, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_saas_clients: async (args) => {
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "saas-clients", async () => {
          await gotoGhl(page, "/saas");
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
              billing: string;
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
                    billing:
                      el.querySelector('[class*="billing"], [class*="amount"]')?.textContent?.trim() ?? "",
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

    ghl_browser_get_saas_billing_summary: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "saas-billing", async () => {
          await gotoGhl(page, "/saas");
          await waitForAppReady(page);
          const billingTab = page
            .locator('a:has-text("Billing"), button:has-text("Billing"), [class*="tab"]:has-text("Billing")')
            .first();
          await billingTab.click({ timeout: 5000 }).catch(() => {});
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
              mrr: getKpi("mrr") || getKpi("monthly recurring"),
              arr: getKpi("arr") || getKpi("annual recurring"),
              churnRate: getKpi("churn"),
              avgRevenuePerClient: getKpi("average") || getKpi("arpu"),
              newSubscriptions: getKpi("new"),
              cancellations: getKpi("cancel"),
              pastDue: getKpi("past due") || getKpi("overdue"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },
  },
};
