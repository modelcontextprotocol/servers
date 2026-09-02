import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const templateLibraryModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_template_categories",
      description: "List template library categories: funnels, websites, emails, workflows, etc.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_templates",
      description: "List available templates with name, category, industry, and preview.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category: funnel, website, email, workflow, form" },
          industry: { type: "string", description: "Filter by industry" },
          search: { type: "string", description: "Search by template name" },
        },
      },
    },
    {
      name: "ghl_browser_get_template_preview",
      description: "Get template preview details: description, pages, sections, and components.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_import_template",
      description: "Import a template from the library into the current sub-account.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name to import" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_list_my_templates",
      description: "List templates saved/created in the current sub-account.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_list_template_categories: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "template-categories", async () => {
          await gotoGhl(page, "/template-library");
          await waitForAppReady(page);
          const categories = await page.evaluate(() => {
            const items: Array<{
              name: string;
              count: string;
            }> = [];
            document
              .querySelectorAll('[class*="category"], [class*="filter"], a[class*="tab"], button[class*="tab"]')
              .forEach((el) => {
                const text = el.textContent?.trim() ?? "";
                if (text.length > 1 && text.length < 50) {
                  items.push({
                    name: text,
                    count:
                      el.querySelector('[class*="count"], [class*="badge"]')?.textContent?.trim() ?? "",
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

    ghl_browser_list_templates: async (args) => {
      const category = (args.category as string) || "";
      const industry = (args.industry as string) || "";
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "templates-list", async () => {
          await gotoGhl(page, "/template-library");
          await waitForAppReady(page);
          if (category) {
            const catBtn = page
              .locator(`button:has-text("${category}"), a:has-text("${category}"), [class*="tab"]:has-text("${category}")`)
              .first();
            await catBtn.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"], input[placeholder*="Search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const templates = await page.evaluate((ind) => {
            const items: Array<{
              name: string;
              category: string;
              industry: string;
              description: string;
            }> = [];
            document
              .querySelectorAll('[class*="template"], [class*="card"], tr, [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, a',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  const rowIndustry =
                    el.querySelector('[class*="industry"], [class*="tag"]')?.textContent?.trim() ?? "";
                  if (ind && !rowIndustry.toLowerCase().includes(ind.toLowerCase())) return;
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    category:
                      el.querySelector('[class*="category"], [class*="type"]')?.textContent?.trim() ?? "",
                    industry: rowIndustry,
                    description:
                      el.querySelector('[class*="desc"], p')?.textContent?.trim()?.slice(0, 200) ?? "",
                  });
                }
              });
            return items;
          }, industry);
          return { category, industry, search, count: templates.length, templates };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_template_preview: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "template-preview", async () => {
          await gotoGhl(page, "/template-library");
          await waitForAppReady(page);
          const card = page
            .locator(`[class*="template"]:has-text("${name}"), [class*="card"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await card.click({ timeout: 5000 });
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              description:
                document.querySelector('[class*="desc"], [class*="detail"], p')?.textContent?.trim() ?? "",
              pages:
                document.querySelector('[class*="pages"], [class*="page-count"]')?.textContent?.trim() ?? "",
              sections:
                document.querySelector('[class*="section"], [class*="component"]')?.textContent?.trim() ?? "",
              industry:
                document.querySelector('[class*="industry"]')?.textContent?.trim() ?? "",
              category:
                document.querySelector('[class*="category"], [class*="type"]')?.textContent?.trim() ?? "",
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_import_template: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "template-import", async () => {
          await gotoGhl(page, "/template-library");
          await waitForAppReady(page);
          const card = page
            .locator(`[class*="template"]:has-text("${name}"), [class*="card"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          const importBtn = card
            .locator('button:has-text("Import"), button:has-text("Use"), button:has-text("Add")')
            .first();
          await importBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const confirmBtn = page
            .locator('button:has-text("Import"), button:has-text("Confirm"), button[type="submit"]')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, imported: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_my_templates: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "my-templates", async () => {
          await gotoGhl(page, "/template-library");
          await waitForAppReady(page);
          const myTab = page
            .locator('a:has-text("My"), button:has-text("My"), [class*="tab"]:has-text("My"), a:has-text("Saved")')
            .first();
          await myTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const templates = await page.evaluate(() => {
            const items: Array<{
              name: string;
              category: string;
              modified: string;
            }> = [];
            document
              .querySelectorAll('[class*="template"], [class*="card"], tr, [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, a',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    category:
                      el.querySelector('[class*="category"], [class*="type"]')?.textContent?.trim() ?? "",
                    modified:
                      el.querySelector('[class*="date"], [class*="modified"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: templates.length, templates };
        });
      } finally {
        await close();
      }
    },
  },
};
