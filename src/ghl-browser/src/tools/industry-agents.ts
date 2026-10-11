import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const industryAgentsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_industry_agents",
      description:
        "List pre-built industry-specific AI agents available for installation (real estate, dental, legal, etc.).",
      inputSchema: {
        type: "object",
        properties: {
          industry: {
            type: "string",
            description: "Filter by industry: real_estate, dental, legal, fitness, home_services, all",
          },
        },
      },
    },
    {
      name: "ghl_browser_get_industry_agent_details",
      description: "Get details of an industry agent: features, prompts, channels, and requirements.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Industry agent name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_install_industry_agent",
      description: "Install an industry agent into the current sub-account.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Industry agent to install" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_list_installed_industry_agents",
      description: "List industry agents currently installed in the sub-account.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_uninstall_industry_agent",
      description: "Remove an installed industry agent from the sub-account.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Industry agent to uninstall" },
          confirm: { type: "boolean", description: "Must be true to confirm" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_industry_agents: async (args) => {
      const industry = (args.industry as string) || "all";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "industry-agents-list", async () => {
          await gotoGhl(page, "/ai/industry-agents");
          await waitForAppReady(page);
          if (industry !== "all") {
            const label = industry.replace(/_/g, " ");
            const filter = page
              .locator(`button:has-text("${label}"), [role="tab"]:has-text("${label}"), a:has-text("${label}")`)
              .first();
            await filter.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const agents = await page.evaluate(() => {
            const rows: Array<{ name: string; industry: string; description: string; installed: boolean }> = [];
            document
              .querySelectorAll('[class*="agent"], [class*="template"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], h3, h4, a');
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    name: nameEl.textContent?.trim() ?? "",
                    industry:
                      el.querySelector('[class*="industry"], [class*="category"], [class*="badge"]')?.textContent?.trim() ?? "",
                    description:
                      el.querySelector('[class*="desc"], [class*="summary"], p')?.textContent?.trim()?.slice(0, 150) ?? "",
                    installed:
                      el.querySelector('[class*="installed"], [class*="active"]') !== null ||
                      (el.textContent ?? "").toLowerCase().includes("installed"),
                  });
                }
              });
            return rows;
          });
          return { industry, count: agents.length, agents };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_industry_agent_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "industry-agent-details", async () => {
          await gotoGhl(page, "/ai/industry-agents");
          await waitForAppReady(page);
          const card = page
            .locator(`[class*="agent"]:has-text("${name}"), [class*="card"]:has-text("${name}"), a:has-text("${name}")`)
            .first();
          await card.click({ timeout: 5000 });
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const sections: Record<string, string> = {};
            document
              .querySelectorAll('[class*="section"], [class*="detail"], [class*="feature"]')
              .forEach((el) => {
                const titleEl = el.querySelector('[class*="title"], h3, h4, [class*="label"]');
                const title = titleEl?.textContent?.trim() ?? "";
                const body = el.textContent?.trim()?.slice(0, 300) ?? "";
                if (title.length > 1) sections[title] = body;
              });
            return sections;
          });
          return { name, sections: details };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_install_industry_agent: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "industry-agent-install", async () => {
          await gotoGhl(page, "/ai/industry-agents");
          await waitForAppReady(page);
          const card = page
            .locator(`[class*="agent"]:has-text("${name}"), [class*="card"]:has-text("${name}")`)
            .first();
          const installBtn = card
            .locator('button:has-text("Install"), button:has-text("Add"), button:has-text("Enable")')
            .first();
          await installBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Confirm"), button:has-text("Install"), button[type="submit"]')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, installed: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_installed_industry_agents: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "industry-agents-installed", async () => {
          await gotoGhl(page, "/ai/industry-agents");
          await waitForAppReady(page);
          const installedTab = page
            .locator('[role="tab"]:has-text("Installed"), button:has-text("Installed"), a:has-text("Installed")')
            .first();
          await installedTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const agents = await page.evaluate(() => {
            const rows: Array<{ name: string; industry: string; status: string }> = [];
            document
              .querySelectorAll('[class*="agent"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], h3, h4');
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    name: nameEl.textContent?.trim() ?? "",
                    industry:
                      el.querySelector('[class*="industry"], [class*="category"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { count: agents.length, agents };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_uninstall_industry_agent: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to uninstall this industry agent" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "industry-agent-uninstall", async () => {
          await gotoGhl(page, "/ai/industry-agents");
          await waitForAppReady(page);
          const installedTab = page
            .locator('[role="tab"]:has-text("Installed"), button:has-text("Installed")')
            .first();
          await installedTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const card = page
            .locator(`[class*="agent"]:has-text("${name}"), [class*="card"]:has-text("${name}")`)
            .first();
          const removeBtn = card
            .locator('button:has-text("Remove"), button:has-text("Uninstall"), button:has-text("Delete")')
            .first();
          await removeBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Confirm"), button:has-text("Remove"), button:has-text("Yes")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, uninstalled: true };
        });
      } finally {
        await close();
      }
    },
  },
};
