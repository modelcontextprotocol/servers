import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const formBuilderModule = {
    tools: [
        {
            name: "ghl_browser_list_forms",
            description: "List all forms (and optionally surveys) on the GHL Forms index page. " +
                "Returns form name, type, status, and ID for each row.",
            inputSchema: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        description: "Filter by type: 'forms' (default), 'surveys', or 'all'",
                    },
                    search: {
                        type: "string",
                        description: "Optional search term to filter by name",
                    },
                },
            },
        },
        {
            name: "ghl_browser_create_form",
            description: "Create a new form or survey via the GHL UI. Returns the form name and URL after creation.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Form name" },
                    type: {
                        type: "string",
                        description: "'form' (default) or 'survey'",
                    },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_get_form_builder",
            description: "Open a form in the builder and return its current field layout: field names, types, " +
                "required flags, and order. Useful for inspecting or auditing a form's structure.",
            inputSchema: {
                type: "object",
                properties: {
                    formName: { type: "string", description: "Form name (used to find the row on the index page)" },
                    formId: { type: "string", description: "Form ID (preferred if known — opens the builder directly)" },
                },
            },
        },
        {
            name: "ghl_browser_add_form_field",
            description: "Add a field to a form from the builder's field palette. " +
                "Supports standard GHL field types: text, email, phone, textarea, dropdown, checkbox, radio, " +
                "date, file_upload, number, and any custom type visible in the palette.",
            inputSchema: {
                type: "object",
                properties: {
                    formName: { type: "string", description: "Form name" },
                    formId: { type: "string", description: "Form ID (preferred)" },
                    fieldType: { type: "string", description: "Field type from the palette (e.g. 'text', 'email', 'phone', 'dropdown')" },
                    fieldLabel: { type: "string", description: "Label to set on the field after adding" },
                },
                required: ["fieldType"],
            },
        },
        {
            name: "ghl_browser_save_form",
            description: "Save the current form from the builder. Optionally publish it to make it live.",
            inputSchema: {
                type: "object",
                properties: {
                    formName: { type: "string" },
                    formId: { type: "string", description: "Form ID (preferred)" },
                    publish: { type: "boolean", description: "Whether to publish the form after saving" },
                },
            },
        },
        {
            name: "ghl_browser_delete_form",
            description: "Delete a form from the forms index page. This action is irreversible.",
            inputSchema: {
                type: "object",
                properties: {
                    formName: { type: "string", description: "Form name to delete" },
                    formId: { type: "string", description: "Form ID to delete" },
                    confirm: { type: "boolean", description: "Must be true to proceed with deletion" },
                },
                required: ["confirm"],
            },
        },
        {
            name: "ghl_browser_get_form_embed",
            description: "Get the embed code (HTML snippet, iframe URL, or direct link) for a form. " +
                "Useful for embedding the form on external websites or funnels.",
            inputSchema: {
                type: "object",
                properties: {
                    formName: { type: "string" },
                    formId: { type: "string", description: "Form ID (preferred)" },
                    format: {
                        type: "string",
                        description: "'html' (default), 'iframe', or 'link'",
                    },
                },
            },
        },
    ],
    handlers: {
        ghl_browser_list_forms: async (args) => {
            const filterType = asString(args.type) || "forms";
            const search = asString(args.search);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "forms-list", async () => {
                    const path = filterType === "surveys" ? "/sites/surveys" : "/sites/forms";
                    await gotoGhl(page, path);
                    await waitForAppReady(page);
                    if (search) {
                        const searchInput = page.locator('input[placeholder*="Search"], input[type="search"], input[name="search"]').first();
                        try {
                            await searchInput.fill(search, { timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // search input not available
                        }
                    }
                    const rows = await page.evaluate((filter) => {
                        const items = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="ListRow"]',
                            '[class*="form-row"]',
                            '[class*="FormRow"]',
                            '[class*="table-row"]',
                            'a[href*="/form/"]',
                            '[data-testid*="form"]',
                            '[data-testid*="survey"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const anchor = el.closest("a") || el.querySelector("a");
                                const nameEl = el.querySelector("td, [class*='name'], [class*='Name'], h3, h4, span");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge']");
                                const typeEl = el.querySelector("[class*='type'], [class*='Type']");
                                const href = anchor?.getAttribute("href") || "";
                                const idMatch = href.match(/\/(?:form|survey)s?\/([a-zA-Z0-9]+)/);
                                items.push({
                                    name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                                    type: typeEl?.textContent?.trim() || (href.includes("survey") ? "survey" : "form"),
                                    status: statusEl?.textContent?.trim() || "",
                                    id: idMatch?.[1] || el.getAttribute("data-row-key") || "",
                                    href,
                                });
                            });
                        }
                        return items;
                    }, filterType);
                    const deduped = Array.from(new Map(rows.map((r) => [r.id || r.name, r])).values());
                    return { count: deduped.length, forms: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_form: async (args) => {
            const name = asString(args.name);
            const type = asString(args.type) || "form";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "forms-create", async () => {
                    const path = type === "survey" ? "/sites/surveys" : "/sites/forms";
                    await gotoGhl(page, path);
                    await waitForAppReady(page);
                    const createBtn = page
                        .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")')
                        .first();
                    await createBtn.click();
                    await page.waitForTimeout(800);
                    const nameInput = page
                        .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="name"], input[type="text"]')
                        .first();
                    await nameInput.fill(name);
                    const saveBtn = page
                        .locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")')
                        .first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, type, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_form_builder: async (args) => {
            const name = asString(args.formName);
            const id = asString(args.formId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "forms-builder", async () => {
                    if (id) {
                        await gotoGhl(page, `/sites/forms/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/sites/forms");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("formName or formId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const builder = await page.evaluate(() => {
                        const fields = [];
                        const fieldSelectors = [
                            '[class*="field-item"]',
                            '[class*="FieldItem"]',
                            '[class*="FormField"]',
                            '[class*="form-field"]',
                            '[class*="builder-field"]',
                            '[draggable="true"]',
                            '[data-field-type]',
                        ];
                        for (const sel of fieldSelectors) {
                            document.querySelectorAll(sel).forEach((el, idx) => {
                                const labelEl = el.querySelector("label, [class*='label'], [class*='Label'], span");
                                const typeAttr = el.getAttribute("data-field-type") || "";
                                const typeFromClass = el.className?.toString().match(/(?:field|type)-(\w+)/)?.[1] || "";
                                const isRequired = !!el.querySelector("[class*='required'], .required, [aria-required='true']");
                                fields.push({
                                    label: labelEl?.textContent?.trim() || "",
                                    type: typeAttr || typeFromClass || "unknown",
                                    required: isRequired,
                                    order: idx,
                                });
                            });
                        }
                        const palette = [];
                        document
                            .querySelectorAll('[class*="palette"] [class*="item"], [class*="sidebar"] [class*="field"], [class*="FieldList"] button')
                            .forEach((el) => {
                            const t = el.textContent?.trim();
                            if (t)
                                palette.push(t);
                        });
                        return {
                            fields,
                            palette,
                            title: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
                        };
                    });
                    return {
                        formId: id || null,
                        formName: name || builder.title || null,
                        fieldCount: builder.fields.length,
                        fields: builder.fields,
                        palette: builder.palette,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_add_form_field: async (args) => {
            const name = asString(args.formName);
            const id = asString(args.formId);
            const fieldType = asString(args.fieldType);
            const fieldLabel = asString(args.fieldLabel);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "forms-add-field", async () => {
                    if (id) {
                        await gotoGhl(page, `/sites/forms/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/sites/forms");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("formName or formId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const paletteItem = page
                        .locator(`[class*="palette"] :has-text("${fieldType}"), ` +
                        `[class*="sidebar"] :has-text("${fieldType}"), ` +
                        `[class*="FieldList"] :has-text("${fieldType}"), ` +
                        `[data-field-type="${fieldType}"]`)
                        .first();
                    try {
                        await paletteItem.click({ timeout: 5000 });
                    }
                    catch {
                        const addBtn = page.locator('button:has-text("Add Field"), button:has-text("Add")').first();
                        try {
                            await addBtn.click({ timeout: 3000 });
                            await page.waitForTimeout(500);
                            await page.locator(`[class*="option"]:has-text("${fieldType}"), button:has-text("${fieldType}")`).first().click({ timeout: 3000 });
                        }
                        catch {
                            throw new Error(`Could not find field type "${fieldType}" in the palette`);
                        }
                    }
                    await page.waitForTimeout(1000);
                    if (fieldLabel) {
                        const lastField = page.locator('[class*="field-item"], [class*="FieldItem"], [draggable="true"]').last();
                        try {
                            const labelInput = lastField.locator("input[type='text'], input[name='label']").first();
                            await labelInput.fill(fieldLabel, { timeout: 3000 });
                        }
                        catch {
                            // label edit may require clicking into the field first
                        }
                    }
                    return { formName: name, formId: id, fieldType, fieldLabel: fieldLabel || null, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_save_form: async (args) => {
            const name = asString(args.formName);
            const id = asString(args.formId);
            const publish = Boolean(args.publish);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "forms-save", async () => {
                    if (id) {
                        await gotoGhl(page, `/sites/forms/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/sites/forms");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("formName or formId is required");
                    }
                    await waitForAppReady(page);
                    const saveBtn = page.locator('button:has-text("Save")').first();
                    await saveBtn.click();
                    await page.waitForTimeout(1500);
                    if (publish) {
                        const pubBtn = page.locator('button:has-text("Publish"), button:has-text("Activate")').first();
                        try {
                            await pubBtn.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // publish may already be active or combined with save
                        }
                    }
                    return { formName: name, formId: id, published: publish, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_delete_form: async (args) => {
            const name = asString(args.formName);
            const id = asString(args.formId);
            const confirm = Boolean(args.confirm);
            if (!confirm)
                throw new Error("confirm must be true to delete a form");
            if (!name && !id)
                throw new Error("formName or formId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "forms-delete", async () => {
                    await gotoGhl(page, "/sites/forms");
                    await waitForAppReady(page);
                    const rowSelector = id
                        ? `tr[data-row-key="${id}"], [data-id="${id}"]`
                        : `[class*="row"]:has-text("${name}"), tr:has-text("${name}")`;
                    const row = page.locator(rowSelector).first();
                    const menuBtn = row.locator('button:has-text("⋮"), button:has-text("⋯"), [class*="menu"], [class*="actions"] button').first();
                    await menuBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const deleteOption = page.locator('text="Delete", text="delete", [class*="delete"]').first();
                    await deleteOption.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")').first();
                    await confirmBtn.click({ timeout: 5000 });
                    await waitForAppReady(page);
                    return { formName: name, formId: id, deleted: true };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_form_embed: async (args) => {
            const name = asString(args.formName);
            const id = asString(args.formId);
            const format = asString(args.format) || "html";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "forms-embed", async () => {
                    if (id) {
                        await gotoGhl(page, `/sites/forms/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/sites/forms");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("formName or formId is required");
                    }
                    await waitForAppReady(page);
                    const embedBtn = page
                        .locator('button:has-text("Embed"), button:has-text("Share"), button:has-text("Publish")')
                        .first();
                    try {
                        await embedBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(1500);
                    }
                    catch {
                        // embed option may be in a dropdown menu
                        const menuBtn = page.locator('button:has-text("⋮"), [class*="more"]').first();
                        try {
                            await menuBtn.click({ timeout: 3000 });
                            await page.locator('text="Embed", text="Get Code"').first().click({ timeout: 3000 });
                            await page.waitForTimeout(1500);
                        }
                        catch {
                            // fallback
                        }
                    }
                    const embedData = await page.evaluate(() => {
                        const codeEl = document.querySelector("textarea, pre, code, [class*='embed-code'], [class*='code']");
                        const iframeEl = document.querySelector('[class*="iframe"], input[value*="iframe"]');
                        const linkEl = document.querySelector('a[href*="form"], input[value*="http"]');
                        return {
                            html: codeEl?.textContent?.trim() || codeEl?.value || "",
                            iframe: iframeEl?.textContent?.trim() || iframeEl?.value || "",
                            link: linkEl?.getAttribute("href") || linkEl?.value || "",
                        };
                    });
                    return {
                        formName: name,
                        formId: id,
                        format,
                        embedCode: format === "iframe" ? embedData.iframe : format === "link" ? embedData.link : embedData.html,
                        allFormats: embedData,
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
