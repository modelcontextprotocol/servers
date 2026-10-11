import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const reputationModule = {
    tools: [
        {
            name: "ghl_browser_list_reviews",
            description: "List reviews from connected platforms (Google, Facebook, etc.) with reviewer name, " +
                "rating, text, date, platform, and response status.",
            inputSchema: {
                type: "object",
                properties: {
                    platform: {
                        type: "string",
                        description: "Filter by platform: 'all' (default), 'google', 'facebook'",
                    },
                    rating: {
                        type: "string",
                        description: "Filter by rating: 'all' (default), '5', '4', '3', '2', '1'",
                    },
                    responded: {
                        type: "string",
                        description: "Filter: 'all' (default), 'responded', 'unresponded'",
                    },
                },
            },
        },
        {
            name: "ghl_browser_request_review",
            description: "Send a review request to a contact via SMS or email. Uses GHL's built-in review funnel.",
            inputSchema: {
                type: "object",
                properties: {
                    contactName: { type: "string", description: "Contact name to send review request to" },
                    channel: {
                        type: "string",
                        description: "'sms' (default), 'email', or 'both'",
                    },
                    message: { type: "string", description: "Custom message to include with the review request" },
                },
                required: ["contactName"],
            },
        },
        {
            name: "ghl_browser_respond_to_review",
            description: "Reply to a review. The response is posted to the original platform (Google, Facebook, etc.).",
            inputSchema: {
                type: "object",
                properties: {
                    reviewerName: { type: "string", description: "Reviewer name to find the review" },
                    platform: { type: "string", description: "Platform the review is on ('google', 'facebook')" },
                    response: { type: "string", description: "Your reply text" },
                },
                required: ["reviewerName", "response"],
            },
        },
        {
            name: "ghl_browser_get_reputation_score",
            description: "Get the overall reputation score: average rating, total review count, " +
                "rating distribution (5-star through 1-star counts), and recent trend.",
            inputSchema: {
                type: "object",
                properties: {
                    platform: {
                        type: "string",
                        description: "'all' (default) or specific platform name",
                    },
                },
            },
        },
        {
            name: "ghl_browser_list_review_sites",
            description: "List connected review platforms/sites with name, URL, review count, " +
                "and average rating for each.",
            inputSchema: {
                type: "object",
                properties: {},
            },
        },
    ],
    handlers: {
        ghl_browser_list_reviews: async (args) => {
            const platform = asString(args.platform) || "all";
            const rating = asString(args.rating) || "all";
            const responded = asString(args.responded) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "reviews-list", async () => {
                    await gotoGhl(page, "/reputation");
                    await waitForAppReady(page);
                    if (platform !== "all") {
                        const platFilter = page
                            .locator(`button:has-text("${platform}"), [class*="filter"]:has-text("${platform}")`)
                            .first();
                        try {
                            await platFilter.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // filter may not exist
                        }
                    }
                    if (rating !== "all") {
                        const ratingFilter = page
                            .locator(`button:has-text("${rating} star"), [class*="rating-filter"]:has-text("${rating}")`)
                            .first();
                        try {
                            await ratingFilter.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // filter may not exist
                        }
                    }
                    if (responded !== "all") {
                        const respondedFilter = page
                            .locator(`button:has-text("${responded}"), [class*="filter"]:has-text("${responded}")`)
                            .first();
                        try {
                            await respondedFilter.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // filter may not exist
                        }
                    }
                    const reviews = await page.evaluate(() => {
                        const items = [];
                        const reviewSelectors = [
                            '[class*="ReviewRow"]',
                            '[class*="review-row"]',
                            '[class*="review-item"]',
                            '[class*="ReviewItem"]',
                            '[class*="review-card"]',
                            '[class*="ReviewCard"]',
                        ];
                        for (const sel of reviewSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("[class*='name'], [class*='Name'], [class*='reviewer']");
                                const ratingEl = el.querySelector("[class*='rating'], [class*='Rating'], [class*='star']");
                                const textEl = el.querySelector("[class*='text'], [class*='Text'], [class*='body'], [class*='content']");
                                const dateEl = el.querySelector("[class*='date'], [class*='Date']");
                                const platEl = el.querySelector("[class*='platform'], [class*='Platform'], [class*='source']");
                                const responseEl = el.querySelector("[class*='response'], [class*='Response'], [class*='reply']");
                                items.push({
                                    reviewer: nameEl?.textContent?.trim() || "",
                                    rating: ratingEl?.textContent?.trim() || "",
                                    text: textEl?.textContent?.slice(0, 300).trim() || "",
                                    date: dateEl?.textContent?.trim() || "",
                                    platform: platEl?.textContent?.trim() || "",
                                    responded: !!responseEl?.textContent?.trim(),
                                    response: responseEl?.textContent?.slice(0, 300).trim() || "",
                                });
                            });
                        }
                        return items;
                    });
                    return {
                        count: reviews.length,
                        filters: { platform, rating, responded },
                        reviews,
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_request_review: async (args) => {
            const contactName = asString(args.contactName);
            const channel = asString(args.channel) || "sms";
            const message = asString(args.message);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "reviews-request", async () => {
                    await gotoGhl(page, "/reputation");
                    await waitForAppReady(page);
                    const requestBtn = page
                        .locator('button:has-text("Request"), button:has-text("Send Request"), button:has-text("Ask for Review")')
                        .first();
                    await requestBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1000);
                    const contactInput = page
                        .locator('input[placeholder*="Contact"], input[placeholder*="Name"], input[name="contact"]')
                        .first();
                    await contactInput.fill(contactName);
                    await page.waitForTimeout(500);
                    try {
                        await page.keyboard.press("Enter");
                        await page.waitForTimeout(500);
                    }
                    catch {
                        // autocomplete
                    }
                    if (channel !== "sms") {
                        const channelSelect = page.locator('[class*="channel"], select[name="channel"]').first();
                        try {
                            await channelSelect.click({ timeout: 3000 });
                            await page.locator(`[class*="option"]:has-text("${channel}")`).first().click({ timeout: 3000 });
                        }
                        catch {
                            // channel selection is best-effort
                        }
                    }
                    if (message) {
                        const msgInput = page
                            .locator('textarea[placeholder*="Message"], textarea[name="message"], [contenteditable="true"]')
                            .first();
                        try {
                            await msgInput.fill(message, { timeout: 3000 });
                        }
                        catch {
                            // message is optional
                        }
                    }
                    const sendBtn = page.locator('button:has-text("Send"), button:has-text("Request"), button:has-text("Submit")').first();
                    await sendBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    return {
                        contact: contactName,
                        channel,
                        message: message || null,
                        sent: true,
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_respond_to_review: async (args) => {
            const reviewerName = asString(args.reviewerName);
            const platform = asString(args.platform);
            const response = asString(args.response);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "reviews-respond", async () => {
                    await gotoGhl(page, "/reputation");
                    await waitForAppReady(page);
                    const reviewRow = page
                        .locator(`[class*="review"]:has-text("${reviewerName}"), [class*="Review"]:has-text("${reviewerName}")`)
                        .first();
                    await reviewRow.click({ timeout: 5000 });
                    await page.waitForTimeout(1000);
                    const respondBtn = page
                        .locator('button:has-text("Respond"), button:has-text("Reply"), button:has-text("Answer")')
                        .first();
                    try {
                        await respondBtn.click({ timeout: 5000 });
                        await page.waitForTimeout(800);
                    }
                    catch {
                        // response area may be inline
                    }
                    const responseInput = page
                        .locator('textarea[placeholder*="Response"], textarea[placeholder*="Reply"], textarea[name="response"], [contenteditable="true"]')
                        .first();
                    await responseInput.fill(response, { timeout: 5000 });
                    const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Post"), button:has-text("Send"), button:has-text("Save")').first();
                    await submitBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);
                    return {
                        reviewer: reviewerName,
                        platform: platform || "unknown",
                        response,
                        posted: true,
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_reputation_score: async (args) => {
            const platform = asString(args.platform) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "reputation-score", async () => {
                    await gotoGhl(page, "/reputation");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const score = await page.evaluate(() => {
                        const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
                        const ratingDistribution = {};
                        document.querySelectorAll('[class*="rating-bar"], [class*="RatingBar"], [class*="distribution"] [class*="row"]').forEach((el) => {
                            const starLabel = el.querySelector("[class*='star'], [class*='label']")?.textContent?.trim() || "";
                            const count = el.querySelector("[class*='count'], [class*='Count'], [class*='bar']")?.textContent?.trim() || "";
                            if (starLabel)
                                ratingDistribution[starLabel] = count;
                        });
                        const platformScores = [];
                        document.querySelectorAll('[class*="platform"], [class*="Platform"], [class*="source"]').forEach((el) => {
                            const nameEl = el.querySelector("[class*='name'], [class*='Name']");
                            const ratingEl = el.querySelector("[class*='rating'], [class*='Rating']");
                            const countEl = el.querySelector("[class*='count'], [class*='Count']");
                            if (nameEl) {
                                platformScores.push({
                                    name: nameEl.textContent?.trim() || "",
                                    rating: ratingEl?.textContent?.trim() || "",
                                    count: countEl?.textContent?.trim() || "",
                                });
                            }
                        });
                        return {
                            averageRating: getText("[class*='average'], [class*='Average'], [class*='score'], [class*='Score']"),
                            totalReviews: getText("[class*='total'], [class*='Total'], [class*='count']"),
                            ratingDistribution,
                            platformScores,
                            trend: getText("[class*='trend'], [class*='Trend'], [class*='change']"),
                        };
                    });
                    return {
                        platform: platform,
                        ...score,
                        url: page.url(),
                    };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_list_review_sites: async (args) => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "review-sites", async () => {
                    await gotoGhl(page, "/reputation");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const sitesTab = page
                        .locator('button:has-text("Sites"), a:has-text("Sites"), [class*="tab"]:has-text("Sites"), button:has-text("Platforms")')
                        .first();
                    try {
                        await sitesTab.click({ timeout: 5000 });
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // tab may not exist, data may be on main page
                    }
                    const sites = await page.evaluate(() => {
                        const items = [];
                        const siteSelectors = [
                            '[class*="site-item"]',
                            '[class*="SiteItem"]',
                            '[class*="platform-item"]',
                            '[class*="PlatformItem"]',
                            '[class*="review-site"]',
                            '[class*="connected"]',
                        ];
                        for (const sel of siteSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const nameEl = el.querySelector("[class*='name'], [class*='Name'], h4");
                                const urlEl = el.querySelector("[class*='url'], [class*='URL'], a");
                                const countEl = el.querySelector("[class*='count'], [class*='Count'], [class*='review']");
                                const ratingEl = el.querySelector("[class*='rating'], [class*='Rating']");
                                const connectedEl = el.querySelector("[class*='connected'], [class*='Connected'], [class*='active']");
                                items.push({
                                    name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 60).trim() || "",
                                    url: urlEl?.href || urlEl?.textContent?.trim() || "",
                                    reviewCount: countEl?.textContent?.trim() || "",
                                    avgRating: ratingEl?.textContent?.trim() || "",
                                    connected: !!connectedEl || el.textContent?.toLowerCase().includes("connected") || false,
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
    },
};
