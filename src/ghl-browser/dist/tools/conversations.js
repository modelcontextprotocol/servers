import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const conversationsModule = {
    tools: [
        {
            name: "ghl_browser_list_conversations",
            description: "List conversations in the GHL inbox with contact name, last message, channel, and unread status.",
            inputSchema: {
                type: "object",
                properties: {
                    filter: { type: "string", description: "Filter: all, unread, starred, sms, email, facebook, instagram, whatsapp, webchat" },
                },
            },
        },
        {
            name: "ghl_browser_get_conversation_thread",
            description: "Open a conversation by contact name and return the full message thread.",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string", description: "Contact name or partial match to find the conversation" },
                    maxMessages: { type: "number", description: "Maximum messages to return (default 50)" },
                },
                required: ["contactName"],
            },
        },
        {
            name: "ghl_browser_send_conversation_message",
            description: "Send a message in an existing conversation (SMS, email, or manual channel).",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string", description: "Contact name to find the conversation" },
                    message: { type: "string", description: "Message text to send" },
                    channel: { type: "string", description: "Channel: sms, email, whatsapp, facebook, instagram (default: current channel)" },
                },
                required: ["contactName", "message"],
            },
        },
        {
            name: "ghl_browser_star_conversation",
            description: "Star or unstar a conversation.",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string" },
                    starred: { type: "boolean", description: "True to star, false to unstar" },
                },
                required: ["contactName"],
            },
        },
        {
            name: "ghl_browser_assign_conversation",
            description: "Assign a conversation to a specific user or team.",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string" },
                    assigneeName: { type: "string", description: "User or team name to assign to" },
                },
                required: ["contactName", "assigneeName"],
            },
        },
        {
            name: "ghl_browser_get_conversation_contact",
            description: "Open a conversation and return the contact details panel (name, phone, email, tags, custom fields).",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string" },
                },
                required: ["contactName"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_conversations: async (args) => {
            const filter = args.filter || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversations-list", async () => {
                    await gotoGhl(page, "/conversations");
                    await waitForAppReady(page);
                    if (filter !== "all") {
                        try {
                            await page.locator(`button:has-text("${filter}"), [role="tab"]:has-text("${filter}"), a:has-text("${filter}")`).first().click({ timeout: 3000 });
                            await waitForAppReady(page);
                        }
                        catch { /* filter may not exist */ }
                    }
                    const rows = await page.evaluate(() => {
                        const items = [];
                        const convEls = document.querySelectorAll('[class*="conversation"], [class*="thread"], [data-testid*="conversation"], [role="listitem"]');
                        convEls.forEach((el) => {
                            const nameEl = el.querySelector('[class*="name"], [class*="contact"], h4, h3, strong');
                            const msgEl = el.querySelector('[class*="message"], [class*="preview"], [class*="snippet"]');
                            const timeEl = el.querySelector('[class*="time"], time, [class*="date"]');
                            const unread = el.querySelector('[class*="unread"], [class*="new"]') !== null ||
                                el.classList.toString().includes("unread");
                            const text = el.textContent || "";
                            if (nameEl || text.length > 5) {
                                items.push({
                                    contact: nameEl?.textContent?.trim() || text.trim().slice(0, 60),
                                    lastMessage: msgEl?.textContent?.trim()?.slice(0, 200) || "",
                                    channel: "",
                                    unread,
                                    time: timeEl?.textContent?.trim() || "",
                                });
                            }
                        });
                        return items;
                    });
                    return { count: rows.length, filter, rows };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_conversation_thread: async (args) => {
            const contactName = String(args.contactName);
            const maxMessages = args.maxMessages || 50;
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversations-thread", async () => {
                    await gotoGhl(page, "/conversations");
                    await waitForAppReady(page);
                    await page.locator(`[class*="conversation"]:has-text("${contactName}"), [class*="thread"]:has-text("${contactName}"), [role="listitem"]:has-text("${contactName}")`).first().click();
                    await waitForAppReady(page);
                    const messages = await page.evaluate((max) => {
                        const msgs = [];
                        const msgEls = document.querySelectorAll('[class*="message"], [class*="bubble"], [data-testid*="message"]');
                        msgEls.forEach((el) => {
                            if (msgs.length >= max)
                                return;
                            const senderEl = el.querySelector('[class*="sender"], [class*="name"], [class*="from"]');
                            const textEl = el.querySelector('[class*="text"], [class*="body"], [class*="content"], p');
                            const timeEl = el.querySelector('[class*="time"], time');
                            const isOutbound = el.classList.toString().includes("outbound") || el.classList.toString().includes("sent") || el.closest('[class*="right"]') !== null;
                            msgs.push({
                                sender: senderEl?.textContent?.trim() || "",
                                text: textEl?.textContent?.trim() || el.textContent?.trim()?.slice(0, 500) || "",
                                time: timeEl?.textContent?.trim() || "",
                                direction: isOutbound ? "outbound" : "inbound",
                            });
                        });
                        return msgs;
                    }, maxMessages);
                    return { contactName, messageCount: messages.length, messages, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_send_conversation_message: async (args) => {
            const contactName = String(args.contactName);
            const message = String(args.message);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversations-send", async () => {
                    await gotoGhl(page, "/conversations");
                    await waitForAppReady(page);
                    await page.locator(`[class*="conversation"]:has-text("${contactName}"), [class*="thread"]:has-text("${contactName}"), [role="listitem"]:has-text("${contactName}")`).first().click();
                    await waitForAppReady(page);
                    const input = page.locator('textarea, [contenteditable="true"], input[type="text"][class*="message"]').first();
                    await input.fill(message);
                    await page.locator('button:has-text("Send"), button[type="submit"], [aria-label*="send"]').first().click();
                    await waitForAppReady(page);
                    return { contactName, message, sent: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_star_conversation: async (args) => {
            const contactName = String(args.contactName);
            const starred = Boolean(args.starred);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversations-star", async () => {
                    await gotoGhl(page, "/conversations");
                    await waitForAppReady(page);
                    const row = page.locator(`[class*="conversation"]:has-text("${contactName}"), [role="listitem"]:has-text("${contactName}")`).first();
                    await row.hover();
                    await page.locator(`[aria-label*="star"], button:has-text("Star"), [class*="star"]`).first().click({ timeout: 3000 });
                    await waitForAppReady(page);
                    return { contactName, starred, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_assign_conversation: async (args) => {
            const contactName = String(args.contactName);
            const assigneeName = String(args.assigneeName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversations-assign", async () => {
                    await gotoGhl(page, "/conversations");
                    await waitForAppReady(page);
                    await page.locator(`[class*="conversation"]:has-text("${contactName}"), [role="listitem"]:has-text("${contactName}")`).first().click();
                    await waitForAppReady(page);
                    await page.locator('button:has-text("Assign"), [aria-label*="assign"], [class*="assign"]').first().click({ timeout: 3000 });
                    await page.locator(`input[placeholder*="search"], input[placeholder*="user"]`).first().fill(assigneeName);
                    await page.waitForTimeout(500);
                    await page.locator(`[role="option"]:has-text("${assigneeName}"), [class*="option"]:has-text("${assigneeName}")`).first().click();
                    await waitForAppReady(page);
                    return { contactName, assigneeName, assigned: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_conversation_contact: async (args) => {
            const contactName = String(args.contactName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversations-contact", async () => {
                    await gotoGhl(page, "/conversations");
                    await waitForAppReady(page);
                    await page.locator(`[class*="conversation"]:has-text("${contactName}"), [role="listitem"]:has-text("${contactName}")`).first().click();
                    await waitForAppReady(page);
                    const details = await page.evaluate(() => {
                        const panel = document.querySelector('[class*="contact"], [class*="details"], [class*="sidebar"]');
                        if (!panel)
                            return { fields: {} };
                        const fields = {};
                        panel.querySelectorAll('[class*="field"], [class*="row"], label, dt, dd').forEach((el) => {
                            const label = el.querySelector('label, dt, [class*="label"]')?.textContent?.trim();
                            const value = el.querySelector('[class*="value"], dd, span')?.textContent?.trim();
                            if (label && value)
                                fields[label] = value;
                        });
                        return {
                            name: panel.querySelector('h2, h3, [class*="name"]')?.textContent?.trim() || "",
                            email: panel.querySelector('a[href*="mailto"]')?.textContent?.trim() || "",
                            phone: panel.querySelector('a[href*="tel"]')?.textContent?.trim() || "",
                            fields,
                        };
                    });
                    return { contactName, ...details, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
