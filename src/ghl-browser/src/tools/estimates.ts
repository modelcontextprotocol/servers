import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const estimatesModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_estimates",
      description: "List business estimates with client name, amount, status, and date.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by estimate name or client" },
          status: { type: "string", description: "Filter: draft, sent, accepted, declined" },
        },
      },
    },
    {
      name: "ghl_browser_get_estimate_details",
      description: "Get details of an estimate: line items, totals, client, terms.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Estimate name or number" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_estimate",
      description: "Create a new estimate for a contact with line items.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Estimate title" },
          contactName: { type: "string", description: "Client contact name" },
          amount: { type: "number", description: "Total estimate amount" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_send_estimate",
      description: "Send an estimate to the client via email.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Estimate name or number" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_convert_estimate_to_invoice",
      description: "Convert an accepted estimate into an invoice.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Estimate name or number" },
        },
        required: ["name"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_estimates: async (args) => {
      const search = (args.search as string) || "";
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "est-list", async () => {
          await gotoGhl(page, "/estimates");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          if (status) {
            const filterBtn = page
              .locator(`button:has-text("${status}"), [role="tab"]:has-text("${status}"), a:has-text("${status}")`)
              .first();
            await filterBtn.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const estimates = await page.evaluate(() => {
            const items: Array<{
              name: string;
              client: string;
              amount: string;
              status: string;
              date: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="estimate"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    client:
                      el.querySelector('[class*="client"], [class*="contact"]')?.textContent?.trim() ?? "",
                    amount:
                      el.querySelector('[class*="amount"], [class*="total"], [class*="price"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    date:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, status, count: estimates.length, estimates };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_estimate_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "est-details", async () => {
          await gotoGhl(page, "/estimates");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="estimate"]:has-text("${name}"), a:has-text("${name}")`)
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
            const lineItems = Array.from(
              document.querySelectorAll('tr[class*="item"], [class*="line-item"]'),
            ).map((el) => ({
              description: el.querySelector('[class*="desc"], td:first-child')?.textContent?.trim() ?? "",
              quantity: el.querySelector('[class*="qty"]')?.textContent?.trim() ?? "",
              price: el.querySelector('[class*="price"], [class*="amount"]')?.textContent?.trim() ?? "",
            }));
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              client: getVal("client") || getVal("contact"),
              status: getVal("status"),
              subtotal: getVal("subtotal"),
              tax: getVal("tax"),
              total: getVal("total"),
              terms: getVal("terms") || getVal("notes"),
              validUntil: getVal("valid") || getVal("expires"),
              lineItems,
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_estimate: async (args) => {
      const name = String(args.name);
      const contactName = (args.contactName as string) || "";
      const amount = (args.amount as number) || 0;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "est-create", async () => {
          await gotoGhl(page, "/estimates");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page
            .locator('input[name="name"], input[placeholder*="name"], input[placeholder*="title"]')
            .first();
          await nameInput.fill(name).catch(() => {});
          if (contactName) {
            const contactInput = page
              .locator('input[placeholder*="contact"], input[placeholder*="client"]')
              .first();
            await contactInput.fill(contactName).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, contactName, amount, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_send_estimate: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "est-send", async () => {
          await gotoGhl(page, "/estimates");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="estimate"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const sendBtn = page
            .locator('button:has-text("Send"), button:has-text("Email")')
            .first();
          await sendBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const confirmSend = page
            .locator('button:has-text("Send"), button:has-text("Confirm")')
            .first();
          await confirmSend.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, sent: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_convert_estimate_to_invoice: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "est-convert", async () => {
          await gotoGhl(page, "/estimates");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="estimate"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const convertBtn = page
            .locator('button:has-text("Convert"), button:has-text("Invoice"), button:has-text("To Invoice")')
            .first();
          await convertBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Convert"), button:has-text("Confirm")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, convertedToInvoice: true };
        });
      } finally {
        await close();
      }
    },
  },
};
