import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const pageBuilderModule = {
    tools: [
        {
            name: "ghl_browser_list_sites",
            description: "List websites and funnels on the GHL Sites index page. " +
                "Returns name, type (website/funnel), page count, and status.",
            inputSchema: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        description: "Filter: 'websites', 'funnels', or 'all' (default 'all')",
                    },
                    search: {
                        type: "string",
                        description: "Optional search term to filter by name",
                    },
                },
            },
        },
        {
            name: "ghl_browser_get_page_tree",
            description: "Get the page tree for a site or funnel: list all pages with name, URL path, " +
                "status (draft/published), and whether each is a homepage.",
            inputSchema: {
                type: "object",
                properties: {
                    siteName: { type: "string", description: "Site/funnel name (used to locate on the index page)" },
                    siteId: { type: "string", description: "Site/funnel ID (preferred if known)" },
                },
            },
        },
        {
            name: "ghl_browser_open_page_builder",
            description: "Open the WYSIWYG page builder for a specific page and return the current element tree: " +
                "sections, columns, and elements with their types, text content, and positions.",
            inputSchema: {
                type: "object",
                properties: {
                    siteName: { type: "string", description: "Site/funnel name" },
                    siteId: { type: "string", description: "Site/funnel ID (preferred)" },
                    pageName: { type: "string", description: "Page name to open in the builder" },
                    pageId: { type: "string", description: "Page ID (preferred if known)" },
                },
            },
        },
        {
            name: "ghl_browser_add_page_section",
            description: "Add a section or element to a page in the builder. " +
                "Supports section types like: heading, text, image, button, form, video, divider, spacer, columns.",
            inputSchema: {
                type: "object",
                properties: {
                    siteName: { type: "string" },
                    siteId: { type: "string", description: "Site/funnel ID (preferred)" },
                    pageName: { type: "string" },
                    pageId: { type: "string", description: "Page ID (preferred)" },
                    elementType: {
                        type: "string",
                        description: "Element type from the builder palette (e.g. 'heading', 'text', 'image', 'button', 'form', 'columns')",
                    },
                    position: {
                        type: "string",
                        description: "'top', 'bottom' (default), or 'after:<elementName>'",
                    },
                },
                required: ["elementType"],
            },
        },
        {
            name: "ghl_browser_edit_page_element",
            description: "Edit properties of an element on a page: text content, link URL, image source, " +
                "background color, font size, or custom CSS class.",
            inputSchema: {
                type: "object",
                properties: {
                    siteName: { type: "string" },
                    siteId: { type: "string", description: "Site/funnel ID (preferred)" },
                    pageName: { type: "string" },
                    pageId: { type: "string", description: "Page ID (preferred)" },
                    elementSelector: {
                        type: "string",
                        description: "CSS selector or element text to identify the target element (e.g. 'h1', 'Buy Now', '.hero-heading')",
                    },
                    text: { type: "string", description: "New text content for the element" },
                    linkUrl: { type: "string", description: "URL to set as the element's link" },
                    imageSrc: { type: "string", description: "Image URL to set as the element's source" },
                    backgroundColor: { type: "string", description: "Background color (hex, rgb, or named)" },
                    fontSize: { type: "string", description: "Font size (e.g. '24px', '2rem')" },
                    cssClass: { type: "string", description: "Custom CSS class to add" },
                },
                required: ["elementSelector"],
            },
        },
        {
            name: "ghl_browser_save_page",
            description: "Save changes in the page builder. Optionally publish to make the page live.",
            inputSchema: {
                type: "object",
                properties: {
                    siteName: { type: "string" },
                    siteId: { type: "string", description: "Site/funnel ID (preferred)" },
                    pageName: { type: "string" },
                    pageId: { type: "string", description: "Page ID (preferred)" },
                    publish: { type: "boolean", description: "Whether to publish the page after saving" },
                },
            },
        },
    ],
    handlers: {
        ghl_browser_list_sites: async (args) => {
            const filterType = asString(args.type) || "all";
            const search = asString(args.search);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "sites-list", async () => {
                    const path = filterType === "funnels" ? "/funnels" : filterType === "websites" ? "/sites" : "/sites";
                    await gotoGhl(page, path);
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
                            // search not available
                        }
                    }
                    const sites = await page.evaluate(() => {
                        const items = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="SiteRow"]',
                            '[class*="site-row"]',
                            '[class*="FunnelRow"]',
                            '[class*="card"]',
                            '[class*="ListRow"]',
                            'a[href*="/sites/"]',
                            'a[href*="/funnels/"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const anchor = el.closest("a") || el.querySelector("a");
                                const nameEl = el.querySelector("[class*='name'], [class*='Name'], h3, h4, td:first-child");
                                const typeEl = el.querySelector("[class*='type'], [class*='Type'], [class*='badge']");
                                const countEl = el.querySelector("[class*='count'], [class*='Count'], [class*='pages']");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status']");
                                const href = anchor?.getAttribute("href") || "";
                                items.push({
                                    name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                                    type: typeEl?.textContent?.trim() || (href.includes("funnel") ? "funnel" : "website"),
                                    pageCount: countEl?.textContent?.trim() || "",
                                    status: statusEl?.textContent?.trim() || "",
                                    href,
                                });
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(sites.map((r) => [r.name, r])).values());
                    return { count: deduped.length, sites: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_page_tree: async (args) => {
            const siteName = asString(args.siteName);
            const siteId = asString(args.siteId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "sites-page-tree", async () => {
                    if (siteId) {
                        await gotoGhl(page, `/sites/${siteId}/pages`);
                    }
                    else if (siteName) {
                        await gotoGhl(page, "/sites");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${siteName}"), [class*="row"]:has-text("${siteName}")`).first().click();
                    }
                    else {
                        throw new Error("siteName or siteId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const tree = await page.evaluate(() => {
                        const pages = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="PageRow"]',
                            '[class*="page-row"]',
                            '[class*="page-item"]',
                            '[class*="PageItem"]',
                            '[class*="ListRow"]',
                            'a[href*="/page/"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const anchor = el.closest("a") || el.querySelector("a");
                                const nameEl = el.querySelector("[class*='name'], [class*='Name'], h4, span");
                                const pathEl = el.querySelector("[class*='path'], [class*='Path'], [class*='url']");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge']");
                                const homeIndicator = !!el.querySelector("[class*='home'], [class*='Home'], [class*='homepage']");
                                const href = anchor?.getAttribute("href") || "";
                                pages.push({
                                    name: nameEl?.textContent?.trim() || "",
                                    path: pathEl?.textContent?.trim() || "",
                                    status: statusEl?.textContent?.trim() || "",
                                    isHome: homeIndicator || el.textContent?.toLowerCase().includes("home") || false,
                                    href,
                                });
                            });
                        }
                        return pages;
                    });
                    return {
                        siteName: siteName || null,
                        siteId: siteId || null,
                        pageCount: tree.length,
                        pages: tree,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_open_page_builder: async (args) => {
            const siteName = asString(args.siteName);
            const siteId = asString(args.siteId);
            const pageName = asString(args.pageName);
            const pageId = asString(args.pageId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "page-builder-open", async () => {
                    if (pageId) {
                        await gotoGhl(page, `/pages/${pageId}/editor`);
                    }
                    else if (siteId && pageName) {
                        await gotoGhl(page, `/sites/${siteId}/pages`);
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}"), [class*="row"]:has-text("${pageName}")`).first().click();
                    }
                    else if (siteName && pageName) {
                        await gotoGhl(page, "/sites");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${siteName}")`).first().click();
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}")`).first().click();
                    }
                    else {
                        throw new Error("Provide pageId, or siteId/siteName + pageName");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(3000);
                    const elements = await page.evaluate(() => {
                        const els = [];
                        const sectionSelectors = [
                            '[class*="section"]',
                            '[class*="Section"]',
                            '[data-element-type]',
                            '[class*="element"]',
                            '[class*="Element"]',
                            '[class*="block"]',
                            '[class*="Block"]',
                            '[class*="row"]',
                            '[class*="column"]',
                        ];
                        for (const sel of sectionSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const rect = el.getBoundingClientRect();
                                if (rect.width < 10 || rect.height < 10)
                                    return;
                                const typeAttr = el.getAttribute("data-element-type") || "";
                                const typeFromClass = el.className?.toString().match(/(?:element|type|block)-(\w+)/)?.[1] || "";
                                els.push({
                                    type: typeAttr || typeFromClass || sel.replace(/[\[\]'"]/g, ""),
                                    text: el.textContent?.slice(0, 80).trim() || "",
                                    tag: el.tagName.toLowerCase(),
                                    classes: el.className?.toString().slice(0, 150) || "",
                                    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
                                });
                            });
                        }
                        return els;
                    });
                    return {
                        siteName: siteName || null,
                        siteId: siteId || null,
                        pageName: pageName || null,
                        pageId: pageId || null,
                        elementCount: elements.length,
                        elements,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_add_page_section: async (args) => {
            const siteName = asString(args.siteName);
            const siteId = asString(args.siteId);
            const pageName = asString(args.pageName);
            const pageId = asString(args.pageId);
            const elementType = asString(args.elementType);
            const position = asString(args.position) || "bottom";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "page-builder-add-section", async () => {
                    if (pageId) {
                        await gotoGhl(page, `/pages/${pageId}/editor`);
                    }
                    else if (siteId && pageName) {
                        await gotoGhl(page, `/sites/${siteId}/pages`);
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}")`).first().click();
                    }
                    else if (siteName && pageName) {
                        await gotoGhl(page, "/sites");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${siteName}")`).first().click();
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}")`).first().click();
                    }
                    else {
                        throw new Error("Provide pageId, or siteId/siteName + pageName");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(3000);
                    const addBtn = page
                        .locator('button:has-text("Add"), button:has-text("+"), [class*="add-section"], [class*="AddSection"]')
                        .first();
                    try {
                        await addBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(800);
                    }
                    catch {
                        // add button may be in toolbar
                    }
                    const elementOption = page
                        .locator(`[class*="element"]:has-text("${elementType}"), ` +
                        `[class*="palette"] :has-text("${elementType}"), ` +
                        `button:has-text("${elementType}"), ` +
                        `[data-element-type="${elementType}"]`)
                        .first();
                    try {
                        await elementOption.click({ timeout: 5000 });
                    }
                    catch {
                        throw new Error(`Could not find element type "${elementType}" in the builder palette`);
                    }
                    await page.waitForTimeout(1500);
                    return {
                        pageName,
                        pageId: pageId || null,
                        elementType,
                        position,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_edit_page_element: async (args) => {
            const siteName = asString(args.siteName);
            const siteId = asString(args.siteId);
            const pageName = asString(args.pageName);
            const pageId = asString(args.pageId);
            const elementSelector = asString(args.elementSelector);
            const text = asString(args.text);
            const linkUrl = asString(args.linkUrl);
            const imageSrc = asString(args.imageSrc);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "page-builder-edit", async () => {
                    if (pageId) {
                        await gotoGhl(page, `/pages/${pageId}/editor`);
                    }
                    else if (siteId && pageName) {
                        await gotoGhl(page, `/sites/${siteId}/pages`);
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}")`).first().click();
                    }
                    else if (siteName && pageName) {
                        await gotoGhl(page, "/sites");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${siteName}")`).first().click();
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}")`).first().click();
                    }
                    else {
                        throw new Error("Provide pageId, or siteId/siteName + pageName");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(3000);
                    const targetEl = page.locator(elementSelector).first();
                    await targetEl.click({ timeout: 5000 });
                    await page.waitForTimeout(800);
                    if (text) {
                        try {
                            const inlineInput = page.locator('[contenteditable="true"], input[type="text"]:focus, textarea:focus').first();
                            await inlineInput.fill(text, { timeout: 3000 });
                        }
                        catch {
                            await page.keyboard.type(text);
                        }
                    }
                    if (linkUrl) {
                        const linkBtn = page.locator('button:has-text("Link"), [class*="link"], [title="Link"]').first();
                        try {
                            await linkBtn.click({ timeout: 3000 });
                            await page.waitForTimeout(500);
                            const linkInput = page.locator('input[placeholder*="URL"], input[placeholder*="link"], input[type="url"]').first();
                            await linkInput.fill(linkUrl, { timeout: 3000 });
                        }
                        catch {
                            // link may be set via properties panel
                        }
                    }
                    if (imageSrc) {
                        const imgInput = page.locator('input[placeholder*="Image"], input[placeholder*="URL"], input[type="url"]').first();
                        try {
                            await imgInput.fill(imageSrc, { timeout: 3000 });
                        }
                        catch {
                            // image may require upload dialog
                        }
                    }
                    return {
                        pageName,
                        pageId: pageId || null,
                        elementSelector,
                        updated: { text: text || null, linkUrl: linkUrl || null, imageSrc: imageSrc || null },
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_save_page: async (args) => {
            const siteName = asString(args.siteName);
            const siteId = asString(args.siteId);
            const pageName = asString(args.pageName);
            const pageId = asString(args.pageId);
            const publish = Boolean(args.publish);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "page-builder-save", async () => {
                    if (pageId) {
                        await gotoGhl(page, `/pages/${pageId}/editor`);
                    }
                    else if (siteId && pageName) {
                        await gotoGhl(page, `/sites/${siteId}/pages`);
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}")`).first().click();
                    }
                    else if (siteName && pageName) {
                        await gotoGhl(page, "/sites");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${siteName}")`).first().click();
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${pageName}")`).first().click();
                    }
                    else {
                        throw new Error("Provide pageId, or siteId/siteName + pageName");
                    }
                    await waitForAppReady(page);
                    const saveBtn = page.locator('button:has-text("Save"), [class*="save"], [title="Save"]').first();
                    await saveBtn.click();
                    await page.waitForTimeout(1500);
                    if (publish) {
                        const pubBtn = page.locator('button:has-text("Publish"), button:has-text("Go Live")').first();
                        try {
                            await pubBtn.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // may already be published
                        }
                    }
                    return {
                        pageName,
                        pageId: pageId || null,
                        published: publish,
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
