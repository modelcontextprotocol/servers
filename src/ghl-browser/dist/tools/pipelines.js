import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const pipelinesModule = {
    tools: [
        {
            name: "ghl_browser_list_pipeline_opportunities",
            description: "List opportunities in a pipeline grouped by stage (reads from the Kanban).",
            inputSchema: {
                type: "object",
                properties: {
                    pipelineName: { type: "string", description: "Pipeline name (or id)" },
                },
            },
        },
        {
            name: "ghl_browser_move_opportunity_stage",
            description: "Drag an opportunity card from one stage to another.",
            inputSchema: {
                type: "object",
                properties: {
                    pipelineName: { type: "string" },
                    opportunityName: { type: "string" },
                    fromStage: { type: "string" },
                    toStage: { type: "string" },
                },
                required: ["pipelineName", "opportunityName", "toStage"],
            },
        },
        {
            name: "ghl_browser_snapshot_pipeline",
            description: "Capture a snapshot of a pipeline board (stage → count + sample opps).",
            inputSchema: {
                type: "object",
                properties: {
                    pipelineName: { type: "string" },
                },
                required: ["pipelineName"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_pipeline_opportunities: async (args) => {
            const pipelineName = args.pipelineName;
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "pipeline-list", async () => {
                    await gotoGhl(page, "/opportunities");
                    await waitForAppReady(page);
                    if (pipelineName) {
                        const picker = page.locator('[class*="pipeline-picker"], [aria-label*="Pipeline"]').first();
                        try {
                            await picker.click({ timeout: 3000 });
                            await page.locator(`[role="option"]:has-text("${pipelineName}"), li:has-text("${pipelineName}")`).first().click();
                            await waitForAppReady(page);
                        }
                        catch {
                            // picker may not be present if only one pipeline
                        }
                    }
                    const stages = await page.evaluate(() => {
                        const out = [];
                        document.querySelectorAll('[class*="column"], [class*="Column"], [class*="stage"]').forEach((col) => {
                            const title = col.querySelector("h3, h4, [class*='title']");
                            const cards = col.querySelectorAll('[class*="card"], [class*="Card"], [data-testid*="opp"]');
                            out.push({
                                stage: title?.textContent?.trim() || "",
                                count: cards.length,
                                items: Array.from(cards).map((c) => c.textContent?.slice(0, 80).trim() || ""),
                            });
                        });
                        return out;
                    });
                    return { pipeline: pipelineName || "(default)", stages };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_move_opportunity_stage: async (args) => {
            const pipelineName = String(args.pipelineName);
            const oppName = String(args.opportunityName);
            const toStage = String(args.toStage);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "pipeline-drag", async () => {
                    await gotoGhl(page, "/opportunities");
                    await waitForAppReady(page);
                    const card = page.locator(`[class*="card"]:has-text("${oppName}")`).first();
                    const target = page.locator(`[class*="column"]:has-text("${toStage}")`).first();
                    await card.dragTo(target);
                    await waitForAppReady(page);
                    return { pipeline: pipelineName, opportunity: oppName, toStage, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_snapshot_pipeline: async (args) => {
            const pipelineName = String(args.pipelineName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "pipeline-snapshot", async () => {
                    await gotoGhl(page, "/opportunities");
                    await waitForAppReady(page);
                    const snapshot = await page.evaluate(() => {
                        const stages = [];
                        document.querySelectorAll('[class*="column"], [class*="Column"], [class*="stage"]').forEach((col) => {
                            const title = col.querySelector("h3, h4, [class*='title']");
                            const cards = col.querySelectorAll('[class*="card"], [class*="Card"]');
                            stages.push({
                                stage: title?.textContent?.trim() || "",
                                count: cards.length,
                                samples: Array.from(cards)
                                    .slice(0, 5)
                                    .map((c) => c.textContent?.slice(0, 80).trim() || ""),
                            });
                        });
                        return { total: stages.reduce((n, s) => n + s.count, 0), stages };
                    });
                    return { pipeline: pipelineName, ...snapshot, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
