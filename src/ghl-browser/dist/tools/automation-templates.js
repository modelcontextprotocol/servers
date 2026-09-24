import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const automationTemplatesModule = {
    tools: [
        {
            name: "ghl_browser_list_automation_templates",
            description: "List available automation templates/recipes from the GHL marketplace or library. " +
                "Returns name, category, description, and whether it's pre-built or custom.",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Optional search term" },
                    category: {
                        type: "string",
                        description: "Filter by category: 'all' (default), 'lead_nurture', 'appointment', 'onboarding', 'follow_up', 'sales', 'marketing'",
                    },
                },
            },
        },
        {
            name: "ghl_browser_get_automation_template_details",
            description: "Get full details of an automation template: steps, triggers, actions, and required configuration.",
            inputSchema: {
                type: "object",
                properties: {
                    templateName: { type: "string" },
                    templateId: { type: "string", description: "Template ID (preferred)" },
                },
            },
        },
        {
            name: "ghl_browser_install_automation_template",
            description: "Install an automation template/recipe, creating a new workflow from the template's blueprint.",
            inputSchema: {
                type: "object",
                properties: {
                    templateName: { type: "string" },
                    templateId: { type: "string" },
                    workflowName: {
                        type: "string",
                        description: "Name for the new workflow created from the template",
                    },
                },
            },
        },
        {
            name: "ghl_browser_list_automation_recipes",
            description: "List automation recipes (multi-step sequences combining workflows, campaigns, and triggers). " +
                "Returns recipe name, steps count, and category.",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Optional search term" },
                },
            },
        },
        {
            name: "ghl_browser_install_automation_recipe",
            description: "Install an automation recipe that creates multiple linked assets " +
                "(workflows, campaigns, forms, tags) from a single blueprint.",
            inputSchema: {
                type: "object",
                properties: {
                    recipeName: { type: "string" },
                    recipeId: { type: "string" },
                    name: {
                        type: "string",
                        description: "Base name for all created assets",
                    },
                },
            },
        },
    ],
    handlers: {
        ghl_browser_list_automation_templates: async (args) => {
            const search = asString(args.search);
            const category = asString(args.category) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "automation-templates-list", async () => {
                    await gotoGhl(page, "/automation/templates");
                    await waitForAppReady(page);
                    if (search) {
                        const searchInput = page
                            .locator('input[placeholder*="Search"], input[type="search"]')
                            .first();
                        try {
                            await searchInput.fill(search, { timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // search not available
                        }
                    }
                    if (category !== "all") {
                        const catFilter = page
                            .locator(`button:has-text("${category}"), [class*="filter"]:has-text("${category}"), [class*="tab"]:has-text("${category}")`)
                            .first();
                        try {
                            await catFilter.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // category filter may not exist
                        }
                    }
                    const templates = await page.evaluate(() => {
                        const items = [];
                        const cardSelectors = [
                            '[class*="TemplateCard"]',
                            '[class*="template-card"]',
                            '[class*="RecipeCard"]',
                            '[class*="recipe-card"]',
                            '[class*="BlueprintCard"]',
                            '[class*="card"]',
                        ];
                        for (const sel of cardSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("h3, h4, [class*='name'], [class*='Name'], [class*='title']");
                                const descEl = el.querySelector("[class*='desc'], [class*='Desc'], p, small");
                                const catEl = el.querySelector("[class*='category'], [class*='Category'], [class*='badge'], [class*='tag']");
                                const stepsEl = el.querySelector("[class*='step'], [class*='Step'], [class*='node']");
                                const sourceEl = el.querySelector("[class*='source'], [class*='Source'], [class*='author']");
                                const id = el.getAttribute("data-id") || el.getAttribute("data-template-id") || "";
                                const name = nameEl?.textContent?.trim() || "";
                                if (name) {
                                    items.push({
                                        name,
                                        description: descEl?.textContent?.trim() || "",
                                        category: catEl?.textContent?.trim() || "",
                                        steps: stepsEl?.textContent?.trim() || "",
                                        source: sourceEl?.textContent?.trim() || "",
                                        id,
                                    });
                                }
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(templates.map((t) => [t.id || t.name, t])).values());
                    return { count: deduped.length, templates: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_automation_template_details: async (args) => {
            const name = asString(args.templateName);
            const id = asString(args.templateId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "automation-templates-details", async () => {
                    if (id) {
                        await gotoGhl(page, `/automation/templates/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/automation/templates");
                        await waitForAppReady(page);
                        await page
                            .locator(`[class*="card"]:has-text("${name}"), a:has-text("${name}")`)
                            .first()
                            .click();
                    }
                    else {
                        throw new Error("templateName or templateId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const details = await page.evaluate(() => {
                        const steps = [];
                        document
                            .querySelectorAll('[class*="step"], [class*="Step"], [class*="node"], [class*="Node"], [class*="action-item"]')
                            .forEach((el) => {
                            const nameEl = el.querySelector("[class*='name'], [class*='Name'], h3, h4, span:first-child");
                            const typeEl = el.querySelector("[class*='type'], [class*='Type'], [class*='badge']");
                            const descEl = el.querySelector("[class*='desc'], [class*='Desc'], p, small");
                            const stepName = nameEl?.textContent?.trim();
                            if (stepName) {
                                steps.push({
                                    name: stepName,
                                    type: typeEl?.textContent?.trim() || "",
                                    description: descEl?.textContent?.trim() || "",
                                });
                            }
                        });
                        const requirements = [];
                        document
                            .querySelectorAll('[class*="requirement"], [class*="Requirement"], [class*="prerequisite"], li')
                            .forEach((el) => {
                            const text = el.textContent?.trim();
                            if (text && text.length < 200 && text.length > 5) {
                                requirements.push(text);
                            }
                        });
                        return {
                            title: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
                            description: document.querySelector("[class*='description'], [class*='desc'], p")?.textContent?.trim() || "",
                            steps,
                            requirements: requirements.slice(0, 20),
                        };
                    });
                    return {
                        templateId: id || null,
                        templateName: name || details.title || null,
                        description: details.description,
                        steps: details.steps,
                        requirements: details.requirements,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_install_automation_template: async (args) => {
            const name = asString(args.templateName);
            const id = asString(args.templateId);
            const workflowName = asString(args.workflowName);
            if (!name && !id)
                throw new Error("templateName or templateId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "automation-templates-install", async () => {
                    if (id) {
                        await gotoGhl(page, `/automation/templates/${id}`);
                    }
                    else {
                        await gotoGhl(page, "/automation/templates");
                        await waitForAppReady(page);
                        await page
                            .locator(`[class*="card"]:has-text("${name}"), a:has-text("${name}")`)
                            .first()
                            .click();
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const installBtn = page
                        .locator('button:has-text("Install"), button:has-text("Use Template"), button:has-text("Import"), button:has-text("Apply")')
                        .first();
                    await installBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    if (workflowName) {
                        const nameInput = page
                            .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="Workflow"]')
                            .first();
                        try {
                            await nameInput.fill(workflowName, { timeout: 5000 });
                        }
                        catch {
                            // name input may not appear
                        }
                    }
                    const confirmBtn = page
                        .locator('button:has-text("Install"), button:has-text("Confirm"), button:has-text("Create"), button:has-text("Import")')
                        .first();
                    await confirmBtn.click({ timeout: 10000 });
                    await page.waitForTimeout(3000);
                    return {
                        templateName: name,
                        templateId: id,
                        workflowName: workflowName || null,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_automation_recipes: async (args) => {
            const search = asString(args.search);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "automation-recipes-list", async () => {
                    await gotoGhl(page, "/automation/recipes");
                    await waitForAppReady(page);
                    if (search) {
                        const searchInput = page
                            .locator('input[placeholder*="Search"], input[type="search"]')
                            .first();
                        try {
                            await searchInput.fill(search, { timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // search not available
                        }
                    }
                    const recipes = await page.evaluate(() => {
                        const items = [];
                        const cardSelectors = [
                            '[class*="RecipeCard"]',
                            '[class*="recipe-card"]',
                            '[class*="BlueprintCard"]',
                            '[class*="card"]',
                        ];
                        for (const sel of cardSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("h3, h4, [class*='name'], [class*='Name'], [class*='title']");
                                const descEl = el.querySelector("[class*='desc'], [class*='Desc'], p, small");
                                const catEl = el.querySelector("[class*='category'], [class*='Category'], [class*='badge']");
                                const assetsEl = el.querySelector("[class*='asset'], [class*='Asset'], [class*='includes']");
                                const id = el.getAttribute("data-id") || el.getAttribute("data-recipe-id") || "";
                                const name = nameEl?.textContent?.trim() || "";
                                if (name) {
                                    items.push({
                                        name,
                                        description: descEl?.textContent?.trim() || "",
                                        category: catEl?.textContent?.trim() || "",
                                        assets: assetsEl?.textContent?.trim() || "",
                                        id,
                                    });
                                }
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(recipes.map((r) => [r.id || r.name, r])).values());
                    return { count: deduped.length, recipes: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_install_automation_recipe: async (args) => {
            const name = asString(args.recipeName);
            const id = asString(args.recipeId);
            const baseName = asString(args.name);
            if (!name && !id)
                throw new Error("recipeName or recipeId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "automation-recipes-install", async () => {
                    if (id) {
                        await gotoGhl(page, `/automation/recipes/${id}`);
                    }
                    else {
                        await gotoGhl(page, "/automation/recipes");
                        await waitForAppReady(page);
                        await page
                            .locator(`[class*="card"]:has-text("${name}"), a:has-text("${name}")`)
                            .first()
                            .click();
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const installBtn = page
                        .locator('button:has-text("Install"), button:has-text("Use Recipe"), button:has-text("Import")')
                        .first();
                    await installBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    if (baseName) {
                        const nameInput = page
                            .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="name"]')
                            .first();
                        try {
                            await nameInput.fill(baseName, { timeout: 5000 });
                        }
                        catch {
                            // name input may not appear
                        }
                    }
                    const confirmBtn = page
                        .locator('button:has-text("Install"), button:has-text("Confirm"), button:has-text("Create"), button:has-text("Import")')
                        .first();
                    await confirmBtn.click({ timeout: 10000 });
                    await page.waitForTimeout(5000);
                    return {
                        recipeName: name,
                        recipeId: id,
                        baseName: baseName || null,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
    },
};
