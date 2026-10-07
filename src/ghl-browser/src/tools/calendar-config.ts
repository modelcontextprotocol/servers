import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError, asString, asNumber } from "../helpers.js";

export const calendarConfigModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_calendars",
      description:
        "List appointment calendars with name, type (simple/round_robin/group), " +
        "status, booking URL, and assigned user count.",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Optional search term to filter by name",
          },
        },
      },
    },
    {
      name: "ghl_browser_get_calendar_config",
      description:
        "Open a calendar and return its full configuration: slot duration, " +
        "availability windows (day-of-week, hours), buffer times, booking limits, " +
        "assigned users, and confirmation settings.",
      inputSchema: {
        type: "object",
        properties: {
          calendarName: { type: "string", description: "Calendar name" },
          calendarId: { type: "string", description: "Calendar ID (preferred if known)" },
        },
      },
    },
    {
      name: "ghl_browser_create_calendar",
      description:
        "Create a new appointment calendar. Supports simple (single user), " +
        "round-robin (rotates among users), and group (multiple users per slot) types.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Calendar name" },
          type: {
            type: "string",
            description: "'simple' (default), 'round_robin', or 'group'",
          },
          slotDuration: {
            type: "number",
            description: "Slot duration in minutes (default 30)",
          },
          description: { type: "string", description: "Calendar description shown on the booking page" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_update_availability",
      description:
        "Update the availability windows for a calendar: set open/close times per day of week. " +
        "Days not specified are treated as unavailable.",
      inputSchema: {
        type: "object",
        properties: {
          calendarName: { type: "string" },
          calendarId: { type: "string", description: "Calendar ID (preferred)" },
          availability: {
            type: "object",
            description:
              "Map of day names to time ranges. Example: " +
              '{ "monday": ["09:00-12:00", "13:00-17:00"], "tuesday": ["09:00-17:00"] }',
          },
          timezone: {
            type: "string",
            description: "IANA timezone for the calendar (e.g. 'America/New_York')",
          },
        },
        required: ["availability"],
      },
    },
    {
      name: "ghl_browser_assign_calendar_users",
      description:
        "Assign or remove users from a calendar. For round-robin calendars, this controls " +
        "the rotation pool. For group calendars, these are the participants.",
      inputSchema: {
        type: "object",
        properties: {
          calendarName: { type: "string" },
          calendarId: { type: "string", description: "Calendar ID (preferred)" },
          addUserNames: {
            type: "string",
            description: "Comma-separated user names to assign",
          },
          removeUserNames: {
            type: "string",
            description: "Comma-separated user names to remove",
          },
        },
      },
    },
    {
      name: "ghl_browser_get_booking_link",
      description:
        "Get the public booking URL for a calendar, suitable for sharing with leads " +
        "or embedding on a website.",
      inputSchema: {
        type: "object",
        properties: {
          calendarName: { type: "string" },
          calendarId: { type: "string", description: "Calendar ID (preferred)" },
        },
      },
    },
    {
      name: "ghl_browser_delete_calendar",
      description:
        "Delete an appointment calendar. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          calendarName: { type: "string" },
          calendarId: { type: "string", description: "Calendar ID (preferred)" },
          confirm: { type: "boolean", description: "Must be true to proceed with deletion" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_calendars: async (args) => {
      const search = asString(args.search);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "calendars-list", async () => {
          await gotoGhl(page, "/calendars");
          await waitForAppReady(page);

          if (search) {
            const searchInput = page
              .locator('input[placeholder*="Search"], input[type="search"], input[name="search"]')
              .first();
            try {
              await searchInput.fill(search, { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // search not available
            }
          }

          const calendars = await page.evaluate(() => {
            const items: Array<{
              name: string;
              type: string;
              status: string;
              bookingUrl: string;
              userCount: string;
              href: string;
            }> = [];
            const rowSelectors = [
              "tr[data-row-key]",
              '[class*="CalendarRow"]',
              '[class*="calendar-row"]',
              '[class*="calendar-item"]',
              '[class*="CalendarItem"]',
              '[class*="ListRow"]',
              'a[href*="calendar"]',
            ];
            for (const sel of rowSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const anchor = el.closest("a") || el.querySelector("a");
                const nameEl = el.querySelector("[class*='name'], [class*='Name'], h4, td:first-child");
                const typeEl = el.querySelector("[class*='type'], [class*='Type'], [class*='badge']");
                const statusEl = el.querySelector("[class*='status'], [class*='Status']");
                const linkEl = el.querySelector('a[href*="book"], [class*="link"], [class*="url"]');
                const userEl = el.querySelector("[class*='user'], [class*='User'], [class*='assign']");
                const href = anchor?.getAttribute("href") || "";
                items.push({
                  name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                  type: typeEl?.textContent?.trim() || "",
                  status: statusEl?.textContent?.trim() || "",
                  bookingUrl: linkEl?.getAttribute("href") || linkEl?.textContent?.trim() || "",
                  userCount: userEl?.textContent?.trim() || "",
                  href,
                });
              });
            }
            return items;
          });

          const deduped = Array.from(new Map(calendars.map((r) => [r.name, r])).values());
          return { count: deduped.length, calendars: deduped };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_calendar_config: async (args) => {
      const name = asString(args.calendarName);
      const id = asString(args.calendarId);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "calendar-config", async () => {
          if (id) {
            await gotoGhl(page, `/calendars/${id}`);
          } else if (name) {
            await gotoGhl(page, "/calendars");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`).first().click();
          } else {
            throw new Error("calendarName or calendarId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const config = await page.evaluate(() => {
            const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || "";

            const availability: Record<string, string[]> = {};
            const dayRows = document.querySelectorAll(
              '[class*="availability"] [class*="row"], ' +
                '[class*="Availability"] [class*="Row"], ' +
                '[class*="day-row"], ' +
                '[data-day]',
            );
            dayRows.forEach((el) => {
              const dayAttr = el.getAttribute("data-day") || "";
              const dayText = el.querySelector("[class*='day'], [class*='Day']")?.textContent?.trim() || dayAttr;
              const timeSlots: string[] = [];
              el.querySelectorAll('[class*="time"], [class*="Time"], input[type="time"]').forEach((t) => {
                const val = (t as HTMLInputElement).value || t.textContent?.trim();
                if (val) timeSlots.push(val);
              });
              if (dayText) availability[dayText.toLowerCase()] = timeSlots;
            });

            const assignedUsers: string[] = [];
            document
              .querySelectorAll('[class*="user-item"], [class*="UserItem"], [class*="assigned"] [class*="name"]')
              .forEach((el) => {
                const t = el.textContent?.trim();
                if (t) assignedUsers.push(t);
              });

            return {
              name: getText("h1, h2, [class*='title'], [class*='Title']"),
              type: getText("[class*='type'], [class*='Type'], [class*='badge']"),
              slotDuration: getText("[class*='slot'], [class*='Slot'], [class*='duration']"),
              bufferBefore: getText("[class*='buffer']:nth-of-type(1)"),
              bufferAfter: getText("[class*='buffer']:nth-of-type(2)"),
              bookingLimit: getText("[class*='limit'], [class*='Limit']"),
              advanceNotice: getText("[class*='notice'], [class*='Notice']"),
              confirmationType: getText("[class*='confirm'], [class*='Confirm']"),
              timezone: getText("[class*='timezone'], [class*='Timezone'], select[class*='tz']"),
              availability,
              assignedUsers,
            };
          });

          return {
            calendarName: name || config.name,
            calendarId: id || null,
            ...config,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_calendar: async (args) => {
      const name = asString(args.name);
      const type = asString(args.type) || "simple";
      const slotDuration = asNumber(args.slotDuration) ?? 30;
      const description = asString(args.description);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "calendar-create", async () => {
          await gotoGhl(page, "/calendars");
          await waitForAppReady(page);

          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")')
            .first();
          await createBtn.click();
          await page.waitForTimeout(800);

          const nameInput = page
            .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="Calendar"]')
            .first();
          await nameInput.fill(name);

          if (description) {
            const descInput = page
              .locator('textarea[name="description"], textarea[placeholder*="Description"], input[placeholder*="description"]')
              .first();
            try {
              await descInput.fill(description, { timeout: 3000 });
            } catch {
              // description is optional
            }
          }

          if (type !== "simple") {
            const typeSelect = page.locator('select[name="type"], [class*="type-select"], [class*="calendar-type"]').first();
            try {
              await typeSelect.click({ timeout: 3000 });
              await page.locator(`button:has-text("${type}"), [class*="option"]:has-text("${type}")`).first().click({ timeout: 3000 });
            } catch {
              // type selection fallback
            }
          }

          const durationInput = page.locator('input[name="slotDuration"], input[placeholder*="Duration"], input[type="number"]').first();
          try {
            await durationInput.fill(String(slotDuration), { timeout: 3000 });
          } catch {
            // duration may be a dropdown
          }

          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Next")').first();
          await saveBtn.click();
          await waitForAppReady(page);

          return { name, type, slotDuration, description: description || null, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_availability: async (args) => {
      const name = asString(args.calendarName);
      const id = asString(args.calendarId);
      const availability = args.availability as Record<string, string[]>;
      const timezone = asString(args.timezone);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "calendar-availability", async () => {
          if (id) {
            await gotoGhl(page, `/calendars/${id}`);
          } else if (name) {
            await gotoGhl(page, "/calendars");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("calendarName or calendarId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const availTab = page
            .locator('button:has-text("Availability"), a:has-text("Availability"), [class*="tab"]:has-text("Availability")')
            .first();
          try {
            await availTab.click({ timeout: 5000 });
            await page.waitForTimeout(800);
          } catch {
            // may already be on availability tab
          }

          if (timezone) {
            const tzSelect = page.locator('select[class*="timezone"], [class*="Timezone"] select, select[name="timezone"]').first();
            try {
              await tzSelect.selectOption({ label: timezone }, { timeout: 3000 });
            } catch {
              const tzInput = page.locator('input[placeholder*="Timezone"], input[name="timezone"]').first();
              try {
                await tzInput.fill(timezone, { timeout: 3000 });
              } catch {
                // timezone update is best-effort
              }
            }
          }

          for (const [day, slots] of Object.entries(availability)) {
            const dayToggle = page
              .locator(`[data-day="${day}"], [class*="${day}"] input[type="checkbox"], [class*="day"]:has-text("${day}")`)
              .first();
            try {
              await dayToggle.click({ timeout: 2000 });
            } catch {
              // day toggle may already be active
            }

            for (let i = 0; i < slots.length; i++) {
              const [start, end] = slots[i].split("-");
              if (!start || !end) continue;

              const timeInputs = page.locator(
                `[data-day="${day}"] input[type="time"], [class*="${day}"] input[type="time"]`,
              );
              const count = await timeInputs.count();
              if (count >= (i + 1) * 2) {
                await timeInputs.nth(i * 2).fill(start);
                await timeInputs.nth(i * 2 + 1).fill(end);
              }
            }
          }

          const saveBtn = page.locator('button:has-text("Save")').first();
          try {
            await saveBtn.click({ timeout: 5000 });
            await page.waitForTimeout(1000);
          } catch {
            // auto-save may be active
          }

          return {
            calendarName: name,
            calendarId: id || null,
            availability,
            timezone: timezone || null,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_assign_calendar_users: async (args) => {
      const name = asString(args.calendarName);
      const id = asString(args.calendarId);
      const addUsers = asString(args.addUserNames)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const removeUsers = asString(args.removeUserNames)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "calendar-assign", async () => {
          if (id) {
            await gotoGhl(page, `/calendars/${id}`);
          } else if (name) {
            await gotoGhl(page, "/calendars");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("calendarName or calendarId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const usersTab = page
            .locator('button:has-text("Users"), a:has-text("Users"), [class*="tab"]:has-text("Users"), button:has-text("Team")')
            .first();
          try {
            await usersTab.click({ timeout: 5000 });
            await page.waitForTimeout(800);
          } catch {
            // may already be on users tab
          }

          for (const userName of addUsers) {
            const addUserBtn = page
              .locator('button:has-text("Add User"), button:has-text("Assign"), [class*="add-user"]')
              .first();
            try {
              await addUserBtn.click({ timeout: 3000 });
              await page.waitForTimeout(500);
              const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="user"], input[type="search"]').first();
              await searchInput.fill(userName, { timeout: 3000 });
              await page.waitForTimeout(800);
              await page.locator(`[class*="option"]:has-text("${userName}"), [class*="result"]:has-text("${userName}")`).first().click({ timeout: 3000 });
            } catch {
              // user assignment is best-effort
            }
          }

          for (const userName of removeUsers) {
            const userChip = page
              .locator(`[class*="user-item"]:has-text("${userName}"), [class*="UserItem"]:has-text("${userName}")`)
              .first();
            try {
              const removeBtn = userChip.locator('[class*="remove"], [class*="close"], button').first();
              await removeBtn.click({ timeout: 3000 });
            } catch {
              // removal is best-effort
            }
          }

          const saveBtn = page.locator('button:has-text("Save")').first();
          try {
            await saveBtn.click({ timeout: 5000 });
            await page.waitForTimeout(1000);
          } catch {
            // auto-save may be active
          }

          return {
            calendarName: name,
            calendarId: id || null,
            added: addUsers,
            removed: removeUsers,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_booking_link: async (args) => {
      const name = asString(args.calendarName);
      const id = asString(args.calendarId);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "calendar-booking-link", async () => {
          if (id) {
            await gotoGhl(page, `/calendars/${id}`);
          } else if (name) {
            await gotoGhl(page, "/calendars");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("calendarName or calendarId is required");
          }
          await waitForAppReady(page);

          const shareBtn = page
            .locator('button:has-text("Share"), button:has-text("Booking Link"), button:has-text("Copy Link")')
            .first();
          try {
            await shareBtn.click({ timeout: 5000 });
            await page.waitForTimeout(1000);
          } catch {
            // link may be visible on the page
          }

          const linkData = await page.evaluate(() => {
            const linkInput = document.querySelector(
              'input[value*="book"], input[value*="calendar"], input[placeholder*="link"], input[readonly]',
            ) as HTMLInputElement | null;
            const linkAnchor = document.querySelector(
              'a[href*="book"], a[href*="calendar"], a[href*="schedule"]',
            ) as HTMLAnchorElement | null;
            return {
              url: linkInput?.value || linkAnchor?.href || "",
              embedCode: document.querySelector("textarea, pre, code")?.textContent?.trim() || "",
            };
          });

          return {
            calendarName: name,
            calendarId: id || null,
            bookingUrl: linkData.url,
            embedCode: linkData.embedCode || null,
            pageUrl: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_calendar: async (args) => {
      const name = asString(args.calendarName);
      const id = asString(args.calendarId);
      const confirm = Boolean(args.confirm);
      if (!confirm) throw new Error("confirm must be true to delete a calendar");
      if (!name && !id) throw new Error("calendarName or calendarId is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "calendar-delete", async () => {
          await gotoGhl(page, "/calendars");
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

          const deleteOption = page.locator('text="Delete", text="delete", [class*="delete"]').first();
          await deleteOption.click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")').first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);

          return { calendarName: name, calendarId: id, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
