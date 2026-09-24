import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const phoneIntegrationModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_phone_numbers",
      description: "List phone numbers with type, status, and assigned user.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by number or label" },
        },
      },
    },
    {
      name: "ghl_browser_get_phone_number_details",
      description: "Get details of a phone number: provider, forwarding, recording settings.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Phone number" },
        },
        required: ["number"],
      },
    },
    {
      name: "ghl_browser_search_available_numbers",
      description: "Search for available phone numbers by area code or city.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Area code or city name" },
          country: { type: "string", description: "Country code (default: US)" },
        },
        required: ["query"],
      },
    },
    {
      name: "ghl_browser_get_call_logs_summary",
      description: "Get call log summary: total calls, missed, answered, duration.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Filter by phone number (optional)" },
        },
      },
    },
    {
      name: "ghl_browser_update_phone_settings",
      description: "Update phone settings: call recording, voicemail, forwarding.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Phone number" },
          callRecording: { type: "boolean", description: "Enable call recording" },
          voicemail: { type: "boolean", description: "Enable voicemail" },
          forwardTo: { type: "string", description: "Forward calls to this number" },
        },
        required: ["number"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_phone_numbers: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "phone-list", async () => {
          await gotoGhl(page, "/settings/phone-numbers");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const numbers = await page.evaluate(() => {
            const items: Array<{
              number: string;
              type: string;
              status: string;
              assignedTo: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="phone"], [class*="number"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="number"], [class*="phone"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 5) {
                  items.push({
                    number: nameEl.textContent?.trim() ?? "",
                    type:
                      el.querySelector('[class*="type"], [class*="badge"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"]')?.textContent?.trim() ?? "",
                    assignedTo:
                      el.querySelector('[class*="user"], [class*="assign"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, count: numbers.length, phoneNumbers: numbers };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_phone_number_details: async (args) => {
      const number = String(args.number);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "phone-details", async () => {
          await gotoGhl(page, "/settings/phone-numbers");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${number}"), [class*="phone"]:has-text("${number}")`)
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
              number:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              provider: getVal("provider") || getVal("twilio"),
              type: getVal("type") || getVal("line type"),
              status: getVal("status"),
              callRecording: getVal("recording"),
              voicemail: getVal("voicemail"),
              forwardTo: getVal("forward") || getVal("ring to"),
              smsEnabled: getVal("sms") || getVal("text"),
              assignedTo: getVal("assigned") || getVal("user"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_search_available_numbers: async (args) => {
      const query = String(args.query);
      const country = (args.country as string) || "US";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "phone-search", async () => {
          await gotoGhl(page, "/settings/phone-numbers");
          await waitForAppReady(page);
          const buyBtn = page
            .locator('button:has-text("Buy"), button:has-text("Add Number"), button:has-text("Search")')
            .first();
          await buyBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const searchInput = page
            .locator('input[placeholder*="area code"], input[placeholder*="city"], input[type="search"]')
            .first();
          await searchInput.fill(query).catch(() => {});
          const goBtn = page
            .locator('button:has-text("Search"), button[type="submit"]')
            .first();
          await goBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const results = await page.evaluate(() => {
            const items: Array<{
              number: string;
              city: string;
              type: string;
              monthlyCost: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="result"], [class*="number"], [role="row"]')
              .forEach((el) => {
                const numEl = el.querySelector(
                  '[class*="number"], [class*="phone"], td:first-child',
                );
                if (numEl && (numEl.textContent?.trim().length ?? 0) > 5) {
                  items.push({
                    number: numEl.textContent?.trim() ?? "",
                    city:
                      el.querySelector('[class*="city"], [class*="location"]')?.textContent?.trim() ?? "",
                    type:
                      el.querySelector('[class*="type"]')?.textContent?.trim() ?? "",
                    monthlyCost:
                      el.querySelector('[class*="cost"], [class*="price"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { query, country, count: results.length, availableNumbers: results };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_call_logs_summary: async (args) => {
      const number = (args.number as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "phone-logs", async () => {
          await gotoGhl(page, "/settings/phone-numbers");
          await waitForAppReady(page);
          if (number) {
            const row = page
              .locator(`tr:has-text("${number}"), [class*="phone"]:has-text("${number}")`)
              .first();
            await row.click({ timeout: 5000 });
            await waitForAppReady(page);
          }
          const logsTab = page
            .locator('a:has-text("Call Logs"), button:has-text("Call Logs"), [class*="tab"]:has-text("Call")')
            .first();
          await logsTab.click({ timeout: 5000 }).catch(() => {});
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
            return {
              totalCalls: getKpi("total") || getKpi("calls"),
              missed: getKpi("missed"),
              answered: getKpi("answered"),
              voicemails: getKpi("voicemail"),
              avgDuration: getKpi("duration") || getKpi("average"),
              inbound: getKpi("inbound"),
              outbound: getKpi("outbound"),
            };
          });
          return { number: number || "all", callSummary: data };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_phone_settings: async (args) => {
      const number = String(args.number);
      const callRecording = args.callRecording as boolean | undefined;
      const voicemail = args.voicemail as boolean | undefined;
      const forwardTo = (args.forwardTo as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "phone-settings", async () => {
          await gotoGhl(page, "/settings/phone-numbers");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${number}"), [class*="phone"]:has-text("${number}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const settingsBtn = page
            .locator('button:has-text("Settings"), button:has-text("Edit"), button:has-text("Configure")')
            .first();
          await settingsBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          if (callRecording !== undefined) {
            const recToggle = page
              .locator('[class*="recording"] input[type="checkbox"], [class*="record"] [role="switch"]')
              .first();
            await recToggle.click({ timeout: 3000 }).catch(() => {});
          }
          if (voicemail !== undefined) {
            const vmToggle = page
              .locator('[class*="voicemail"] input[type="checkbox"], [class*="voicemail"] [role="switch"]')
              .first();
            await vmToggle.click({ timeout: 3000 }).catch(() => {});
          }
          if (forwardTo) {
            const fwdInput = page
              .locator('input[placeholder*="forward"], input[name="forward"]')
              .first();
            await fwdInput.fill(forwardTo).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { number, callRecording, voicemail, forwardTo, updated: true };
        });
      } finally {
        await close();
      }
    },
  },
};
