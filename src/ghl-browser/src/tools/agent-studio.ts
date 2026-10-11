import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const agentStudioModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_agent_studio_sessions",
      description: "List recent test/debug sessions in Agent Studio with agent name, status, and timestamp.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_agent_studio_session",
      description: "Get full transcript and metrics from a specific Agent Studio test session.",
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "Agent name to find sessions for" },
        },
        required: ["agentName"],
      },
    },
    {
      name: "ghl_browser_run_agent_test",
      description: "Run a test conversation against an agent in Agent Studio.",
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "Agent to test" },
          message: { type: "string", description: "Initial test message to send" },
        },
        required: ["agentName", "message"],
      },
    },
    {
      name: "ghl_browser_get_agent_studio_metrics",
      description: "Get performance metrics for an agent: response time, accuracy, satisfaction scores.",
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "Agent name" },
        },
        required: ["agentName"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_agent_studio_sessions: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-studio-sessions", async () => {
          await gotoGhl(page, "/ai/agent-studio");
          await waitForAppReady(page);
          const sessions = await page.evaluate(() => {
            const rows: Array<{ agent: string; status: string; messages: string; time: string }> = [];
            document
              .querySelectorAll('tr, [class*="session"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const agentEl = el.querySelector('[class*="agent"], [class*="name"], a, td:first-child');
                if (agentEl && (agentEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    agent: agentEl.textContent?.trim() ?? "",
                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    messages:
                      el.querySelector('[class*="message"], [class*="count"]')?.textContent?.trim() ?? "",
                    time: el.querySelector('[class*="time"], [class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { count: sessions.length, sessions };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_agent_studio_session: async (args) => {
      const agentName = String(args.agentName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-studio-session", async () => {
          await gotoGhl(page, "/ai/agent-studio");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${agentName}"), [class*="session"]:has-text("${agentName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const transcript = await page.evaluate(() => {
            const messages: Array<{ role: string; text: string; time: string }> = [];
            document
              .querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat"]')
              .forEach((el) => {
                const role =
                  el.classList.contains("bot") || el.classList.contains("agent")
                    ? "agent"
                    : el.classList.contains("user")
                      ? "user"
                      : "";
                const textEl = el.querySelector('[class*="text"], [class*="content"], p');
                const text = textEl?.textContent?.trim() ?? el.textContent?.trim()?.slice(0, 300) ?? "";
                const timeEl = el.querySelector('[class*="time"], time');
                if (text.length > 2) {
                  messages.push({
                    role,
                    text,
                    time: timeEl?.textContent?.trim() ?? "",
                  });
                }
              });
            return messages;
          });
          return { agentName, messageCount: transcript.length, messages: transcript };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_run_agent_test: async (args) => {
      const agentName = String(args.agentName);
      const message = String(args.message);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-studio-test", async () => {
          await gotoGhl(page, "/ai/agent-studio");
          await waitForAppReady(page);
          const agentSelect = page
            .locator('select, [role="combobox"], input[placeholder*="agent"]')
            .first();
          await agentSelect.click();
          await page
            .locator(`[role="option"]:has-text("${agentName}"), [class*="item"]:has-text("${agentName}")`)
            .first()
            .click({ timeout: 3000 })
            .catch(() => {});
          await waitForAppReady(page);
          const input = page.locator('textarea, input[type="text"], [class*="input"]').first();
          await input.fill(message);
          const sendBtn = page
            .locator('button:has-text("Send"), button:has-text("Run"), button[type="submit"]')
            .first();
          await sendBtn.click({ timeout: 5000 });
          await page.waitForTimeout(5000);
          const response = await page.evaluate(() => {
            const messages = document.querySelectorAll('[class*="message"], [class*="bubble"]');
            const last = messages[messages.length - 1];
            return last?.textContent?.trim()?.slice(0, 500) ?? "";
          });
          return { agentName, sentMessage: message, response };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_agent_studio_metrics: async (args) => {
      const agentName = String(args.agentName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "agent-studio-metrics", async () => {
          await gotoGhl(page, "/ai/agent-studio");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${agentName}"), [class*="session"]:has-text("${agentName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const metricsTab = page
            .locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics"), a:has-text("Metrics")')
            .first();
          await metricsTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const metrics = await page.evaluate(() => {
            const items: Array<{ label: string; value: string }> = [];
            document
              .querySelectorAll('[class*="metric"], [class*="stat"], [class*="card"]')
              .forEach((el) => {
                const labelEl = el.querySelector('[class*="label"], [class*="title"], h4');
                const valueEl = el.querySelector('[class*="value"], [class*="number"], [class*="score"]');
                const label = labelEl?.textContent?.trim() ?? "";
                const value = valueEl?.textContent?.trim() ?? "";
                if (label.length > 1 || value.length > 0) items.push({ label, value });
              });
            return items;
          });
          return { agentName, metricCount: metrics.length, metrics };
        });
      } finally {
        await close();
      }
    },
  },
};
