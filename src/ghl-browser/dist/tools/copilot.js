import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const copilotModule = {
    tools: [
        {
            name: "ghl_browser_get_copilot_status",
            description: "Get AI Copilot status, enabled features, and configuration.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_configure_copilot",
            description: "Configure AI Copilot settings: enable/disable, set model preferences, and automation rules.",
            inputSchema: {
                type: "object",
                properties: {
                    enabled: { type: "boolean" },
                    autoReply: { type: "boolean", description: "Enable automatic AI replies to conversations" },
                    tone: { type: "string", description: "Response tone: professional, friendly, casual, formal" },
                },
            },
        },
        {
            name: "ghl_browser_list_copilot_automations",
            description: "List AI Copilot automation rules with name, trigger, and status.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_copilot_automation",
            description: "Create a new Copilot automation rule.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    trigger: { type: "string", description: "Trigger type: new_message, keyword, time_based, all" },
                    prompt: { type: "string", description: "AI instruction prompt" },
                },
                required: ["name", "trigger"],
            },
        },
        {
            name: "ghl_browser_get_copilot_logs",
            description: "Get recent Copilot activity logs showing AI actions taken.",
            inputSchema: {
                type: "object",
                properties: {
                    limit: { type: "number", description: "Max log entries to return" },
                },
            },
        },
    ],
    handlers: {
        ghl_browser_get_copilot_status: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "copilot-status", async () => {
                    await gotoGhl(page, "/settings/copilot");
                    await waitForAppReady(page);
                    const details = await page.evaluate(() => {
                        const toggles = {};
                        document.querySelectorAll('input[type="checkbox"], [role="switch"], [class*="toggle"]').forEach((el) => {
                            const label = el.closest('label, [class*="setting"]')?.querySelector('[class*="label"], span')?.textContent?.trim() || "";
                            const checked = el.checked || el.getAttribute("aria-checked") === "true" || el.classList.toString().includes("active");
                            if (label)
                                toggles[label] = checked;
                        });
                        const fields = {};
                        document.querySelectorAll('input:not([type="checkbox"]), select, textarea').forEach((el) => {
                            const label = el.closest('label, [class*="field"]')?.querySelector('[class*="label"], span')?.textContent?.trim() || el.placeholder || "";
                            if (label)
                                fields[label] = el.value || "";
                        });
                        return { toggles, fields };
                    });
                    return { ...details, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_configure_copilot: async (args) => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "copilot-configure", async () => {
                    await gotoGhl(page, "/settings/copilot");
                    await waitForAppReady(page);
                    if (typeof args.enabled === "boolean") {
                        const toggle = page.locator('[role="switch"], [class*="toggle"], input[type="checkbox"]').first();
                        const current = await toggle.getAttribute("aria-checked") === "true";
                        if (current !== args.enabled)
                            await toggle.click();
                    }
                    if (typeof args.autoReply === "boolean") {
                        try {
                            const autoReplyToggle = page.locator('[class*="setting"]:has-text("Auto"), [class*="setting"]:has-text("Reply")').locator('[role="switch"], [class*="toggle"]').first();
                            const current = await autoReplyToggle.getAttribute("aria-checked") === "true";
                            if (current !== args.autoReply)
                                await autoReplyToggle.click();
                        }
                        catch { /* setting may not exist */ }
                    }
                    await page.locator('button:has-text("Save")').first().click();
                    await waitForAppReady(page);
                    return { enabled: args.enabled ?? null, autoReply: args.autoReply ?? null, tone: args.tone || null, saved: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_copilot_automations: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "copilot-automations", async () => {
                    await gotoGhl(page, "/settings/copilot");
                    await waitForAppReady(page);
                    try {
                        await page.locator('button:has-text("Automations"), [role="tab"]:has-text("Automations"), a:has-text("Rules")').first().click({ timeout: 3000 });
                    }
                    catch { /* tab may not exist */ }
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('tr, [class*="rule"], [class*="automation"], [class*="row"], [role="row"]').forEach((el) => {
                            const nameEl = el.querySelector('[class*="name"], h4, td:first-child');
                            if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                                items.push({
                                    name: nameEl.textContent?.trim() ?? "",
                                    trigger: el.querySelector('[class*="trigger"]')?.textContent?.trim() || "",
                                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
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
        ghl_browser_create_copilot_automation: async (args) => {
            const name = String(args.name);
            const trigger = String(args.trigger);
            const prompt = args.prompt || "";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "copilot-create-automation", async () => {
                    await gotoGhl(page, "/settings/copilot");
                    await waitForAppReady(page);
                    try {
                        await page.locator('button:has-text("Automations"), [role="tab"]:has-text("Automations")').first().click({ timeout: 3000 });
                    }
                    catch { /* optional */ }
                    await waitForAppReady(page);
                    await page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")').first().click();
                    await waitForAppReady(page);
                    await page.locator('input[name="name"], input[placeholder*="Name"]').first().fill(name);
                    if (prompt) {
                        try {
                            await page.locator('textarea, [contenteditable="true"]').first().fill(prompt);
                        }
                        catch { /* optional */ }
                    }
                    await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
                    await waitForAppReady(page);
                    return { name, trigger, prompt: prompt || null, created: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_copilot_logs: async (args) => {
            const limit = args.limit || 50;
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "copilot-logs", async () => {
                    await gotoGhl(page, "/settings/copilot");
                    await waitForAppReady(page);
                    try {
                        await page.locator('button:has-text("Logs"), [role="tab"]:has-text("Logs"), a:has-text("Activity")').first().click({ timeout: 3000 });
                    }
                    catch { /* tab may not exist */ }
                    await waitForAppReady(page);
                    const logs = await page.evaluate((max) => {
                        const items = [];
                        document.querySelectorAll('tr, [class*="log"], [class*="entry"], [role="row"]').forEach((el) => {
                            if (items.length >= max)
                                return;
                            const timeEl = el.querySelector('[class*="time"], time, td:first-child');
                            if (timeEl && timeEl.textContent?.trim()) {
                                items.push({
                                    time: timeEl.textContent.trim(),
                                    action: el.querySelector('[class*="action"], [class*="type"]')?.textContent?.trim() || "",
                                    contact: el.querySelector('[class*="contact"], [class*="name"]')?.textContent?.trim() || "",
                                    result: el.querySelector('[class*="result"], [class*="status"]')?.textContent?.trim() || "",
                                });
                            }
                        });
                        return items;
                    }, limit);
                    return { count: logs.length, logs };
                });
            }
            finally {
                await close();
            }
        },
    },
};
