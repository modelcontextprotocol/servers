import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const notificationsModule = {
    tools: [
        {
            name: "ghl_browser_list_notifications",
            description: "List recent notifications in the GHL inbox.",
            inputSchema: {
                type: "object",
                properties: {
                    filter: {
                        type: "string",
                        description: "Filter: all, unread, mentions",
                    },
                },
            },
        },
        {
            name: "ghl_browser_mark_notification_read",
            description: "Mark a notification as read by its label text.",
            inputSchema: {
                type: "object",
                properties: {
                    label: { type: "string", description: "Text snippet of the notification to mark read" },
                },
                required: ["label"],
            },
        },
        {
            name: "ghl_browser_get_notification_settings",
            description: "Get current notification preferences and channels.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_update_notification_settings",
            description: "Toggle a notification channel on or off.",
            inputSchema: {
                type: "object",
                properties: {
                    channel: { type: "string", description: "Channel name: email, sms, push, in_app" },
                    enabled: { type: "boolean" },
                },
                required: ["channel", "enabled"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_notifications: async (args) => {
            const filter = args.filter || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "notifications-list", async () => {
                    await gotoGhl(page, "/notifications");
                    await waitForAppReady(page);
                    if (filter !== "all") {
                        const tab = page.locator(`[role="tab"]:has-text("${filter}"), button:has-text("${filter}")`).first();
                        await tab.click({ timeout: 3000 }).catch(() => { });
                        await waitForAppReady(page);
                    }
                    const items = await page.evaluate(() => {
                        const rows = [];
                        document
                            .querySelectorAll('[class*="notification"], [class*="Notification"], [data-testid*="notif"]')
                            .forEach((el) => {
                            const text = el.textContent?.slice(0, 200)?.trim() || "";
                            const timeEl = el.querySelector("time, [class*='time'], [class*='date']");
                            const isUnread = el.classList.contains("unread") ||
                                el.querySelector('[class*="unread"]') !== null ||
                                el.getAttribute("data-read") === "false";
                            if (text.length > 2) {
                                rows.push({ text, time: timeEl?.textContent?.trim() || "", unread: isUnread });
                            }
                        });
                        return rows;
                    });
                    return { filter, count: items.length, items };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_mark_notification_read: async (args) => {
            const label = String(args.label);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "notifications-read", async () => {
                    await gotoGhl(page, "/notifications");
                    await waitForAppReady(page);
                    const item = page.locator(`[class*="notification"]:has-text("${label}"), [data-testid*="notif"]:has-text("${label}")`).first();
                    await item.click({ timeout: 5000 });
                    await waitForAppReady(page);
                    return { label, marked: true };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_notification_settings: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "notifications-settings", async () => {
                    await gotoGhl(page, "/settings/notifications");
                    await waitForAppReady(page);
                    const settings = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('input[type="checkbox"], [role="switch"], [role="checkbox"]').forEach((el) => {
                            const label = el.closest("label, [class*='row'], [class*='item']")?.textContent?.trim().slice(0, 80) || "";
                            const checked = el.checked ||
                                el.getAttribute("aria-checked") === "true" ||
                                el.getAttribute("data-checked") === "true";
                            items.push({ label, enabled: checked, channel: "" });
                        });
                        return items;
                    });
                    return { count: settings.length, settings };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_update_notification_settings: async (args) => {
            const channel = String(args.channel);
            const enabled = Boolean(args.enabled);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "notifications-update", async () => {
                    await gotoGhl(page, "/settings/notifications");
                    await waitForAppReady(page);
                    const toggle = page
                        .locator(`label:has-text("${channel}"), [class*="row"]:has-text("${channel}")`)
                        .first()
                        .locator('input[type="checkbox"], [role="switch"], [role="checkbox"]')
                        .first();
                    const current = await toggle.isChecked().catch(() => false);
                    if (current !== enabled) {
                        await toggle.click();
                        await waitForAppReady(page);
                    }
                    return { channel, enabled, toggled: current !== enabled };
                });
            }
            finally {
                await close();
            }
        },
    },
};
