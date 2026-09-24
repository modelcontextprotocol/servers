import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const schemaMarkupModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_schema_markups",
      description: "List schema markup configurations with page, type, and status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_schema_markup_details",
      description: "Get details of a specific schema markup: JSON-LD content, page, type.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "string", description: "Page name or URL with schema markup" },
        },
        required: ["page"],
      },
    },
    {
      name: "ghl_browser_create_schema_markup",
      description: "Create a new schema markup for a page (local business, product, FAQ, etc).",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "string", description: "Page URL or name to add schema to" },
          type: { type: "string", description: "Schema type: LocalBusiness, Product, FAQ, Article, Event" },
          name: { type: "string", description: "Business or item name" },
        },
        required: ["page", "type"],
      },
    },
    {
      name: "ghl_browser_validate_schema_markup",
      description: "Validate a page's schema markup and return errors/warnings.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "string", description: "Page name or URL to validate" },
        },
        required: ["page"],
      },
    },
    {
      name: "ghl_browser_delete_schema_markup",
      description: "Remove schema markup from a page.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "string", description: "Page name or URL" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["page", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_schema_markups: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "schema-list", async () => {
          await gotoGhl(page, "/seo");
          await waitForAppReady(page);
          const schemaTab = page
            .locator('a:has-text("Schema"), button:has-text("Schema"), [class*="tab"]:has-text("Schema")')
            .first();
          await schemaTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const markups = await page.evaluate(() => {
            const items: Array<{
              page: string;
              type: string;
              status: string;
              modified: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="schema"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const pageEl = el.querySelector(
                  '[class*="page"], [class*="url"], a, td:first-child',
                );
                if (pageEl && (pageEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    page: pageEl.textContent?.trim() ?? "",
                    type:
                      el.querySelector('[class*="type"], [class*="schema"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    modified:
                      el.querySelector('[class*="date"], [class*="modified"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: markups.length, markups };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_schema_markup_details: async (args) => {
      const pg = String(args.page);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "schema-details", async () => {
          await gotoGhl(page, "/seo");
          await waitForAppReady(page);
          const schemaTab = page
            .locator('a:has-text("Schema"), button:has-text("Schema"), [class*="tab"]:has-text("Schema")')
            .first();
          await schemaTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${pg}"), [class*="schema"]:has-text("${pg}"), a:has-text("${pg}")`)
            .first();
          await row.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const codeEl = document.querySelector('pre, code, textarea[readonly], [class*="json"], [class*="code"]');
            return {
              page:
                document.querySelector('[class*="page"], [class*="url"]')?.textContent?.trim() ?? "",
              type:
                document.querySelector('[class*="type"], [class*="schema-type"]')?.textContent?.trim() ?? "",
              jsonLd: codeEl?.textContent?.trim() ?? "",
              status:
                document.querySelector('[class*="status"]')?.textContent?.trim() ?? "",
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_schema_markup: async (args) => {
      const pg = String(args.page);
      const type = String(args.type);
      const name = (args.name as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "schema-create", async () => {
          await gotoGhl(page, "/seo");
          await waitForAppReady(page);
          const schemaTab = page
            .locator('a:has-text("Schema"), button:has-text("Schema"), [class*="tab"]:has-text("Schema")')
            .first();
          await schemaTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const pageInput = page
            .locator('input[placeholder*="page"], input[placeholder*="url"]')
            .first();
          await pageInput.fill(pg).catch(() => {});
          const typeSelect = page
            .locator(`[class*="type"]:has-text("${type}"), option:has-text("${type}"), button:has-text("${type}")`)
            .first();
          await typeSelect.click({ timeout: 3000 }).catch(() => {});
          if (name) {
            const nameInput = page
              .locator('input[name="name"], input[placeholder*="name"]')
              .first();
            await nameInput.fill(name).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { page: pg, type, name, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_validate_schema_markup: async (args) => {
      const pg = String(args.page);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "schema-validate", async () => {
          await gotoGhl(page, "/seo");
          await waitForAppReady(page);
          const schemaTab = page
            .locator('a:has-text("Schema"), button:has-text("Schema"), [class*="tab"]:has-text("Schema")')
            .first();
          await schemaTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${pg}"), [class*="schema"]:has-text("${pg}")`)
            .first();
          const validateBtn = row
            .locator('button:has-text("Validate"), button:has-text("Test"), [class*="validate"]')
            .first();
          await validateBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const errors: string[] = [];
            const warnings: string[] = [];
            document.querySelectorAll('[class*="error"], [class*="issue"]').forEach((el) => {
              const text = el.textContent?.trim() ?? "";
              if (text) errors.push(text);
            });
            document.querySelectorAll('[class*="warning"], [class*="warn"]').forEach((el) => {
              const text = el.textContent?.trim() ?? "";
              if (text) warnings.push(text);
            });
            return {
              valid: errors.length === 0,
              errors,
              warnings,
              status:
                document.querySelector('[class*="status"], [class*="result"]')?.textContent?.trim() ?? "",
            };
          });
          return { page: pg, validation: data };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_schema_markup: async (args) => {
      const pg = String(args.page);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this schema markup" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "schema-delete", async () => {
          await gotoGhl(page, "/seo");
          await waitForAppReady(page);
          const schemaTab = page
            .locator('a:has-text("Schema"), button:has-text("Schema"), [class*="tab"]:has-text("Schema")')
            .first();
          await schemaTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${pg}"), [class*="schema"]:has-text("${pg}")`)
            .first();
          const deleteBtn = row
            .locator('button:has-text("Delete"), button:has-text("Remove"), [class*="delete"]')
            .first();
          await deleteBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { page: pg, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
