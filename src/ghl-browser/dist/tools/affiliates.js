import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const affiliateModule = {
    tools: [
        {
            name: "ghl_browser_list_affiliates",
            description: "List affiliates in the GHL affiliate manager. Returns affiliate name, email, " +
                "commission rate, status, and referral stats.",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Optional search term to filter affiliates" },
                    status: {
                        type: "string",
                        description: "Filter by status: 'all' (default), 'active', 'pending', 'disabled'",
                    },
                },
            },
        },
        {
            name: "ghl_browser_create_affiliate",
            description: "Create a new affiliate via the GHL UI. Returns the affiliate name and URL.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Affiliate name" },
                    email: { type: "string", description: "Affiliate email address" },
                    commissionRate: { type: "string", description: "Commission percentage (e.g. '30')" },
                    commissionType: {
                        type: "string",
                        description: "'percentage' (default) or 'fixed'",
                    },
                },
                required: ["name", "email"],
            },
        },
        {
            name: "ghl_browser_get_affiliate_details",
            description: "Open an affiliate and return their full details: commission settings, referral links, " +
                "conversion stats, and payment history.",
            inputSchema: {
                type: "object",
                properties: {
                    affiliateName: { type: "string", description: "Affiliate name" },
                    affiliateId: { type: "string", description: "Affiliate ID (preferred)" },
                },
            },
        },
        {
            name: "ghl_browser_update_affiliate",
            description: "Update an affiliate's settings: commission rate, status, or other configuration.",
            inputSchema: {
                type: "object",
                properties: {
                    affiliateName: { type: "string" },
                    affiliateId: { type: "string" },
                    commissionRate: { type: "string", description: "New commission percentage" },
                    status: {
                        type: "string",
                        description: "New status: 'active', 'pending', 'disabled'",
                    },
                },
            },
        },
        {
            name: "ghl_browser_get_affiliate_links",
            description: "Get referral/tracking links for an affiliate. Returns the link URLs and click/conversion stats.",
            inputSchema: {
                type: "object",
                properties: {
                    affiliateName: { type: "string" },
                    affiliateId: { type: "string" },
                },
            },
        },
        {
            name: "ghl_browser_delete_affiliate",
            description: "Delete an affiliate. This action is irreversible.",
            inputSchema: {
                type: "object",
                properties: {
                    affiliateName: { type: "string" },
                    affiliateId: { type: "string" },
                    confirm: { type: "boolean", description: "Must be true to proceed" },
                },
                required: ["confirm"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_affiliates: async (args) => {
            const search = asString(args.search);
            const status = asString(args.status) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "affiliates-list", async () => {
                    await gotoGhl(page, "/affiliates");
                    await waitForAppReady(page);
                    if (search) {
                        const searchInput = page
                            .locator('input[placeholder*="Search"], input[type="search"], input[name="search"]')
                            .first();
                        try {
                            await searchInput.fill(search, { timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // search may not be available
                        }
                    }
                    if (status !== "all") {
                        const filterBtn = page
                            .locator('button:has-text("Filter"), button:has-text("Status"), [class*="filter"]')
                            .first();
                        try {
                            await filterBtn.click({ timeout: 3000 });
                            await page.waitForTimeout(500);
                            await page
                                .locator(`button:has-text("${status}"), [class*="option"]:has-text("${status}")`)
                                .first()
                                .click({ timeout: 3000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // filter may not be available
                        }
                    }
                    const affiliates = await page.evaluate(() => {
                        const items = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="ListRow"]',
                            '[class*="affiliate-row"]',
                            '[class*="AffiliateRow"]',
                            '[class*="table-row"]',
                            '[data-testid*="affiliate"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("td:first-child, [class*='name'], [class*='Name'], h3, h4");
                                const emailEl = el.querySelector("[class*='email'], [class*='Email'], td:nth-child(2)");
                                const commissionEl = el.querySelector("[class*='commission'], [class*='Commission'], td:nth-child(3)");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge']");
                                const referralsEl = el.querySelector("[class*='referral'], [class*='Referral'], td:nth-child(5)");
                                const revenueEl = el.querySelector("[class*='revenue'], [class*='Revenue'], td:nth-child(6)");
                                const id = el.getAttribute("data-row-key") ||
                                    el.getAttribute("data-id") ||
                                    el.querySelector("a")?.getAttribute("href")?.match(/\/affiliate\/([^/]+)/)?.[1] ||
                                    "";
                                items.push({
                                    name: nameEl?.textContent?.trim() || "",
                                    email: emailEl?.textContent?.trim() || "",
                                    commission: commissionEl?.textContent?.trim() || "",
                                    status: statusEl?.textContent?.trim() || "",
                                    referrals: referralsEl?.textContent?.trim() || "",
                                    revenue: revenueEl?.textContent?.trim() || "",
                                    id,
                                });
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(affiliates.map((a) => [a.id || a.email || a.name, a])).values());
                    return { count: deduped.length, affiliates: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_affiliate: async (args) => {
            const name = asString(args.name);
            const email = asString(args.email);
            const commissionRate = asString(args.commissionRate) || "30";
            const commissionType = asString(args.commissionType) || "percentage";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "affiliates-create", async () => {
                    await gotoGhl(page, "/affiliates");
                    await waitForAppReady(page);
                    const createBtn = page
                        .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
                        .first();
                    await createBtn.click();
                    await page.waitForTimeout(1000);
                    const nameInput = page
                        .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="name"]')
                        .first();
                    await nameInput.fill(name);
                    const emailInput = page
                        .locator('input[name="email"], input[type="email"], input[placeholder*="email"]')
                        .first();
                    await emailInput.fill(email);
                    const commissionInput = page
                        .locator('input[name="commission"], input[placeholder*="Commission"], input[placeholder*="commission"]')
                        .first();
                    try {
                        await commissionInput.fill(commissionRate, { timeout: 3000 });
                    }
                    catch {
                        // commission may be in a dropdown or different field
                    }
                    if (commissionType === "fixed") {
                        const typeSelect = page
                            .locator('[class*="select"], [class*="dropdown"], select')
                            .first();
                        try {
                            await typeSelect.click({ timeout: 3000 });
                            await page
                                .locator('[class*="option"]:has-text("Fixed"), button:has-text("Fixed")')
                                .first()
                                .click({ timeout: 3000 });
                        }
                        catch {
                            // type selector may not exist
                        }
                    }
                    const saveBtn = page
                        .locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")')
                        .first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, email, commissionRate, commissionType, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_affiliate_details: async (args) => {
            const name = asString(args.affiliateName);
            const id = asString(args.affiliateId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "affiliates-details", async () => {
                    if (id) {
                        await gotoGhl(page, `/affiliates/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/affiliates");
                        await waitForAppReady(page);
                        await page
                            .locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`)
                            .first()
                            .click();
                    }
                    else {
                        throw new Error("affiliateName or affiliateId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const details = await page.evaluate(() => {
                        const stats = {};
                        document
                            .querySelectorAll('[class*="stat"], [class*="Stat"], [class*="metric"], [class*="Metric"], [class*="card"]')
                            .forEach((el) => {
                            const labelEl = el.querySelector("[class*='label'], [class*='Label'], small, span:first-child");
                            const valueEl = el.querySelector("[class*='value'], [class*='Value'], h2, h3, strong");
                            const label = labelEl?.textContent?.trim();
                            const value = valueEl?.textContent?.trim();
                            if (label && value)
                                stats[label] = value;
                        });
                        const links = [];
                        document
                            .querySelectorAll('[class*="link-row"], [class*="LinkRow"], [class*="referral-link"], tr:has(a[href*="ref"])')
                            .forEach((el) => {
                            const linkEl = el.querySelector("a, input[value], code");
                            const clickEl = el.querySelector("[class*='click'], td:nth-child(2)");
                            const convEl = el.querySelector("[class*='conversion'], td:nth-child(3)");
                            links.push({
                                url: linkEl?.textContent?.trim() || linkEl?.getAttribute("href") || "",
                                clicks: clickEl?.textContent?.trim() || "",
                                conversions: convEl?.textContent?.trim() || "",
                            });
                        });
                        const payments = [];
                        document
                            .querySelectorAll('[class*="payment-row"], [class*="PaymentRow"], tr:has([class*="payment"])')
                            .forEach((el) => {
                            const dateEl = el.querySelector("td:first-child, [class*='date']");
                            const amountEl = el.querySelector("td:nth-child(2), [class*='amount']");
                            const statusEl = el.querySelector("td:nth-child(3), [class*='status']");
                            payments.push({
                                date: dateEl?.textContent?.trim() || "",
                                amount: amountEl?.textContent?.trim() || "",
                                status: statusEl?.textContent?.trim() || "",
                            });
                        });
                        return {
                            title: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
                            stats,
                            links,
                            payments,
                        };
                    });
                    return {
                        affiliateId: id || null,
                        affiliateName: name || details.title || null,
                        stats: details.stats,
                        referralLinks: details.links,
                        paymentHistory: details.payments,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_update_affiliate: async (args) => {
            const name = asString(args.affiliateName);
            const id = asString(args.affiliateId);
            const commissionRate = asString(args.commissionRate);
            const status = asString(args.status);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "affiliates-update", async () => {
                    if (id) {
                        await gotoGhl(page, `/affiliates/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/affiliates");
                        await waitForAppReady(page);
                        await page
                            .locator(`a:has-text("${name}")`)
                            .first()
                            .click();
                    }
                    else {
                        throw new Error("affiliateName or affiliateId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(1500);
                    if (commissionRate) {
                        const commissionInput = page
                            .locator('input[name="commission"], input[placeholder*="Commission"], [class*="commission"] input')
                            .first();
                        try {
                            await commissionInput.fill(commissionRate, { timeout: 5000 });
                        }
                        catch {
                            // commission field may not be directly editable
                        }
                    }
                    if (status) {
                        const statusSelect = page
                            .locator('[class*="status"] [class*="select"], [class*="status"] select, [class*="Status"]')
                            .first();
                        try {
                            await statusSelect.click({ timeout: 5000 });
                            await page
                                .locator(`[class*="option"]:has-text("${status}"), button:has-text("${status}")`)
                                .first()
                                .click({ timeout: 3000 });
                        }
                        catch {
                            // status may be toggled differently
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
                    return { affiliateName: name, affiliateId: id, commissionRate, status, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_affiliate_links: async (args) => {
            const name = asString(args.affiliateName);
            const id = asString(args.affiliateId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "affiliates-links", async () => {
                    if (id) {
                        await gotoGhl(page, `/affiliates/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/affiliates");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("affiliateName or affiliateId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const linksTab = page
                        .locator('button:has-text("Links"), button:has-text("Referral"), [class*="tab"]:has-text("Link")')
                        .first();
                    try {
                        await linksTab.click({ timeout: 5000 });
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // links may already be visible
                    }
                    const linkData = await page.evaluate(() => {
                        const links = [];
                        const allInputs = document.querySelectorAll('input[value*="http"], input[value*="ref"], code, [class*="link"]');
                        allInputs.forEach((el) => {
                            const url = el.value || el.textContent?.trim() || el.getAttribute("href") || "";
                            if (url && (url.includes("http") || url.includes("ref"))) {
                                const row = el.closest("tr, [class*='row'], [class*='Row'], li");
                                const labelEl = row?.querySelector("[class*='label'], [class*='name'], td:first-child");
                                const clickEl = row?.querySelector("[class*='click'], td:nth-child(3)");
                                const convEl = row?.querySelector("[class*='conversion'], td:nth-child(4)");
                                const revEl = row?.querySelector("[class*='revenue'], td:nth-child(5)");
                                links.push({
                                    url,
                                    label: labelEl?.textContent?.trim() || "",
                                    clicks: clickEl?.textContent?.trim() || "",
                                    conversions: convEl?.textContent?.trim() || "",
                                    revenue: revEl?.textContent?.trim() || "",
                                });
                            }
                        });
                        return links;
                    });
                    return {
                        affiliateName: name,
                        affiliateId: id,
                        linkCount: linkData.length,
                        links: linkData,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_delete_affiliate: async (args) => {
            const name = asString(args.affiliateName);
            const id = asString(args.affiliateId);
            const confirm = Boolean(args.confirm);
            if (!confirm)
                throw new Error("confirm must be true to delete an affiliate");
            if (!name && !id)
                throw new Error("affiliateName or affiliateId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "affiliates-delete", async () => {
                    await gotoGhl(page, "/affiliates");
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
                    return { affiliateName: name, affiliateId: id, deleted: true };
                });
            }
            finally {
                await close();
            }
        },
    },
};
