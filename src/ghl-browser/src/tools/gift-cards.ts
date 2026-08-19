import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const giftCardsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_gift_cards",
      description: "List gift card products with name, denomination, status, and inventory.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter: active, inactive" },
        },
      },
    },
    {
      name: "ghl_browser_get_gift_card_details",
      description: "Get details of a specific gift card product.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Gift card product name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_gift_card",
      description: "Create a new gift card product with name, denomination, and design.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Gift card product name" },
          amount: { type: "number", description: "Denomination amount" },
          description: { type: "string", description: "Product description" },
        },
        required: ["name", "amount"],
      },
    },
    {
      name: "ghl_browser_list_gift_card_transactions",
      description: "List gift card purchase/redemption transactions.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Filter: purchase, redemption" },
        },
      },
    },
    {
      name: "ghl_browser_toggle_gift_card",
      description: "Activate or deactivate a gift card product.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Gift card product name" },
          active: { type: "boolean", description: "true to activate, false to deactivate" },
        },
        required: ["name", "active"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_gift_cards: async (args) => {
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "gift-cards-list", async () => {
          await gotoGhl(page, "/gift-cards");
          await waitForAppReady(page);
          const cards = await page.evaluate((st) => {
            const items: Array<{
              name: string;
              amount: string;
              status: string;
              sold: string;
              redeemed: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="card"], [class*="product"], [role="row"]')
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
                      el.querySelector('[class*="amount"], [class*="price"], [class*="denomination"]')?.textContent?.trim() ?? "",
                    status: rowStatus,
                    sold:
                      el.querySelector('[class*="sold"], [class*="purchased"]')?.textContent?.trim() ?? "",
                    redeemed:
                      el.querySelector('[class*="redeem"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, status);
          return { status, count: cards.length, giftCards: cards };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_gift_card_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "gift-card-details", async () => {
          await gotoGhl(page, "/gift-cards");
          await waitForAppReady(page);
          const row = page
            .locator(
              `tr:has-text("${name}"), [class*="card"]:has-text("${name}"), a:has-text("${name}")`,
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
              amount: getVal("amount") || getVal("denomination"),
              description: getVal("description"),
              status: getVal("status"),
              totalSold: getVal("sold"),
              totalRedeemed: getVal("redeemed"),
              outstanding: getVal("outstanding") || getVal("balance"),
              created: getVal("created") || getVal("date"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_gift_card: async (args) => {
      const name = String(args.name);
      const amount = args.amount as number;
      const description = (args.description as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "gift-card-create", async () => {
          await gotoGhl(page, "/gift-cards");
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
          if (description) {
            const descInput = page
              .locator('textarea, input[placeholder*="description"]')
              .first();
            await descInput.fill(description).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, amount, description, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_gift_card_transactions: async (args) => {
      const type = (args.type as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "gift-card-txns", async () => {
          await gotoGhl(page, "/gift-cards");
          await waitForAppReady(page);
          const txnTab = page
            .locator('a:has-text("Transactions"), button:has-text("Transactions"), [class*="tab"]:has-text("Transaction")')
            .first();
          await txnTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const transactions = await page.evaluate((filterType) => {
            const items: Array<{
              code: string;
              type: string;
              amount: string;
              contact: string;
              date: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="transaction"], [role="row"]')
              .forEach((el) => {
                const codeEl = el.querySelector(
                  '[class*="code"], td:first-child',
                );
                if (codeEl && (codeEl.textContent?.trim().length ?? 0) > 1) {
                  const rowType =
                    el.querySelector('[class*="type"]')?.textContent?.trim() ?? "";
                  if (filterType && !rowType.toLowerCase().includes(filterType.toLowerCase())) return;
                  items.push({
                    code: codeEl.textContent?.trim() ?? "",
                    type: rowType,
                    amount:
                      el.querySelector('[class*="amount"]')?.textContent?.trim() ?? "",
                    contact:
                      el.querySelector('[class*="contact"], [class*="customer"]')?.textContent?.trim() ?? "",
                    date:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, type);
          return { type, count: transactions.length, transactions };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_toggle_gift_card: async (args) => {
      const name = String(args.name);
      const active = args.active === true;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "gift-card-toggle", async () => {
          await gotoGhl(page, "/gift-cards");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="card"]:has-text("${name}")`)
            .first();
          const toggle = row
            .locator('input[type="checkbox"], [role="switch"], button[class*="toggle"]')
            .first();
          await toggle.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, active, toggled: true };
        });
      } finally {
        await close();
      }
    },
  },
};
