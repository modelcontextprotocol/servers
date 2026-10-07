import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const yextModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_get_yext_overview",
      description: "Get Yext listings overview: connected status, listing count, suppression status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_list_yext_listings",
      description: "List Yext directory listings with name, status, and data accuracy.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter: live, suppressed, pending" },
        },
      },
    },
    {
      name: "ghl_browser_get_yext_listing_details",
      description: "Get detailed info for a specific Yext listing: data accuracy, issues.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Listing/directory name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_yext_listing_score",
      description: "Get the listing accuracy score and breakdown across directories.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "ghl_browser_sync_yext_listings",
      description: "Trigger a sync of business data to all connected Yext directories.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  handlers: {
    ghl_browser_get_yext_overview: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "yext-overview", async () => {
          await gotoGhl(page, "/yext");
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
              connected: getVal("status") || getVal("connected"),
              totalListings: getKpi("listings") || getKpi("total"),
              liveListings: getKpi("live"),
              suppressed: getKpi("suppressed"),
              accuracyScore: getKpi("accuracy") || getKpi("score"),
              issues: getKpi("issues"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_yext_listings: async (args) => {
      const status = (args.status as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "yext-listings", async () => {
          await gotoGhl(page, "/yext");
          await waitForAppReady(page);
          const listings = await page.evaluate((st) => {
            const items: Array<{
              name: string;
              status: string;
              accuracy: string;
              issues: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="listing"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="directory"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  const rowStatus =
                    el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "";
                  if (st && !rowStatus.toLowerCase().includes(st.toLowerCase())) return;
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    status: rowStatus,
                    accuracy:
                      el.querySelector('[class*="accuracy"], [class*="score"]')?.textContent?.trim() ?? "",
                    issues:
                      el.querySelector('[class*="issue"], [class*="error"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, status);
          return { status, count: listings.length, listings };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_yext_listing_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "yext-listing-details", async () => {
          await gotoGhl(page, "/yext");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="listing"]:has-text("${name}"), a:has-text("${name}")`)
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
              directory:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              status: getVal("status"),
              url: getVal("url") || getVal("link"),
              accuracy: getVal("accuracy") || getVal("score"),
              lastSync: getVal("last sync") || getVal("synced"),
              issues: getVal("issues"),
              businessName: getVal("business name"),
              address: getVal("address"),
              phone: getVal("phone"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_yext_listing_score: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "yext-score", async () => {
          await gotoGhl(page, "/yext");
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
              overallScore: getKpi("overall") || getKpi("score") || getKpi("accuracy"),
              complete: getKpi("complete"),
              incomplete: getKpi("incomplete"),
              duplicate: getKpi("duplicate"),
              suppressed: getKpi("suppressed"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_sync_yext_listings: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "yext-sync", async () => {
          await gotoGhl(page, "/yext");
          await waitForAppReady(page);
          const syncBtn = page
            .locator('button:has-text("Sync"), button:has-text("Update"), button:has-text("Push")')
            .first();
          await syncBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { synced: true };
        });
      } finally {
        await close();
      }
    },
  },
};
