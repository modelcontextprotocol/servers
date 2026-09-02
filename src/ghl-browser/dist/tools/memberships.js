import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString, asNumber } from "../helpers.js";
export const membershipModule = {
    tools: [
        {
            name: "ghl_browser_list_memberships",
            description: "List membership products and courses with name, type (membership/course/offer), " +
                "price, member count, and status.",
            inputSchema: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        description: "Filter: 'all' (default), 'memberships', 'courses', 'offers'",
                    },
                    search: {
                        type: "string",
                        description: "Optional search term to filter by name",
                    },
                },
            },
        },
        {
            name: "ghl_browser_create_membership",
            description: "Create a new membership product or course. Returns the name and URL after creation.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Membership/course name" },
                    type: {
                        type: "string",
                        description: "'membership' (default), 'course', or 'offer'",
                    },
                    price: { type: "number", description: "Price (one-time or recurring base)" },
                    billingCycle: {
                        type: "string",
                        description: "'one_time', 'monthly', 'yearly' (default 'one_time')",
                    },
                    description: { type: "string", description: "Membership description" },
                },
                required: ["name"],
            },
        },
        {
            name: "ghl_browser_get_membership_structure",
            description: "Open a membership and return its full content hierarchy: offers, products, " +
                "courses, modules, and lessons with titles and order.",
            inputSchema: {
                type: "object",
                properties: {
                    membershipName: { type: "string", description: "Membership name" },
                    membershipId: { type: "string", description: "Membership ID (preferred if known)" },
                },
            },
        },
        {
            name: "ghl_browser_add_membership_content",
            description: "Add content to a membership: a new course, module within a course, or lesson within a module. " +
                "Supports video, text, PDF, and quiz content types.",
            inputSchema: {
                type: "object",
                properties: {
                    membershipName: { type: "string" },
                    membershipId: { type: "string", description: "Membership ID (preferred)" },
                    contentType: {
                        type: "string",
                        description: "'course', 'module', or 'lesson'",
                    },
                    title: { type: "string", description: "Title for the new content item" },
                    parentTitle: {
                        type: "string",
                        description: "Parent item title (e.g. course name when adding a module, module name when adding a lesson)",
                    },
                    body: { type: "string", description: "Text/HTML body for lessons" },
                    videoUrl: { type: "string", description: "Video URL for video lessons" },
                },
                required: ["contentType", "title"],
            },
        },
        {
            name: "ghl_browser_update_membership_settings",
            description: "Update membership settings: pricing, access control, drip schedule, " +
                "trial period, or thank-you page URL.",
            inputSchema: {
                type: "object",
                properties: {
                    membershipName: { type: "string" },
                    membershipId: { type: "string", description: "Membership ID (preferred)" },
                    price: { type: "number", description: "New price" },
                    billingCycle: { type: "string", description: "'one_time', 'monthly', 'yearly'" },
                    trialDays: { type: "number", description: "Trial period in days (0 to disable)" },
                    dripInterval: {
                        type: "string",
                        description: "Drip schedule: 'immediate', 'daily', 'weekly', 'monthly'",
                    },
                    thankYouUrl: { type: "string", description: "URL to redirect after purchase" },
                },
            },
        },
        {
            name: "ghl_browser_delete_membership",
            description: "Delete a membership product or course. This action is irreversible.",
            inputSchema: {
                type: "object",
                properties: {
                    membershipName: { type: "string" },
                    membershipId: { type: "string", description: "Membership ID (preferred)" },
                    confirm: { type: "boolean", description: "Must be true to proceed with deletion" },
                },
                required: ["confirm"],
            },
        },
    ],
    handlers: {
        ghl_browser_list_memberships: async (args) => {
            const filterType = asString(args.type) || "all";
            const search = asString(args.search);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "memberships-list", async () => {
                    const basePath = filterType === "courses" ? "/memberships/courses" : filterType === "offers" ? "/memberships/offers" : "/memberships";
                    await gotoGhl(page, basePath);
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
                    const memberships = await page.evaluate(() => {
                        const items = [];
                        const rowSelectors = [
                            "tr[data-row-key]",
                            '[class*="MembershipRow"]',
                            '[class*="membership-row"]',
                            '[class*="membership-item"]',
                            '[class*="MembershipItem"]',
                            '[class*="product-row"]',
                            '[class*="ListRow"]',
                            'a[href*="membership"]',
                            'a[href*="product"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const anchor = el.closest("a") || el.querySelector("a");
                                const nameEl = el.querySelector("[class*='name'], [class*='Name'], h4, td:first-child");
                                const typeEl = el.querySelector("[class*='type'], [class*='Type'], [class*='badge']");
                                const priceEl = el.querySelector("[class*='price'], [class*='Price'], [class*='amount']");
                                const countEl = el.querySelector("[class*='member'], [class*='Member'], [class*='count']");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status']");
                                const href = anchor?.getAttribute("href") || "";
                                items.push({
                                    name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                                    type: typeEl?.textContent?.trim() || (href.includes("course") ? "course" : "membership"),
                                    price: priceEl?.textContent?.trim() || "",
                                    memberCount: countEl?.textContent?.trim() || "",
                                    status: statusEl?.textContent?.trim() || "",
                                    href,
                                });
                            });
                        }
                        return items;
                    });
                    const deduped = Array.from(new Map(memberships.map((r) => [r.name, r])).values());
                    return { count: deduped.length, memberships: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_create_membership: async (args) => {
            const name = asString(args.name);
            const type = asString(args.type) || "membership";
            const price = asNumber(args.price);
            const billingCycle = asString(args.billingCycle) || "one_time";
            const description = asString(args.description);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "memberships-create", async () => {
                    await gotoGhl(page, "/memberships");
                    await waitForAppReady(page);
                    const createBtn = page
                        .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")')
                        .first();
                    await createBtn.click();
                    await page.waitForTimeout(800);
                    const nameInput = page
                        .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="Membership"]')
                        .first();
                    await nameInput.fill(name);
                    if (description) {
                        const descInput = page
                            .locator('textarea[name="description"], textarea[placeholder*="Description"]')
                            .first();
                        try {
                            await descInput.fill(description, { timeout: 3000 });
                        }
                        catch {
                            // description is optional
                        }
                    }
                    if (price !== undefined) {
                        const priceInput = page
                            .locator('input[name="price"], input[placeholder*="Price"], input[type="number"]')
                            .first();
                        try {
                            await priceInput.fill(String(price), { timeout: 3000 });
                        }
                        catch {
                            // price is optional
                        }
                    }
                    if (billingCycle !== "one_time") {
                        const cycleSelect = page
                            .locator('select[name="billingCycle"], [class*="billing"], [class*="cycle"]')
                            .first();
                        try {
                            await cycleSelect.click({ timeout: 3000 });
                            await page.locator(`button:has-text("${billingCycle}"), [class*="option"]:has-text("${billingCycle}")`).first().click({ timeout: 3000 });
                        }
                        catch {
                            // billing cycle selection is best-effort
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Next")').first();
                    await saveBtn.click();
                    await waitForAppReady(page);
                    return { name, type, price: price ?? null, billingCycle, description: description || null, url: page.url() };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_membership_structure: async (args) => {
            const name = asString(args.membershipName);
            const id = asString(args.membershipId);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "memberships-structure", async () => {
                    if (id) {
                        await gotoGhl(page, `/memberships/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/memberships");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("membershipName or membershipId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const structure = await page.evaluate(() => {
                        const courses = [];
                        const courseSelectors = [
                            '[class*="course-item"]',
                            '[class*="CourseItem"]',
                            '[class*="product-section"]',
                            '[data-course]',
                        ];
                        for (const sel of courseSelectors) {
                            document.querySelectorAll(sel).forEach((courseEl, cIdx) => {
                                const courseTitle = courseEl.querySelector("h3, h4, [class*='title']")?.textContent?.trim() || "";
                                const modules = [];
                                courseEl
                                    .querySelectorAll('[class*="module"], [class*="Module"]')
                                    .forEach((modEl, mIdx) => {
                                    const modTitle = modEl.querySelector("h4, h5, [class*='title']")?.textContent?.trim() || "";
                                    const lessons = [];
                                    modEl
                                        .querySelectorAll('[class*="lesson"], [class*="Lesson"], [class*="item"]')
                                        .forEach((lessonEl, lIdx) => {
                                        const lessonTitle = lessonEl.querySelector("span, [class*='title'], a")?.textContent?.trim() || "";
                                        const typeIcon = lessonEl.querySelector("[class*='icon'], [class*='type']")?.textContent?.trim() || "";
                                        lessons.push({ title: lessonTitle, type: typeIcon, order: lIdx });
                                    });
                                    modules.push({ title: modTitle, lessons, order: mIdx });
                                });
                                courses.push({ title: courseTitle, modules, order: cIdx });
                            });
                        }
                        const offers = [];
                        document
                            .querySelectorAll('[class*="offer"], [class*="Offer"], [class*="plan"], [class*="Plan"]')
                            .forEach((el) => {
                            const t = el.querySelector("[class*='name'], [class*='title']")?.textContent?.trim() || el.textContent?.slice(0, 60).trim();
                            if (t)
                                offers.push(t);
                        });
                        return {
                            name: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
                            courses,
                            offers,
                        };
                    });
                    return {
                        membershipName: name || structure.name,
                        membershipId: id || null,
                        courseCount: structure.courses.length,
                        courses: structure.courses,
                        offers: structure.offers,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_add_membership_content: async (args) => {
            const name = asString(args.membershipName);
            const id = asString(args.membershipId);
            const contentType = asString(args.contentType);
            const title = asString(args.title);
            const parentTitle = asString(args.parentTitle);
            const body = asString(args.body);
            const videoUrl = asString(args.videoUrl);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "memberships-add-content", async () => {
                    if (id) {
                        await gotoGhl(page, `/memberships/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/memberships");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("membershipName or membershipId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    if (parentTitle) {
                        const parentEl = page.locator(`[class*="course"]:has-text("${parentTitle}"), [class*="module"]:has-text("${parentTitle}")`).first();
                        try {
                            await parentEl.click({ timeout: 3000 });
                            await page.waitForTimeout(500);
                        }
                        catch {
                            // parent selection is best-effort
                        }
                    }
                    const addBtn = page
                        .locator(`button:has-text("Add ${contentType}"), button:has-text("New ${contentType}"), button:has-text("Add"), button:has-text("+")`)
                        .first();
                    try {
                        await addBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(800);
                    }
                    catch {
                        // add button fallback
                    }
                    const titleInput = page
                        .locator('input[placeholder*="Title"], input[placeholder*="Name"], input[name="title"]')
                        .first();
                    try {
                        await titleInput.fill(title, { timeout: 3000 });
                    }
                    catch {
                        // title may be inline
                    }
                    if (body && contentType === "lesson") {
                        const bodyInput = page
                            .locator('textarea[placeholder*="Content"], [contenteditable="true"], [class*="editor"]')
                            .first();
                        try {
                            await bodyInput.fill(body, { timeout: 3000 });
                        }
                        catch {
                            // body is optional
                        }
                    }
                    if (videoUrl) {
                        const videoInput = page
                            .locator('input[placeholder*="Video"], input[placeholder*="URL"], input[name="videoUrl"]')
                            .first();
                        try {
                            await videoInput.fill(videoUrl, { timeout: 3000 });
                        }
                        catch {
                            // video URL is optional
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Add"), button:has-text("Create")').first();
                    try {
                        await saveBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // may auto-save
                    }
                    return {
                        membershipName: name,
                        membershipId: id || null,
                        contentType,
                        title,
                        parentTitle: parentTitle || null,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_update_membership_settings: async (args) => {
            const name = asString(args.membershipName);
            const id = asString(args.membershipId);
            const price = asNumber(args.price);
            const billingCycle = asString(args.billingCycle);
            const trialDays = asNumber(args.trialDays);
            const dripInterval = asString(args.dripInterval);
            const thankYouUrl = asString(args.thankYouUrl);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "memberships-settings", async () => {
                    if (id) {
                        await gotoGhl(page, `/memberships/${id}`);
                    }
                    else if (name) {
                        await gotoGhl(page, "/memberships");
                        await waitForAppReady(page);
                        await page.locator(`a:has-text("${name}")`).first().click();
                    }
                    else {
                        throw new Error("membershipName or membershipId is required");
                    }
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const settingsTab = page
                        .locator('button:has-text("Settings"), a:has-text("Settings"), [class*="tab"]:has-text("Settings")')
                        .first();
                    try {
                        await settingsTab.click({ timeout: 5000 });
                        await page.waitForTimeout(800);
                    }
                    catch {
                        // may already be on settings
                    }
                    if (price !== undefined) {
                        const priceInput = page.locator('input[name="price"], input[placeholder*="Price"], input[type="number"]').first();
                        try {
                            await priceInput.fill(String(price), { timeout: 3000 });
                        }
                        catch {
                            // price update is best-effort
                        }
                    }
                    if (billingCycle) {
                        const cycleSelect = page.locator('select[name="billingCycle"], [class*="billing"]').first();
                        try {
                            await cycleSelect.click({ timeout: 3000 });
                            await page.locator(`[class*="option"]:has-text("${billingCycle}")`).first().click({ timeout: 3000 });
                        }
                        catch {
                            // billing cycle is best-effort
                        }
                    }
                    if (trialDays !== undefined) {
                        const trialInput = page.locator('input[name="trialDays"], input[placeholder*="Trial"]').first();
                        try {
                            await trialInput.fill(String(trialDays), { timeout: 3000 });
                        }
                        catch {
                            // trial is best-effort
                        }
                    }
                    if (dripInterval) {
                        const dripSelect = page.locator('select[name="drip"], [class*="drip"]').first();
                        try {
                            await dripSelect.click({ timeout: 3000 });
                            await page.locator(`[class*="option"]:has-text("${dripInterval}")`).first().click({ timeout: 3000 });
                        }
                        catch {
                            // drip is best-effort
                        }
                    }
                    if (thankYouUrl) {
                        const urlInput = page.locator('input[name="thankYouUrl"], input[placeholder*="Thank"], input[placeholder*="redirect"]').first();
                        try {
                            await urlInput.fill(thankYouUrl, { timeout: 3000 });
                        }
                        catch {
                            // URL is best-effort
                        }
                    }
                    const saveBtn = page.locator('button:has-text("Save")').first();
                    try {
                        await saveBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // auto-save
                    }
                    return {
                        membershipName: name,
                        membershipId: id || null,
                        updated: {
                            price: price ?? null,
                            billingCycle: billingCycle || null,
                            trialDays: trialDays ?? null,
                            dripInterval: dripInterval || null,
                            thankYouUrl: thankYouUrl || null,
                        },
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_delete_membership: async (args) => {
            const name = asString(args.membershipName);
            const id = asString(args.membershipId);
            const confirm = Boolean(args.confirm);
            if (!confirm)
                throw new Error("confirm must be true to delete a membership");
            if (!name && !id)
                throw new Error("membershipName or membershipId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "memberships-delete", async () => {
                    await gotoGhl(page, "/memberships");
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
                    const deleteOption = page.locator('text="Delete", text="delete", [class*="delete"]').first();
                    await deleteOption.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")').first();
                    await confirmBtn.click({ timeout: 5000 });
                    await waitForAppReady(page);
                    return { membershipName: name, membershipId: id, deleted: true };
                });
            }
            finally {
                await close();
            }
        },
    },
};
