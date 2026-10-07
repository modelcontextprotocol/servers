import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const eventsModule = {
    tools: [
        {
            name: "ghl_browser_list_events",
            description: "List events with name, date, type, and attendee count.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_event",
            description: "Create an event (webinar, in-person, or hybrid) with name, date, and description.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    date: { type: "string", description: "ISO date string or human-readable date" },
                    description: { type: "string" },
                    type: { type: "string", description: "webinar, in_person, hybrid" },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_get_event_details",
            description: "Get event details: attendees, registrations, check-ins, and settings.",
            inputSchema: {
                type: "object",
                properties: { eventName: { type: "string" } },
                required: ["eventName"],
            },
        },
        {
            name: "ghl_browser_list_event_registrations",
            description: "List registrations/attendees for an event with name, email, and check-in status.",
            inputSchema: {
                type: "object",
                properties: { eventName: { type: "string" } },
                required: ["eventName"],
            },
        },
        {
            name: "ghl_browser_delete_event",
            description: "Delete an event.",
            inputSchema: {
                type: "object",
                properties: { eventName: { type: "string" }, confirm: { type: "boolean" } },
                required: ["eventName", "confirm"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_events: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "events-list", async () => {
                    await gotoGhl(page, "/events");
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('[class*="event"], tr, [class*="row"], [role="row"], [class*="card"]').forEach((el) => {
                            const nameEl = el.querySelector('a, h3, h4, [class*="name"]');
                            if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                                items.push({
                                    name: nameEl.textContent?.trim() ?? "",
                                    date: el.querySelector('[class*="date"], time, [class*="when"]')?.textContent?.trim() || "",
                                    type: el.querySelector('[class*="type"], [class*="badge"]')?.textContent?.trim() || "",
                                    attendees: el.querySelector('[class*="attendee"], [class*="count"], [class*="registrations"]')?.textContent?.trim() || "",
                                });
                            }
                        });
                        return items;
                    });
                    return { count: rows.length, rows };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_event: async (args) => {
            const name = String(args.name);
            const date = args.date || "";
            const description = args.description || "";
            const type = args.type || "webinar";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "events-create", async () => {
                    await gotoGhl(page, "/events");
                    await waitForAppReady(page);
                    await page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")').first().click();
                    await waitForAppReady(page);
                    await page.locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="Title"]').first().fill(name);
                    if (date) {
                        try {
                            await page.locator('input[type="date"], input[name*="date" i]').first().fill(date);
                        }
                        catch { /* optional */ }
                    }
                    if (description) {
                        try {
                            await page.locator('textarea, [contenteditable="true"]').first().fill(description);
                        }
                        catch { /* optional */ }
                    }
                    await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
                    await waitForAppReady(page);
                    return { name, date: date || null, type, description: description || null, created: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_event_details: async (args) => {
            const eventName = String(args.eventName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "events-detail", async () => {
                    await gotoGhl(page, "/events");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${eventName}"), [class*="name"]:has-text("${eventName}")`).first().click();
                    await waitForAppReady(page);
                    const details = await page.evaluate(() => {
                        const fields = {};
                        document.querySelectorAll('[class*="field"], label, dt').forEach((el) => {
                            const label = el.textContent?.trim() || "";
                            const valueEl = el.parentElement?.querySelector('[class*="value"], dd, span');
                            if (label && valueEl)
                                fields[label] = valueEl.textContent?.trim() || "";
                        });
                        return {
                            registrations: document.querySelector('[class*="registration"] [class*="count"]')?.textContent?.trim() || "",
                            checkIns: document.querySelector('[class*="check"] [class*="count"]')?.textContent?.trim() || "",
                            fields,
                        };
                    });
                    return { eventName, ...details, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_event_registrations: async (args) => {
            const eventName = String(args.eventName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "events-registrations", async () => {
                    await gotoGhl(page, "/events");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${eventName}"), [class*="name"]:has-text("${eventName}")`).first().click();
                    await waitForAppReady(page);
                    try {
                        await page.locator('button:has-text("Registrations"), [role="tab"]:has-text("Registrations"), a:has-text("Attendees")').first().click({ timeout: 3000 });
                    }
                    catch { /* tab may not exist */ }
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('tr, [class*="attendee"], [class*="registration"], [role="row"]').forEach((el) => {
                            const nameEl = el.querySelector('[class*="name"], td:first-child');
                            if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                                items.push({
                                    name: nameEl.textContent?.trim() ?? "",
                                    email: el.querySelector('[class*="email"], a[href*="mailto"]')?.textContent?.trim() || "",
                                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
                                    checkedIn: el.querySelector('[class*="check"], [class*="attended"]') !== null,
                                });
                            }
                        });
                        return items;
                    });
                    return { eventName, count: rows.length, rows };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_delete_event: async (args) => {
            const eventName = String(args.eventName);
            if (!args.confirm)
                throw new Error("confirm: true is required to delete an event");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "events-delete", async () => {
                    await gotoGhl(page, "/events");
                    await waitForAppReady(page);
                    const row = page.locator(`[class*="row"]:has-text("${eventName}"), tr:has-text("${eventName}")`).first();
                    await row.locator('button:has-text("Delete"), [aria-label*="delete"], [class*="delete"]').first().click();
                    await page.locator('button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Yes")').first().click();
                    await waitForAppReady(page);
                    return { eventName, deleted: true };
                });
            }
            finally {
                await close();
            }
        },
    },
};
