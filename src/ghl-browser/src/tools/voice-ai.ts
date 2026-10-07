import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const voiceAiModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_voice_ai_calls",
      description: "List recent Voice AI calls with status and duration.",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Filter: all, completed, missed, in_progress" },
        },
      },
    },
    {
      name: "ghl_browser_get_voice_ai_call",
      description: "Get transcript and details for a Voice AI call.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: { type: "string", description: "Contact name or phone number to find the call" },
        },
        required: ["contactName"],
      },
    },
    {
      name: "ghl_browser_get_voice_ai_settings",
      description: "Get Voice AI configuration and prompt settings.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_update_voice_ai_settings",
      description: "Update Voice AI prompt or configuration.",
      inputSchema: {
        type: "object",
        properties: {
          systemPrompt: { type: "string", description: "New system prompt for Voice AI" },
          enabled: { type: "boolean", description: "Enable or disable Voice AI" },
        },
      },
    },
    {
      name: "ghl_browser_list_voice_ai_recordings",
      description: "List Voice AI call recordings.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  handlers: {
    ghl_browser_list_voice_ai_calls: async (args) => {
      const filter = (args.filter as string) || "all";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "voice-ai-calls", async () => {
          await gotoGhl(page, "/voice-ai/calls");
          await waitForAppReady(page);
          if (filter !== "all") {
            const tab = page.locator(`button:has-text("${filter}"), [role="tab"]:has-text("${filter}")`).first();
            await tab.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const calls = await page.evaluate(() => {
            const rows: Array<{ contact: string; phone: string; duration: string; status: string; date: string }> = [];
            document
              .querySelectorAll("table tbody tr, [class*='call-item'], [class*='CallItem'], [class*='list-row']")
              .forEach((el) => {
                const cells = el.querySelectorAll("td, [class*='cell']");
                const text = el.textContent || "";
                rows.push({
                  contact: cells[0]?.textContent?.trim() || text.slice(0, 40).trim(),
                  phone: cells[1]?.textContent?.trim() || "",
                  duration: cells[2]?.textContent?.trim() || "",
                  status: cells[3]?.textContent?.trim() || "",
                  date: cells[4]?.textContent?.trim() || "",
                });
              });
            return rows;
          });
          return { filter, count: calls.length, calls };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_voice_ai_call: async (args) => {
      const contactName = String(args.contactName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "voice-ai-call", async () => {
          await gotoGhl(page, "/voice-ai/calls");
          await waitForAppReady(page);
          await page.locator(`tr:has-text("${contactName}"), [class*='call-item']:has-text("${contactName}")`).first().click();
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const transcriptEl = document.querySelector('[class*="transcript"], [class*="Transcript"], [class*="conversation"]');
            const summaryEl = document.querySelector('[class*="summary"], [class*="Summary"]');
            return {
              transcript: transcriptEl?.textContent?.trim() || "",
              summary: summaryEl?.textContent?.trim() || "",
              title: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
              url: window.location.href,
            };
          });
          return { contactName, ...details };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_voice_ai_settings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "voice-ai-settings", async () => {
          await gotoGhl(page, "/settings/voice-ai");
          await waitForAppReady(page);
          const settings = await page.evaluate(() => {
            const promptEl = document.querySelector('textarea, [contenteditable="true"]');
            const toggleEl = document.querySelector('input[type="checkbox"], [role="switch"]');
            return {
              systemPrompt: promptEl?.textContent?.trim() || (promptEl as HTMLTextAreaElement)?.value || "",
              enabled: toggleEl ? (toggleEl as HTMLInputElement).checked || toggleEl.getAttribute("aria-checked") === "true" : null,
              url: window.location.href,
            };
          });
          return settings;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_voice_ai_settings: async (args) => {
      const systemPrompt = args.systemPrompt as string | undefined;
      const enabled = args.enabled as boolean | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "voice-ai-update", async () => {
          await gotoGhl(page, "/settings/voice-ai");
          await waitForAppReady(page);
          if (systemPrompt) {
            const editor = page.locator('textarea, [contenteditable="true"]').first();
            await editor.fill(systemPrompt);
          }
          if (enabled !== undefined) {
            const toggle = page.locator('input[type="checkbox"], [role="switch"]').first();
            const current = await toggle.isChecked().catch(() => false);
            if (current !== enabled) await toggle.click();
          }
          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
          await saveBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { updated: true, systemPrompt: systemPrompt ? "set" : "unchanged", enabled: enabled ?? "unchanged" };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_voice_ai_recordings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "voice-ai-recordings", async () => {
          await gotoGhl(page, "/voice-ai/recordings");
          await waitForAppReady(page);
          const recordings = await page.evaluate(() => {
            const rows: Array<{ name: string; duration: string; date: string; url: string }> = [];
            document
              .querySelectorAll("table tbody tr, [class*='recording'], [class*='Recording'], audio")
              .forEach((el) => {
                const nameEl = el.querySelector("td, [class*='name'], [class*='title']");
                const a = el.closest("a") as HTMLAnchorElement | null;
                rows.push({
                  name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 60).trim() || "",
                  duration: "",
                  date: "",
                  url: a?.href || (el as HTMLAudioElement).src || "",
                });
              });
            return rows;
          });
          return { count: recordings.length, recordings };
        });
      } finally {
        await close();
      }
    },
  },
};
