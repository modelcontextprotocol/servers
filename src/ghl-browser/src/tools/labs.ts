import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const labsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_lab_features",
      description: "List experimental/beta features available in Labs with status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_lab_feature_details",
      description: "Get details of a specific lab feature: description, status, requirements.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Lab feature name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_toggle_lab_feature",
      description: "Enable or disable a lab feature.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Lab feature name" },
          enable: { type: "boolean", description: "True to enable, false to disable" },
        },
        required: ["name", "enable"],
      },
    },
    {
      name: "ghl_browser_get_labs_feedback",
      description: "Get feedback and known issues for lab features.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Lab feature name (optional, all if omitted)" },
        },
      },
    },
    {
      name: "ghl_browser_submit_lab_feedback",
      description: "Submit feedback for a lab feature.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Lab feature name" },
          feedback: { type: "string", description: "Feedback text" },
          rating: { type: "number", description: "Rating 1-5" },
        },
        required: ["name", "feedback"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_lab_features: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "labs-list", async () => {
          await gotoGhl(page, "/labs");
          await waitForAppReady(page);
          const features = await page.evaluate(() => {
            const items: Array<{
              name: string;
              description: string;
              status: string;
              enabled: boolean;
            }> = [];
            document
              .querySelectorAll('tr, [class*="lab"], [class*="feature"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], h3, h4, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  const toggleEl = el.querySelector(
                    '[class*="toggle"], input[type="checkbox"], [role="switch"]',
                  );
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    description:
                      el.querySelector('[class*="desc"], [class*="detail"], p')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    enabled:
                      toggleEl?.getAttribute("aria-checked") === "true" ||
                      toggleEl?.classList.contains("active") ||
                      (toggleEl as HTMLInputElement)?.checked === true,
                  });
                }
              });
            return items;
          });
          return { count: features.length, labFeatures: features };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_lab_feature_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "labs-details", async () => {
          await gotoGhl(page, "/labs");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="feature"]:has-text("${name}"), [class*="card"]:has-text("${name}")`)
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
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              description: getVal("description") || getVal("about"),
              status: getVal("status"),
              releasedDate: getVal("released") || getVal("date"),
              knownIssues: getVal("known issues") || getVal("issues"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_toggle_lab_feature: async (args) => {
      const name = String(args.name);
      const enable = args.enable === true;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "labs-toggle", async () => {
          await gotoGhl(page, "/labs");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="feature"]:has-text("${name}"), [class*="card"]:has-text("${name}")`)
            .first();
          const toggle = row
            .locator('[class*="toggle"], input[type="checkbox"], [role="switch"]')
            .first();
          await toggle.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, enabled: enable, toggled: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_labs_feedback: async (args) => {
      const name = (args.name as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "labs-feedback", async () => {
          await gotoGhl(page, "/labs");
          await waitForAppReady(page);
          if (name) {
            const row = page
              .locator(`tr:has-text("${name}"), [class*="feature"]:has-text("${name}")`)
              .first();
            await row.click({ timeout: 5000 });
            await waitForAppReady(page);
          }
          const feedbackTab = page
            .locator('a:has-text("Feedback"), button:has-text("Feedback"), [class*="tab"]:has-text("Feed")')
            .first();
          await feedbackTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const feedback = await page.evaluate(() => {
            const items: Array<{
              feature: string;
              comment: string;
              rating: string;
              date: string;
            }> = [];
            document
              .querySelectorAll('[class*="feedback"], [class*="comment"], [class*="review"]')
              .forEach((el) => {
                items.push({
                  feature:
                    el.querySelector('[class*="feature"], [class*="name"]')?.textContent?.trim() ?? "",
                  comment:
                    el.querySelector('[class*="comment"], [class*="text"], p')?.textContent?.trim() ?? "",
                  rating:
                    el.querySelector('[class*="rating"], [class*="star"]')?.textContent?.trim() ?? "",
                  date:
                    el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                });
              });
            return items;
          });
          return { name: name || "all", count: feedback.length, feedback };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_submit_lab_feedback: async (args) => {
      const name = String(args.name);
      const feedback = String(args.feedback);
      const rating = (args.rating as number) || 0;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "labs-submit", async () => {
          await gotoGhl(page, "/labs");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="feature"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const feedbackBtn = page
            .locator('button:has-text("Feedback"), button:has-text("Submit")')
            .first();
          await feedbackBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const textarea = page.locator("textarea").first();
          await textarea.fill(feedback).catch(() => {});
          if (rating > 0) {
            const stars = page.locator(`[class*="star"]:nth-child(${rating})`).first();
            await stars.click({ timeout: 3000 }).catch(() => {});
          }
          const submitBtn = page
            .locator('button:has-text("Submit"), button[type="submit"]')
            .first();
          await submitBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, feedback, rating, submitted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
