import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const storeCatalogModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_store_products",
      description: "List store catalog products with name, price, inventory, category, and status.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by product category" },
          status: { type: "string", description: "Filter: active, draft, out_of_stock" },
        },
      },
    },
    {
      name: "ghl_browser_get_store_product_details",
      description: "Get detailed information for a specific store product.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_store_product",
      description: "Create a new store product with name, price, description, and category.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
          price: { type: "number", description: "Product price" },
          description: { type: "string", description: "Product description" },
          category: { type: "string", description: "Product category" },
          inventory: { type: "number", description: "Initial inventory quantity" },
        },
        required: ["name", "price"],
      },
    },
    {
      name: "ghl_browser_list_store_categories",
      description: "List store product categories with name, product count, and status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_store_orders_summary",
      description: "Get store orders summary: total orders, revenue, pending, fulfilled counts.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_list_store_products: async (args) => {
      const category = (args.category as string) || "";
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-products", async () => {
          await gotoGhl(page, "/store");
          await waitForAppReady(page);
          if (category) {
            const catBtn = page
              .locator(`button:has-text("${category}"), a:has-text("${category}"), [class*="filter"]:has-text("${category}")`)
              .first();
            await catBtn.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const products = await page.evaluate((st) => {
            const items: Array<{
              name: string;
              price: string;
              inventory: string;
              category: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="product"], [class*="card"], [role="row"]')
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
                    price:
                      el.querySelector('[class*="price"], [class*="amount"]')?.textContent?.trim() ?? "",
                    inventory:
                      el.querySelector('[class*="inventory"], [class*="stock"], [class*="qty"]')?.textContent?.trim() ?? "",
                    category:
                      el.querySelector('[class*="category"]')?.textContent?.trim() ?? "",
                    status: rowStatus,
                  });
                }
              });
            return items;
          }, status);
          return { category, status, count: products.length, products };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_store_product_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-product-details", async () => {
          await gotoGhl(page, "/store");
          await waitForAppReady(page);
          const row = page
            .locator(
              `tr:has-text("${name}"), [class*="product"]:has-text("${name}"), a:has-text("${name}")`,
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
              price: getVal("price"),
              description: getVal("description"),
              category: getVal("category"),
              inventory: getVal("inventory") || getVal("stock"),
              sku: getVal("sku"),
              status: getVal("status"),
              totalSold: getVal("sold") || getVal("sales"),
              created: getVal("created") || getVal("date"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_store_product: async (args) => {
      const name = String(args.name);
      const price = args.price as number;
      const description = (args.description as string) || "";
      const category = (args.category as string) || "";
      const inventory = args.inventory as number | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-product-create", async () => {
          await gotoGhl(page, "/store");
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
          if (description) {
            const descInput = page
              .locator('textarea, input[placeholder*="description"]')
              .first();
            await descInput.fill(description).catch(() => {});
          }
          if (category) {
            const catSelect = page
              .locator(`[class*="category"]:has-text("${category}"), option:has-text("${category}")`)
              .first();
            await catSelect.click({ timeout: 3000 }).catch(() => {});
          }
          if (inventory !== undefined) {
            const invInput = page
              .locator('input[name*="inventory"], input[placeholder*="stock"], input[name*="quantity"]')
              .first();
            await invInput.fill(String(inventory)).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, price, description, category, inventory, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_store_categories: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-categories", async () => {
          await gotoGhl(page, "/store");
          await waitForAppReady(page);
          const catTab = page
            .locator('a:has-text("Categories"), button:has-text("Categories"), [class*="tab"]:has-text("Categor")')
            .first();
          await catTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const categories = await page.evaluate(() => {
            const items: Array<{
              name: string;
              productCount: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="category"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    productCount:
                      el.querySelector('[class*="count"], [class*="product"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: categories.length, categories };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_store_orders_summary: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-orders-summary", async () => {
          await gotoGhl(page, "/store");
          await waitForAppReady(page);
          const ordersTab = page
            .locator('a:has-text("Orders"), button:has-text("Orders"), [class*="tab"]:has-text("Order")')
            .first();
          await ordersTab.click({ timeout: 5000 }).catch(() => {});
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
              totalOrders: getKpi("total orders") || getKpi("total"),
              totalRevenue: getKpi("revenue") || getKpi("total revenue"),
              pending: getKpi("pending"),
              fulfilled: getKpi("fulfilled") || getKpi("completed"),
              cancelled: getKpi("cancelled") || getKpi("canceled"),
              refunded: getKpi("refunded"),
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
