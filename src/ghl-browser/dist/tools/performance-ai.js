import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const performanceAiModule = {
    tools: [
        {
            name: "ghl_browser_get_performance_overview",
            description: "Get the Performance AI dashboard overview with key metrics.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_list_performance_suggestions",
            description: "List AI-generated optimization suggestions.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_apply_performance_suggestion",
            description: "Apply a specific Performance AI suggestion by label.",
            inputSchema: {
                type: "object",
                properties: {
                    label: { type: "string", description: "Suggestion label or title to apply" },
                },
                required: ["label"],
            },
        },
        {
            name: "ghl_browser_dismiss_performance_suggestion",
            description: "Dismiss a Performance AI suggestion.",
            inputSchema: {
                type: "object",
                properties: {
                    label: { type: "string", description: "Suggestion label or title to dismiss" },
                },
                required: ["label"],
            },
        },
        {
            name: "ghl_browser_get_performance_scores",
            description: "Get performance scores for funnels, websites, and campaigns.",
            inputSchema: { type: "object", properties: {} },
        },
    ],
    handlers: {
        ghl_browser_get_performance_overview: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "performance-overview", async () => {
                    await gotoGhl(page, "/performance-ai");
                    await waitForAppReady(page);
                    const data = await page.evaluate(() => {
                        const scores = {};
                        document.querySelectorAll('[class*="score"], [class*="Score"], [class*="metric"], [class*="Metric"]').forEach((el) => {
                            const label = el.querySelector('[class*="label"], [class*="title"], h4, h5')?.textContent?.trim() || "";
                            const value = el.querySelector('[class*="value"], [class*="number"], [class*="count"]')?.textContent?.trim() || "";
                            if (label && value)
                                scores[label] = value;
                        });
                        return { scores, url: window.location.href };
                    });
                    return data;
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_performance_suggestions: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "performance-suggestions", async () => {
                    await gotoGhl(page, "/performance-ai");
                    await waitForAppReady(page);
                    const suggestions = await page.evaluate(() => {
                        const items = [];
                        document
                            .querySelectorAll('[class*="suggestion"], [class*="Suggestion"], [class*="recommendation"], [class*="Recommendation"]')
                            .forEach((el) => {
                            const titleEl = el.querySelector('[class*="title"], h4, h5, [class*="label"]');
                            const descEl = el.querySelector('[class*="description"], p, [class*="body"]');
                            const catEl = el.querySelector('[class*="category"], [class*="tag"], [class*="badge"]');
                            const statusEl = el.querySelector('[class*="status"], [class*="state"]');
                            const text = el.textContent?.trim() || "";
                            if (text.length > 3) {
                                items.push({
                                    label: titleEl?.textContent?.trim() || text.slice(0, 80),
                                    description: descEl?.textContent?.trim() || "",
                                    category: catEl?.textContent?.trim() || "",
                                    status: statusEl?.textContent?.trim() || "",
                                });
                            }
                        });
                        return items;
                    });
                    return { count: suggestions.length, suggestions };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_apply_performance_suggestion: async (args) => {
            const label = String(args.label);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "performance-apply", async () => {
                    await gotoGhl(page, "/performance-ai");
                    await waitForAppReady(page);
                    const item = page
                        .locator(`[class*="suggestion"]:has-text("${label}"), [class*="Suggestion"]:has-text("${label}")`)
                        .first();
                    const applyBtn = item.locator('button:has-text("Apply"), button:has-text("Fix"), button:has-text("Optimize")').first();
                    await applyBtn.click();
                    await waitForAppReady(page);
                    return { label, applied: true };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_dismiss_performance_suggestion: async (args) => {
            const label = String(args.label);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "performance-dismiss", async () => {
                    await gotoGhl(page, "/performance-ai");
                    await waitForAppReady(page);
                    const item = page
                        .locator(`[class*="suggestion"]:has-text("${label}"), [class*="Suggestion"]:has-text("${label}")`)
                        .first();
                    const dismissBtn = item.locator('button:has-text("Dismiss"), button:has-text("Ignore"), [aria-label*="close"], [aria-label*="dismiss"]').first();
                    await dismissBtn.click();
                    await waitForAppReady(page);
                    return { label, dismissed: true };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_performance_scores: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "performance-scores", async () => {
                    await gotoGhl(page, "/performance-ai/scores");
                    await waitForAppReady(page);
                    const scores = await page.evaluate(() => {
                        const items = [];
                        document
                            .querySelectorAll("table tbody tr, [class*='score-row'], [class*='ScoreRow'], [class*='list-row']")
                            .forEach((el) => {
                            const cells = el.querySelectorAll("td, [class*='cell']");
                            const text = el.textContent?.trim() || "";
                            if (text.length > 2) {
                                items.push({
                                    name: cells[0]?.textContent?.trim() || text.slice(0, 60),
                                    score: cells[1]?.textContent?.trim() || "",
                                    type: cells[2]?.textContent?.trim() || "",
                                });
                            }
                        });
                        return items;
                    });
                    return { count: scores.length, scores };
                });
            }
            finally {
                await close();
            }
        },
    },
};
