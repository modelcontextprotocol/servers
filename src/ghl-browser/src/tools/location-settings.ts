import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const locationSettingsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_location_settings",
      description:
        "Get full location/sub-account settings: business info, timezone, currency, locale, and feature toggles.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_update_location_settings",
      description: "Update a location setting: timezone, currency, locale, or feature toggle.",
      inputSchema: {
        type: "object",
        properties: {
          setting: {
            type: "string",
            description: "Setting name: timezone, currency, locale, language, phone_format",
          },
          value: { type: "string", description: "New value for the setting" },
        },
        required: ["setting", "value"],
      },
    },
    {
      name: "ghl_browser_get_location_features",
      description: "List feature toggles for the current sub-account: which features are enabled/disabled.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_toggle_location_feature",
      description: "Enable or disable a feature toggle for the current sub-account.",
      inputSchema: {
        type: "object",
        properties: {
          feature: { type: "string", description: "Feature name to toggle" },
          enabled: { type: "boolean" },
        },
        required: ["feature", "enabled"],
      },
    },
    {
      name: "ghl_browser_get_location_domains",
      description: "Get configured domains for the sub-account: custom domains, CNAME records, SSL status.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  handlers: {
    ghl_browser_get_location_settings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "location-settings", async () => {
          await gotoGhl(page, "/settings/location");
          await waitForAppReady(page);
          const settings = await page.evaluate(() => {
            const items: Record<string, string> = {};
            document
              .querySelectorAll('input, select, textarea, [class*="field"], [class*="row"]')
              .forEach((el) => {
                const labelEl = (el as HTMLElement).closest("label, [class*='row'], [class*='field']")
                  ?.querySelector('[class*="label"], [class*="title"], span');
                const label = labelEl?.textContent?.trim() ?? (el as HTMLInputElement).name ?? "";
                const value =
                  (el as HTMLInputElement).value ??
                  el.querySelector('[class*="value"]')?.textContent?.trim() ??
                  "";
                if (label.length > 1 && value.length > 0) items[label] = value;
              });
            return items;
          });
          return { settingCount: Object.keys(settings).length, settings };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_location_settings: async (args) => {
      const setting = String(args.setting);
      const value = String(args.value);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "location-settings-update", async () => {
          await gotoGhl(page, "/settings/location");
          await waitForAppReady(page);
          const input = page
            .locator(`label:has-text("${setting}"), [class*="field"]:has-text("${setting}")`)
            .first()
            .locator('input, select, textarea')
            .first();
          await input.fill(value).catch(async () => {
            await input.click();
            await page.locator(`[role="option"]:has-text("${value}")`).first().click({ timeout: 3000 }).catch(() => {});
          });
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { setting, value, updated: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_location_features: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "location-features", async () => {
          await gotoGhl(page, "/settings/location");
          await waitForAppReady(page);
          const featuresTab = page
            .locator('[role="tab"]:has-text("Features"), button:has-text("Features"), a:has-text("Features")')
            .first();
          await featuresTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const features = await page.evaluate(() => {
            const items: Array<{ name: string; enabled: boolean }> = [];
            document
              .querySelectorAll('input[type="checkbox"], [role="switch"], [role="checkbox"]')
              .forEach((el) => {
                const label =
                  (el as HTMLElement).closest("label, [class*='row'], [class*='item']")?.textContent?.trim()?.slice(0, 80) ?? "";
                const checked =
                  (el as HTMLInputElement).checked ||
                  el.getAttribute("aria-checked") === "true";
                if (label.length > 1) items.push({ name: label, enabled: checked });
              });
            return items;
          });
          return { count: features.length, features };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_toggle_location_feature: async (args) => {
      const feature = String(args.feature);
      const enabled = Boolean(args.enabled);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "location-feature-toggle", async () => {
          await gotoGhl(page, "/settings/location");
          await waitForAppReady(page);
          const featuresTab = page
            .locator('[role="tab"]:has-text("Features"), button:has-text("Features")')
            .first();
          await featuresTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const row = page
            .locator(`label:has-text("${feature}"), [class*="row"]:has-text("${feature}"), [class*="item"]:has-text("${feature}")`)
            .first();
          const toggle = row
            .locator('input[type="checkbox"], [role="switch"], [role="checkbox"]')
            .first();
          const current = await toggle.isChecked().catch(() => false);
          if (current !== enabled) {
            await toggle.click();
            await waitForAppReady(page);
          }
          return { feature, enabled, toggled: current !== enabled };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_location_domains: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "location-domains", async () => {
          await gotoGhl(page, "/settings/location");
          await waitForAppReady(page);
          const domainsTab = page
            .locator('[role="tab"]:has-text("Domain"), button:has-text("Domain"), a:has-text("Domain")')
            .first();
          await domainsTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const domains = await page.evaluate(() => {
            const items: Array<{ domain: string; type: string; status: string; ssl: string }> = [];
            document
              .querySelectorAll('tr, [class*="domain"], [class*="row"], [role="row"]')
              .forEach((el) => {
                const domainEl = el.querySelector('[class*="domain"], [class*="name"], a, td:first-child');
                if (domainEl && (domainEl.textContent?.trim().length ?? 0) > 3) {
                  items.push({
                    domain: domainEl.textContent?.trim() ?? "",
                    type: el.querySelector('[class*="type"], [class*="category"]')?.textContent?.trim() ?? "",
                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    ssl: el.querySelector('[class*="ssl"], [class*="cert"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: domains.length, domains };
        });
      } finally {
        await close();
      }
    },
  },
};
