import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const storeWidgetsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_store_widgets",
      description: "List embeddable store widgets with name, type, embed status, and views.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_store_widget_config",
      description: "Get configuration for a specific store widget: style, products, embed code.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Widget name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_store_widget",
      description: "Create a new embeddable store widget: product grid, single product, or cart.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Widget name" },
          type: { type: "string", description: "Widget type: product-grid, single-product, cart, checkout" },
          products: { type: "string", description: "Comma-separated product names to include" },
        },
        required: ["name", "type"],
      },
    },
    {
      name: "ghl_browser_get_store_widget_code",
      description: "Get the embed HTML/JS code for a store widget.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Widget name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_store_widget",
      description: "Delete a store widget by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Widget name to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_store_widgets: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-widgets-list", async () => {
          await gotoGhl(page, "/store/widgets");
          await waitForAppReady(page);
          const widgets = await page.evaluate(() => {
            const items: Array<{
              name: string;
              type: string;
              views: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="widget"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    type:
                      el.querySelector('[class*="type"], [class*="widget-type"]')?.textContent?.trim() ?? "",
                    views:
                      el.querySelector('[class*="view"], [class*="count"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: widgets.length, widgets };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_store_widget_config: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-widget-config", async () => {
          await gotoGhl(page, "/store/widgets");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="widget"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], span, input")?.textContent?.trim() ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              type: getVal("type") || getVal("widget type"),
              products: getVal("products"),
              style: getVal("style") || getVal("theme"),
              embedCode: getVal("embed") || getVal("code"),
              views: getVal("views"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_store_widget: async (args) => {
      const name = String(args.name);
      const type = String(args.type);
      const products = (args.products as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-widget-create", async () => {
          await gotoGhl(page, "/store/widgets");
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
          const typeSelect = page
            .locator(`[class*="type"]:has-text("${type}"), option:has-text("${type}"), button:has-text("${type}")`)
            .first();
          await typeSelect.click({ timeout: 3000 }).catch(() => {});
          if (products) {
            for (const prod of products.split(",")) {
              const prodSelect = page
                .locator(`[class*="product"]:has-text("${prod.trim()}"), label:has-text("${prod.trim()}")`)
                .first();
              await prodSelect.click({ timeout: 2000 }).catch(() => {});
            }
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, type, products, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_store_widget_code: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-widget-code", async () => {
          await gotoGhl(page, "/store/widgets");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="widget"]:has-text("${name}")`)
            .first();
          const codeBtn = row
            .locator('button:has-text("Code"), button:has-text("Embed"), [class*="code"]')
            .first();
          await codeBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const code = await page.evaluate(() => {
            const codeEl = document.querySelector('pre, code, textarea[readonly], [class*="code"], [class*="snippet"]');
            return { embedCode: codeEl?.textContent?.trim() ?? "" };
          });
          return { name, ...code };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_store_widget: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this store widget" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "store-widget-delete", async () => {
          await gotoGhl(page, "/store/widgets");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="widget"]:has-text("${name}")`)
            .first();
          const deleteBtn = row
            .locator('button:has-text("Delete"), button:has-text("delete"), [class*="delete"]')
            .first();
          await deleteBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
