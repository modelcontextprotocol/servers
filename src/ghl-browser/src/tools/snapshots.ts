import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError, asString } from "../helpers.js";

export const snapshotModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_snapshots",
      description:
        "List available account snapshots (templates). Returns name, description, creation date, and included assets.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional search term" },
          type: {
            type: "string",
            description: "Filter by type: 'all' (default), 'agency', 'sub-account'",
          },
        },
      },
    },
    {
      name: "ghl_browser_create_snapshot",
      description:
        "Create a snapshot from the current sub-account, capturing workflows, funnels, pipelines, " +
        "calendars, campaigns, and other assets for reuse.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Snapshot name" },
          description: { type: "string", description: "Snapshot description" },
          includeAssets: {
            type: "string",
            description:
              "Comma-separated list of asset types to include: workflows, funnels, pipelines, campaigns, calendars, forms, emails, tags, custom_fields, triggers. Default: all",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_snapshot_details",
      description:
        "Get detailed information about a snapshot: included assets, creation date, and size.",
      inputSchema: {
        type: "object",
        properties: {
          snapshotName: { type: "string" },
          snapshotId: { type: "string", description: "Snapshot ID (preferred)" },
        },
      },
    },
    {
      name: "ghl_browser_load_snapshot",
      description:
        "Load (apply) a snapshot to a target sub-account. This will create or overwrite assets in the target.",
      inputSchema: {
        type: "object",
        properties: {
          snapshotName: { type: "string" },
          snapshotId: { type: "string" },
          targetAccountId: { type: "string", description: "Target sub-account ID" },
          targetAccountName: { type: "string", description: "Target sub-account name" },
          overwrite: {
            type: "boolean",
            description: "Whether to overwrite existing assets in the target (default: false)",
          },
        },
      },
    },
    {
      name: "ghl_browser_delete_snapshot",
      description:
        "Delete a snapshot. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          snapshotName: { type: "string" },
          snapshotId: { type: "string" },
          confirm: { type: "boolean", description: "Must be true to proceed" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_snapshots: async (args) => {
      const search = asString(args.search);
      const type = asString(args.type) || "all";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snapshots-list", async () => {
          await gotoGhl(page, "/snapshots");
          await waitForAppReady(page);

          if (search) {
            const searchInput = page
              .locator('input[placeholder*="Search"], input[type="search"]')
              .first();
            try {
              await searchInput.fill(search, { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // search not available
            }
          }

          const snapshots = await page.evaluate(() => {
            const items: Array<{
              name: string;
              description: string;
              type: string;
              date: string;
              assets: string;
              id: string;
            }> = [];
            const rowSelectors = [
              '[class*="SnapshotCard"]',
              '[class*="snapshot-card"]',
              '[class*="SnapshotRow"]',
              "tr[data-row-key]",
              '[class*="ListRow"]',
              '[data-testid*="snapshot"]',
            ];
            for (const sel of rowSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const nameEl = el.querySelector(
                  "h3, h4, [class*='name'], [class*='Name'], td:first-child",
                );
                const descEl = el.querySelector(
                  "[class*='desc'], [class*='Desc'], p, small, td:nth-child(2)",
                );
                const typeEl = el.querySelector(
                  "[class*='type'], [class*='Type'], [class*='badge']",
                );
                const dateEl = el.querySelector(
                  "[class*='date'], [class*='Date'], [class*='created'], time",
                );
                const assetEl = el.querySelector(
                  "[class*='asset'], [class*='Asset'], [class*='includes']",
                );
                const id =
                  el.getAttribute("data-row-key") ||
                  el.getAttribute("data-id") ||
                  "";
                items.push({
                  name: nameEl?.textContent?.trim() || "",
                  description: descEl?.textContent?.trim() || "",
                  type: typeEl?.textContent?.trim() || "",
                  date: dateEl?.textContent?.trim() || "",
                  assets: assetEl?.textContent?.trim() || "",
                  id,
                });
              });
            }
            return items;
          });

          const deduped = Array.from(
            new Map(snapshots.map((s) => [s.id || s.name, s])).values(),
          );
          return { count: deduped.length, snapshots: deduped };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_snapshot: async (args) => {
      const name = asString(args.name);
      const description = asString(args.description);
      const includeAssets = asString(args.includeAssets);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snapshots-create", async () => {
          await gotoGhl(page, "/snapshots");
          await waitForAppReady(page);

          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")')
            .first();
          await createBtn.click();
          await page.waitForTimeout(1000);

          const nameInput = page
            .locator('input[name="name"], input[placeholder*="Name"]')
            .first();
          await nameInput.fill(name);

          if (description) {
            const descInput = page
              .locator('textarea[name="description"], input[placeholder*="Description"], textarea')
              .first();
            try {
              await descInput.fill(description, { timeout: 3000 });
            } catch {
              // description may not be available
            }
          }

          if (includeAssets) {
            const assetTypes = includeAssets.split(",").map((a) => a.trim());
            for (const assetType of assetTypes) {
              const checkbox = page
                .locator(
                  `label:has-text("${assetType}") input[type="checkbox"], ` +
                    `[class*="asset"]:has-text("${assetType}") input, ` +
                    `[class*="option"]:has-text("${assetType}")`,
                )
                .first();
              try {
                await checkbox.click({ timeout: 2000 });
              } catch {
                // asset type checkbox may not exist
              }
            }
          }

          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Capture")')
            .first();
          await saveBtn.click();
          await waitForAppReady(page);

          return { name, description, includeAssets, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_snapshot_details: async (args) => {
      const name = asString(args.snapshotName);
      const id = asString(args.snapshotId);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snapshots-details", async () => {
          if (id) {
            await gotoGhl(page, `/snapshots/${id}`);
          } else if (name) {
            await gotoGhl(page, "/snapshots");
            await waitForAppReady(page);
            await page
              .locator(`a:has-text("${name}"), [class*="card"]:has-text("${name}")`)
              .first()
              .click();
          } else {
            throw new Error("snapshotName or snapshotId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const details = await page.evaluate(() => {
            const info: Record<string, string> = {};
            document.querySelectorAll("input, [class*='info'] span, dt, dd").forEach((el) => {
              const label =
                el.getAttribute("name") ||
                el.getAttribute("placeholder") ||
                el.closest("dt")?.textContent?.trim() ||
                "";
              const value =
                (el as HTMLInputElement).value || el.textContent?.trim() || "";
              if (label && value && value.length < 200) info[label] = value;
            });

            const assets: Array<{ type: string; count: string; included: boolean }> = [];
            document
              .querySelectorAll(
                '[class*="asset-item"], [class*="AssetItem"], [class*="asset-row"], ' +
                  'label:has(input[type="checkbox"]), tr:has(td)',
              )
              .forEach((el) => {
                const typeEl = el.querySelector("[class*='type'], [class*='name'], span, td:first-child");
                const countEl = el.querySelector("[class*='count'], td:nth-child(2)");
                const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                const typeName = typeEl?.textContent?.trim();
                if (typeName) {
                  assets.push({
                    type: typeName,
                    count: countEl?.textContent?.trim() || "",
                    included: checkbox ? checkbox.checked : true,
                  });
                }
              });

            return {
              title:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
              info,
              assets,
            };
          });

          return {
            snapshotId: id || null,
            snapshotName: name || details.title || null,
            info: details.info,
            assets: details.assets,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_load_snapshot: async (args) => {
      const name = asString(args.snapshotName);
      const id = asString(args.snapshotId);
      const targetId = asString(args.targetAccountId);
      const targetName = asString(args.targetAccountName);
      const overwrite = Boolean(args.overwrite);
      if (!name && !id) throw new Error("snapshotName or snapshotId is required");
      if (!targetId && !targetName) throw new Error("targetAccountId or targetAccountName is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snapshots-load", async () => {
          await gotoGhl(page, "/snapshots");
          await waitForAppReady(page);

          const cardSelector = id
            ? `[data-id="${id}"], tr[data-row-key="${id}"]`
            : `[class*="card"]:has-text("${name}"), tr:has-text("${name}")`;

          const card = page.locator(cardSelector).first();
          const loadBtn = card
            .locator('button:has-text("Load"), button:has-text("Apply"), button:has-text("Deploy")')
            .first();
          try {
            await loadBtn.click({ timeout: 5000 });
          } catch {
            const menuBtn = card
              .locator('button:has-text("⋮"), button:has-text("⋯"), [class*="menu"]')
              .first();
            await menuBtn.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            await page
              .locator('text="Load", text="Apply", text="Deploy"')
              .first()
              .click({ timeout: 5000 });
          }
          await page.waitForTimeout(1500);

          const targetInput = page
            .locator(
              'input[placeholder*="Search"], input[placeholder*="account"], input[placeholder*="Account"], [class*="search"] input',
            )
            .first();
          try {
            await targetInput.fill(targetName || targetId, { timeout: 5000 });
            await page.waitForTimeout(1000);
            await page
              .locator(
                `[class*="option"]:has-text("${targetName || targetId}"), [class*="result"]:has-text("${targetName || targetId}")`,
              )
              .first()
              .click({ timeout: 5000 });
          } catch {
            // target selector may work differently
          }

          if (overwrite) {
            const overwriteToggle = page
              .locator(
                'label:has-text("Overwrite"), [class*="overwrite"], input[name="overwrite"]',
              )
              .first();
            try {
              await overwriteToggle.click({ timeout: 3000 });
            } catch {
              // overwrite option may not be present
            }
          }

          const confirmBtn = page
            .locator('button:has-text("Load"), button:has-text("Confirm"), button:has-text("Apply")')
            .first();
          await confirmBtn.click({ timeout: 10000 });
          await page.waitForTimeout(3000);

          return {
            snapshotName: name,
            snapshotId: id,
            targetAccountId: targetId,
            targetAccountName: targetName,
            overwrite,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_snapshot: async (args) => {
      const name = asString(args.snapshotName);
      const id = asString(args.snapshotId);
      const confirm = Boolean(args.confirm);
      if (!confirm) throw new Error("confirm must be true to delete a snapshot");
      if (!name && !id) throw new Error("snapshotName or snapshotId is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "snapshots-delete", async () => {
          await gotoGhl(page, "/snapshots");
          await waitForAppReady(page);

          const rowSelector = id
            ? `tr[data-row-key="${id}"], [data-id="${id}"]`
            : `[class*="card"]:has-text("${name}"), [class*="row"]:has-text("${name}"), tr:has-text("${name}")`;

          const row = page.locator(rowSelector).first();
          const menuBtn = row
            .locator('button:has-text("⋮"), button:has-text("⋯"), [class*="menu"], [class*="actions"] button')
            .first();
          await menuBtn.click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const deleteOption = page
            .locator('text="Delete", text="delete", [class*="delete"]')
            .first();
          await deleteOption.click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const confirmBtn = page
            .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
            .first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);

          return { snapshotName: name, snapshotId: id, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
