import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const settingsModule = {
    tools: [
        {
            name: "ghl_browser_get_business_profile",
            description: "Get the sub-account business profile: name, address, phone, timezone, currency, and other settings.",
            inputSchema: {
                type: "object",
                properties: {},
            },
        },
        {
            name: "ghl_browser_update_business_profile",
            description: "Update sub-account business profile fields: name, phone, address, timezone, etc.",
            inputSchema: {
                type: "object",
                properties: {
                    businessName: { type: "string", description: "Business name" },
                    phone: { type: "string", description: "Business phone number" },
                    address: { type: "string", description: "Street address" },
                    city: { type: "string", description: "City" },
                    state: { type: "string", description: "State/province" },
                    postalCode: { type: "string", description: "ZIP/postal code" },
                    country: { type: "string", description: "Country" },
                    timezone: { type: "string", description: "Timezone (e.g. 'America/New_York')" },
                },
            },
        },
        {
            name: "ghl_browser_list_users",
            description: "List users/team members for the current sub-account. Returns name, email, role, and status.",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Optional search term" },
                },
            },
        },
        {
            name: "ghl_browser_create_user",
            description: "Invite a new user/team member to the sub-account.",
            inputSchema: {
                type: "object",
                properties: {
                    firstName: { type: "string", description: "First name" },
                    lastName: { type: "string", description: "Last name" },
                    email: { type: "string", description: "Email address" },
                    role: {
                        type: "string",
                        description: "Role: 'admin', 'user', or a custom role name",
                    },
                },
                required: ["firstName", "email"],
            },
        },
        {
            name: "ghl_browser_update_user_permissions",
            description: "Update a user's role or permissions in the sub-account.",
            inputSchema: {
                type: "object",
                properties: {
                    userName: { type: "string", description: "User's name or email" },
                    userId: { type: "string", description: "User ID (preferred)" },
                    role: { type: "string", description: "New role name" },
                },
            },
        },
        {
            name: "ghl_browser_get_integrations",
            description: "List configured integrations (Twilio, Mailgun, Stripe, etc.) and their connection status.",
            inputSchema: {
                type: "object",
                properties: {
                    category: {
                        type: "string",
                        description: "Filter by category: 'all' (default), 'phone', 'email', 'payment', 'calendar', 'other'",
                    },
                },
            },
        },
        {
            name: "ghl_browser_configure_integration",
            description: "Open an integration settings panel and update its configuration.",
            inputSchema: {
                type: "object",
                properties: {
                    integrationName: { type: "string", description: "Integration name (e.g. 'Twilio', 'Stripe')" },
                    enabled: { type: "boolean", description: "Enable or disable the integration" },
                    apiKey: { type: "string", description: "API key or credential to set" },
                },
                required: ["integrationName"],
            },
        },
    ],
    handlers: {
        ghl_browser_get_business_profile: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "settings-profile", async () => {
                    await gotoGhl(page, "/settings/business-profile");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const profile = await page.evaluate(() => {
                        const fields = {};
                        document.querySelectorAll("input, textarea, select").forEach((el) => {
                            const input = el;
                            const label = input.getAttribute("name") ||
                                input.getAttribute("id") ||
                                input.getAttribute("placeholder") ||
                                input.closest("[class*='field'], [class*='form-group']")?.querySelector("label")?.textContent?.trim() ||
                                "";
                            const value = input.value || input.getAttribute("value") || "";
                            if (label && value)
                                fields[label] = value;
                        });
                        const businessName = document.querySelector('input[name="name"], input[name="businessName"]')?.value ||
                            document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ||
                            "";
                        return { businessName, fields };
                    });
                    return profile;
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_update_business_profile: async (args) => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "settings-profile-update", async () => {
                    await gotoGhl(page, "/settings/business-profile");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const fieldMap = {};
                    if (args.businessName)
                        fieldMap["name"] = asString(args.businessName);
                    if (args.phone)
                        fieldMap["phone"] = asString(args.phone);
                    if (args.address)
                        fieldMap["address"] = asString(args.address);
                    if (args.city)
                        fieldMap["city"] = asString(args.city);
                    if (args.state)
                        fieldMap["state"] = asString(args.state);
                    if (args.postalCode)
                        fieldMap["postalCode"] = asString(args.postalCode);
                    if (args.country)
                        fieldMap["country"] = asString(args.country);
                    if (args.timezone)
                        fieldMap["timezone"] = asString(args.timezone);
                    const updated = {};
                    for (const [name, value] of Object.entries(fieldMap)) {
                        const input = page
                            .locator(`input[name="${name}"], input[name*="${name}"], ` +
                            `input[placeholder*="${name}"], #${name}, ` +
                            `label:has-text("${name}") + input, ` +
                            `[class*="field"]:has-text("${name}") input`)
                            .first();
                        try {
                            await input.fill(value, { timeout: 3000 });
                            updated[name] = value;
                        }
                        catch {
                            // field may not exist or have a different name
                        }
                    }
                    if (args.timezone) {
                        const tzSelect = page
                            .locator('select[name*="timezone"], [class*="timezone"] select, [class*="Timezone"] [class*="select"]')
                            .first();
                        try {
                            await tzSelect.selectOption({ label: asString(args.timezone) });
                            updated.timezone = asString(args.timezone);
                        }
                        catch {
                            // timezone may use a custom dropdown
                            const tzTrigger = page
                                .locator('[class*="timezone"] [class*="trigger"], [class*="Timezone"] button')
                                .first();
                            try {
                                await tzTrigger.click({ timeout: 3000 });
                                await page.waitForTimeout(500);
                                const tzInput = page.locator('[class*="search"] input, [role="combobox"]').first();
                                await tzInput.fill(asString(args.timezone), { timeout: 3000 });
                                await page.waitForTimeout(500);
                                await page.locator(`[class*="option"]:has-text("${args.timezone}")`).first().click({ timeout: 3000 });
                                updated.timezone = asString(args.timezone);
                            }
                            catch {
                                // could not set timezone
                            }
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
                    try {
                        await saveBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(1500);
                    }
                    catch {
                        // auto-save may be enabled
                    }
                    return { updated, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_users: async (args) => {
            const search = asString(args.search);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "settings-users", async () => {
                    await gotoGhl(page, "/settings/users");
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
                    const users = await page.evaluate(() => {
                        const items = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="UserRow"]',
                            '[class*="user-row"]',
                            '[class*="ListRow"]',
                            '[class*="table-row"]',
                            '[data-testid*="user"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("[class*='name'], [class*='Name'], td:first-child, h3, h4");
                                const emailEl = el.querySelector("[class*='email'], [class*='Email'], td:nth-child(2)");
                                const roleEl = el.querySelector("[class*='role'], [class*='Role'], td:nth-child(3), [class*='badge']");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge']");
                                const id = el.getAttribute("data-row-key") ||
                                    el.getAttribute("data-id") ||
                                    "";
                                items.push({
                                    name: nameEl?.textContent?.trim() || "",
                                    email: emailEl?.textContent?.trim() || "",
                                    role: roleEl?.textContent?.trim() || "",
                                    status: statusEl?.textContent?.trim() || "",
                                    id,
                                });
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(users.map((u) => [u.id || u.email || u.name, u])).values());
                    return { count: deduped.length, users: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_user: async (args) => {
            const firstName = asString(args.firstName);
            const lastName = asString(args.lastName);
            const email = asString(args.email);
            const role = asString(args.role) || "user";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "settings-create-user", async () => {
                    await gotoGhl(page, "/settings/users");
                    await waitForAppReady(page);
                    const addBtn = page
                        .locator('button:has-text("Add User"), button:has-text("Invite"), button:has-text("Create")')
                        .first();
                    await addBtn.click();
                    await page.waitForTimeout(1000);
                    const fnInput = page
                        .locator('input[name="firstName"], input[placeholder*="First"]')
                        .first();
                    await fnInput.fill(firstName);
                    if (lastName) {
                        const lnInput = page
                            .locator('input[name="lastName"], input[placeholder*="Last"]')
                            .first();
                        try {
                            await lnInput.fill(lastName, { timeout: 3000 });
                        }
                        catch {
                            // last name may be optional
                        }
                    }
                    const emailInput = page
                        .locator('input[name="email"], input[type="email"]')
                        .first();
                    await emailInput.fill(email);
                    const roleSelect = page
                        .locator('[class*="role"] [class*="select"], [class*="role"] select, select[name*="role"], [class*="Role"]')
                        .first();
                    try {
                        await roleSelect.click({ timeout: 3000 });
                        await page
                            .locator(`[class*="option"]:has-text("${role}"), button:has-text("${role}")`)
                            .first()
                            .click({ timeout: 3000 });
                    }
                    catch {
                        // role may default to "user"
                    }
                    const saveBtn = page
                        .locator('button:has-text("Save"), button:has-text("Invite"), button:has-text("Create")')
                        .first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { firstName, lastName, email, role, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_update_user_permissions: async (args) => {
            const userName = asString(args.userName);
            const userId = asString(args.userId);
            const role = asString(args.role);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "settings-update-user", async () => {
                    await gotoGhl(page, "/settings/users");
                    await waitForAppReady(page);
                    const rowSelector = userId
                        ? `tr[data-row-key="${userId}"], [data-id="${userId}"]`
                        : `[class*="row"]:has-text("${userName}"), tr:has-text("${userName}")`;
                    const row = page.locator(rowSelector).first();
                    const editBtn = row
                        .locator('button:has-text("Edit"), [class*="edit"], a:has-text("Edit")')
                        .first();
                    await editBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    if (role) {
                        const roleSelect = page
                            .locator('[class*="role"] [class*="select"], select[name*="role"]')
                            .first();
                        await roleSelect.click({ timeout: 5000 });
                        await page
                            .locator(`[class*="option"]:has-text("${role}"), button:has-text("${role}")`)
                            .first()
                            .click({ timeout: 3000 });
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
                    await saveBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    return { userName, userId, role, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_integrations: async (args) => {
            const category = asString(args.category) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "settings-integrations", async () => {
                    await gotoGhl(page, "/settings/integrations");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    if (category !== "all") {
                        const catTab = page
                            .locator(`[class*="tab"]:has-text("${category}"), button:has-text("${category}"), a:has-text("${category}")`)
                            .first();
                        try {
                            await catTab.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // category tab may not exist
                        }
                    }
                    const integrations = await page.evaluate(() => {
                        const items = [];
                        const cardSelectors = [
                            '[class*="IntegrationCard"]',
                            '[class*="integration-card"]',
                            '[class*="IntegrationItem"]',
                            '[class*="card"]',
                            '[class*="setting-item"]',
                        ];
                        for (const sel of cardSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("h3, h4, [class*='name'], [class*='Name'], [class*='title']");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge'], [class*='connected']");
                                const descEl = el.querySelector("[class*='desc'], [class*='Desc'], p, small");
                                const categoryEl = el.querySelector("[class*='category'], [class*='Category'], [class*='tag']");
                                const isConfigured = !!el.querySelector("[class*='connected'], [class*='configured'], [class*='active']") ||
                                    statusEl?.textContent?.trim()?.toLowerCase()?.includes("connected") ||
                                    false;
                                const name = nameEl?.textContent?.trim() || "";
                                if (name) {
                                    items.push({
                                        name,
                                        status: statusEl?.textContent?.trim() || "",
                                        category: categoryEl?.textContent?.trim() || "",
                                        description: descEl?.textContent?.trim() || "",
                                        configured: isConfigured,
                                    });
                                }
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(integrations.map((i) => [i.name, i])).values());
                    return { count: deduped.length, integrations: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_configure_integration: async (args) => {
            const name = asString(args.integrationName);
            const enabled = args.enabled;
            const apiKey = asString(args.apiKey);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "settings-configure-integration", async () => {
                    await gotoGhl(page, "/settings/integrations");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const card = page
                        .locator(`[class*="card"]:has-text("${name}"), [class*="IntegrationItem"]:has-text("${name}"), ` +
                        `[class*="integration"]:has-text("${name}"), [class*="setting-item"]:has-text("${name}")`)
                        .first();
                    const editBtn = card
                        .locator('button:has-text("Edit"), button:has-text("Configure"), button:has-text("Setup"), a:has-text("Edit")')
                        .first();
                    try {
                        await editBtn.click({ timeout: 5000 });
                    }
                    catch {
                        await card.click({ timeout: 5000 });
                    }
                    await page.waitForTimeout(1500);
                    if (apiKey) {
                        const keyInput = page
                            .locator('input[name="apiKey"], input[name="api_key"], input[placeholder*="API"], input[type="password"], input[type="text"]')
                            .first();
                        try {
                            await keyInput.fill(apiKey, { timeout: 5000 });
                        }
                        catch {
                            // API key field may not be present
                        }
                    }
                    if (typeof enabled === "boolean") {
                        const toggle = page
                            .locator('[class*="toggle"], [class*="switch"], input[type="checkbox"]')
                            .first();
                        try {
                            const isChecked = await toggle.isChecked().catch(() => false);
                            if (isChecked !== enabled) {
                                await toggle.click({ timeout: 3000 });
                            }
                        }
                        catch {
                            // toggle may not be present
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Connect")').first();
                    try {
                        await saveBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(1500);
                    }
                    catch {
                        // auto-save or no explicit save
                    }
                    return { integrationName: name, enabled, apiKeySet: !!apiKey, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
