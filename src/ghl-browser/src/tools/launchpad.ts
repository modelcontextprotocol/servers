import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const launchpadModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_launchpad_status",
      description: "Get launchpad onboarding status: completed steps, pending actions.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_launchpad_tasks",
      description: "List all launchpad setup tasks with completion status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_complete_launchpad_step",
      description: "Mark a launchpad setup step as completed or skip it.",
      inputSchema: {
        type: "object",
        properties: {
          step: { type: "string", description: "Step name to complete" },
          skip: { type: "boolean", description: "Skip instead of complete" },
        },
        required: ["step"],
      },
    },
    {
      name: "ghl_browser_get_launchpad_checklist",
      description: "Get the full onboarding checklist with progress percentage.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_reset_launchpad",
      description: "Reset launchpad to start onboarding from scratch.",
      inputSchema: {
        type: "object",
        properties: {
          confirm: { type: "boolean", description: "Must be true to confirm reset" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_get_launchpad_status: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "launch-status", async () => {
          await gotoGhl(page, "/launchpad");
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
              title:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              progress: getVal("progress") || getVal("complete") || getVal("%"),
              currentStep: getVal("current") || getVal("step") || getVal("next"),
              completedSteps: getVal("completed") || getVal("done"),
              totalSteps: getVal("total") || getVal("steps"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_launchpad_tasks: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "launch-tasks", async () => {
          await gotoGhl(page, "/launchpad");
          await waitForAppReady(page);
          const tasks = await page.evaluate(() => {
            const items: Array<{
              name: string;
              status: string;
              description: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="task"], [class*="step"], [class*="checklist"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], label, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"], [class*="check"]')?.textContent?.trim() ??
                      (el.querySelector('input[type="checkbox"]') as HTMLInputElement)?.checked ? "completed" : "pending",
                    description:
                      el.querySelector('[class*="desc"], [class*="detail"], p')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: tasks.length, tasks };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_complete_launchpad_step: async (args) => {
      const step = String(args.step);
      const skip = args.skip === true;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "launch-complete", async () => {
          await gotoGhl(page, "/launchpad");
          await waitForAppReady(page);
          const row = page
            .locator(`[class*="step"]:has-text("${step}"), [class*="task"]:has-text("${step}"), tr:has-text("${step}")`)
            .first();
          if (skip) {
            const skipBtn = row
              .locator('button:has-text("Skip"), a:has-text("Skip")')
              .first();
            await skipBtn.click({ timeout: 5000 }).catch(() => {});
          } else {
            const completeBtn = row
              .locator('button:has-text("Complete"), button:has-text("Done"), input[type="checkbox"]')
              .first();
            await completeBtn.click({ timeout: 5000 }).catch(() => {});
          }
          await waitForAppReady(page);
          return { step, action: skip ? "skipped" : "completed" };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_launchpad_checklist: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "launch-checklist", async () => {
          await gotoGhl(page, "/launchpad");
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getKpi = (label: string): string => {
              const el = Array.from(
                document.querySelectorAll('[class*="kpi"], [class*="metric"], [class*="stat"], [class*="card"]'),
              ).find((k) => k.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                el?.querySelector('[class*="value"], [class*="number"], strong')?.textContent?.trim() ?? ""
              );
            };
            const steps = Array.from(
              document.querySelectorAll('[class*="step"], [class*="checklist-item"]'),
            ).map((el) => ({
              name: el.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() ?? "",
              done: el.classList.contains("completed") || el.classList.contains("done"),
            }));
            return {
              progress: getKpi("progress") || getKpi("complete"),
              totalSteps: steps.length,
              completedSteps: steps.filter((s) => s.done).length,
              steps,
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_reset_launchpad: async (args) => {
      if (args.confirm !== true) {
        return { error: "Set confirm=true to reset launchpad" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "launch-reset", async () => {
          await gotoGhl(page, "/launchpad");
          await waitForAppReady(page);
          const resetBtn = page
            .locator('button:has-text("Reset"), button:has-text("Start Over"), button:has-text("Restart")')
            .first();
          await resetBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Reset")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { reset: true };
        });
      } finally {
        await close();
      }
    },
  },
};
