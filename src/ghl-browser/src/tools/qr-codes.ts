import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const qrCodesModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_qr_codes",
      description: "List QR codes with name, destination URL, scan count, and date created.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by QR code name" },
        },
      },
    },
    {
      name: "ghl_browser_get_qr_code_details",
      description: "Get details of a specific QR code: destination, design, scan analytics.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "QR code name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_qr_code",
      description: "Create a new QR code with destination URL and optional custom name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "QR code name" },
          destination: { type: "string", description: "Destination URL" },
          funnelPage: { type: "string", description: "Or link to a specific funnel page name" },
        },
        required: [],
      },
    },
    {
      name: "ghl_browser_get_qr_code_analytics",
      description: "Get scan analytics for a QR code: total scans, daily breakdown, devices.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "QR code name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_qr_code",
      description: "Delete a QR code by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "QR code name to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_qr_codes: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "qr-list", async () => {
          await gotoGhl(page, "/qr-codes");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const codes = await page.evaluate(() => {
            const items: Array<{
              name: string;
              destination: string;
              scans: string;
              created: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="qr"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    destination:
                      el.querySelector('[class*="url"], [class*="destination"], [class*="link"]')?.textContent?.trim() ?? "",
                    scans:
                      el.querySelector('[class*="scan"], [class*="count"]')?.textContent?.trim() ?? "",
                    created:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, count: codes.length, qrCodes: codes };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_qr_code_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "qr-details", async () => {
          await gotoGhl(page, "/qr-codes");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="qr"]:has-text("${name}"), a:has-text("${name}")`)
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
              destination: getVal("destination") || getVal("url") || getVal("link"),
              totalScans: getVal("scans") || getVal("total"),
              design: getVal("design") || getVal("style"),
              color: getVal("color"),
              created: getVal("created") || getVal("date"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_qr_code: async (args) => {
      const name = (args.name as string) || "";
      const destination = (args.destination as string) || "";
      const funnelPage = (args.funnelPage as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "qr-create", async () => {
          await gotoGhl(page, "/qr-codes");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          if (name) {
            const nameInput = page
              .locator('input[name="name"], input[placeholder*="name"]')
              .first();
            await nameInput.fill(name).catch(() => {});
          }
          if (destination) {
            const urlInput = page
              .locator('input[placeholder*="url"], input[placeholder*="destination"], input[name="url"]')
              .first();
            await urlInput.fill(destination).catch(() => {});
          }
          if (funnelPage) {
            const funnelSelect = page
              .locator(`[class*="funnel"]:has-text("${funnelPage}"), option:has-text("${funnelPage}")`)
              .first();
            await funnelSelect.click({ timeout: 3000 }).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, destination, funnelPage, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_qr_code_analytics: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "qr-analytics", async () => {
          await gotoGhl(page, "/qr-codes");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="qr"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const analyticsTab = page
            .locator('a:has-text("Analytics"), button:has-text("Analytics"), [class*="tab"]:has-text("Analytic")')
            .first();
          await analyticsTab.click({ timeout: 5000 }).catch(() => {});
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
              totalScans: getKpi("total") || getKpi("scans"),
              uniqueScans: getKpi("unique"),
              today: getKpi("today"),
              thisWeek: getKpi("week"),
              mobile: getKpi("mobile"),
              desktop: getKpi("desktop"),
            };
          });
          return { name, analytics: data };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_qr_code: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this QR code" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "qr-delete", async () => {
          await gotoGhl(page, "/qr-codes");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="qr"]:has-text("${name}")`)
            .first();
          const deleteBtn = row
            .locator('button:has-text("Delete"), button:has-text("delete"), [class*="delete"]')
            .first();
          await deleteBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { name, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
