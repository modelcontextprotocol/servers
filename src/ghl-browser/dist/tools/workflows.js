import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const workflowsModule = {
    tools: [
        {
            name: "ghl_browser_list_workflows",
            description: "List workflows visible on the GHL Workflows index page.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_workflow",
            description: "Create a new workflow via the GHL UI. Returns the workflow row after save.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    template: { type: "string", description: "Optional template name to start from" },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_get_workflow_canvas",
            description: "Open a workflow and return a snapshot of its canvas: triggers, actions, and their connections.",
            inputSchema: {
                type: "object",
                properties: {
                    workflowName: { type: "string", description: "Workflow name (used to find the row)" },
                    workflowId: { type: "string", description: "Workflow ID (preferred if known)" },
                },
            },
        },
        {
            name: "ghl_browser_add_workflow_node",
            description: "Add a trigger or action node to an open workflow canvas. Requires the workflow already open.",
            inputSchema: {
                type: "object",
                properties: {
                    workflowName: { type: "string" },
                    nodeType: { type: "string", description: "e.g. 'trigger', 'action', 'wait', 'condition'" },
                    nodeLabel: { type: "string" },
                    config: { type: "object", additionalProperties: true },
                },
                required: ["workflowName", "nodeType"],
            },
        },
        {
            name: "ghl_browser_save_workflow",
            description: "Save (and optionally publish) the current workflow from the canvas.",
            inputSchema: {
                type: "object",
                properties: {
                    workflowName: { type: "string" },
                    publish: { type: "boolean" },
                },
                required: ["workflowName"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_workflows: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "workflows-list", async () => {
                    await gotoGhl(page, "/automation/workflows");
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document
                            .querySelectorAll('[data-testid*="workflow"], [class*="WorkflowRow"], a[href*="/workflow/"]')
                            .forEach((el) => {
                            const a = el.closest("a");
                            const nameEl = el.querySelector("h3, h4, [class*='name'], [class*='Name']");
                            const statusEl = el.querySelector("[class*='status'], [class*='Status']");
                            items.push({
                                name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                                status: statusEl?.textContent?.trim() || "",
                                href: a?.href || "",
                            });
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
        ghl_browser_create_workflow: async (args) => {
            const name = String(args.name);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "workflows-create", async () => {
                    await gotoGhl(page, "/automation/workflows");
                    await waitForAppReady(page);
                    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Workflow")').first();
                    await createBtn.click();
                    await page.waitForTimeout(600);
                    const nameInput = page.locator('input[name="name"], input[placeholder*="Workflow"], input[type="text"]').first();
                    await nameInput.fill(name);
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_workflow_canvas: async (args) => {
            const name = args.workflowName;
            const id = args.workflowId;
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "workflows-canvas", async () => {
                    if (id) {
                        await gotoGhl(page, `/automation/workflows/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/automation/workflows");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("workflowName or workflowId is required");
                    }
                    await waitForAppReady(page);
                    const snapshot = await page.evaluate(() => {
                        const nodes = [];
                        document
                            .querySelectorAll('[class*="node"], [class*="Node"], [data-node-id]')
                            .forEach((el) => {
                            nodes.push({
                                id: el.getAttribute("data-node-id") || el.getAttribute("data-id") || "",
                                label: el.textContent?.slice(0, 120).trim() || "",
                                type: el.getAttribute("data-node-type") || "",
                            });
                        });
                        return { nodes };
                    });
                    return { workflowId: id || null, name: name || null, ...snapshot, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_add_workflow_node: async (args) => {
            const name = String(args.workflowName);
            const nodeType = String(args.nodeType);
            const label = args.nodeLabel;
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "workflows-add-node", async () => {
                    await gotoGhl(page, "/automation/workflows");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${name}")`).first().click();
                    await waitForAppReady(page);
                    const addBtn = page.locator('button:has-text("Add"), [class*="add-node"], [class*="AddNode"]').first();
                    await addBtn.click();
                    await page.waitForTimeout(400);
                    const typeChoice = page.locator(`button:has-text("${nodeType}"), [data-type="${nodeType}"]`).first();
                    await typeChoice.click();
                    if (label) {
                        const labelInput = page.locator('input[name="label"], input[placeholder*="name"]').first();
                        try {
                            await labelInput.fill(label, { timeout: 3000 });
                        }
                        catch {
                            // label input optional on some node types
                        }
                    }
                    return { workflowName: name, nodeType, nodeLabel: label || null, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_save_workflow: async (args) => {
            const name = String(args.workflowName);
            const publish = Boolean(args.publish);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "workflows-save", async () => {
                    await gotoGhl(page, "/automation/workflows");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${name}")`).first().click();
                    await waitForAppReady(page);
                    const saveBtn = page.locator('button:has-text("Save")').first();
                    await saveBtn.click();
                    await page.waitForTimeout(800);
                    if (publish) {
                        const pubBtn = page.locator('button:has-text("Publish"), [class*="publish"]').first();
                        try {
                            await pubBtn.click({ timeout: 3000 });
                        }
                        catch {
                            // publish step may already be active
                        }
                    }
                    return { workflowName: name, published: publish, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
