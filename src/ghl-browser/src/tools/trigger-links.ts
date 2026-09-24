import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError, asString } from "../helpers.js";

export const triggerLinksModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_trigger_links",
      description:
        "List trigger (tracking) links. Returns link name, URL, click count, and associated action.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional search term" },
        },
      },
    },
    {
      name: "ghl_browser_create_trigger_link",
      description:
        "Create a new trigger link that fires an action (workflow, tag, pipeline update) when clicked.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Link name/label" },
          actionType: {
            type: "string",
            description:
              "Action to trigger: 'workflow', 'add_tag', 'remove_tag', 'update_pipeline', 'add_to_campaign', 'custom'",
          },
          actionValue: {
            type: "string",
            description: "Name or ID of the workflow/tag/pipeline/campaign to trigger",
          },
          redirectUrl: {
            type: "string",
            description: "URL to redirect the visitor to after the trigger fires",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_trigger_link_stats",
      description:
        "Get click analytics for a trigger link: total clicks, unique clicks, conversions, and recent activity.",
      inputSchema: {
        type: "object",
        properties: {
          linkName: { type: "string", description: "Trigger link name" },
          linkId: { type: "string", description: "Trigger link ID (preferred)" },
        },
      },
    },
    {
      name: "ghl_browser_update_trigger_link",
      description:
        "Update a trigger link's name, action, or redirect URL.",
      inputSchema: {
        type: "object",
        properties: {
          linkName: { type: "string" },
          linkId: { type: "string" },
          newName: { type: "string", description: "New name for the link" },
          redirectUrl: { type: "string", description: "New redirect URL" },
          enabled: { type: "boolean", description: "Enable or disable the link" },
        },
      },
    },
    {
      name: "ghl_browser_delete_trigger_link",
      description:
        "Delete a trigger link. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          linkName: { type: "string" },
          linkId: { type: "string" },
          confirm: { type: "boolean", description: "Must be true to proceed" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_trigger_links: async (args) => {
      const search = asString(args.search);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "triggers-list", async () => {
          await gotoGhl(page, "/triggers");
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

          const links = await page.evaluate(() => {
            const items: Array<{
              name: string;
              url: string;
              clicks: string;
              action: string;
              status: string;
              id: string;
            }> = [];
            const rowSelectors = [
              "tr[data-row-key]",
              '[class*="TriggerRow"]',
              '[class*="trigger-row"]',
              '[class*="ListRow"]',
              '[class*="table-row"]',
              '[data-testid*="trigger"]',
            ];
            for (const sel of rowSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const nameEl = el.querySelector(
                  "td:first-child, [class*='name'], [class*='Name'], h3, h4",
                );
                const urlEl = el.querySelector(
                  "[class*='url'], [class*='Url'], a[href], code, input[value]",
                );
                const clickEl = el.querySelector(
                  "[class*='click'], [class*='Click'], td:nth-child(3)",
                );
                const actionEl = el.querySelector(
                  "[class*='action'], [class*='Action'], td:nth-child(4), [class*='badge']",
                );
                const statusEl = el.querySelector(
                  "[class*='status'], [class*='Status'], [class*='badge']",
                );
                const id =
                  el.getAttribute("data-row-key") ||
                  el.getAttribute("data-id") ||
                  "";
                const urlValue =
                  (urlEl as HTMLInputElement)?.value ||
                  urlEl?.textContent?.trim() ||
                  urlEl?.getAttribute("href") ||
                  "";
                items.push({
                  name: nameEl?.textContent?.trim() || "",
                  url: urlValue,
                  clicks: clickEl?.textContent?.trim() || "",
                  action: actionEl?.textContent?.trim() || "",
                  status: statusEl?.textContent?.trim() || "",
                  id,
                });
              });
            }
            return items;
          });

          const deduped = Array.from(
            new Map(links.map((l) => [l.id || l.name || l.url, l])).values(),
          );
          return { count: deduped.length, triggerLinks: deduped };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_trigger_link: async (args) => {
      const name = asString(args.name);
      const actionType = asString(args.actionType);
      const actionValue = asString(args.actionValue);
      const redirectUrl = asString(args.redirectUrl);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "triggers-create", async () => {
          await gotoGhl(page, "/triggers");
          await waitForAppReady(page);

          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click();
          await page.waitForTimeout(1000);

          const nameInput = page
            .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="name"]')
            .first();
          await nameInput.fill(name);

          if (actionType) {
            const actionSelect = page
              .locator(
                '[class*="action"] [class*="select"], select[name*="action"], [class*="Action"] select',
              )
              .first();
            try {
              await actionSelect.click({ timeout: 5000 });
              await page
                .locator(
                  `[class*="option"]:has-text("${actionType}"), button:has-text("${actionType}")`,
                )
                .first()
                .click({ timeout: 3000 });
            } catch {
              // action selector may use different UI
            }
          }

          if (actionValue) {
            const valueInput = page
              .locator(
                '[class*="value"] input, input[name="actionValue"], input[placeholder*="Select"], [class*="search"] input',
              )
              .first();
            try {
              await valueInput.fill(actionValue, { timeout: 5000 });
              await page.waitForTimeout(500);
              await page
                .locator(`[class*="option"]:has-text("${actionValue}")`)
                .first()
                .click({ timeout: 3000 });
            } catch {
              // value selector may not need selection
            }
          }

          if (redirectUrl) {
            const redirectInput = page
              .locator(
                'input[name="redirectUrl"], input[placeholder*="Redirect"], input[placeholder*="URL"]',
              )
              .first();
            try {
              await redirectInput.fill(redirectUrl, { timeout: 3000 });
            } catch {
              // redirect may not be available
            }
          }

          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create")')
            .first();
          await saveBtn.click();
          await waitForAppReady(page);

          return { name, actionType, actionValue, redirectUrl, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_trigger_link_stats: async (args) => {
      const name = asString(args.linkName);
      const id = asString(args.linkId);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "triggers-stats", async () => {
          if (id) {
            await gotoGhl(page, `/triggers/${id}`);
          } else if (name) {
            await gotoGhl(page, "/triggers");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`).first().click();
          } else {
            throw new Error("linkName or linkId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const stats = await page.evaluate(() => {
            const metrics: Record<string, string> = {};
            document
              .querySelectorAll(
                '[class*="stat"], [class*="Stat"], [class*="metric"], [class*="Metric"], [class*="card"]',
              )
              .forEach((el) => {
                const labelEl = el.querySelector(
                  "[class*='label'], [class*='Label'], small, span:first-child",
                );
                const valueEl = el.querySelector(
                  "[class*='value'], [class*='Value'], h2, h3, strong",
                );
                const label = labelEl?.textContent?.trim();
                const value = valueEl?.textContent?.trim();
                if (label && value) metrics[label] = value;
              });

            const activity: Array<{ date: string; contact: string; action: string }> = [];
            document
              .querySelectorAll(
                '[class*="activity-row"], [class*="ActivityRow"], tr:has([class*="click"])',
              )
              .forEach((el) => {
                const dateEl = el.querySelector("td:first-child, [class*='date']");
                const contactEl = el.querySelector("td:nth-child(2), [class*='contact']");
                const actionEl = el.querySelector("td:nth-child(3), [class*='action']");
                activity.push({
                  date: dateEl?.textContent?.trim() || "",
                  contact: contactEl?.textContent?.trim() || "",
                  action: actionEl?.textContent?.trim() || "",
                });
              });

            return { metrics, recentActivity: activity };
          });

          return {
            linkName: name,
            linkId: id,
            metrics: stats.metrics,
            recentActivity: stats.recentActivity,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_trigger_link: async (args) => {
      const name = asString(args.linkName);
      const id = asString(args.linkId);
      const newName = asString(args.newName);
      const redirectUrl = asString(args.redirectUrl);
      const enabled = args.enabled;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "triggers-update", async () => {
          if (id) {
            await gotoGhl(page, `/triggers/${id}`);
          } else if (name) {
            await gotoGhl(page, "/triggers");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("linkName or linkId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(1500);

          if (newName) {
            const nameInput = page
              .locator('input[name="name"], input[placeholder*="Name"]')
              .first();
            try {
              await nameInput.fill(newName, { timeout: 5000 });
            } catch {
              // name may not be editable here
            }
          }

          if (redirectUrl) {
            const redirectInput = page
              .locator('input[name="redirectUrl"], input[placeholder*="Redirect"]')
              .first();
            try {
              await redirectInput.fill(redirectUrl, { timeout: 3000 });
            } catch {
              // redirect may not exist
            }
          }

          if (typeof enabled === "boolean") {
            const toggle = page
              .locator('[class*="toggle"], [class*="switch"], input[type="checkbox"]')
              .first();
            try {
              const isChecked = await toggle.isChecked().catch(() => false);
              if (isChecked !== enabled) {
                await toggle.click({ timeout: 3000 });
              }
            } catch {
              // toggle may not be present
            }
          }

          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
          try {
            await saveBtn.click({ timeout: 5000 });
            await page.waitForTimeout(1500);
          } catch {
            // auto-save may be enabled
          }

          return { linkName: name, linkId: id, newName, redirectUrl, enabled, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_trigger_link: async (args) => {
      const name = asString(args.linkName);
      const id = asString(args.linkId);
      const confirm = Boolean(args.confirm);
      if (!confirm) throw new Error("confirm must be true to delete a trigger link");
      if (!name && !id) throw new Error("linkName or linkId is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "triggers-delete", async () => {
          await gotoGhl(page, "/triggers");
          await waitForAppReady(page);

          const rowSelector = id
            ? `tr[data-row-key="${id}"], [data-id="${id}"]`
            : `[class*="row"]:has-text("${name}"), tr:has-text("${name}")`;

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

          return { linkName: name, linkId: id, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
