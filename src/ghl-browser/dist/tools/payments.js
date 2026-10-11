import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const paymentsModule = {
    tools: [
        {
            name: "ghl_browser_list_transactions",
            description: "List payment transactions with amount, contact, status, and method.",
            inputSchema: {
                type: "object",
                properties: {
                    status: { type: "string", description: "Filter: all, succeeded, failed, refunded, pending" },
                },
            },
        },
        {
            name: "ghl_browser_get_transaction_details",
            description: "Get full details of a specific transaction.",
            inputSchema: {
                type: "object",
                properties: { transactionId: { type: "string", description: "Transaction ID or description to find" } },
                required: ["transactionId"],
            },
        },
        {
            name: "ghl_browser_list_subscriptions",
            description: "List recurring subscriptions with contact, plan, amount, and status.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_list_payment_providers",
            description: "List connected payment providers (Stripe, PayPal, etc.) with status.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_payment_link",
            description: "Create a payment link / checkout page for a specific amount or product.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    amount: { type: "number" },
                    currency: { type: "string", description: "ISO currency code (default USD)" },
                    description: { type: "string" },
                },
                required: ["name", "amount"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_transactions: async (args) => {
            const status = args.status || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "payments-transactions", async () => {
                    await gotoGhl(page, "/payments/transactions");
                    await waitForAppReady(page);
                    if (status !== "all") {
                        try {
                            await page.locator(`button:has-text("${status}"), [role="tab"]:has-text("${status}")`).first().click({ timeout: 3000 });
                            await waitForAppReady(page);
                        }
                        catch { /* filter may not exist */ }
                    }
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('tr, [class*="transaction"], [class*="row"], [role="row"]').forEach((el) => {
                            const cells = el.querySelectorAll('td, [class*="cell"]');
                            const text = el.textContent || "";
                            if (text.length > 5) {
                                items.push({
                                    id: el.querySelector('a, [class*="id"]')?.textContent?.trim() || "",
                                    contact: el.querySelector('[class*="contact"], [class*="name"]')?.textContent?.trim() || cells[0]?.textContent?.trim() || "",
                                    amount: el.querySelector('[class*="amount"], [class*="total"]')?.textContent?.trim() || "",
                                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
                                    method: el.querySelector('[class*="method"], [class*="card"]')?.textContent?.trim() || "",
                                    date: el.querySelector('[class*="date"], time')?.textContent?.trim() || "",
                                });
                            }
                        });
                        return items;
                    });
                    return { count: rows.length, status, rows };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_transaction_details: async (args) => {
            const transactionId = String(args.transactionId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "payments-detail", async () => {
                    await gotoGhl(page, "/payments/transactions");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${transactionId}"), [class*="id"]:has-text("${transactionId}")`).first().click();
                    await waitForAppReady(page);
                    const details = await page.evaluate(() => {
                        const fields = {};
                        document.querySelectorAll('[class*="field"], label, dt').forEach((el) => {
                            const label = el.textContent?.trim() || "";
                            const valueEl = el.parentElement?.querySelector('[class*="value"], dd, span');
                            if (label && valueEl)
                                fields[label] = valueEl.textContent?.trim() || "";
                        });
                        return fields;
                    });
                    return { transactionId, fields: details, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_subscriptions: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "payments-subscriptions", async () => {
                    await gotoGhl(page, "/payments/subscriptions");
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('tr, [class*="subscription"], [class*="row"], [role="row"]').forEach((el) => {
                            const text = el.textContent || "";
                            if (text.length > 5) {
                                items.push({
                                    contact: el.querySelector('[class*="contact"], [class*="name"]')?.textContent?.trim() || "",
                                    plan: el.querySelector('[class*="plan"], [class*="product"]')?.textContent?.trim() || "",
                                    amount: el.querySelector('[class*="amount"]')?.textContent?.trim() || "",
                                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
                                    nextBilling: el.querySelector('[class*="next"], [class*="billing"]')?.textContent?.trim() || "",
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
        ghl_browser_list_payment_providers: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "payments-providers", async () => {
                    await gotoGhl(page, "/settings/payments");
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('[class*="provider"], [class*="integration"], [class*="card"]').forEach((el) => {
                            const nameEl = el.querySelector('h4, [class*="name"], [class*="title"]');
                            const statusEl = el.querySelector('[class*="status"], [class*="badge"], [class*="connected"]');
                            if (nameEl && nameEl.textContent?.trim()) {
                                items.push({
                                    name: nameEl.textContent.trim(),
                                    status: statusEl?.textContent?.trim() || "",
                                    type: el.querySelector('[class*="type"]')?.textContent?.trim() || "",
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
        ghl_browser_create_payment_link: async (args) => {
            const name = String(args.name);
            const amount = Number(args.amount);
            const currency = args.currency || "USD";
            const description = args.description || "";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "payments-create-link", async () => {
                    await gotoGhl(page, "/payments/links");
                    await waitForAppReady(page);
                    await page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")').first().click();
                    await waitForAppReady(page);
                    await page.locator('input[name="name"], input[placeholder*="Name"]').first().fill(name);
                    await page.locator('input[name="amount"], input[type="number"]').first().fill(String(amount));
                    if (description) {
                        try {
                            await page.locator('textarea, input[name="description"]').first().fill(description);
                        }
                        catch { /* optional */ }
                    }
                    await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
                    await waitForAppReady(page);
                    const link = await page.evaluate(() => {
                        const linkEl = document.querySelector('a[href*="pay"], input[value*="http"]');
                        return linkEl?.getAttribute("href") || linkEl?.value || "";
                    });
                    return { name, amount, currency, description: description || null, link: link || null, created: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
