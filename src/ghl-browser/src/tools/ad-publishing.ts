import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const adPublishingModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_ad_campaigns",
      description: "List ad campaigns (Facebook/Google) with name, platform, status, budget, and spend.",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", description: "Filter by platform: facebook, google" },
        },
      },
    },
    {
      name: "ghl_browser_get_ad_campaign_details",
      description: "Get detailed metrics and settings for a specific ad campaign.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_ad_campaign",
      description: "Create a new ad campaign on Facebook or Google.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          platform: { type: "string", description: "Platform: facebook or google" },
          objective: { type: "string", description: "Campaign objective (e.g. leads, traffic, conversions)" },
          dailyBudget: { type: "number", description: "Daily budget amount" },
        },
        required: ["name", "platform"],
      },
    },
    {
      name: "ghl_browser_get_ad_metrics",
      description: "Get aggregate ad performance metrics: impressions, clicks, CTR, spend, conversions.",
      inputSchema: {
        type: "object",
        properties: {
          dateRange: { type: "string", description: "Date range: today, 7days, 30days, custom" },
        },
      },
    },
    {
      name: "ghl_browser_toggle_ad_campaign",
      description: "Enable or pause an ad campaign.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          action: { type: "string", description: "Action: enable or pause" },
        },
        required: ["name", "action"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_ad_campaigns: async (args) => {
      const platform = (args.platform as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ads-list", async () => {
          await gotoGhl(page, "/ad-publishing");
          await waitForAppReady(page);
          const campaigns = await page.evaluate((plat) => {
            const items: Array<{
              name: string;
              platform: string;
              status: string;
              budget: string;
              spend: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="campaign"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  const rowPlatform =
                    el.querySelector('[class*="platform"], [class*="icon"]')?.getAttribute("title") ??
                    el.querySelector('[class*="platform"]')?.textContent?.trim() ??
                    "";
                  if (plat && !rowPlatform.toLowerCase().includes(plat.toLowerCase())) return;
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    platform: rowPlatform,
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    budget:
                      el.querySelector('[class*="budget"]')?.textContent?.trim() ?? "",
                    spend:
                      el.querySelector('[class*="spend"], [class*="cost"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, platform);
          return { platform, count: campaigns.length, campaigns };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_ad_campaign_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ads-details", async () => {
          await gotoGhl(page, "/ad-publishing");
          await waitForAppReady(page);
          const row = page
            .locator(
              `tr:has-text("${name}"), [class*="campaign"]:has-text("${name}"), a:has-text("${name}")`,
            )
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(document.querySelectorAll('label, [class*="label"], dt, th')).find(
                (el) => el.textContent?.toLowerCase().includes(label.toLowerCase()),
              );
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], span")?.textContent?.trim() ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              platform: getVal("platform"),
              status: getVal("status"),
              objective: getVal("objective"),
              budget: getVal("budget"),
              spend: getVal("spend"),
              impressions: getVal("impressions"),
              clicks: getVal("clicks"),
              ctr: getVal("ctr"),
              conversions: getVal("conversions"),
              startDate: getVal("start"),
              endDate: getVal("end"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_ad_campaign: async (args) => {
      const name = String(args.name);
      const platform = String(args.platform);
      const objective = (args.objective as string) || "";
      const dailyBudget = args.dailyBudget as number | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ads-create", async () => {
          await gotoGhl(page, "/ad-publishing");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page
            .locator('input[name="name"], input[placeholder*="name"], input[type="text"]')
            .first();
          await nameInput.fill(name);
          if (platform) {
            const platSelect = page
              .locator(`[class*="platform"]:has-text("${platform}"), button:has-text("${platform}"), label:has-text("${platform}")`)
              .first();
            await platSelect.click({ timeout: 3000 }).catch(() => {});
          }
          if (objective) {
            const objSelect = page
              .locator(`[class*="objective"]:has-text("${objective}"), label:has-text("${objective}")`)
              .first();
            await objSelect.click({ timeout: 3000 }).catch(() => {});
          }
          if (dailyBudget) {
            const budgetInput = page
              .locator('input[placeholder*="budget"], input[name*="budget"]')
              .first();
            await budgetInput.fill(String(dailyBudget)).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, platform, objective, dailyBudget, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_ad_metrics: async (args) => {
      const dateRange = (args.dateRange as string) || "7days";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ads-metrics", async () => {
          await gotoGhl(page, "/ad-publishing");
          await waitForAppReady(page);
          if (dateRange !== "7days") {
            const rangeBtn = page
              .locator(`button:has-text("${dateRange}"), [class*="date"] button, [class*="filter"] button`)
              .first();
            await rangeBtn.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const metrics = await page.evaluate(() => {
            const getKpi = (label: string): string => {
              const el = Array.from(
                document.querySelectorAll('[class*="kpi"], [class*="metric"], [class*="stat"], [class*="card"]'),
              ).find((k) => k.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                el?.querySelector('[class*="value"], [class*="number"], strong')?.textContent?.trim() ?? ""
              );
            };
            return {
              impressions: getKpi("impressions"),
              clicks: getKpi("clicks"),
              ctr: getKpi("ctr"),
              spend: getKpi("spend"),
              conversions: getKpi("conversions"),
              costPerClick: getKpi("cost per click"),
              roas: getKpi("roas"),
            };
          });
          return { dateRange, metrics };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_toggle_ad_campaign: async (args) => {
      const name = String(args.name);
      const action = String(args.action);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "ads-toggle", async () => {
          await gotoGhl(page, "/ad-publishing");
          await waitForAppReady(page);
          const row = page
            .locator(
              `tr:has-text("${name}"), [class*="campaign"]:has-text("${name}")`,
            )
            .first();
          const toggle = row
            .locator('input[type="checkbox"], [role="switch"], button[class*="toggle"], [class*="status"]')
            .first();
          await toggle.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, action, toggled: true };
        });
      } finally {
        await close();
      }
    },
  },
};
