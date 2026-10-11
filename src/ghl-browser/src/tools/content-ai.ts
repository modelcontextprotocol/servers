import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const contentAiModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_content_ai_settings",
      description: "Get Content AI configuration: tone, brand voice, default language, usage limits.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_content_ai_templates",
      description: "List available Content AI writing templates by category (emails, ads, social, blogs).",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category: email, ad, social, blog, sms" },
        },
      },
    },
    {
      name: "ghl_browser_generate_content_ai_text",
      description: "Generate AI-written content using a specific template and prompt.",
      inputSchema: {
        type: "object",
        properties: {
          template: { type: "string", description: "Template name (e.g. 'Email Subject Line', 'Blog Intro')" },
          prompt: { type: "string", description: "Content prompt or topic" },
          tone: { type: "string", description: "Tone: professional, casual, friendly, formal" },
        },
        required: ["template", "prompt"],
      },
    },
    {
      name: "ghl_browser_list_content_ai_history",
      description: "List recently generated Content AI outputs with template, prompt, and date.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_content_ai_usage",
      description: "Get Content AI usage stats: credits used, remaining, content generated count.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_content_ai_settings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "content-ai-settings", async () => {
          await gotoGhl(page, "/content-ai");
          await waitForAppReady(page);
          const settingsTab = page
            .locator('a:has-text("Settings"), button:has-text("Settings"), [class*="tab"]:has-text("Setting")')
            .first();
          await settingsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], input, select")?.textContent?.trim() ??
                (lbl?.parentElement?.querySelector("input") as HTMLInputElement)?.value ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              tone: getVal("tone"),
              brandVoice: getVal("brand"),
              language: getVal("language"),
              creditsUsed: getVal("credits used"),
              creditsRemaining: getVal("remaining"),
              enabled: getVal("enabled") || getVal("status"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_content_ai_templates: async (args) => {
      const category = (args.category as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "content-ai-templates", async () => {
          await gotoGhl(page, "/content-ai");
          await waitForAppReady(page);
          if (category) {
            const catBtn = page
              .locator(`button:has-text("${category}"), a:has-text("${category}"), [class*="filter"]:has-text("${category}")`)
              .first();
            await catBtn.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const templates = await page.evaluate(() => {
            const items: Array<{
              name: string;
              category: string;
              description: string;
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
                      el.querySelector('[class*="category"], [class*="tag"], [class*="badge"]')?.textContent?.trim() ?? "",
                    description:
                      el.querySelector('[class*="desc"], [class*="detail"], p')?.textContent?.trim()?.slice(0, 200) ?? "",
                  });
                }
              });
            return items;
          });
          return { category, count: templates.length, templates };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_generate_content_ai_text: async (args) => {
      const template = String(args.template);
      const prompt = String(args.prompt);
      const tone = (args.tone as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "content-ai-generate", async () => {
          await gotoGhl(page, "/content-ai");
          await waitForAppReady(page);
          const tmplBtn = page
            .locator(`[class*="template"]:has-text("${template}"), [class*="card"]:has-text("${template}"), a:has-text("${template}")`)
            .first();
          await tmplBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const promptInput = page
            .locator('textarea, input[placeholder*="topic"], input[placeholder*="prompt"]')
            .first();
          await promptInput.fill(prompt);
          if (tone) {
            const toneSelect = page
              .locator(`button:has-text("${tone}"), [class*="tone"]:has-text("${tone}"), option:has-text("${tone}")`)
              .first();
            await toneSelect.click({ timeout: 3000 }).catch(() => {});
          }
          const generateBtn = page
            .locator('button:has-text("Generate"), button:has-text("Create"), button[type="submit"]')
            .first();
          await generateBtn.click({ timeout: 15000 });
          await page.waitForTimeout(3000);
          await waitForAppReady(page);
          const result = await page.evaluate(() => {
            const outputEl = document.querySelector(
              '[class*="output"], [class*="result"], [class*="generated"], [class*="content"]',
            );
            return {
              generatedText: outputEl?.textContent?.trim() ?? "",
              wordCount: (outputEl?.textContent?.trim().split(/\s+/).length) ?? 0,
            };
          });
          return { template, prompt, tone, ...result };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_content_ai_history: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "content-ai-history", async () => {
          await gotoGhl(page, "/content-ai");
          await waitForAppReady(page);
          const histTab = page
            .locator('a:has-text("History"), button:has-text("History"), [class*="tab"]:has-text("History")')
            .first();
          await histTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const history = await page.evaluate(() => {
            const items: Array<{
              template: string;
              prompt: string;
              preview: string;
              date: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="history"], [class*="item"], [role="row"]')
              .forEach((el) => {
                const tmplEl = el.querySelector(
                  '[class*="template"], [class*="type"], td:first-child',
                );
                if (tmplEl && (tmplEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    template: tmplEl.textContent?.trim() ?? "",
                    prompt:
                      el.querySelector('[class*="prompt"], [class*="topic"]')?.textContent?.trim() ?? "",
                    preview:
                      el.querySelector('[class*="output"], [class*="preview"], [class*="content"]')?.textContent?.trim()?.slice(0, 150) ?? "",
                    date:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: history.length, history };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_content_ai_usage: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "content-ai-usage", async () => {
          await gotoGhl(page, "/content-ai");
          await waitForAppReady(page);
          const usage = await page.evaluate(() => {
            const getKpi = (label: string): string => {
              const el = Array.from(
                document.querySelectorAll('[class*="kpi"], [class*="metric"], [class*="stat"], [class*="card"]'),
              ).find((k) => k.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                el?.querySelector('[class*="value"], [class*="number"], strong')?.textContent?.trim() ?? ""
              );
            };
            return {
              creditsUsed: getKpi("credits used") || getKpi("used"),
              creditsRemaining: getKpi("remaining") || getKpi("available"),
              totalGenerated: getKpi("generated") || getKpi("total"),
              plan: getKpi("plan"),
            };
          });
          return usage;
        });
      } finally {
        await close();
      }
    },
  },
};
