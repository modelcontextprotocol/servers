import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const knowledgeBaseModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_knowledge_bases",
      description: "List AI knowledge bases with name, article count, and status.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by knowledge base name" },
        },
      },
    },
    {
      name: "ghl_browser_get_knowledge_base_details",
      description: "Get details of a knowledge base: articles, sources, AI agents using it.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Knowledge base name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_knowledge_base",
      description: "Create a new AI knowledge base with name and optional source URL.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Knowledge base name" },
          sourceUrl: { type: "string", description: "URL to crawl and index" },
          description: { type: "string", description: "Description of the knowledge base" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_add_knowledge_source",
      description: "Add a source (URL, text, file) to an existing knowledge base.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Knowledge base name" },
          sourceUrl: { type: "string", description: "URL to add as source" },
          text: { type: "string", description: "Plain text to add" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_knowledge_base",
      description: "Delete a knowledge base by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Knowledge base name to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_knowledge_bases: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "kb-list", async () => {
          await gotoGhl(page, "/knowledge-base");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const bases = await page.evaluate(() => {
            const items: Array<{
              name: string;
              articles: string;
              sources: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="knowledge"], [class*="kb"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    articles:
                      el.querySelector('[class*="article"], [class*="count"]')?.textContent?.trim() ?? "",
                    sources:
                      el.querySelector('[class*="source"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, count: bases.length, knowledgeBases: bases };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_knowledge_base_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "kb-details", async () => {
          await gotoGhl(page, "/knowledge-base");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="knowledge"]:has-text("${name}"), a:has-text("${name}")`)
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
            const sources = Array.from(
              document.querySelectorAll('[class*="source"], [class*="url"], [class*="document"]'),
            ).map((el) => el.textContent?.trim() ?? "").filter(Boolean);
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              description: getVal("description") || getVal("about"),
              articleCount: getVal("articles") || getVal("pages"),
              status: getVal("status"),
              aiAgents: getVal("agents") || getVal("used by"),
              sources,
              lastIndexed: getVal("indexed") || getVal("updated"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_knowledge_base: async (args) => {
      const name = String(args.name);
      const sourceUrl = (args.sourceUrl as string) || "";
      const description = (args.description as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "kb-create", async () => {
          await gotoGhl(page, "/knowledge-base");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page
            .locator('input[name="name"], input[placeholder*="name"]')
            .first();
          await nameInput.fill(name).catch(() => {});
          if (description) {
            const descInput = page
              .locator('textarea, input[placeholder*="description"]')
              .first();
            await descInput.fill(description).catch(() => {});
          }
          if (sourceUrl) {
            const urlInput = page
              .locator('input[placeholder*="url"], input[name="url"]')
              .first();
            await urlInput.fill(sourceUrl).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, sourceUrl, description, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_add_knowledge_source: async (args) => {
      const name = String(args.name);
      const sourceUrl = (args.sourceUrl as string) || "";
      const text = (args.text as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "kb-add-source", async () => {
          await gotoGhl(page, "/knowledge-base");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="knowledge"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const addBtn = page
            .locator('button:has-text("Add Source"), button:has-text("Add"), button:has-text("Import")')
            .first();
          await addBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          if (sourceUrl) {
            const urlInput = page
              .locator('input[placeholder*="url"], input[name="url"]')
              .first();
            await urlInput.fill(sourceUrl).catch(() => {});
          }
          if (text) {
            const textArea = page.locator("textarea").first();
            await textArea.fill(text).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Add"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, sourceUrl, text, added: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_knowledge_base: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this knowledge base" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "kb-delete", async () => {
          await gotoGhl(page, "/knowledge-base");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="knowledge"]:has-text("${name}")`)
            .first();
          const deleteBtn = row
            .locator('button:has-text("Delete"), [class*="delete"]')
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
