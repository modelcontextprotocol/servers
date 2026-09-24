import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const customObjectsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_custom_objects",
      description: "List custom object definitions with name, record count, and field count.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_custom_object_schema",
      description: "Get the full schema of a custom object: fields, types, relationships, and validations.",
      inputSchema: {
        type: "object",
        properties: { objectName: { type: "string" } },
        required: ["objectName"],
      },
    },
    {
      name: "ghl_browser_list_custom_object_records",
      description: "List records of a specific custom object.",
      inputSchema: {
        type: "object",
        properties: {
          objectName: { type: "string" },
          search: { type: "string" },
        },
        required: ["objectName"],
      },
    },
    {
      name: "ghl_browser_create_custom_object",
      description: "Create a new custom object definition with name and initial fields.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          fields: { type: "string", description: "JSON array of field definitions [{name, type}]" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_custom_object",
      description: "Delete a custom object definition and all its records.",
      inputSchema: {
        type: "object",
        properties: { objectName: { type: "string" }, confirm: { type: "boolean" } },
        required: ["objectName", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_custom_objects: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "customobjects-list", async () => {
          await gotoGhl(page, "/settings/custom-objects");
          await waitForAppReady(page);
          const rows = await page.evaluate(() => {
            const items: Array<{ name: string; records: string; fields: string; status: string }> = [];
            document.querySelectorAll('tr, [class*="object"], [class*="row"], [role="row"], [class*="card"]').forEach((el) => {
              const nameEl = el.querySelector('a, h4, [class*="name"], td:first-child');
              if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                items.push({
                  name: nameEl.textContent?.trim() ?? "",
                  records: el.querySelector('[class*="record"], [class*="count"]')?.textContent?.trim() || "",
                  fields: el.querySelector('[class*="field"]')?.textContent?.trim() || "",
                  status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
                });
              }
            });
            return items;
          });
          return { count: rows.length, rows };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_custom_object_schema: async (args) => {
      const objectName = String(args.objectName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "customobjects-schema", async () => {
          await gotoGhl(page, "/settings/custom-objects");
          await waitForAppReady(page);
          await page.locator(`a:has-text("${objectName}"), [class*="name"]:has-text("${objectName}")`).first().click();
          await waitForAppReady(page);
          const schema = await page.evaluate(() => {
            const fields: Array<{ name: string; type: string; required: boolean }> = [];
            document.querySelectorAll('tr, [class*="field"], [class*="row"], [role="row"]').forEach((el) => {
              const nameEl = el.querySelector('[class*="name"], td:first-child');
              if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                fields.push({
                  name: nameEl.textContent?.trim() ?? "",
                  type: el.querySelector('[class*="type"], td:nth-child(2)')?.textContent?.trim() || "",
                  required: el.querySelector('[class*="required"], [class*="mandatory"]') !== null,
                });
              }
            });
            return { fields };
          });
          return { objectName, ...schema, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_custom_object_records: async (args) => {
      const objectName = String(args.objectName);
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "customobjects-records", async () => {
          await gotoGhl(page, "/settings/custom-objects");
          await waitForAppReady(page);
          await page.locator(`a:has-text("${objectName}"), [class*="name"]:has-text("${objectName}")`).first().click();
          await waitForAppReady(page);
          if (search) {
            try {
              await page.locator('input[placeholder*="Search"], input[type="search"]').first().fill(search);
              await waitForAppReady(page);
            } catch { /* search may not exist */ }
          }
          const rows = await page.evaluate(() => {
            const items: Array<Record<string, string>> = [];
            document.querySelectorAll('tbody tr, [class*="record"], [role="row"]').forEach((el) => {
              const cells = Array.from(el.querySelectorAll('td, [class*="cell"]'));
              if (cells.length > 0) {
                const record: Record<string, string> = {};
                cells.forEach((c, i) => { record[`col${i}`] = c.textContent?.trim() || ""; });
                if (record.col0 && record.col0.length > 1) items.push(record);
              }
            });
            return items;
          });
          return { objectName, count: rows.length, search: search || null, rows };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_custom_object: async (args) => {
      const name = String(args.name);
      const description = (args.description as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "customobjects-create", async () => {
          await gotoGhl(page, "/settings/custom-objects");
          await waitForAppReady(page);
          await page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")').first().click();
          await waitForAppReady(page);
          await page.locator('input[name="name"], input[placeholder*="Name"]').first().fill(name);
          if (description) {
            try { await page.locator('textarea, input[name="description"]').first().fill(description); } catch { /* optional */ }
          }
          await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
          await waitForAppReady(page);
          return { name, description: description || null, created: true, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_custom_object: async (args) => {
      const objectName = String(args.objectName);
      if (!args.confirm) throw new Error("confirm: true is required to delete a custom object");
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "customobjects-delete", async () => {
          await gotoGhl(page, "/settings/custom-objects");
          await waitForAppReady(page);
          const row = page.locator(`[class*="row"]:has-text("${objectName}"), tr:has-text("${objectName}")`).first();
          await row.locator('button:has-text("Delete"), [aria-label*="delete"]').first().click();
          await page.locator('button:has-text("Confirm"), button:has-text("Delete")').first().click();
          await waitForAppReady(page);
          return { objectName, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
