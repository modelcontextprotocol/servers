import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const communitiesModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_communities",
      description: "List communities/groups with name, member count, and status.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_create_community",
      description: "Create a new community/group with name and description.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          privacy: { type: "string", description: "public, private, or secret" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_community_details",
      description: "Get community details: members, posts count, categories, and settings.",
      inputSchema: {
        type: "object",
        properties: { communityName: { type: "string" } },
        required: ["communityName"],
      },
    },
    {
      name: "ghl_browser_list_community_members",
      description: "List members of a community with name, role, and join date.",
      inputSchema: {
        type: "object",
        properties: { communityName: { type: "string" } },
        required: ["communityName"],
      },
    },
    {
      name: "ghl_browser_delete_community",
      description: "Delete a community.",
      inputSchema: {
        type: "object",
        properties: { communityName: { type: "string" }, confirm: { type: "boolean" } },
        required: ["communityName", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_communities: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "communities-list", async () => {
          await gotoGhl(page, "/communities");
          await waitForAppReady(page);
          const rows = await page.evaluate(() => {
            const items: Array<{ name: string; members: string; posts: string; status: string }> = [];
            document.querySelectorAll('[class*="community"], [class*="group"], tr, [class*="card"], [role="row"]').forEach((el) => {
              const nameEl = el.querySelector('a, h3, h4, [class*="name"]');
              if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                items.push({
                  name: nameEl.textContent?.trim() ?? "",
                  members: el.querySelector('[class*="member"], [class*="count"]')?.textContent?.trim() || "",
                  posts: el.querySelector('[class*="post"]')?.textContent?.trim() || "",
                  status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
                });
              }
            });
            return items;
          });
          return { count: rows.length, rows };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_community: async (args) => {
      const name = String(args.name);
      const description = (args.description as string) || "";
      const privacy = (args.privacy as string) || "private";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "communities-create", async () => {
          await gotoGhl(page, "/communities");
          await waitForAppReady(page);
          await page.locator('button:has-text("Create"), button:has-text("New")').first().click();
          await waitForAppReady(page);
          await page.locator('input[name="name"], input[placeholder*="Name"]').first().fill(name);
          if (description) {
            try { await page.locator('textarea, [contenteditable="true"]').first().fill(description); } catch { /* optional */ }
          }
          await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
          await waitForAppReady(page);
          return { name, privacy, description: description || null, created: true, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_community_details: async (args) => {
      const communityName = String(args.communityName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "communities-detail", async () => {
          await gotoGhl(page, "/communities");
          await waitForAppReady(page);
          await page.locator(`a:has-text("${communityName}"), [class*="name"]:has-text("${communityName}")`).first().click();
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const fields: Record<string, string> = {};
            document.querySelectorAll('[class*="field"], label, dt').forEach((el) => {
              const label = el.textContent?.trim() || "";
              const valueEl = el.parentElement?.querySelector('[class*="value"], dd, span');
              if (label && valueEl) fields[label] = valueEl.textContent?.trim() || "";
            });
            return fields;
          });
          return { communityName, fields: details, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_list_community_members: async (args) => {
      const communityName = String(args.communityName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "communities-members", async () => {
          await gotoGhl(page, "/communities");
          await waitForAppReady(page);
          await page.locator(`a:has-text("${communityName}"), [class*="name"]:has-text("${communityName}")`).first().click();
          await waitForAppReady(page);
          try { await page.locator('button:has-text("Members"), [role="tab"]:has-text("Members")').first().click({ timeout: 3000 }); } catch { /* tab may not exist */ }
          await waitForAppReady(page);
          const rows = await page.evaluate(() => {
            const items: Array<{ name: string; role: string; joined: string }> = [];
            document.querySelectorAll('tr, [class*="member"], [class*="row"], [role="row"]').forEach((el) => {
              const nameEl = el.querySelector('[class*="name"], td:first-child');
              if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                items.push({
                  name: nameEl.textContent?.trim() ?? "",
                  role: el.querySelector('[class*="role"], [class*="badge"]')?.textContent?.trim() || "",
                  joined: el.querySelector('[class*="date"], [class*="joined"]')?.textContent?.trim() || "",
                });
              }
            });
            return items;
          });
          return { communityName, count: rows.length, rows };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_community: async (args) => {
      const communityName = String(args.communityName);
      if (!args.confirm) throw new Error("confirm: true is required to delete a community");
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "communities-delete", async () => {
          await gotoGhl(page, "/communities");
          await waitForAppReady(page);
          const row = page.locator(`[class*="row"]:has-text("${communityName}"), [class*="community"]:has-text("${communityName}")`).first();
          await row.locator('button:has-text("Delete"), [aria-label*="delete"]').first().click();
          await page.locator('button:has-text("Confirm"), button:has-text("Delete")').first().click();
          await waitForAppReady(page);
          return { communityName, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
