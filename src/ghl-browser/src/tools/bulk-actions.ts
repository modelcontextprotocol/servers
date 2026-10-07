import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const bulkActionsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_bulk_operations",
      description: "List recent bulk operations with type, status, count, and date.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_bulk_operation_status",
      description: "Get the status and progress of a specific bulk operation.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Operation name or ID" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_bulk_add_tag",
      description: "Add a tag to multiple contacts at once.",
      inputSchema: {
        type: "object",
        properties: {
          tag: { type: "string", description: "Tag name to add" },
          filter: { type: "string", description: "Contact filter (e.g. 'all', smart list name)" },
        },
        required: ["tag"],
      },
    },
    {
      name: "ghl_browser_bulk_remove_tag",
      description: "Remove a tag from multiple contacts at once.",
      inputSchema: {
        type: "object",
        properties: {
          tag: { type: "string", description: "Tag name to remove" },
          filter: { type: "string", description: "Contact filter (e.g. 'all', smart list name)" },
        },
        required: ["tag"],
      },
    },
    {
      name: "ghl_browser_bulk_update_field",
      description: "Update a custom field value for multiple contacts at once.",
      inputSchema: {
        type: "object",
        properties: {
          field: { type: "string", description: "Field name to update" },
          value: { type: "string", description: "New field value" },
          filter: { type: "string", description: "Contact filter" },
        },
        required: ["field", "value"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_bulk_operations: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "bulk-list", async () => {
          await gotoGhl(page, "/contacts/bulk-actions");
          await waitForAppReady(page);
          const operations = await page.evaluate(() => {
            const items: Array<{
              name: string;
              type: string;
              status: string;
              count: string;
              date: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="operation"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    type:
                      el.querySelector('[class*="type"], [class*="action"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    count:
                      el.querySelector('[class*="count"], [class*="records"]')?.textContent?.trim() ?? "",
                    date:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: operations.length, operations };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_bulk_operation_status: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "bulk-status", async () => {
          await gotoGhl(page, "/contacts/bulk-actions");
          await waitForAppReady(page);
          const row = page
            .locator(
              `tr:has-text("${name}"), [class*="operation"]:has-text("${name}"), a:has-text("${name}")`,
            )
            .first();
          await row.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              status:
                document.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
              progress:
                document.querySelector('[class*="progress"], [role="progressbar"]')?.textContent?.trim() ??
                document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") ??
                "",
              totalRecords:
                document.querySelector('[class*="total"]')?.textContent?.trim() ?? "",
              processed:
                document.querySelector('[class*="processed"], [class*="completed"]')?.textContent?.trim() ?? "",
              errors:
                document.querySelector('[class*="error"], [class*="failed"]')?.textContent?.trim() ?? "",
              startedAt:
                document.querySelector('[class*="start"]')?.textContent?.trim() ?? "",
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_bulk_add_tag: async (args) => {
      const tag = String(args.tag);
      const filter = (args.filter as string) || "all";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "bulk-add-tag", async () => {
          await gotoGhl(page, "/contacts");
          await waitForAppReady(page);
          if (filter !== "all") {
            const smartList = page
              .locator(`a:has-text("${filter}"), [class*="list"]:has-text("${filter}")`)
              .first();
            await smartList.click({ timeout: 5000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const selectAll = page
            .locator('input[type="checkbox"][class*="select-all"], th input[type="checkbox"]')
            .first();
          await selectAll.click({ timeout: 5000 }).catch(() => {});
          const bulkBtn = page
            .locator('button:has-text("Bulk"), button:has-text("Actions"), [class*="bulk"]')
            .first();
          await bulkBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const addTagOption = page
            .locator('button:has-text("Add Tag"), [class*="option"]:has-text("Add Tag")')
            .first();
          await addTagOption.click({ timeout: 5000 });
          await waitForAppReady(page);
          const tagInput = page
            .locator('input[placeholder*="tag"], input[name="tag"]')
            .first();
          await tagInput.fill(tag);
          const confirmBtn = page
            .locator('button:has-text("Add"), button:has-text("Confirm"), button[type="submit"]')
            .first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { tag, filter, submitted: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_bulk_remove_tag: async (args) => {
      const tag = String(args.tag);
      const filter = (args.filter as string) || "all";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "bulk-remove-tag", async () => {
          await gotoGhl(page, "/contacts");
          await waitForAppReady(page);
          if (filter !== "all") {
            const smartList = page
              .locator(`a:has-text("${filter}"), [class*="list"]:has-text("${filter}")`)
              .first();
            await smartList.click({ timeout: 5000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const selectAll = page
            .locator('input[type="checkbox"][class*="select-all"], th input[type="checkbox"]')
            .first();
          await selectAll.click({ timeout: 5000 }).catch(() => {});
          const bulkBtn = page
            .locator('button:has-text("Bulk"), button:has-text("Actions"), [class*="bulk"]')
            .first();
          await bulkBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const removeTagOption = page
            .locator('button:has-text("Remove Tag"), [class*="option"]:has-text("Remove Tag")')
            .first();
          await removeTagOption.click({ timeout: 5000 });
          await waitForAppReady(page);
          const tagInput = page
            .locator('input[placeholder*="tag"], input[name="tag"]')
            .first();
          await tagInput.fill(tag);
          const confirmBtn = page
            .locator('button:has-text("Remove"), button:has-text("Confirm"), button[type="submit"]')
            .first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { tag, filter, submitted: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_bulk_update_field: async (args) => {
      const field = String(args.field);
      const value = String(args.value);
      const filter = (args.filter as string) || "all";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "bulk-update-field", async () => {
          await gotoGhl(page, "/contacts");
          await waitForAppReady(page);
          if (filter !== "all") {
            const smartList = page
              .locator(`a:has-text("${filter}"), [class*="list"]:has-text("${filter}")`)
              .first();
            await smartList.click({ timeout: 5000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const selectAll = page
            .locator('input[type="checkbox"][class*="select-all"], th input[type="checkbox"]')
            .first();
          await selectAll.click({ timeout: 5000 }).catch(() => {});
          const bulkBtn = page
            .locator('button:has-text("Bulk"), button:has-text("Actions"), [class*="bulk"]')
            .first();
          await bulkBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const updateOption = page
            .locator('button:has-text("Update"), [class*="option"]:has-text("Update Field")')
            .first();
          await updateOption.click({ timeout: 5000 });
          await waitForAppReady(page);
          const fieldSelect = page
            .locator(`[class*="field"]:has-text("${field}"), option:has-text("${field}")`)
            .first();
          await fieldSelect.click({ timeout: 3000 }).catch(() => {});
          const valueInput = page
            .locator('input[type="text"], textarea')
            .last();
          await valueInput.fill(value);
          const confirmBtn = page
            .locator('button:has-text("Update"), button:has-text("Confirm"), button[type="submit"]')
            .first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { field, value, filter, submitted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
