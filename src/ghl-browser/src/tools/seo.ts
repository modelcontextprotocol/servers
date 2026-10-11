import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const seoModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_seo_overview",
      description:
        "Get the SEO dashboard overview: site health score, keyword rankings, traffic estimates, and issues.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_list_seo_pages",
      description: "List pages tracked for SEO with their optimization score, title, and URL.",
      inputSchema: {
        type: "object",
        properties: {
          sortBy: {
            type: "string",
            description: "Sort by: score, title, url",
          },
        },
      },
    },
    {
      name: "ghl_browser_get_seo_page_analysis",
      description: "Get detailed SEO analysis for a specific page: issues, suggestions, keyword usage.",
      inputSchema: {
        type: "object",
        properties: {
          pageUrl: { type: "string", description: "Page URL or path to analyze" },
        },
        required: ["pageUrl"],
      },
    },
    {
      name: "ghl_browser_list_seo_keywords",
      description: "List tracked keywords with current ranking, change, and search volume.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_add_seo_keyword",
      description: "Add a keyword to track in the SEO dashboard.",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Keyword phrase to track" },
        },
        required: ["keyword"],
      },
    },
  ],
  handlers: {
    ghl_browser_get_seo_overview: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "seo-overview", async () => {
          await gotoGhl(page, "/seo");
          await waitForAppReady(page);
          const overview = await page.evaluate(() => {
            const metrics: Array<{ label: string; value: string }> = [];
            document
              .querySelectorAll(
                '[class*="metric"], [class*="card"], [class*="score"], [class*="widget"], [class*="stat"]',
              )
              .forEach((el) => {
                const labelEl = el.querySelector(
                  '[class*="label"], [class*="title"], h3, h4, [class*="heading"]',
                );
                const valueEl = el.querySelector(
                  '[class*="value"], [class*="number"], [class*="score"], [class*="count"]',
                );
                const label = labelEl?.textContent?.trim() ?? "";
                const value = valueEl?.textContent?.trim() ?? "";
                if (label.length > 1 || value.length > 0) {
                  metrics.push({ label, value });
                }
              });
            return metrics;
          });
          return { metricCount: overview.length, metrics: overview };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_seo_pages: async (args) => {
      const sortBy = (args.sortBy as string) || "score";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "seo-pages", async () => {
          await gotoGhl(page, "/seo/pages");
          await waitForAppReady(page);
          const pages = await page.evaluate(() => {
            const rows: Array<{ title: string; url: string; score: string; issues: string }> = [];
            document.querySelectorAll('tr, [class*="page"], [class*="row"], [role="row"]').forEach((el) => {
              const titleEl = el.querySelector('[class*="title"], [class*="name"], a');
              if (titleEl && (titleEl.textContent?.trim().length ?? 0) > 2) {
                rows.push({
                  title: titleEl.textContent?.trim() ?? "",
                  url: el.querySelector('[class*="url"], [class*="path"], a[href]')?.getAttribute("href") ?? "",
                  score:
                    el.querySelector('[class*="score"], [class*="grade"], [class*="rating"]')?.textContent?.trim() ?? "",
                  issues:
                    el.querySelector('[class*="issue"], [class*="error"], [class*="warning"]')?.textContent?.trim() ?? "",
                });
              }
            });
            return rows;
          });
          return { sortBy, count: pages.length, pages };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_seo_page_analysis: async (args) => {
      const pageUrl = String(args.pageUrl);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "seo-page-analysis", async () => {
          await gotoGhl(page, "/seo/pages");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${pageUrl}"), [class*="page"]:has-text("${pageUrl}"), a:has-text("${pageUrl}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const analysis = await page.evaluate(() => {
            const issues: Array<{ type: string; message: string; severity: string }> = [];
            document
              .querySelectorAll('[class*="issue"], [class*="error"], [class*="warning"], [class*="suggestion"]')
              .forEach((el) => {
                const msgEl = el.querySelector('[class*="message"], [class*="text"], [class*="desc"]');
                const severity =
                  el.classList.contains("error") || el.classList.contains("critical")
                    ? "error"
                    : el.classList.contains("warning")
                      ? "warning"
                      : "info";
                const message = msgEl?.textContent?.trim() ?? el.textContent?.trim()?.slice(0, 200) ?? "";
                if (message.length > 3) {
                  issues.push({ type: "issue", message, severity });
                }
              });
            const scoreEl = document.querySelector('[class*="score"], [class*="grade"], [class*="rating"]');
            return {
              score: scoreEl?.textContent?.trim() ?? "",
              issueCount: issues.length,
              issues,
            };
          });
          return { pageUrl, ...analysis };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_seo_keywords: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "seo-keywords", async () => {
          await gotoGhl(page, "/seo/keywords");
          await waitForAppReady(page);
          const keywords = await page.evaluate(() => {
            const rows: Array<{ keyword: string; position: string; change: string; volume: string }> = [];
            document.querySelectorAll('tr, [class*="keyword"], [class*="row"], [role="row"]').forEach((el) => {
              const kwEl = el.querySelector('[class*="keyword"], [class*="term"], [class*="name"]');
              if (kwEl && (kwEl.textContent?.trim().length ?? 0) > 1) {
                rows.push({
                  keyword: kwEl.textContent?.trim() ?? "",
                  position:
                    el.querySelector('[class*="position"], [class*="rank"], [class*="place"]')?.textContent?.trim() ?? "",
                  change:
                    el.querySelector('[class*="change"], [class*="trend"], [class*="delta"]')?.textContent?.trim() ?? "",
                  volume:
                    el.querySelector('[class*="volume"], [class*="search"]')?.textContent?.trim() ?? "",
                });
              }
            });
            return rows;
          });
          return { count: keywords.length, keywords };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_add_seo_keyword: async (args) => {
      const keyword = String(args.keyword);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "seo-add-keyword", async () => {
          await gotoGhl(page, "/seo/keywords");
          await waitForAppReady(page);
          const addBtn = page
            .locator('button:has-text("Add"), button:has-text("Track"), button:has-text("New")')
            .first();
          await addBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const input = page.locator('input[type="text"], input[placeholder*="keyword"]').first();
          await input.fill(keyword);
          const submitBtn = page
            .locator('button:has-text("Add"), button:has-text("Save"), button[type="submit"]')
            .first();
          await submitBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { keyword, added: true };
        });
      } finally {
        await close();
      }
    },
  },
};
