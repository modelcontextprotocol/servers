import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError } from "../helpers.js";
export const ecommerceModule = {
    tools: [
        {
            name: "ghl_browser_list_products",
            description: "List e-commerce products with name, price, inventory, and status.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "ghl_browser_create_product",
            description: "Create a new product with name, price, and description.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    price: { type: "number" },
                    description: { type: "string" },
                    type: { type: "string", description: "Product type: physical, digital, service" },
                },
                required: ["name", "price"],
            },
        },
        {
            name: "ghl_browser_get_product_details",
            description: "Get full product details including variants, pricing, and inventory.",
            inputSchema: {
                type: "object",
                properties: { productName: { type: "string" } },
                required: ["productName"],
            },
        },
        {
            name: "ghl_browser_list_orders",
            description: "List e-commerce orders with contact, amount, status, and date.",
            inputSchema: {
                type: "object",
                properties: {
                    status: { type: "string", description: "Filter: all, pending, fulfilled, shipped, cancelled" },
                },
            },
        },
        {
            name: "ghl_browser_get_order_details",
            description: "Get full order details including items, shipping, and payment.",
            inputSchema: {
                type: "object",
                properties: { orderId: { type: "string", description: "Order ID or customer name to find" } },
                required: ["orderId"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_products: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "ecommerce-products", async () => {
                    await gotoGhl(page, "/stores/products");
                    await waitForAppReady(page);
                    const rows = await page.evaluate(() => {
                        const items = [];
                        document.querySelectorAll('tr, [class*="product"], [class*="row"], [role="row"]').forEach((el) => {
                            const nameEl = el.querySelector('a, h4, [class*="name"], td:first-child');
                            if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                                items.push({
                                    name: nameEl.textContent?.trim() ?? "",
                                    price: el.querySelector('[class*="price"], [class*="amount"]')?.textContent?.trim() || "",
                                    inventory: el.querySelector('[class*="inventory"], [class*="stock"]')?.textContent?.trim() || "",
                                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
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
        ghl_browser_create_product: async (args) => {
            const name = String(args.name);
            const price = Number(args.price);
            const description = args.description || "";
            const type = args.type || "digital";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "ecommerce-create", async () => {
                    await gotoGhl(page, "/stores/products");
                    await waitForAppReady(page);
                    await page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")').first().click();
                    await waitForAppReady(page);
                    await page.locator('input[name="name"], input[placeholder*="Name"]').first().fill(name);
                    await page.locator('input[name="price"], input[type="number"]').first().fill(String(price));
                    if (description) {
                        try {
                            await page.locator('textarea, [contenteditable="true"]').first().fill(description);
                        }
                        catch { /* optional */ }
                    }
                    await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
                    await waitForAppReady(page);
                    return { name, price, type, description: description || null, created: true, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_product_details: async (args) => {
            const productName = String(args.productName);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "ecommerce-detail", async () => {
                    await gotoGhl(page, "/stores/products");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${productName}"), [class*="name"]:has-text("${productName}")`).first().click();
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
                    return { productName, fields: details, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_orders: async (args) => {
            const status = args.status || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "ecommerce-orders", async () => {
                    await gotoGhl(page, "/stores/orders");
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
                        document.querySelectorAll('tr, [class*="order"], [class*="row"], [role="row"]').forEach((el) => {
                            const idEl = el.querySelector('a, [class*="id"]');
                            if (idEl && (idEl.textContent?.trim().length ?? 0) > 2) {
                                items.push({
                                    id: idEl.textContent?.trim() ?? "",
                                    contact: el.querySelector('[class*="contact"], [class*="customer"]')?.textContent?.trim() || "",
                                    amount: el.querySelector('[class*="amount"], [class*="total"]')?.textContent?.trim() || "",
                                    status: el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() || "",
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
        ghl_browser_get_order_details: async (args) => {
            const orderId = String(args.orderId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "ecommerce-order-detail", async () => {
                    await gotoGhl(page, "/stores/orders");
                    await waitForAppReady(page);
                    await page.locator(`a:has-text("${orderId}"), [class*="id"]:has-text("${orderId}")`).first().click();
                    await waitForAppReady(page);
                    const details = await page.evaluate(() => {
                        const fields = {};
                        document.querySelectorAll('[class*="field"], label, dt').forEach((el) => {
                            const label = el.textContent?.trim() || "";
                            const valueEl = el.parentElement?.querySelector('[class*="value"], dd, span');
                            if (label && valueEl)
                                fields[label] = valueEl.textContent?.trim() || "";
                        });
                        const items = Array.from(document.querySelectorAll('[class*="item"], [class*="line"]')).map((el) => ({
                            name: el.querySelector('[class*="name"], [class*="product"]')?.textContent?.trim() || "",
                            qty: el.querySelector('[class*="qty"], [class*="quantity"]')?.textContent?.trim() || "",
                            price: el.querySelector('[class*="price"]')?.textContent?.trim() || "",
                        }));
                        return { fields, items };
                    });
                    return { orderId, ...details, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
    },
};
