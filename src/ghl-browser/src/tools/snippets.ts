import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const snippetsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_snippets",
      description:
        "List content snippets (reusable text blocks) with name, content preview, and last modified date.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term to filter snippets by name" },
        },
      },
    },
    {
      name: "ghl_browser_get_snippet",
      description: "Get the full content of a specific snippet by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Snippet name to retrieve" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_snippet",
      description: "Create a new content snippet with name and body text.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Snippet name" },
          content: { type: "string", description: "Snippet body text or HTML" },
        },
        required: ["name", "content"],
      },
    },
    {
      name: "ghl_browser_update_snippet",
      description: "Update the content of an existing snippet.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Snippet name to update" },
          content: { type: "string", description: "New body text or HTML" },
        },
        required: ["name", "content"],
      },
    },
    {
      name: "ghl_browser_delete_snippet",
      description: "Delete a content snippet by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Snippet name to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_snippets: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snippets-list", async () => {
          await gotoGhl(page, "/snippets");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page.locator('input[type="search"], input[placeholder*="search"], input[placeholder*="Search"]').first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const snippets = await page.evaluate(() => {
            const rows: Array<{ name: string; preview: string; modified: string }> = [];
            document
              .querySelectorAll('tr, [class*="snippet"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], a, td:first-child');
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    name: nameEl.textContent?.trim() ?? "",
                    preview:
                      el.querySelector('[class*="content"], [class*="preview"], [class*="body"]')?.textContent?.trim()?.slice(0, 120) ?? "",
                    modified:
                      el.querySelector('[class*="date"], [class*="modified"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { search, count: snippets.length, snippets };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_snippet: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snippet-get", async () => {
          await gotoGhl(page, "/snippets");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="snippet"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const nameEl = document.querySelector('[class*="name"] input, [class*="title"] input, input[name="name"]');
            const bodyEl = document.querySelector(
              '[class*="editor"], [class*="content"], textarea, [contenteditable]',
            );
            return {
              name: (nameEl as HTMLInputElement)?.value ?? nameEl?.textContent?.trim() ?? "",
              content: (bodyEl as HTMLTextAreaElement)?.value ?? bodyEl?.textContent?.trim() ?? "",
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_snippet: async (args) => {
      const name = String(args.name);
      const content = String(args.content);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snippet-create", async () => {
          await gotoGhl(page, "/snippets");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page.locator('input[name="name"], input[placeholder*="name"], input[type="text"]').first();
          await nameInput.fill(name);
          const bodyInput = page.locator('textarea, [contenteditable], [class*="editor"]').first();
          await bodyInput.fill(content).catch(async () => {
            await bodyInput.click();
            await page.keyboard.type(content);
          });
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_snippet: async (args) => {
      const name = String(args.name);
      const content = String(args.content);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snippet-update", async () => {
          await gotoGhl(page, "/snippets");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="snippet"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const bodyInput = page.locator('textarea, [contenteditable], [class*="editor"]').first();
          await bodyInput.fill(content).catch(async () => {
            await bodyInput.click();
            await page.keyboard.press("Control+A");
            await page.keyboard.type(content);
          });
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, updated: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_snippet: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this snippet" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snippet-delete", async () => {
          await gotoGhl(page, "/snippets");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="snippet"]:has-text("${name}")`)
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
