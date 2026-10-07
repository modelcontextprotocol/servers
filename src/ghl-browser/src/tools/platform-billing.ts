import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const platformBillingModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_platform_billing_overview",
      description: "Get platform billing overview: current plan, billing cycle, next payment, balance.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_platform_invoices",
      description: "List platform-level invoices with date, amount, status, and description.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter: paid, pending, failed" },
        },
      },
    },
    {
      name: "ghl_browser_get_platform_payment_method",
      description: "Get the current payment method on file: card type, last 4, expiry.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_platform_usage",
      description: "Get platform usage breakdown: contacts, emails, SMS, storage by sub-account.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_platform_plan_comparison",
      description: "Get available platform plans with pricing, features, and limits for comparison.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_platform_billing_overview: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "platform-billing", async () => {
          await gotoGhl(page, "/billing");
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
            const getKpi = (label: string): string => {
              const el = Array.from(
                document.querySelectorAll('[class*="kpi"], [class*="metric"], [class*="stat"], [class*="card"]'),
              ).find((k) => k.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                el?.querySelector('[class*="value"], [class*="number"], strong')?.textContent?.trim() ?? ""
              );
            };
            return {
              plan: getVal("plan") || getKpi("plan"),
              billingCycle: getVal("cycle") || getVal("billing"),
              nextPayment: getVal("next payment") || getVal("next billing"),
              amount: getVal("amount") || getKpi("amount"),
              balance: getVal("balance") || getKpi("balance"),
              status: getVal("status"),
              subAccounts: getKpi("sub-accounts") || getKpi("locations"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_platform_invoices: async (args) => {
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "platform-invoices", async () => {
          await gotoGhl(page, "/billing");
          await waitForAppReady(page);
          const invoicesTab = page
            .locator('a:has-text("Invoices"), button:has-text("Invoices"), [class*="tab"]:has-text("Invoice")')
            .first();
          await invoicesTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const invoices = await page.evaluate((st) => {
            const items: Array<{
              id: string;
              date: string;
              amount: string;
              status: string;
              description: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="invoice"], [role="row"]')
              .forEach((el) => {
                const idEl = el.querySelector(
                  '[class*="id"], [class*="number"], td:first-child',
                );
                if (idEl && (idEl.textContent?.trim().length ?? 0) > 1) {
                  const rowStatus =
                    el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "";
                  if (st && !rowStatus.toLowerCase().includes(st.toLowerCase())) return;
                  items.push({
                    id: idEl.textContent?.trim() ?? "",
                    date:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                    amount:
                      el.querySelector('[class*="amount"], [class*="total"]')?.textContent?.trim() ?? "",
                    status: rowStatus,
                    description:
                      el.querySelector('[class*="desc"], [class*="detail"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, status);
          return { status, count: invoices.length, invoices };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_platform_payment_method: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "platform-payment-method", async () => {
          await gotoGhl(page, "/billing");
          await waitForAppReady(page);
          const payTab = page
            .locator('a:has-text("Payment"), button:has-text("Payment"), [class*="tab"]:has-text("Payment")')
            .first();
          await payTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th, [class*="field"]'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], span")?.textContent?.trim() ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              cardType: getVal("card") || getVal("type"),
              last4: getVal("last 4") || getVal("ending"),
              expiry: getVal("expir") || getVal("expiry"),
              billingAddress: getVal("address"),
              isDefault: getVal("default"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_platform_usage: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "platform-usage", async () => {
          await gotoGhl(page, "/billing");
          await waitForAppReady(page);
          const usageTab = page
            .locator('a:has-text("Usage"), button:has-text("Usage"), [class*="tab"]:has-text("Usage")')
            .first();
          await usageTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const usage = await page.evaluate(() => {
            const items: Array<{
              subAccount: string;
              contacts: string;
              emails: string;
              sms: string;
              storage: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="usage"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="account"], td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    subAccount: nameEl.textContent?.trim() ?? "",
                    contacts:
                      el.querySelector('[class*="contact"]')?.textContent?.trim() ?? "",
                    emails:
                      el.querySelector('[class*="email"]')?.textContent?.trim() ?? "",
                    sms:
                      el.querySelector('[class*="sms"], [class*="text"]')?.textContent?.trim() ?? "",
                    storage:
                      el.querySelector('[class*="storage"], [class*="file"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: usage.length, usage };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_platform_plan_comparison: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "platform-plan-compare", async () => {
          await gotoGhl(page, "/billing");
          await waitForAppReady(page);
          const plansTab = page
            .locator('a:has-text("Plans"), button:has-text("Plans"), [class*="tab"]:has-text("Plan"), a:has-text("Upgrade")')
            .first();
          await plansTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const plans = await page.evaluate(() => {
            const items: Array<{
              name: string;
              price: string;
              subAccounts: string;
              contacts: string;
              features: string;
              current: boolean;
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
                    subAccounts:
                      el.querySelector('[class*="sub-account"], [class*="location"]')?.textContent?.trim() ?? "",
                    contacts:
                      el.querySelector('[class*="contact"]')?.textContent?.trim() ?? "",
                    features:
                      el.querySelector('[class*="feature"], ul, p')?.textContent?.trim()?.slice(0, 300) ?? "",
                    current: !!(
                      el.querySelector('[class*="current"], [class*="active"]') ||
                      el.textContent?.toLowerCase().includes("current plan")
                    ),
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
  },
};
