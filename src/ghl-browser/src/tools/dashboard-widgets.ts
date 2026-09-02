import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const dashboardWidgetsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_dashboard_overview",
      description:
        "Read the main dashboard overview widgets: leads, opportunities, revenue, appointments, and other KPIs.",
      inputSchema: {
        type: "object",
        properties: {
          dateRange: {
            type: "string",
            description: "Date range: today, yesterday, last_7_days, last_30_days, this_month, last_month, custom",
          },
        },
      },
    },
    {
      name: "ghl_browser_get_dashboard_widget",
      description: "Read data from a specific dashboard widget by name.",
      inputSchema: {
        type: "object",
        properties: {
          widgetName: {
            type: "string",
            description: "Widget name or keyword to match (e.g. 'Revenue', 'Appointments', 'Pipeline')",
          },
        },
        required: ["widgetName"],
      },
    },
    {
      name: "ghl_browser_list_dashboard_widgets",
      description: "List all visible dashboard widgets with their titles and summary values.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_pipeline_summary",
      description: "Read pipeline summary cards from the dashboard: stage counts, total value, conversion rate.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_appointment_summary",
      description: "Read appointment metrics from the dashboard: today's count, upcoming, no-shows, completed.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  handlers: {
    ghl_browser_get_dashboard_overview: async (args) => {
      const dateRange = (args.dateRange as string) || "last_7_days";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "dashboard-overview", async () => {
          await gotoGhl(page, "/dashboard");
          await waitForAppReady(page);
          if (dateRange !== "last_7_days") {
            const label = dateRange.replace(/_/g, " ");
            const picker = page
              .locator(`button:has-text("${label}"), [role="option"]:has-text("${label}"), a:has-text("${label}")`)
              .first();
            await picker.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const widgets = await page.evaluate(() => {
            const items: Array<{ title: string; value: string; change: string }> = [];
            document
              .querySelectorAll(
                '[class*="widget"], [class*="card"], [class*="metric"], [class*="stat"], [data-testid*="widget"], [data-testid*="card"]',
              )
              .forEach((el) => {
                const titleEl = el.querySelector(
                  '[class*="title"], [class*="label"], h3, h4, [class*="heading"]',
                );
                const valueEl = el.querySelector(
                  '[class*="value"], [class*="count"], [class*="number"], [class*="amount"]',
                );
                const changeEl = el.querySelector(
                  '[class*="change"], [class*="trend"], [class*="delta"], [class*="percent"]',
                );
                const title = titleEl?.textContent?.trim() ?? "";
                const value = valueEl?.textContent?.trim() ?? "";
                if (title.length > 1 || value.length > 0) {
                  items.push({
                    title,
                    value,
                    change: changeEl?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { dateRange, widgetCount: widgets.length, widgets };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_dashboard_widget: async (args) => {
      const widgetName = String(args.widgetName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "dashboard-widget", async () => {
          await gotoGhl(page, "/dashboard");
          await waitForAppReady(page);
          const data = await page.evaluate((name) => {
            const lower = name.toLowerCase();
            const cards = document.querySelectorAll(
              '[class*="widget"], [class*="card"], [class*="metric"], [class*="stat"], [data-testid*="widget"]',
            );
            for (const el of cards) {
              const titleEl = el.querySelector(
                '[class*="title"], [class*="label"], h3, h4, [class*="heading"]',
              );
              const title = titleEl?.textContent?.trim() ?? "";
              if (title.toLowerCase().includes(lower)) {
                const valueEl = el.querySelector(
                  '[class*="value"], [class*="count"], [class*="number"], [class*="amount"]',
                );
                const bodyText = el.textContent?.trim()?.slice(0, 500) ?? "";
                return {
                  found: true,
                  title,
                  value: valueEl?.textContent?.trim() ?? "",
                  bodyText,
                };
              }
            }
            return { found: false, title: "", value: "", bodyText: "" };
          }, widgetName);
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_dashboard_widgets: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "dashboard-widgets-list", async () => {
          await gotoGhl(page, "/dashboard");
          await waitForAppReady(page);
          const widgets = await page.evaluate(() => {
            const items: Array<{ title: string; value: string }> = [];
            document
              .querySelectorAll(
                '[class*="widget"], [class*="card"], [class*="metric"], [class*="stat"], [data-testid*="widget"], [data-testid*="card"]',
              )
              .forEach((el) => {
                const titleEl = el.querySelector(
                  '[class*="title"], [class*="label"], h3, h4, [class*="heading"]',
                );
                const valueEl = el.querySelector(
                  '[class*="value"], [class*="count"], [class*="number"], [class*="amount"]',
                );
                const title = titleEl?.textContent?.trim() ?? "";
                const value = valueEl?.textContent?.trim() ?? "";
                if (title.length > 1) {
                  items.push({ title, value });
                }
              });
            return items;
          });
          return { count: widgets.length, widgets };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_pipeline_summary: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "dashboard-pipeline-summary", async () => {
          await gotoGhl(page, "/dashboard");
          await waitForAppReady(page);
          const summary = await page.evaluate(() => {
            const stages: Array<{ name: string; count: string; value: string }> = [];
            document
              .querySelectorAll(
                '[class*="pipeline"] [class*="stage"], [class*="pipeline"] [class*="column"], [class*="kanban"] [class*="column"]',
              )
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], h4, h3');
                const countEl = el.querySelector('[class*="count"], [class*="number"], [class*="badge"]');
                const valueEl = el.querySelector('[class*="value"], [class*="total"], [class*="amount"]');
                const name = nameEl?.textContent?.trim() ?? "";
                if (name.length > 1) {
                  stages.push({
                    name,
                    count: countEl?.textContent?.trim() ?? "",
                    value: valueEl?.textContent?.trim() ?? "",
                  });
                }
              });
            const totalEl = document.querySelector(
              '[class*="pipeline"] [class*="total"], [class*="pipeline"] [class*="summary"]',
            );
            return {
              stageCount: stages.length,
              stages,
              totalText: totalEl?.textContent?.trim() ?? "",
            };
          });
          return summary;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_appointment_summary: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "dashboard-appointment-summary", async () => {
          await gotoGhl(page, "/dashboard");
          await waitForAppReady(page);
          const metrics = await page.evaluate(() => {
            const items: Array<{ label: string; value: string }> = [];
            const cards = document.querySelectorAll(
              '[class*="widget"], [class*="card"], [class*="metric"], [data-testid*="widget"]',
            );
            for (const el of cards) {
              const text = el.textContent ?? "";
              if (
                text.toLowerCase().includes("appointment") ||
                text.toLowerCase().includes("booking") ||
                text.toLowerCase().includes("calendar")
              ) {
                const titleEl = el.querySelector(
                  '[class*="title"], [class*="label"], h3, h4',
                );
                const valueEl = el.querySelector(
                  '[class*="value"], [class*="count"], [class*="number"]',
                );
                items.push({
                  label: titleEl?.textContent?.trim() ?? "",
                  value: valueEl?.textContent?.trim() ?? "",
                });
              }
            }
            return items;
          });
          return { count: metrics.length, metrics };
        });
      } finally {
        await close();
      }
    },
  },
};
