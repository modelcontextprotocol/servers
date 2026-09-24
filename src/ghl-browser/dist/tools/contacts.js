import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const contactsModule = {
    tools: [
        {
            name: "ghl_browser_list_contacts",
            description: "List contacts in the GHL contacts page with name, email, phone, and tags.",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Search term to filter contacts" },
                    tag: { type: "string", description: "Filter by tag name" },
                },
            },
        },
        {
            name: "ghl_browser_get_contact_details_browser",
            description: "Open a contact record and return all visible fields, tags, custom fields, and activity.",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string" },
                },
                required: ["contactName"],
            },
        },
        {
            name: "ghl_browser_create_contact_browser",
            description: "Create a new contact via the GHL UI with name, email, phone, and optional tags.",
            inputSchema: {
                type: "object",
                properties: {
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                    tags: { type: "string", description: "Comma-separated tags" },
                },
                required: ["firstName"],
            },
        },
        {
            name: "ghl_browser_edit_contact",
            description: "Edit a contact's fields (name, email, phone) via the GHL UI.",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string", description: "Existing contact name to find" },
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                },
                required: ["contactName"],
            },
        },
        {
            name: "ghl_browser_list_smart_lists",
            description: "List saved smart lists / contact filters.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_smart_list",
            description: "Create a new smart list by applying filters in the contacts UI.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    filters: { type: "string", description: "JSON or description of filter criteria" },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_export_contacts",
            description: "Trigger a CSV export of the current contact list view.",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Optional search/filter before export" },
                },
            },
        },
    ],
    handlers: {
        ghl_browser_list_contacts: async (args) => {
            const search = args.search || "";
            const tag = args.tag || "";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "contacts-list", async () => {
                    await gotoGhl(page, "/contacts");
                    await waitForAppReady(page);
                    if (search) {
                        const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
                        await searchInput.fill(search);
                        await waitForAppReady(page);
                    }
                    if (tag) {
                        try {
                            await page.locator(`button:has-text("Tag"), [class*="filter"]:has-text("Tag")`).first().click({ timeout: 3000 });
                            await page.locator(`[role="option"]:has-text("${tag}"), [class*="option"]:has-text("${tag}")`).first().click();
                            await waitForAppReady(page);
                        }
                        catch { /* tag filter may not exist */ }
                    }
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('tr, [class*="contact"], [class*="row"], [role="row"]').forEach((el) => {
                            const nameEl = el.querySelector('a[href*="contact"], [class*="name"], td:first-child');
                            const emailEl = el.querySelector('a[href*="mailto"], [class*="email"]');
                            const phoneEl = el.querySelector('a[href*="tel"], [class*="phone"]');
                            const tagEls = el.querySelectorAll('[class*="tag"], [class*="chip"], [class*="badge"]');
                            if (nameEl && nameEl.textContent?.trim()) {
                                items.push({
                                    name: nameEl.textContent?.trim() ?? "",
                                    email: emailEl?.textContent?.trim() || "",
                                    phone: phoneEl?.textContent?.trim() || "",
                                    tags: Array.from(tagEls).map((t) => t.textContent?.trim() || "").filter(Boolean),
                                });
                            }
                        });
                        return items;
                    });
                    return { count: rows.length, search: search || null, tag: tag || null, rows };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_contact_details_browser: async (args) => {
            const contactName = String(args.contactName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "contacts-detail", async () => {
                    await gotoGhl(page, "/contacts");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${contactName}"), [class*="name"]:has-text("${contactName}")`).first().click();
                    await waitForAppReady(page);
                    const details = await page.evaluate(() => {
                        const fields = {};
                        document.querySelectorAll('[class*="field"], [class*="detail"], [class*="info"] label, dt').forEach((el) => {
                            const label = el.textContent?.trim() || "";
                            const valueEl = el.parentElement?.querySelector('[class*="value"], dd, span, p');
                            if (label && valueEl)
                                fields[label] = valueEl.textContent?.trim() || "";
                        });
                        const tags = Array.from(document.querySelectorAll('[class*="tag"], [class*="chip"]'))
                            .map((t) => t.textContent?.trim() || "").filter(Boolean);
                        return { fields, tags };
                    });
                    return { contactName, ...details, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_contact_browser: async (args) => {
            const firstName = String(args.firstName);
            const lastName = args.lastName || "";
            const email = args.email || "";
            const phone = args.phone || "";
            const tags = args.tags || "";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "contacts-create", async () => {
                    await gotoGhl(page, "/contacts");
                    await waitForAppReady(page);
                    await page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').first().click();
                    await waitForAppReady(page);
                    if (firstName)
                        await page.locator('input[name*="first" i], input[placeholder*="First"]').first().fill(firstName);
                    if (lastName)
                        await page.locator('input[name*="last" i], input[placeholder*="Last"]').first().fill(lastName);
                    if (email)
                        await page.locator('input[type="email"], input[name="email"]').first().fill(email);
                    if (phone)
                        await page.locator('input[type="tel"], input[name="phone"]').first().fill(phone);
                    if (tags) {
                        for (const t of tags.split(",")) {
                            try {
                                const tagInput = page.locator('input[placeholder*="tag" i], [class*="tag"] input').first();
                                await tagInput.fill(t.trim());
                                await page.keyboard.press("Enter");
                            }
                            catch { /* optional */ }
                        }
                    }
                    await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
                    await waitForAppReady(page);
                    return { firstName, lastName, email, phone, tags: tags || null, created: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_edit_contact: async (args) => {
            const contactName = String(args.contactName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "contacts-edit", async () => {
                    await gotoGhl(page, "/contacts");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${contactName}"), [class*="name"]:has-text("${contactName}")`).first().click();
                    await waitForAppReady(page);
                    if (args.firstName)
                        await page.locator('input[name*="first" i]').first().fill(String(args.firstName));
                    if (args.lastName)
                        await page.locator('input[name*="last" i]').first().fill(String(args.lastName));
                    if (args.email)
                        await page.locator('input[type="email"]').first().fill(String(args.email));
                    if (args.phone)
                        await page.locator('input[type="tel"]').first().fill(String(args.phone));
                    await page.locator('button:has-text("Save")').first().click();
                    await waitForAppReady(page);
                    return { contactName, updated: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_smart_lists: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "contacts-smartlists", async () => {
                    await gotoGhl(page, "/contacts/smart-lists");
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('[class*="list"], [class*="smart"], tr, [role="row"]').forEach((el) => {
                            const nameEl = el.querySelector('a, h4, [class*="name"]');
                            const countEl = el.querySelector('[class*="count"], [class*="total"]');
                            const filterEl = el.querySelector('[class*="filter"], [class*="criteria"]');
                            if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                                items.push({
                                    name: nameEl.textContent?.trim() ?? "",
                                    count: countEl?.textContent?.trim() || "",
                                    filters: filterEl?.textContent?.trim() || "",
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
        ghl_browser_create_smart_list: async (args) => {
            const name = String(args.name);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "contacts-create-smartlist", async () => {
                    await gotoGhl(page, "/contacts/smart-lists");
                    await waitForAppReady(page);
                    await page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")').first().click();
                    await waitForAppReady(page);
                    await page.locator('input[name="name"], input[placeholder*="name" i]').first().fill(name);
                    await page.locator('button:has-text("Save")').first().click();
                    await waitForAppReady(page);
                    return { name, created: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_export_contacts: async (args) => {
            const search = args.search || "";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "contacts-export", async () => {
                    await gotoGhl(page, "/contacts");
                    await waitForAppReady(page);
                    if (search) {
                        await page.locator('input[placeholder*="Search"]').first().fill(search);
                        await waitForAppReady(page);
                    }
                    await page.locator('button:has-text("Export"), [aria-label*="export"], [class*="export"]').first().click({ timeout: 5000 });
                    await waitForAppReady(page);
                    try {
                        await page.locator('button:has-text("Confirm"), button:has-text("Download"), button:has-text("Export CSV")').first().click({ timeout: 5000 });
                    }
                    catch { /* confirm may not be needed */ }
                    await waitForAppReady(page);
                    return { search: search || null, exported: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
