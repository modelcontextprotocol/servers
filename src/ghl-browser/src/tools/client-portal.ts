import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const clientPortalModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_client_portal_settings",
      description: "Get client portal settings: enabled, branding, URL, access control.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_update_client_portal",
      description: "Update client portal settings: branding, colors, logo, welcome message.",
      inputSchema: {
        type: "object",
        properties: {
          welcomeMessage: { type: "string", description: "Welcome message for portal users" },
          primaryColor: { type: "string", description: "Primary brand color hex code" },
          enabled: { type: "boolean", description: "Enable or disable the client portal" },
        },
      },
    },
    {
      name: "ghl_browser_list_client_portal_users",
      description: "List contacts with client portal access: name, email, last login.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_get_client_portal_url",
      description: "Get the client portal URL for sharing with contacts.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_client_portal_pages",
      description: "List client portal pages/sections: dashboard, invoices, documents, etc.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_client_portal_settings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "client-portal-settings", async () => {
          await gotoGhl(page, "/settings/client-portal");
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
            const toggle = document.querySelector(
              'input[type="checkbox"][class*="toggle"], [role="switch"]',
            );
            return {
              enabled:
                toggle?.getAttribute("aria-checked") === "true" ||
                (toggle as HTMLInputElement)?.checked === true,
              url: getVal("url") || getVal("portal url"),
              welcomeMessage: getVal("welcome") || getVal("message"),
              primaryColor: getVal("color") || getVal("primary"),
              logo: getVal("logo"),
              accessControl: getVal("access"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_client_portal: async (args) => {
      const welcomeMessage = args.welcomeMessage as string | undefined;
      const primaryColor = args.primaryColor as string | undefined;
      const enabled = args.enabled as boolean | undefined;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "client-portal-update", async () => {
          await gotoGhl(page, "/settings/client-portal");
          await waitForAppReady(page);
          if (welcomeMessage) {
            const msgInput = page
              .locator('textarea, input[placeholder*="welcome"], input[placeholder*="message"]')
              .first();
            await msgInput.fill(welcomeMessage).catch(() => {});
          }
          if (primaryColor) {
            const colorInput = page.locator('input[type="color"]').first();
            await colorInput.fill(primaryColor).catch(() => {});
          }
          if (enabled !== undefined) {
            const toggle = page
              .locator('input[type="checkbox"][class*="toggle"], [role="switch"]')
              .first();
            const isChecked =
              (await toggle.getAttribute("aria-checked")) === "true" ||
              (await toggle.isChecked().catch(() => false));
            if (isChecked !== enabled) {
              await toggle.click({ timeout: 5000 });
            }
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { welcomeMessage, primaryColor, enabled, updated: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_client_portal_users: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "client-portal-users", async () => {
          await gotoGhl(page, "/settings/client-portal");
          await waitForAppReady(page);
          const usersTab = page
            .locator('a:has-text("Users"), button:has-text("Users"), [class*="tab"]:has-text("User"), a:has-text("Access")')
            .first();
          await usersTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const users = await page.evaluate(() => {
            const items: Array<{
              name: string;
              email: string;
              lastLogin: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="user"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="contact"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    email:
                      el.querySelector('[class*="email"]')?.textContent?.trim() ?? "",
                    lastLogin:
                      el.querySelector('[class*="login"], [class*="last"], [class*="date"], time')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { count: users.length, users };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_client_portal_url: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "client-portal-url", async () => {
          await gotoGhl(page, "/settings/client-portal");
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const urlEl = document.querySelector(
              '[class*="url"] a, [class*="link"] a, input[readonly], [class*="portal-url"]',
            );
            return {
              url:
                (urlEl as HTMLInputElement)?.value ??
                urlEl?.getAttribute("href") ??
                urlEl?.textContent?.trim() ??
                "",
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_client_portal_pages: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "client-portal-pages", async () => {
          await gotoGhl(page, "/settings/client-portal");
          await waitForAppReady(page);
          const pagesTab = page
            .locator('a:has-text("Pages"), button:has-text("Pages"), [class*="tab"]:has-text("Page"), a:has-text("Sections")')
            .first();
          await pagesTab.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const pages = await page.evaluate(() => {
            const items: Array<{
              name: string;
              enabled: string;
              description: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="page"], [class*="section"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  const toggle = el.querySelector('input[type="checkbox"], [role="switch"]');
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    enabled:
                      toggle?.getAttribute("aria-checked") ??
                      (toggle as HTMLInputElement)?.checked ? "true" :
                      el.querySelector('[class*="status"]')?.textContent?.trim() ?? "",
                    description:
                      el.querySelector('[class*="desc"], p')?.textContent?.trim()?.slice(0, 150) ?? "",
                  });
                }
              });
            return items;
          });
          return { count: pages.length, pages };
        });
      } finally {
        await close();
      }
    },
  },
};
