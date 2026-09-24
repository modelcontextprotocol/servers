import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const brandBoardsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_brand_boards",
      description: "List brand boards with name, status, and last updated date.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by board name" },
        },
      },
    },
    {
      name: "ghl_browser_get_brand_board_details",
      description: "Get details of a brand board: colors, fonts, logos, images.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Brand board name" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_create_brand_board",
      description: "Create a new brand board with name and optional color palette.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Brand board name" },
          primaryColor: { type: "string", description: "Primary brand color (hex)" },
          secondaryColor: { type: "string", description: "Secondary brand color (hex)" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_set_brand_colors",
      description: "Update the color palette on a brand board.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Brand board name" },
          primaryColor: { type: "string", description: "Primary color (hex)" },
          secondaryColor: { type: "string", description: "Secondary color (hex)" },
          accentColor: { type: "string", description: "Accent color (hex)" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_brand_board",
      description: "Delete a brand board by name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Brand board name to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" },
        },
        required: ["name", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_brand_boards: async (args) => {
      const search = (args.search as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "brand-list", async () => {
          await gotoGhl(page, "/brand-boards");
          await waitForAppReady(page);
          if (search) {
            const searchInput = page
              .locator('input[type="search"], input[placeholder*="search"]')
              .first();
            await searchInput.fill(search).catch(() => {});
            await waitForAppReady(page);
          }
          const boards = await page.evaluate(() => {
            const items: Array<{
              name: string;
              status: string;
              updated: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="brand"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector(
                  '[class*="name"], [class*="title"], a, td:first-child',
                );
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    name: nameEl.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    updated:
                      el.querySelector('[class*="date"], time')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { search, count: boards.length, brandBoards: boards };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_brand_board_details: async (args) => {
      const name = String(args.name);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "brand-details", async () => {
          await gotoGhl(page, "/brand-boards");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="brand"]:has-text("${name}"), a:has-text("${name}")`)
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
            const colors = Array.from(
              document.querySelectorAll('[class*="color"], [style*="background"]'),
            ).map((el) => ({
              hex: el.getAttribute("data-color") || el.getAttribute("style")?.match(/#[0-9a-fA-F]{6}/)?.[0] || "",
              label: el.getAttribute("title") || el.textContent?.trim() || "",
            })).filter((c) => c.hex);
            return {
              name:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              primaryFont: getVal("primary font") || getVal("heading"),
              secondaryFont: getVal("secondary font") || getVal("body"),
              logo: document.querySelector('[class*="logo"] img')?.getAttribute("src") ?? "",
              colors,
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_brand_board: async (args) => {
      const name = String(args.name);
      const primaryColor = (args.primaryColor as string) || "";
      const secondaryColor = (args.secondaryColor as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "brand-create", async () => {
          await gotoGhl(page, "/brand-boards");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page
            .locator('input[name="name"], input[placeholder*="name"]')
            .first();
          await nameInput.fill(name).catch(() => {});
          if (primaryColor) {
            const colorInput = page.locator('input[type="color"]').first();
            await colorInput.fill(primaryColor).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, primaryColor, secondaryColor, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_set_brand_colors: async (args) => {
      const name = String(args.name);
      const primaryColor = (args.primaryColor as string) || "";
      const secondaryColor = (args.secondaryColor as string) || "";
      const accentColor = (args.accentColor as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "brand-colors", async () => {
          await gotoGhl(page, "/brand-boards");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="brand"]:has-text("${name}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const editBtn = page
            .locator('button:has-text("Edit"), button:has-text("Customize")')
            .first();
          await editBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const colorInputs = page.locator('input[type="color"]');
          if (primaryColor) await colorInputs.nth(0).fill(primaryColor).catch(() => {});
          if (secondaryColor) await colorInputs.nth(1).fill(secondaryColor).catch(() => {});
          if (accentColor) await colorInputs.nth(2).fill(accentColor).catch(() => {});
          const saveBtn = page
            .locator('button:has-text("Save"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, primaryColor, secondaryColor, accentColor, updated: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_brand_board: async (args) => {
      const name = String(args.name);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to delete this brand board" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "brand-delete", async () => {
          await gotoGhl(page, "/brand-boards");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${name}"), [class*="brand"]:has-text("${name}")`)
            .first();
          const deleteBtn = row
            .locator('button:has-text("Delete"), [class*="delete"]')
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
