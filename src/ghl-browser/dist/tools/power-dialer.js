import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const powerDialerModule = {
    tools: [
        {
            name: "ghl_browser_list_power_dialer_campaigns",
            description: "List power dialer campaigns and their status.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_power_dialer_campaign",
            description: "Create a new power dialer campaign.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    listName: { type: "string", description: "Contact list or smart list to dial" },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_get_power_dialer_stats",
            description: "Get call statistics for a power dialer campaign.",
            inputSchema: {
                type: "object",
                properties: {
                    campaignName: { type: "string" },
                },
                required: ["campaignName"],
            },
        },
        {
            name: "ghl_browser_start_power_dialer_campaign",
            description: "Start or resume a power dialer campaign.",
            inputSchema: {
                type: "object",
                properties: {
                    campaignName: { type: "string" },
                },
                required: ["campaignName"],
            },
        },
        {
            name: "ghl_browser_stop_power_dialer_campaign",
            description: "Pause or stop a power dialer campaign.",
            inputSchema: {
                type: "object",
                properties: {
                    campaignName: { type: "string" },
                },
                required: ["campaignName"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_power_dialer_campaigns: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "power-dialer-list", async () => {
                    await gotoGhl(page, "/power-dialer");
                    await waitForAppReady(page);
                    const campaigns = await page.evaluate(() => {
                        const rows = [];
                        document
                            .querySelectorAll("table tbody tr, [class*='campaign'], [class*='Campaign'], [class*='list-row']")
                            .forEach((el) => {
                            const cells = el.querySelectorAll("td, [class*='cell']");
                            const text = el.textContent || "";
                            if (text.trim().length > 2) {
                                rows.push({
                                    name: cells[0]?.textContent?.trim() || text.slice(0, 60).trim(),
                                    status: cells[1]?.textContent?.trim() || "",
                                    contacts: cells[2]?.textContent?.trim() || "",
                                    calls: cells[3]?.textContent?.trim() || "",
                                });
                            }
                        });
                        return rows;
                    });
                    return { count: campaigns.length, campaigns };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_power_dialer_campaign: async (args) => {
            const name = String(args.name);
            const listName = args.listName;
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "power-dialer-create", async () => {
                    await gotoGhl(page, "/power-dialer");
                    await waitForAppReady(page);
                    const newBtn = page.locator('button:has-text("New Campaign"), button:has-text("Create")').first();
                    await newBtn.click();
                    await waitForAppReady(page);
                    const nameInput = page.locator('input[name="name"], input[placeholder*="Campaign"]').first();
                    await nameInput.fill(name);
                    if (listName) {
                        const listInput = page.locator('input[placeholder*="List"], input[placeholder*="Smart List"], select').first();
                        await listInput.fill(listName).catch(() => { });
                        await page.waitForTimeout(500);
                        const option = page.locator(`[role="option"]:has-text("${listName}"), li:has-text("${listName}")`).first();
                        await option.click({ timeout: 3000 }).catch(() => { });
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').last();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, listName: listName || null, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_power_dialer_stats: async (args) => {
            const campaignName = String(args.campaignName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "power-dialer-stats", async () => {
                    await gotoGhl(page, "/power-dialer");
                    await waitForAppReady(page);
                    await page.locator(`tr:has-text("${campaignName}"), [class*='campaign']:has-text("${campaignName}")`).first().click();
                    await waitForAppReady(page);
                    const stats = await page.evaluate(() => {
                        const metrics = {};
                        document.querySelectorAll('[class*="stat"], [class*="metric"], [class*="Stat"], [class*="Metric"], [class*="kpi"]').forEach((el) => {
                            const label = el.querySelector('[class*="label"], [class*="title"], h4, h5')?.textContent?.trim() || "";
                            const value = el.querySelector('[class*="value"], [class*="count"], [class*="number"]')?.textContent?.trim() || el.textContent?.trim() || "";
                            if (label && value)
                                metrics[label] = value;
                        });
                        return metrics;
                    });
                    return { campaignName, stats };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_start_power_dialer_campaign: async (args) => {
            const campaignName = String(args.campaignName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "power-dialer-start", async () => {
                    await gotoGhl(page, "/power-dialer");
                    await waitForAppReady(page);
                    const row = page.locator(`tr:has-text("${campaignName}"), [class*='campaign']:has-text("${campaignName}")`).first();
                    const startBtn = row.locator('button:has-text("Start"), button:has-text("Resume"), [aria-label*="start"]').first();
                    await startBtn.click();
                    await waitForAppReady(page);
                    return { campaignName, action: "started" };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_stop_power_dialer_campaign: async (args) => {
            const campaignName = String(args.campaignName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "power-dialer-stop", async () => {
                    await gotoGhl(page, "/power-dialer");
                    await waitForAppReady(page);
                    const row = page.locator(`tr:has-text("${campaignName}"), [class*='campaign']:has-text("${campaignName}")`).first();
                    const stopBtn = row.locator('button:has-text("Stop"), button:has-text("Pause"), [aria-label*="stop"]').first();
                    await stopBtn.click();
                    await waitForAppReady(page);
                    return { campaignName, action: "stopped" };
                });
            }
            finally {
                await close();
            }
        },
    },
};
