import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const funnelsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_funnel_pages",
      description: "List funnel pages with their status (draft/published) and funnel name.",
      inputSchema: {
        type: "object",
        properties: {
          funnelName: { type: "string", description: "Optional: filter by funnel name" },
        },
      },
    },
    {
      name: "ghl_browser_edit_funnel_page",
      description:
        "Open a funnel page in the editor and update headline/body/button text. Saves on completion.",
      inputSchema: {
        type: "object",
        properties: {
          pageName: { type: "string" },
          headline: { type: "string" },
          bodyText: { type: "string" },
          buttonText: { type: "string" },
        },
        required: ["pageName"],
      },
    },
    {
      name: "ghl_browser_publish_funnel_page",
      description: "Publish or unpublish a funnel page by name.",
      inputSchema: {
        type: "object",
        properties: {
          pageName: { type: "string" },
          publish: { type: "boolean" },
        },
        required: ["pageName"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_funnel_pages: async (args) => {
      const filter = args.funnelName as string | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "funnels-list", async () => {
          await gotoGhl(page, "/funnels");
          await waitForAppReady(page);
          const rows = await page.evaluate(() => {
            const items: Array<{ funnel: string; page: string; status: string; url: string }> = [];
            document
              .querySelectorAll('[class*="funnel"], [class*="Funnel"], [data-testid*="funnel"]')
              .forEach((el) => {
                const funnelEl = el.querySelector("h3, h4, [class*='name']");
                const pages = el.querySelectorAll('[class*="page"], a[href*="/page"]');
                pages.forEach((p) => {
                  const a = p.closest("a") as HTMLAnchorElement | null;
                  items.push({
                    funnel: funnelEl?.textContent?.trim() || "",
                    page: p.textContent?.slice(0, 80).trim() || "",
                    status: p.querySelector('[class*="status"]')?.textContent?.trim() || "",
                    url: a?.href || "",
                  });
                });
              });
            return items;
          });
          const filtered = filter ? rows.filter((r) => r.funnel.includes(filter)) : rows;
          return { count: filtered.length, rows: filtered };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_edit_funnel_page: async (args) => {
      const pageName = String(args.pageName);
      const headline = args.headline as string | undefined;
      const bodyText = args.bodyText as string | undefined;
      const buttonText = args.buttonText as string | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "funnels-edit", async () => {
          await gotoGhl(page, "/funnels");
          await waitForAppReady(page);
          await page.locator(`text=${pageName}`).first().click();
          await waitForAppReady(page);
          if (headline) {
            const h = page.locator('h1[contenteditable="true"], [class*="headline"][contenteditable]').first();
            await h.click();
            await h.fill(headline);
          }
          if (bodyText) {
            const b = page.locator('[class*="body"][contenteditable], [class*="paragraph"][contenteditable]').first();
            try {
              await b.click({ timeout: 3000 });
              await b.fill(bodyText);
            } catch {
              // not all pages have a body region
            }
          }
          if (buttonText) {
            const btn = page.locator('button[contenteditable="true"], [class*="button"][contenteditable]').first();
            try {
              await btn.click({ timeout: 3000 });
              await btn.fill(buttonText);
            } catch {
              // not all pages have a CTA
            }
          }
          const saveBtn = page.locator('button:has-text("Save")').first();
          await saveBtn.click();
          await waitForAppReady(page);
          return { pageName, headline, bodyText, buttonText, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_publish_funnel_page: async (args) => {
      const pageName = String(args.pageName);
      const publish = args.publish !== false;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "funnels-publish", async () => {
          await gotoGhl(page, "/funnels");
          await waitForAppReady(page);
          const row = page.locator(`tr:has-text("${pageName}"), [class*="row"]:has-text("${pageName}")`).first();
          await row.locator('button:has-text("..."), button[aria-haspopup="menu"]').first().click();
          const action = publish ? "Publish" : "Unpublish";
          await page.locator(`[role="menuitem"]:has-text("${action}")`).first().click();
          await waitForAppReady(page);
          return { pageName, publish, url: page.url() };
        });
      } finally {
        await close();
      }
    },
  },
};
