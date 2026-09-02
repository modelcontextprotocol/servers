import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const calendarBookingsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_bookings",
      description:
        "List calendar bookings/appointments with contact, date, time, status, and calendar name.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status: all, confirmed, pending, cancelled, noshow, completed",
          },
          dateRange: {
            type: "string",
            description: "Date range: today, tomorrow, this_week, next_week, this_month, custom",
          },
        },
      },
    },
    {
      name: "ghl_browser_get_booking_details",
      description: "Open a specific booking and return full details: contact, time, notes, custom fields.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: {
            type: "string",
            description: "Contact name or partial name to find the booking",
          },
        },
        required: ["contactName"],
      },
    },
    {
      name: "ghl_browser_confirm_booking",
      description: "Confirm a pending booking by contact name.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: { type: "string", description: "Contact name of the booking to confirm" },
        },
        required: ["contactName"],
      },
    },
    {
      name: "ghl_browser_cancel_booking",
      description: "Cancel a booking by contact name.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: { type: "string", description: "Contact name of the booking to cancel" },
          reason: { type: "string", description: "Optional cancellation reason" },
        },
        required: ["contactName"],
      },
    },
    {
      name: "ghl_browser_mark_booking_noshow",
      description: "Mark a booking as no-show by contact name.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: { type: "string", description: "Contact name of the booking" },
        },
        required: ["contactName"],
      },
    },
    {
      name: "ghl_browser_reschedule_booking",
      description: "Reschedule a booking to a new date and time.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: { type: "string", description: "Contact name of the booking to reschedule" },
          newDate: { type: "string", description: "New date (YYYY-MM-DD)" },
          newTime: { type: "string", description: "New time (HH:MM, 24h format)" },
        },
        required: ["contactName", "newDate", "newTime"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_bookings: async (args) => {
      const status = (args.status as string) || "all";
      const dateRange = (args.dateRange as string) || "this_week";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "bookings-list", async () => {
          await gotoGhl(page, "/calendars/bookings");
          await waitForAppReady(page);
          if (status !== "all") {
            const tab = page
              .locator(
                `[role="tab"]:has-text("${status}"), button:has-text("${status}"), a:has-text("${status}")`,
              )
              .first();
            await tab.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          if (dateRange !== "this_week") {
            const label = dateRange.replace(/_/g, " ");
            const range = page
              .locator(`button:has-text("${label}"), [role="option"]:has-text("${label}")`)
              .first();
            await range.click({ timeout: 3000 }).catch(() => {});
            await waitForAppReady(page);
          }
          const bookings = await page.evaluate(() => {
            const rows: Array<{
              contact: string;
              date: string;
              time: string;
              status: string;
              calendar: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="booking"], [class*="appointment"], [role="row"]')
              .forEach((el) => {
                const contactEl = el.querySelector(
                  '[class*="contact"], [class*="name"], a, td:first-child',
                );
                if (contactEl && (contactEl.textContent?.trim().length ?? 0) > 2) {
                  rows.push({
                    contact: contactEl.textContent?.trim() ?? "",
                    date:
                      el.querySelector('[class*="date"], time, [class*="day"]')?.textContent?.trim() ?? "",
                    time:
                      el.querySelector('[class*="time"], [class*="hour"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    calendar:
                      el.querySelector('[class*="calendar"], [class*="cal"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { status, dateRange, count: bookings.length, bookings };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_booking_details: async (args) => {
      const contactName = String(args.contactName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "booking-details", async () => {
          await gotoGhl(page, "/calendars/bookings");
          await waitForAppReady(page);
          const row = page
            .locator(`[class*="booking"]:has-text("${contactName}"), [class*="appointment"]:has-text("${contactName}"), tr:has-text("${contactName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const fields: Record<string, string> = {};
            document
              .querySelectorAll('[class*="detail"], [class*="field"], [class*="info"], dl, [class*="row"]')
              .forEach((el) => {
                const labelEl = el.querySelector(
                  '[class*="label"], dt, [class*="key"], [class*="title"]',
                );
                const valueEl = el.querySelector(
                  '[class*="value"], dd, [class*="data"], [class*="content"]',
                );
                const label = labelEl?.textContent?.trim() ?? "";
                const value = valueEl?.textContent?.trim() ?? "";
                if (label.length > 1 && value.length > 0) {
                  fields[label] = value;
                }
              });
            const notesEl = document.querySelector(
              '[class*="notes"], [class*="note"], [class*="comment"]',
            );
            return {
              fields,
              notes: notesEl?.textContent?.trim() ?? "",
              fullText: document.body.textContent?.slice(0, 1000)?.trim() ?? "",
            };
          });
          return { contactName, ...details };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_confirm_booking: async (args) => {
      const contactName = String(args.contactName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "booking-confirm", async () => {
          await gotoGhl(page, "/calendars/bookings");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${contactName}"), [class*="booking"]:has-text("${contactName}")`)
            .first();
          const confirmBtn = row
            .locator('button:has-text("Confirm"), button:has-text("confirm"), [class*="confirm"]')
            .first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { contactName, confirmed: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_cancel_booking: async (args) => {
      const contactName = String(args.contactName);
      const reason = (args.reason as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "booking-cancel", async () => {
          await gotoGhl(page, "/calendars/bookings");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${contactName}"), [class*="booking"]:has-text("${contactName}")`)
            .first();
          const cancelBtn = row
            .locator('button:has-text("Cancel"), button:has-text("cancel")')
            .first();
          await cancelBtn.click({ timeout: 5000 });
          if (reason) {
            const input = page.locator('textarea, input[type="text"]').last();
            await input.fill(reason).catch(() => {});
          }
          const submitBtn = page
            .locator('button:has-text("Confirm"), button:has-text("Yes"), button[type="submit"]')
            .first();
          await submitBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { contactName, cancelled: true, reason };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_mark_booking_noshow: async (args) => {
      const contactName = String(args.contactName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "booking-noshow", async () => {
          await gotoGhl(page, "/calendars/bookings");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${contactName}"), [class*="booking"]:has-text("${contactName}")`)
            .first();
          const moreBtn = row.locator('button:has-text("More"), [class*="menu"], [class*="dropdown"]').first();
          await moreBtn.click({ timeout: 3000 }).catch(() => {});
          const noshowBtn = page
            .locator('button:has-text("No Show"), button:has-text("no-show"), [class*="noshow"]')
            .first();
          await noshowBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { contactName, markedNoShow: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_reschedule_booking: async (args) => {
      const contactName = String(args.contactName);
      const newDate = String(args.newDate);
      const newTime = String(args.newTime);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "booking-reschedule", async () => {
          await gotoGhl(page, "/calendars/bookings");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${contactName}"), [class*="booking"]:has-text("${contactName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const rescheduleBtn = page
            .locator('button:has-text("Reschedule"), button:has-text("reschedule")')
            .first();
          await rescheduleBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const dateInput = page.locator('input[type="date"], input[placeholder*="date"]').first();
          await dateInput.fill(newDate).catch(() => {});
          const timeInput = page.locator('input[type="time"], input[placeholder*="time"]').first();
          await timeInput.fill(newTime).catch(() => {});
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Confirm"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { contactName, newDate, newTime, rescheduled: true };
        });
      } finally {
        await close();
      }
    },
  },
};
