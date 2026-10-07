import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const preferenceManagementModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_preference_settings",
      description: "Get contact communication preference settings: opt-in defaults, channels, compliance.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_preference_categories",
      description: "List preference categories (e.g. Marketing, Transactional) with channel settings.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_create_preference_category",
      description: "Create a new preference category for contact communication management.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Category name (e.g. 'Weekly Newsletter')" },
          channels: { type: "string", description: "Comma-separated channels: email, sms, whatsapp" },
          defaultOptIn: { type: "boolean", description: "Whether contacts are opted in by default" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_contact_preferences",
      description: "Get a specific contact's communication preferences across all categories.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: { type: "string", description: "Contact name to look up" },
        },
        required: ["contactName"],
      },
    },
    {
      name: "ghl_browser_get_compliance_summary",
      description: "Get compliance summary: TCPA, GDPR, CAN-SPAM status and consent statistics.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_preference_settings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "pref-settings", async () => {
          await gotoGhl(page, "/settings/preferences");
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], input, select, span")?.textContent?.trim() ??
                (lbl?.parentElement?.querySelector("input") as HTMLInputElement)?.value ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              defaultOptIn: getVal("default opt") || getVal("opt-in"),
              emailPolicy: getVal("email"),
              smsPolicy: getVal("sms") || getVal("text"),
              whatsappPolicy: getVal("whatsapp"),
              doubleOptIn: getVal("double opt"),
              unsubscribeLink: getVal("unsubscribe"),
              consentExpiry: getVal("consent expiry") || getVal("expiration"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_preference_categories: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "pref-categories", async () => {
          await gotoGhl(page, "/settings/preferences");
          await waitForAppReady(page);
          const categories = await page.evaluate(() => {
            const items: Array<{
              name: string;
              channels: string;
              defaultOptIn: string;
              contactCount: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="category"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    channels:
                      el.querySelector('[class*="channel"]')?.textContent?.trim() ?? "",
                    defaultOptIn:
                      el.querySelector('[class*="opt"], [class*="default"]')?.textContent?.trim() ?? "",
                    contactCount:
                      el.querySelector('[class*="count"], [class*="contact"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: categories.length, categories };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_preference_category: async (args) => {
      const name = String(args.name);
      const channels = (args.channels as string) || "";
      const defaultOptIn = args.defaultOptIn === true;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "pref-create", async () => {
          await gotoGhl(page, "/settings/preferences");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page
            .locator('input[name="name"], input[placeholder*="name"]')
            .first();
          await nameInput.fill(name);
          if (channels) {
            for (const ch of channels.split(",")) {
              const chBox = page
                .locator(`label:has-text("${ch.trim()}") input, [class*="channel"]:has-text("${ch.trim()}") input`)
                .first();
              await chBox.click({ timeout: 2000 }).catch(() => {});
            }
          }
          if (defaultOptIn) {
            const optToggle = page
              .locator('[class*="opt"] input[type="checkbox"], [class*="default"] [role="switch"]')
              .first();
            await optToggle.click({ timeout: 2000 }).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, channels, defaultOptIn, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_contact_preferences: async (args) => {
      const contactName = String(args.contactName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "contact-prefs", async () => {
          await gotoGhl(page, "/contacts");
          await waitForAppReady(page);
          const searchInput = page
            .locator('input[type="search"], input[placeholder*="search"], input[placeholder*="Search"]')
            .first();
          await searchInput.fill(contactName).catch(() => {});
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${contactName}"), a:has-text("${contactName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const prefsTab = page
            .locator('a:has-text("Preferences"), button:has-text("Preferences"), [class*="tab"]:has-text("Preference")')
            .first();
          await prefsTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const prefs = await page.evaluate(() => {
            const items: Array<{
              category: string;
              email: string;
              sms: string;
              whatsapp: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="preference"], [class*="category"], [role="row"]')
              .forEach((el) => {
                const catEl = el.querySelector(
                  '[class*="name"], [class*="category"], td:first-child',
                );
                if (catEl && (catEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    category: catEl.textContent?.trim() ?? "",
                    email:
                      el.querySelector('[class*="email"]')?.textContent?.trim() ?? "",
                    sms:
                      el.querySelector('[class*="sms"]')?.textContent?.trim() ?? "",
                    whatsapp:
                      el.querySelector('[class*="whatsapp"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { contactName, count: prefs.length, preferences: prefs };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_compliance_summary: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "compliance-summary", async () => {
          await gotoGhl(page, "/settings/preferences");
          await waitForAppReady(page);
          const complianceTab = page
            .locator('a:has-text("Compliance"), button:has-text("Compliance"), [class*="tab"]:has-text("Compliance")')
            .first();
          await complianceTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th, [class*="field"]'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], span")?.textContent?.trim() ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            const getKpi = (label: string): string => {
              const el = Array.from(
                document.querySelectorAll('[class*="kpi"], [class*="metric"], [class*="stat"], [class*="card"]'),
              ).find((k) => k.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                el?.querySelector('[class*="value"], [class*="number"], strong')?.textContent?.trim() ?? ""
              );
            };
            return {
              tcpaStatus: getVal("tcpa"),
              gdprStatus: getVal("gdpr"),
              canSpamStatus: getVal("can-spam") || getVal("canspam"),
              optedInContacts: getKpi("opted in") || getVal("opted in"),
              optedOutContacts: getKpi("opted out") || getVal("opted out"),
              pendingConsent: getKpi("pending") || getVal("pending"),
              lastConsentUpdate: getVal("last update") || getVal("updated"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },
  },
};
