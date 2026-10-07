import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const campaignsModule = {
    tools: [
        {
            name: "ghl_browser_list_campaigns",
            description: "List campaigns with their status (active/paused/stopped).",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_campaign",
            description: "Create a new campaign shell with a name and type.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    type: { type: "string", description: "e.g. 'drip', 'sequence'" },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_add_campaign_step",
            description: "Add a step to a campaign (SMS, Email, Wait, Action, etc.).",
            inputSchema: {
                type: "object",
                properties: {
                    campaignName: { type: "string" },
                    stepType: { type: "string", description: "'sms' | 'email' | 'wait' | 'action' | 'condition'" },
                    label: { type: "string" },
                    config: { type: "object", additionalProperties: true },
                },
                required: ["campaignName", "stepType"],
            },
        },
        {
            name: "ghl_browser_start_stop_campaign",
            description: "Start, pause, or stop a campaign by name.",
            inputSchema: {
                type: "object",
                properties: {
                    campaignName: { type: "string" },
                    action: { type: "string", enum: ["start", "pause", "stop"] },
                },
                required: ["campaignName", "action"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_campaigns: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "campaigns-list", async () => {
                    await gotoGhl(page, "/marketing/campaigns");
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document
                            .querySelectorAll('[class*="campaign"], [data-testid*="campaign"]')
                            .forEach((el) => {
                            const nameEl = el.querySelector("h3, h4, [class*='name']");
                            const statusEl = el.querySelector('[class*="status"], [class*="Status"]');
                            const typeEl = el.querySelector('[class*="type"]');
                            const text = el.textContent?.slice(0, 200) || "";
                            if (nameEl || text.length > 5) {
                                items.push({
                                    name: nameEl?.textContent?.trim() || text.trim().slice(0, 80),
                                    status: statusEl?.textContent?.trim() || "",
                                    type: typeEl?.textContent?.trim() || "",
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
        ghl_browser_create_campaign: async (args) => {
            const name = String(args.name);
            const type = args.type || "drip";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "campaigns-create", async () => {
                    await gotoGhl(page, "/marketing/campaigns");
                    await waitForAppReady(page);
                    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Campaign")').first();
                    await createBtn.click();
                    await page.waitForTimeout(600);
                    const nameInput = page.locator('input[name="name"], input[placeholder*="Campaign"]').first();
                    await nameInput.fill(name);
                    if (type) {
                        try {
                            await page.locator(`[role="option"]:has-text("${type}"), button:has-text("${type}")`).first().click({ timeout: 2000 });
                        }
                        catch {
                            // type picker optional
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, type, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_add_campaign_step: async (args) => {
            const campaignName = String(args.campaignName);
            const stepType = String(args.stepType);
            const label = args.label;
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "campaigns-add-step", async () => {
                    await gotoGhl(page, "/marketing/campaigns");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${campaignName}"), [class*="row"]:has-text("${campaignName}")`).first().click();
                    await waitForAppReady(page);
                    const addBtn = page.locator('button:has-text("Add Step"), [class*="add-step"]').first();
                    await addBtn.click();
                    await page.locator(`[data-type="${stepType}"], button:has-text("${stepType}")`).first().click();
                    if (label) {
                        try {
                            await page.locator('input[name="label"], input[placeholder*="name"]').first().fill(label, { timeout: 2000 });
                        }
                        catch {
                            // label field not always present
                        }
                    }
                    const confirmBtn = page.locator('button:has-text("Add"), button:has-text("Save")').first();
                    try {
                        await confirmBtn.click({ timeout: 3000 });
                    }
                    catch {
                        // modal may auto-close
                    }
                    return { campaignName, stepType, label: label || null, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_start_stop_campaign: async (args) => {
            const campaignName = String(args.campaignName);
            const action = String(args.action);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "campaigns-toggle", async () => {
                    await gotoGhl(page, "/marketing/campaigns");
                    await waitForAppReady(page);
                    const row = page.locator(`tr:has-text("${campaignName}"), [class*="row"]:has-text("${campaignName}")`).first();
                    await row.locator('button:has-text("..."), button[aria-haspopup="menu"]').first().click();
                    const menuItem = page.locator(`[role="menuitem"]:has-text("${action}")`).first();
                    await menuItem.click();
                    await waitForAppReady(page);
                    return { campaignName, action, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
