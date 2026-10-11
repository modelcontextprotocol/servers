import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const paymentLinksModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_payment_links",
      description: "List payment links with name, amount, status, and transaction count.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter: active, inactive" },
        },
      },
    },
    {
      name: "ghl_browser_get_payment_link_details",
      description: "Get details of a specific payment link: URL, products, amount, settings.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Payment link name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_payment_link",
      description: "Create a new payment link with name, amount, and product association.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Payment link name" },
          amount: { type: "number", description: "Payment amount" },
          product: { type: "string", description: "Product name to associate" },
          allowCustomAmount: { type: "boolean", description: "Allow customer to enter custom amount" },
        },
        required: ["name", "amount"],
      },
    },
    {
      name: "ghl_browser_get_payment_link_url",
      description: "Get the shareable URL for a payment link.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Payment link name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_deactivate_payment_link",
      description: "Deactivate (disable) a payment link.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Payment link name" },
          confirm: { type: "boolean", description: "Must be true to confirm" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_payment_links: async (args) => {
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "payment-links-list", async () => {
          await gotoGhl(page, "/payments/links");
          await waitForAppReady(page);
          const links = await page.evaluate((st) => {
            const items: Array<{
              name: string;
              amount: string;
              status: string;
              transactions: string;
              created: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="link"], [class*="card"], [role="row"]')
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
                    amount:
                      el.querySelector('[class*="amount"], [class*="price"]')?.textContent?.trim() ?? "",
                    status: rowStatus,
                    transactions:
                      el.querySelector('[class*="transaction"], [class*="count"]')?.textContent?.trim() ?? "",
                    created:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, status);
          return { status, count: links.length, paymentLinks: links };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_payment_link_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "payment-link-details", async () => {
          await gotoGhl(page, "/payments/links");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="link"]:has-text("${name}"), a:has-text("${name}")`)
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
              amount: getVal("amount") || getVal("price"),
              url: getVal("url") || getVal("link"),
              product: getVal("product"),
              status: getVal("status"),
              allowCustom: getVal("custom amount"),
              totalTransactions: getVal("transactions") || getVal("total"),
              totalRevenue: getVal("revenue"),
              created: getVal("created") || getVal("date"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_payment_link: async (args) => {
      const name = String(args.name);
      const amount = args.amount as number;
      const product = (args.product as string) || "";
      const allowCustomAmount = args.allowCustomAmount === true;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "payment-link-create", async () => {
          await gotoGhl(page, "/payments/links");
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
          const amountInput = page
            .locator('input[name*="amount"], input[placeholder*="amount"], input[type="number"]')
            .first();
          await amountInput.fill(String(amount));
          if (product) {
            const prodSelect = page
              .locator(`[class*="product"]:has-text("${product}"), option:has-text("${product}")`)
              .first();
            await prodSelect.click({ timeout: 3000 }).catch(() => {});
          }
          if (allowCustomAmount) {
            const customToggle = page
              .locator('[class*="custom"] input[type="checkbox"], [class*="custom"] [role="switch"]')
              .first();
            await customToggle.click({ timeout: 2000 }).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, amount, product, allowCustomAmount, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_payment_link_url: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "payment-link-url", async () => {
          await gotoGhl(page, "/payments/links");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="link"]:has-text("${name}")`)
            .first();
          const copyBtn = row
            .locator('button:has-text("Copy"), button:has-text("URL"), [class*="copy"], [class*="link"]')
            .first();
          await copyBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const urlEl = document.querySelector('[class*="url"], [class*="link"], input[readonly]');
            return {
              url:
                (urlEl as HTMLInputElement)?.value ??
                urlEl?.textContent?.trim() ??
                "",
            };
          });
          return { name, ...data };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_deactivate_payment_link: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to deactivate this payment link" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "payment-link-deactivate", async () => {
          await gotoGhl(page, "/payments/links");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="link"]:has-text("${name}")`)
            .first();
          const toggle = row
            .locator('input[type="checkbox"], [role="switch"], button[class*="toggle"]')
            .first();
          await toggle.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, deactivated: true };
        });
      } finally {
        await close();
      }
    },
  },
};
