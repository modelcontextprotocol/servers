import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString, asNumber } from "../helpers.js";
export const invoiceModule = {
    tools: [
        {
            name: "ghl_browser_list_invoices",
            description: "List invoices with contact, amount, status (draft/sent/paid/overdue/void), " +
                "due date, and amount outstanding.",
            inputSchema: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        description: "Filter by status: 'all' (default), 'draft', 'sent', 'paid', 'overdue', 'void'",
                    },
                    search: {
                        type: "string",
                        description: "Optional search term to filter by contact or invoice number",
                    },
                },
            },
        },
        {
            name: "ghl_browser_create_invoice",
            description: "Create a new invoice. Specify contact, line items (description, quantity, rate), " +
                "due date, and optional notes. Returns the invoice number and URL.",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string", description: "Contact/client name to invoice" },
                    lineItems: {
                        type: "string",
                        description: "Semicolon-separated line items: 'description|qty|rate;description|qty|rate'. " +
                            "Example: 'Web Design|1|2500;Hosting (monthly)|12|29.99'",
                    },
                    dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
                    notes: { type: "string", description: "Invoice notes/terms" },
                    taxRate: { type: "number", description: "Tax rate percentage (e.g. 8.5)" },
                },
                required: ["contactName"],
            },
        },
        {
            name: "ghl_browser_get_invoice_details",
            description: "Open an invoice and return its full details: line items, amounts, tax, " +
                "payments received, balance due, and status.",
            inputSchema: {
                type: "object",
                properties: {
                    invoiceNumber: { type: "string", description: "Invoice number" },
                    invoiceId: { type: "string", description: "Invoice ID (preferred if known)" },
                },
            },
        },
        {
            name: "ghl_browser_send_invoice",
            description: "Send an invoice to the contact via email. Optionally include a custom message.",
            inputSchema: {
                type: "object",
                properties: {
                    invoiceNumber: { type: "string" },
                    invoiceId: { type: "string", description: "Invoice ID (preferred)" },
                    emailSubject: { type: "string", description: "Custom email subject" },
                    emailBody: { type: "string", description: "Custom email message" },
                },
            },
        },
        {
            name: "ghl_browser_record_invoice_payment",
            description: "Record a payment against an invoice. Specify amount, payment method, date, and reference.",
            inputSchema: {
                type: "object",
                properties: {
                    invoiceNumber: { type: "string" },
                    invoiceId: { type: "string", description: "Invoice ID (preferred)" },
                    amount: { type: "number", description: "Payment amount" },
                    method: {
                        type: "string",
                        description: "'cash', 'check', 'bank_transfer', 'credit_card', 'other'",
                    },
                    date: { type: "string", description: "Payment date (YYYY-MM-DD)" },
                    reference: { type: "string", description: "Payment reference number" },
                },
                required: ["amount"],
            },
        },
        {
            name: "ghl_browser_void_invoice",
            description: "Void or delete an invoice. Voided invoices remain in the system but are marked inactive.",
            inputSchema: {
                type: "object",
                properties: {
                    invoiceNumber: { type: "string" },
                    invoiceId: { type: "string", description: "Invoice ID (preferred)" },
                    action: {
                        type: "string",
                        description: "'void' (default) or 'delete'",
                    },
                    confirm: { type: "boolean", description: "Must be true to proceed" },
                },
                required: ["confirm"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_invoices: async (args) => {
            const status = asString(args.status) || "all";
            const search = asString(args.search);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "invoices-list", async () => {
                    await gotoGhl(page, "/invoices");
                    await waitForAppReady(page);
                    if (status !== "all") {
                        const statusTab = page
                            .locator(`button:has-text("${status}"), a:has-text("${status}"), [class*="tab"]:has-text("${status}")`)
                            .first();
                        try {
                            await statusTab.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // tab may not exist
                        }
                    }
                    if (search) {
                        const searchInput = page
                            .locator('input[placeholder*="Search"], input[type="search"], input[name="search"]')
                            .first();
                        try {
                            await searchInput.fill(search, { timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // search not available
                        }
                    }
                    const invoices = await page.evaluate(() => {
                        const items = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="InvoiceRow"]',
                            '[class*="invoice-row"]',
                            '[class*="invoice-item"]',
                            '[class*="ListRow"]',
                            'a[href*="invoice"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const anchor = el.closest("a") || el.querySelector("a");
                                const cells = el.querySelectorAll("td, [class*='cell']");
                                const numEl = el.querySelector("[class*='number'], [class*='Number'], [class*='id']");
                                const contactEl = cells[1] || el.querySelector("[class*='contact'], [class*='Contact']");
                                const amountEl = cells[2] || el.querySelector("[class*='amount'], [class*='Amount']");
                                const outEl = cells[3] || el.querySelector("[class*='outstanding'], [class*='balance']");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge']");
                                const dateEl = cells[5] || el.querySelector("[class*='due'], [class*='date'], [class*='Date']");
                                const href = anchor?.getAttribute("href") || "";
                                items.push({
                                    number: numEl?.textContent?.trim() || "",
                                    contact: contactEl?.textContent?.trim() || "",
                                    amount: amountEl?.textContent?.trim() || "",
                                    outstanding: outEl?.textContent?.trim() || "",
                                    status: statusEl?.textContent?.trim() || "",
                                    dueDate: dateEl?.textContent?.trim() || "",
                                    href,
                                });
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(invoices.map((r) => [r.number || r.contact, r])).values());
                    return { count: deduped.length, invoices: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_invoice: async (args) => {
            const contactName = asString(args.contactName);
            const lineItemsStr = asString(args.lineItems);
            const dueDate = asString(args.dueDate);
            const notes = asString(args.notes);
            const taxRate = asNumber(args.taxRate);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "invoices-create", async () => {
                    await gotoGhl(page, "/invoices");
                    await waitForAppReady(page);
                    const createBtn = page
                        .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")')
                        .first();
                    await createBtn.click();
                    await page.waitForTimeout(800);
                    const contactInput = page
                        .locator('input[placeholder*="Contact"], input[placeholder*="Client"], input[name="contact"]')
                        .first();
                    await contactInput.fill(contactName);
                    await page.waitForTimeout(500);
                    try {
                        await page.keyboard.press("Enter");
                        await page.waitForTimeout(500);
                    }
                    catch {
                        // autocomplete may not require enter
                    }
                    if (lineItemsStr) {
                        const items = lineItemsStr.split(";").map((item) => {
                            const parts = item.split("|").map((s) => s.trim());
                            return { description: parts[0] || "", quantity: parts[1] || "1", rate: parts[2] || "0" };
                        });
                        for (let i = 0; i < items.length; i++) {
                            if (i > 0) {
                                const addRowBtn = page
                                    .locator('button:has-text("Add Item"), button:has-text("Add Line"), button:has-text("+")')
                                    .first();
                                try {
                                    await addRowBtn.click({ timeout: 3000 });
                                    await page.waitForTimeout(500);
                                }
                                catch {
                                    // row may auto-add
                                }
                            }
                            const rowInputs = page.locator('input[placeholder*="Description"], input[placeholder*="Item"]');
                            const qtyInputs = page.locator('input[placeholder*="Qty"], input[placeholder*="Quantity"]');
                            const rateInputs = page.locator('input[placeholder*="Rate"], input[placeholder*="Price"], input[placeholder*="Amount"]');
                            const rowCount = await rowInputs.count();
                            if (rowCount > i) {
                                await rowInputs.nth(i).fill(items[i].description);
                            }
                            const qtyCount = await qtyInputs.count();
                            if (qtyCount > i) {
                                await qtyInputs.nth(i).fill(items[i].quantity);
                            }
                            const rateCount = await rateInputs.count();
                            if (rateCount > i) {
                                await rateInputs.nth(i).fill(items[i].rate);
                            }
                        }
                    }
                    if (dueDate) {
                        const dateInput = page.locator('input[placeholder*="Due"], input[name="dueDate"], input[type="date"]').first();
                        try {
                            await dateInput.fill(dueDate, { timeout: 3000 });
                        }
                        catch {
                            // date is best-effort
                        }
                    }
                    if (notes) {
                        const notesInput = page.locator('textarea[placeholder*="Notes"], textarea[name="notes"]').first();
                        try {
                            await notesInput.fill(notes, { timeout: 3000 });
                        }
                        catch {
                            // notes are optional
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return {
                        contact: contactName,
                        lineItems: lineItemsStr || null,
                        dueDate: dueDate || null,
                        notes: notes || null,
                        taxRate: taxRate ?? null,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_invoice_details: async (args) => {
            const number = asString(args.invoiceNumber);
            const id = asString(args.invoiceId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "invoices-details", async () => {
                    if (id) {
                        await gotoGhl(page, `/invoices/${id}`);
                    }
                    else if (number) {
                        await gotoGhl(page, "/invoices");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${number}"), [class*="row"]:has-text("${number}")`).first().click();
                    }
                    else {
                        throw new Error("invoiceNumber or invoiceId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const details = await page.evaluate(() => {
                        const lineItems = [];
                        document.querySelectorAll("tr[class*='item'], [class*='LineItem'], [class*='line-item'], [class*='invoice-row']").forEach((el) => {
                            const cells = el.querySelectorAll("td, [class*='cell']");
                            lineItems.push({
                                description: cells[0]?.textContent?.trim() || "",
                                qty: cells[1]?.textContent?.trim() || "",
                                rate: cells[2]?.textContent?.trim() || "",
                                total: cells[3]?.textContent?.trim() || "",
                            });
                        });
                        const payments = [];
                        document.querySelectorAll("[class*='payment'], [class*='Payment'], [class*='transaction']").forEach((el) => {
                            const cells = el.querySelectorAll("td, [class*='cell'], span");
                            payments.push({
                                amount: cells[0]?.textContent?.trim() || "",
                                method: cells[1]?.textContent?.trim() || "",
                                date: cells[2]?.textContent?.trim() || "",
                                reference: cells[3]?.textContent?.trim() || "",
                            });
                        });
                        const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
                        return {
                            number: getText("[class*='number'], [class*='Number'], h1, h2"),
                            contact: getText("[class*='contact'], [class*='Contact'], [class*='client']"),
                            status: getText("[class*='status'], [class*='Status'], [class*='badge']"),
                            subtotal: getText("[class*='subtotal'], [class*='Subtotal']"),
                            tax: getText("[class*='tax'], [class*='Tax']"),
                            total: getText("[class*='total'], [class*='Total']"),
                            balanceDue: getText("[class*='balance'], [class*='Balance'], [class*='outstanding']"),
                            dueDate: getText("[class*='due'], [class*='Due']"),
                            notes: getText("[class*='notes'], [class*='Notes']"),
                            lineItems,
                            payments,
                        };
                    });
                    return {
                        invoiceNumber: number || details.number,
                        invoiceId: id || null,
                        ...details,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_send_invoice: async (args) => {
            const number = asString(args.invoiceNumber);
            const id = asString(args.invoiceId);
            const emailSubject = asString(args.emailSubject);
            const emailBody = asString(args.emailBody);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "invoices-send", async () => {
                    if (id) {
                        await gotoGhl(page, `/invoices/${id}`);
                    }
                    else if (number) {
                        await gotoGhl(page, "/invoices");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${number}")`).first().click();
                    }
                    else {
                        throw new Error("invoiceNumber or invoiceId is required");
                    }
                    await waitForAppReady(page);
                    const sendBtn = page
                        .locator('button:has-text("Send"), button:has-text("Email"), button:has-text("Share")')
                        .first();
                    await sendBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1000);
                    if (emailSubject) {
                        const subjectInput = page.locator('input[placeholder*="Subject"], input[name="subject"]').first();
                        try {
                            await subjectInput.fill(emailSubject, { timeout: 3000 });
                        }
                        catch {
                            // subject is optional
                        }
                    }
                    if (emailBody) {
                        const bodyInput = page.locator('textarea[placeholder*="Message"], textarea[name="body"], [contenteditable="true"]').first();
                        try {
                            await bodyInput.fill(emailBody, { timeout: 3000 });
                        }
                        catch {
                            // body is optional
                        }
                    }
                    const confirmSend = page.locator('button:has-text("Send"), button:has-text("Confirm")').first();
                    await confirmSend.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    return {
                        invoiceNumber: number,
                        invoiceId: id || null,
                        sent: true,
                        emailSubject: emailSubject || null,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_record_invoice_payment: async (args) => {
            const number = asString(args.invoiceNumber);
            const id = asString(args.invoiceId);
            const amount = asNumber(args.amount);
            const method = asString(args.method) || "cash";
            const date = asString(args.date);
            const reference = asString(args.reference);
            if (amount === undefined)
                throw new Error("amount is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "invoices-payment", async () => {
                    if (id) {
                        await gotoGhl(page, `/invoices/${id}`);
                    }
                    else if (number) {
                        await gotoGhl(page, "/invoices");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${number}")`).first().click();
                    }
                    else {
                        throw new Error("invoiceNumber or invoiceId is required");
                    }
                    await waitForAppReady(page);
                    const paymentBtn = page
                        .locator('button:has-text("Record Payment"), button:has-text("Add Payment"), button:has-text("Payment")')
                        .first();
                    await paymentBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1000);
                    const amountInput = page.locator('input[placeholder*="Amount"], input[name="amount"], input[type="number"]').first();
                    await amountInput.fill(String(amount), { timeout: 3000 });
                    if (method) {
                        const methodSelect = page.locator('select[name="method"], [class*="method"], [class*="payment-type"]').first();
                        try {
                            await methodSelect.click({ timeout: 3000 });
                            await page.locator(`[class*="option"]:has-text("${method}")`).first().click({ timeout: 3000 });
                        }
                        catch {
                            // method selection is best-effort
                        }
                    }
                    if (date) {
                        const dateInput = page.locator('input[type="date"], input[placeholder*="Date"]').first();
                        try {
                            await dateInput.fill(date, { timeout: 3000 });
                        }
                        catch {
                            // date is best-effort
                        }
                    }
                    if (reference) {
                        const refInput = page.locator('input[placeholder*="Reference"], input[name="reference"]').first();
                        try {
                            await refInput.fill(reference, { timeout: 3000 });
                        }
                        catch {
                            // reference is optional
                        }
                    }
                    const savePayment = page.locator('button:has-text("Save"), button:has-text("Record"), button:has-text("Confirm")').first();
                    await savePayment.click({ timeout: 5000 });
                    await page.waitForTimeout(1000);
                    return {
                        invoiceNumber: number,
                        invoiceId: id || null,
                        amount,
                        method,
                        date: date || null,
                        reference: reference || null,
                        recorded: true,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_void_invoice: async (args) => {
            const number = asString(args.invoiceNumber);
            const id = asString(args.invoiceId);
            const action = asString(args.action) || "void";
            const confirm = Boolean(args.confirm);
            if (!confirm)
                throw new Error("confirm must be true to void/delete an invoice");
            if (!number && !id)
                throw new Error("invoiceNumber or invoiceId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "invoices-void", async () => {
                    if (id) {
                        await gotoGhl(page, `/invoices/${id}`);
                    }
                    else {
                        await gotoGhl(page, "/invoices");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${number}")`).first().click();
                    }
                    await waitForAppReady(page);
                    const actionLabel = action === "delete" ? "Delete" : "Void";
                    const actionBtn = page
                        .locator(`button:has-text("${actionLabel}"), button:has-text("More"), button:has-text("⋮")`)
                        .first();
                    await actionBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    if (action !== "delete") {
                        const voidOption = page.locator(`text="${actionLabel}", text="${actionLabel.toLowerCase()}", [class*="${action}"]`).first();
                        try {
                            await voidOption.click({ timeout: 3000 });
                        }
                        catch {
                            // may have been direct button
                        }
                    }
                    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete"), button:has-text("Void")').first();
                    await confirmBtn.click({ timeout: 5000 });
                    await waitForAppReady(page);
                    return {
                        invoiceNumber: number,
                        invoiceId: id || null,
                        action,
                        completed: true,
                    };
                });
            }
            finally {
                await close();
            }
        },
    },
};
