import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const tagsFieldsModule = {
    tools: [
        {
            name: "ghl_browser_list_tags",
            description: "List all tags configured in the sub-account. Returns tag name, color, and usage count.",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Optional search term" },
                },
            },
        },
        {
            name: "ghl_browser_create_tag",
            description: "Create a new tag in the sub-account.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Tag name" },
                    color: { type: "string", description: "Tag color (hex, e.g. '#ff6600')" },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_delete_tag",
            description: "Delete a tag. This removes it from all contacts.",
            inputSchema: {
                type: "object",
                properties: {
                    tagName: { type: "string" },
                    tagId: { type: "string" },
                    confirm: { type: "boolean", description: "Must be true to proceed" },
                },
                required: ["confirm"],
            },
        },
        {
            name: "ghl_browser_list_custom_fields",
            description: "List all custom fields for the sub-account. Returns field name, key, type, and model (contact/opportunity).",
            inputSchema: {
                type: "object",
                properties: {
                    model: {
                        type: "string",
                        description: "Filter by model: 'all' (default), 'contact', 'opportunity'",
                    },
                },
            },
        },
        {
            name: "ghl_browser_create_custom_field",
            description: "Create a new custom field for contacts or opportunities.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Field display name" },
                    fieldType: {
                        type: "string",
                        description: "Field type: 'text', 'textarea', 'number', 'phone', 'email', 'date', 'checkbox', 'radio', 'select', 'multiselect', 'url'",
                    },
                    model: {
                        type: "string",
                        description: "Entity model: 'contact' (default) or 'opportunity'",
                    },
                    placeholder: { type: "string", description: "Placeholder text" },
                    options: {
                        type: "string",
                        description: "Comma-separated options for select/radio/checkbox fields",
                    },
                    required: { type: "boolean", description: "Whether the field is required" },
                },
                required: ["name", "fieldType"],
            },
        },
        {
            name: "ghl_browser_update_custom_field",
            description: "Update a custom field's name, placeholder, options, or settings.",
            inputSchema: {
                type: "object",
                properties: {
                    fieldName: { type: "string", description: "Current field name" },
                    fieldId: { type: "string", description: "Field ID (preferred)" },
                    newName: { type: "string", description: "New display name" },
                    placeholder: { type: "string", description: "New placeholder text" },
                    options: { type: "string", description: "Updated comma-separated options" },
                },
            },
        },
        {
            name: "ghl_browser_delete_custom_field",
            description: "Delete a custom field. This is irreversible.",
            inputSchema: {
                type: "object",
                properties: {
                    fieldName: { type: "string" },
                    fieldId: { type: "string" },
                    confirm: { type: "boolean", description: "Must be true to proceed" },
                },
                required: ["confirm"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_tags: async (args) => {
            const search = asString(args.search);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "tags-list", async () => {
                    await gotoGhl(page, "/settings/tags");
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
                    const tags = await page.evaluate(() => {
                        const items = [];
                        const rowSelectors = [
                            '[class*="TagRow"]',
                            '[class*="tag-row"]',
                            '[class*="TagItem"]',
                            '[class*="tag-item"]',
                            "tr[data-row-key]",
                            '[class*="ListRow"]',
                            '[data-testid*="tag"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("td:first-child, [class*='name'], [class*='Name'], h3, span");
                                const colorEl = el.querySelector("[class*='color'], [class*='Color'], [class*='swatch'], [style*='background']");
                                const countEl = el.querySelector("[class*='count'], [class*='Count'], td:nth-child(3)");
                                const bgColor = colorEl?.getAttribute("style")?.match(/background(?:-color)?:\s*([^;]+)/)?.[1]?.trim() || "";
                                const id = el.getAttribute("data-row-key") || el.getAttribute("data-id") || "";
                                items.push({
                                    name: nameEl?.textContent?.trim() || "",
                                    color: bgColor || colorEl?.textContent?.trim() || "",
                                    count: countEl?.textContent?.trim() || "",
                                    id,
                                });
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(tags.map((t) => [t.id || t.name, t])).values());
                    return { count: deduped.length, tags: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_tag: async (args) => {
            const name = asString(args.name);
            const color = asString(args.color);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "tags-create", async () => {
                    await gotoGhl(page, "/settings/tags");
                    await waitForAppReady(page);
                    const createBtn = page
                        .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
                        .first();
                    await createBtn.click();
                    await page.waitForTimeout(1000);
                    const nameInput = page
                        .locator('input[name="name"], input[placeholder*="Tag"], input[placeholder*="Name"]')
                        .first();
                    await nameInput.fill(name);
                    if (color) {
                        const colorInput = page.locator('input[type="color"], input[name="color"]').first();
                        try {
                            await colorInput.fill(color, { timeout: 3000 });
                        }
                        catch {
                            // color picker may not be available
                        }
                    }
                    const saveBtn = page
                        .locator('button:has-text("Save"), button:has-text("Create")')
                        .first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, color: color || null, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_delete_tag: async (args) => {
            const name = asString(args.tagName);
            const id = asString(args.tagId);
            const confirm = Boolean(args.confirm);
            if (!confirm)
                throw new Error("confirm must be true to delete a tag");
            if (!name && !id)
                throw new Error("tagName or tagId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "tags-delete", async () => {
                    await gotoGhl(page, "/settings/tags");
                    await waitForAppReady(page);
                    const rowSelector = id
                        ? `tr[data-row-key="${id}"], [data-id="${id}"]`
                        : `[class*="row"]:has-text("${name}"), tr:has-text("${name}")`;
                    const row = page.locator(rowSelector).first();
                    const menuBtn = row
                        .locator('button:has-text("⋮"), button:has-text("⋯"), [class*="menu"], [class*="actions"] button')
                        .first();
                    await menuBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const deleteOption = page
                        .locator('text="Delete", text="delete", [class*="delete"]')
                        .first();
                    await deleteOption.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const confirmBtn = page
                        .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
                        .first();
                    await confirmBtn.click({ timeout: 5000 });
                    await waitForAppReady(page);
                    return { tagName: name, tagId: id, deleted: true };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_custom_fields: async (args) => {
            const model = asString(args.model) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "custom-fields-list", async () => {
                    await gotoGhl(page, "/settings/custom-fields");
                    await waitForAppReady(page);
                    if (model !== "all") {
                        const modelTab = page
                            .locator(`button:has-text("${model}"), [class*="tab"]:has-text("${model}"), [class*="filter"]:has-text("${model}")`)
                            .first();
                        try {
                            await modelTab.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // tab may not exist
                        }
                    }
                    const fields = await page.evaluate(() => {
                        const items = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="FieldRow"]',
                            '[class*="field-row"]',
                            '[class*="ListRow"]',
                            '[class*="table-row"]',
                            '[data-testid*="field"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("td:first-child, [class*='name'], [class*='Name'], h3");
                                const keyEl = el.querySelector("[class*='key'], [class*='Key'], code, td:nth-child(2)");
                                const typeEl = el.querySelector("[class*='type'], [class*='Type'], td:nth-child(3)");
                                const modelEl = el.querySelector("[class*='model'], [class*='Model'], td:nth-child(4)");
                                const requiredEl = el.querySelector("[class*='required'], [aria-required], td:has([class*='check'])");
                                const id = el.getAttribute("data-row-key") || el.getAttribute("data-id") || "";
                                items.push({
                                    name: nameEl?.textContent?.trim() || "",
                                    key: keyEl?.textContent?.trim() || "",
                                    type: typeEl?.textContent?.trim() || "",
                                    model: modelEl?.textContent?.trim() || "",
                                    required: !!requiredEl,
                                    id,
                                });
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(fields.map((f) => [f.id || f.key || f.name, f])).values());
                    return { count: deduped.length, customFields: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_custom_field: async (args) => {
            const name = asString(args.name);
            const fieldType = asString(args.fieldType);
            const model = asString(args.model) || "contact";
            const placeholder = asString(args.placeholder);
            const options = asString(args.options);
            const required = Boolean(args.required);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "custom-fields-create", async () => {
                    await gotoGhl(page, "/settings/custom-fields");
                    await waitForAppReady(page);
                    const createBtn = page
                        .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
                        .first();
                    await createBtn.click();
                    await page.waitForTimeout(1000);
                    const nameInput = page
                        .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="Field"]')
                        .first();
                    await nameInput.fill(name);
                    const typeSelect = page
                        .locator('select[name*="type"], [class*="type"] [class*="select"], [class*="Type"] [class*="select"]')
                        .first();
                    try {
                        await typeSelect.click({ timeout: 5000 });
                        await page
                            .locator(`[class*="option"]:has-text("${fieldType}"), button:has-text("${fieldType}")`)
                            .first()
                            .click({ timeout: 3000 });
                    }
                    catch {
                        // type selector may work differently
                    }
                    if (model !== "contact") {
                        const modelSelect = page
                            .locator('[class*="model"] [class*="select"], select[name*="model"]')
                            .first();
                        try {
                            await modelSelect.click({ timeout: 3000 });
                            await page
                                .locator(`[class*="option"]:has-text("${model}")`)
                                .first()
                                .click({ timeout: 3000 });
                        }
                        catch {
                            // model selector may not exist
                        }
                    }
                    if (placeholder) {
                        const phInput = page
                            .locator('input[name="placeholder"], input[placeholder*="Placeholder"]')
                            .first();
                        try {
                            await phInput.fill(placeholder, { timeout: 3000 });
                        }
                        catch {
                            // placeholder may not be available
                        }
                    }
                    if (options) {
                        const optionsInput = page
                            .locator('textarea[name="options"], textarea[placeholder*="option"], textarea')
                            .first();
                        try {
                            await optionsInput.fill(options, { timeout: 3000 });
                        }
                        catch {
                            // options textarea may not be available for this field type
                        }
                    }
                    if (required) {
                        const requiredToggle = page
                            .locator('label:has-text("Required") input, [class*="required"] [class*="toggle"], input[name="required"]')
                            .first();
                        try {
                            await requiredToggle.click({ timeout: 3000 });
                        }
                        catch {
                            // required toggle may not exist
                        }
                    }
                    const saveBtn = page
                        .locator('button:has-text("Save"), button:has-text("Create")')
                        .first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, fieldType, model, placeholder: placeholder || null, options: options || null, required, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_update_custom_field: async (args) => {
            const name = asString(args.fieldName);
            const id = asString(args.fieldId);
            const newName = asString(args.newName);
            const placeholder = asString(args.placeholder);
            const options = asString(args.options);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "custom-fields-update", async () => {
                    await gotoGhl(page, "/settings/custom-fields");
                    await waitForAppReady(page);
                    const rowSelector = id
                        ? `tr[data-row-key="${id}"], [data-id="${id}"]`
                        : `[class*="row"]:has-text("${name}"), tr:has-text("${name}")`;
                    const row = page.locator(rowSelector).first();
                    const editBtn = row
                        .locator('button:has-text("Edit"), [class*="edit"], a:has-text("Edit")')
                        .first();
                    await editBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    if (newName) {
                        const nameInput = page.locator('input[name="name"], input[placeholder*="Name"]').first();
                        try {
                            await nameInput.fill(newName, { timeout: 5000 });
                        }
                        catch {
                            // name may not be editable
                        }
                    }
                    if (placeholder) {
                        const phInput = page.locator('input[name="placeholder"], input[placeholder*="Placeholder"]').first();
                        try {
                            await phInput.fill(placeholder, { timeout: 3000 });
                        }
                        catch {
                            // placeholder may not be available
                        }
                    }
                    if (options) {
                        const optionsInput = page.locator('textarea[name="options"], textarea').first();
                        try {
                            await optionsInput.fill(options, { timeout: 3000 });
                        }
                        catch {
                            // options may not be available
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
                    await saveBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    return { fieldName: name, fieldId: id, newName: newName || null, placeholder: placeholder || null, options: options || null, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_delete_custom_field: async (args) => {
            const name = asString(args.fieldName);
            const id = asString(args.fieldId);
            const confirm = Boolean(args.confirm);
            if (!confirm)
                throw new Error("confirm must be true to delete a custom field");
            if (!name && !id)
                throw new Error("fieldName or fieldId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "custom-fields-delete", async () => {
                    await gotoGhl(page, "/settings/custom-fields");
                    await waitForAppReady(page);
                    const rowSelector = id
                        ? `tr[data-row-key="${id}"], [data-id="${id}"]`
                        : `[class*="row"]:has-text("${name}"), tr:has-text("${name}")`;
                    const row = page.locator(rowSelector).first();
                    const menuBtn = row
                        .locator('button:has-text("⋮"), button:has-text("⋯"), [class*="menu"], [class*="actions"] button')
                        .first();
                    await menuBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const deleteOption = page
                        .locator('text="Delete", text="delete", [class*="delete"]')
                        .first();
                    await deleteOption.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const confirmBtn = page
                        .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
                        .first();
                    await confirmBtn.click({ timeout: 5000 });
                    await waitForAppReady(page);
                    return { fieldName: name, fieldId: id, deleted: true };
                });
            }
            finally {
                await close();
            }
        },
    },
};
