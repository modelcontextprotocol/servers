import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import { withPageError, asString } from "../helpers.js";
export const conversationAiModule = {
    tools: [
        {
            name: "ghl_browser_get_conversation_ai_config",
            description: "Get the current Conversation AI / chatbot configuration for the sub-account: " +
                "bot name, enabled status, tone, knowledge base, and response settings.",
            inputSchema: {
                type: "object",
                properties: {},
            },
        },
        {
            name: "ghl_browser_update_conversation_ai",
            description: "Update Conversation AI settings: bot name, tone/personality, enabled channels, " +
                "response delay, handoff rules, and knowledge base content.",
            inputSchema: {
                type: "object",
                properties: {
                    botName: { type: "string", description: "Bot display name" },
                    tone: {
                        type: "string",
                        description: "Bot personality/tone: 'friendly', 'professional', 'casual', 'formal'",
                    },
                    enabled: { type: "boolean", description: "Enable or disable the bot" },
                    systemPrompt: {
                        type: "string",
                        description: "Custom system prompt / instructions for the bot",
                    },
                    responseDelay: {
                        type: "string",
                        description: "Delay in seconds before bot responds (e.g. '3')",
                    },
                    handoffMessage: {
                        type: "string",
                        description: "Message shown when bot hands off to a human agent",
                    },
                },
            },
        },
        {
            name: "ghl_browser_list_ai_training_data",
            description: "List knowledge base / training data entries used by Conversation AI: " +
                "FAQs, documents, URLs, and custom Q&A pairs.",
            inputSchema: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        description: "Filter by type: 'all' (default), 'faq', 'document', 'url', 'qa_pair'",
                    },
                },
            },
        },
        {
            name: "ghl_browser_add_ai_training_data",
            description: "Add a knowledge base entry: FAQ, document text, URL to crawl, or custom Q&A pair.",
            inputSchema: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        description: "Entry type: 'faq', 'document', 'url', 'qa_pair'",
                    },
                    question: { type: "string", description: "Question or FAQ prompt" },
                    answer: { type: "string", description: "Answer or document text" },
                    url: { type: "string", description: "URL to crawl (for type='url')" },
                    title: { type: "string", description: "Title for the entry" },
                },
                required: ["type"],
            },
        },
        {
            name: "ghl_browser_delete_ai_training_data",
            description: "Remove a knowledge base entry.",
            inputSchema: {
                type: "object",
                properties: {
                    entryTitle: { type: "string", description: "Title or question of the entry to remove" },
                    entryId: { type: "string", description: "Entry ID (preferred)" },
                    confirm: { type: "boolean", description: "Must be true to proceed" },
                },
                required: ["confirm"],
            },
        },
        {
            name: "ghl_browser_get_ai_conversation_logs",
            description: "Get recent Conversation AI chat logs: contact name, channel, messages, and resolution status.",
            inputSchema: {
                type: "object",
                properties: {
                    limit: { type: "string", description: "Max conversations to return (default 20)" },
                    status: {
                        type: "string",
                        description: "Filter: 'all' (default), 'active', 'resolved', 'escalated'",
                    },
                },
            },
        },
    ],
    handlers: {
        ghl_browser_get_conversation_ai_config: async () => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversation-ai-config", async () => {
                    await gotoGhl(page, "/settings/conversation-ai");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const config = await page.evaluate(() => {
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
                        const toggles = {};
                        document.querySelectorAll('[class*="toggle"], [class*="switch"], input[type="checkbox"]').forEach((el) => {
                            const label = el.closest("[class*='field'], [class*='setting']")?.querySelector("label, [class*='label']")?.textContent?.trim() ||
                                el.getAttribute("name") ||
                                "";
                            const input = el;
                            toggles[label || "enabled"] = input.checked || el.classList.contains("active") || el.classList.contains("on");
                        });
                        return {
                            title: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
                            fields,
                            toggles,
                        };
                    });
                    return config;
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_update_conversation_ai: async (args) => {
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversation-ai-update", async () => {
                    await gotoGhl(page, "/settings/conversation-ai");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const updated = {};
                    if (args.botName) {
                        const input = page
                            .locator('input[name="botName"], input[placeholder*="Bot"], input[placeholder*="Name"]')
                            .first();
                        try {
                            await input.fill(asString(args.botName), { timeout: 5000 });
                            updated.botName = asString(args.botName);
                        }
                        catch {
                            // field may not exist
                        }
                    }
                    if (args.tone) {
                        const toneSelect = page
                            .locator('[class*="tone"] [class*="select"], select[name*="tone"], [class*="personality"] [class*="select"]')
                            .first();
                        try {
                            await toneSelect.click({ timeout: 5000 });
                            await page
                                .locator(`[class*="option"]:has-text("${args.tone}"), button:has-text("${args.tone}")`)
                                .first()
                                .click({ timeout: 3000 });
                            updated.tone = asString(args.tone);
                        }
                        catch {
                            // tone selector may not exist
                        }
                    }
                    if (typeof args.enabled === "boolean") {
                        const toggle = page
                            .locator('[class*="toggle"], [class*="switch"], input[type="checkbox"]')
                            .first();
                        try {
                            const isChecked = await toggle.isChecked().catch(() => false);
                            if (isChecked !== args.enabled) {
                                await toggle.click({ timeout: 3000 });
                            }
                            updated.enabled = String(args.enabled);
                        }
                        catch {
                            // toggle may not be present
                        }
                    }
                    if (args.systemPrompt) {
                        const promptInput = page
                            .locator('textarea[name="systemPrompt"], textarea[placeholder*="instruction"], textarea[placeholder*="prompt"], textarea')
                            .first();
                        try {
                            await promptInput.fill(asString(args.systemPrompt), { timeout: 5000 });
                            updated.systemPrompt = "(set)";
                        }
                        catch {
                            // system prompt textarea may not be found
                        }
                    }
                    if (args.responseDelay) {
                        const delayInput = page
                            .locator('input[name*="delay"], input[placeholder*="delay"], input[type="number"]')
                            .first();
                        try {
                            await delayInput.fill(asString(args.responseDelay), { timeout: 3000 });
                            updated.responseDelay = asString(args.responseDelay);
                        }
                        catch {
                            // delay field may not exist
                        }
                    }
                    if (args.handoffMessage) {
                        const handoffInput = page
                            .locator('input[name*="handoff"], textarea[placeholder*="handoff"], input[placeholder*="human"]')
                            .first();
                        try {
                            await handoffInput.fill(asString(args.handoffMessage), { timeout: 3000 });
                            updated.handoffMessage = "(set)";
                        }
                        catch {
                            // handoff field may not exist
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
        ghl_browser_list_ai_training_data: async (args) => {
            const filterType = asString(args.type) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversation-ai-training", async () => {
                    await gotoGhl(page, "/settings/conversation-ai");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const trainingTab = page
                        .locator('button:has-text("Training"), button:has-text("Knowledge"), [class*="tab"]:has-text("Training"), a:has-text("Training")')
                        .first();
                    try {
                        await trainingTab.click({ timeout: 5000 });
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // tab may already be active
                    }
                    const entries = await page.evaluate((type) => {
                        const items = [];
                        const rowSelectors = [
                            '[class*="TrainingRow"]',
                            '[class*="training-row"]',
                            '[class*="KnowledgeItem"]',
                            '[class*="knowledge-item"]',
                            "tr[data-row-key]",
                            '[class*="ListRow"]',
                            '[data-testid*="training"]',
                        ];
                        for (const sel of rowSelectors) {
                            document.querySelectorAll(sel).forEach((el) => {
                                const titleEl = el.querySelector("h3, h4, [class*='title'], [class*='Title'], td:first-child");
                                const typeEl = el.querySelector("[class*='type'], [class*='Type'], [class*='badge'], td:nth-child(2)");
                                const questionEl = el.querySelector("[class*='question'], [class*='Question'], [class*='prompt']");
                                const answerEl = el.querySelector("[class*='answer'], [class*='Answer'], [class*='response']");
                                const urlEl = el.querySelector("a[href], [class*='url'], [class*='Url']");
                                const id = el.getAttribute("data-row-key") || el.getAttribute("data-id") || "";
                                items.push({
                                    title: titleEl?.textContent?.trim() || "",
                                    type: typeEl?.textContent?.trim() || "",
                                    question: questionEl?.textContent?.trim() || "",
                                    answer: answerEl?.textContent?.trim()?.slice(0, 200) || "",
                                    url: urlEl?.getAttribute("href") || urlEl?.textContent?.trim() || "",
                                    id,
                                });
                            });
                        }
                        return items;
                    }, filterType);
                    const deduped = Array.from(new Map(entries.map((e) => [e.id || e.title || e.question, e])).values());
                    return { count: deduped.length, entries: deduped };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_add_ai_training_data: async (args) => {
            const type = asString(args.type);
            const question = asString(args.question);
            const answer = asString(args.answer);
            const url = asString(args.url);
            const title = asString(args.title);
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversation-ai-add-training", async () => {
                    await gotoGhl(page, "/settings/conversation-ai");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const trainingTab = page
                        .locator('button:has-text("Training"), button:has-text("Knowledge"), [class*="tab"]:has-text("Training")')
                        .first();
                    try {
                        await trainingTab.click({ timeout: 5000 });
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // tab may already be active
                    }
                    const addBtn = page
                        .locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create")')
                        .first();
                    await addBtn.click();
                    await page.waitForTimeout(1000);
                    if (type) {
                        const typeSelect = page
                            .locator('[class*="type"] [class*="select"], select[name*="type"], [class*="Type"]')
                            .first();
                        try {
                            await typeSelect.click({ timeout: 3000 });
                            await page
                                .locator(`[class*="option"]:has-text("${type}"), button:has-text("${type}")`)
                                .first()
                                .click({ timeout: 3000 });
                        }
                        catch {
                            // type selector may not exist
                        }
                    }
                    if (title) {
                        const titleInput = page.locator('input[name="title"], input[placeholder*="Title"]').first();
                        try {
                            await titleInput.fill(title, { timeout: 3000 });
                        }
                        catch {
                            // title may not be required
                        }
                    }
                    if (question) {
                        const qInput = page
                            .locator('input[name="question"], textarea[name="question"], input[placeholder*="Question"]').first();
                        try {
                            await qInput.fill(question, { timeout: 3000 });
                        }
                        catch {
                            // question field may not exist
                        }
                    }
                    if (answer) {
                        const aInput = page
                            .locator('textarea[name="answer"], textarea[placeholder*="Answer"], textarea').first();
                        try {
                            await aInput.fill(answer, { timeout: 3000 });
                        }
                        catch {
                            // answer field may not exist
                        }
                    }
                    if (url) {
                        const urlInput = page
                            .locator('input[name="url"], input[type="url"], input[placeholder*="URL"]').first();
                        try {
                            await urlInput.fill(url, { timeout: 3000 });
                        }
                        catch {
                            // URL field may not be present
                        }
                    }
                    const saveBtn = page
                        .locator('button:has-text("Save"), button:has-text("Add"), button:has-text("Create")')
                        .first();
                    await saveBtn.click();
                    await page.waitForTimeout(1500);
                    return { type, title, question, answer: answer ? "(set)" : null, url: url || null };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_delete_ai_training_data: async (args) => {
            const title = asString(args.entryTitle);
            const id = asString(args.entryId);
            const confirm = Boolean(args.confirm);
            if (!confirm)
                throw new Error("confirm must be true to delete a training entry");
            if (!title && !id)
                throw new Error("entryTitle or entryId is required");
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversation-ai-delete-training", async () => {
                    await gotoGhl(page, "/settings/conversation-ai");
                    await waitForAppReady(page);
                    await page.waitForTimeout(2000);
                    const trainingTab = page
                        .locator('button:has-text("Training"), button:has-text("Knowledge"), [class*="tab"]:has-text("Training")')
                        .first();
                    try {
                        await trainingTab.click({ timeout: 5000 });
                        await page.waitForTimeout(1000);
                    }
                    catch {
                        // tab may already be active
                    }
                    const rowSelector = id
                        ? `tr[data-row-key="${id}"], [data-id="${id}"]`
                        : `[class*="row"]:has-text("${title}"), tr:has-text("${title}")`;
                    const row = page.locator(rowSelector).first();
                    const deleteBtn = row
                        .locator('button:has-text("Delete"), button:has-text("⋮"), button:has-text("⋯"), [class*="delete"]')
                        .first();
                    await deleteBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(500);
                    const confirmOption = page
                        .locator('text="Delete", button:has-text("Delete"), button:has-text("Confirm")')
                        .first();
                    try {
                        await confirmOption.click({ timeout: 5000 });
                    }
                    catch {
                        // delete may have fired directly
                    }
                    await page.waitForTimeout(1000);
                    return { entryTitle: title, entryId: id, deleted: true };
                });
            }
            finally {
                await close();
            }
        },
        ghl_browser_get_ai_conversation_logs: async (args) => {
            const limit = parseInt(asString(args.limit) || "20", 10);
            const status = asString(args.status) || "all";
            const { page, close } = await openPage();
            try {
                return await withPageError(page, "conversation-ai-logs", async () => {
                    await gotoGhl(page, "/conversations/ai");
                    await waitForAppReady(page);
                    if (status !== "all") {
                        const filterBtn = page
                            .locator(`button:has-text("${status}"), [class*="filter"]:has-text("${status}"), [class*="tab"]:has-text("${status}")`)
                            .first();
                        try {
                            await filterBtn.click({ timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                        catch {
                            // filter may not be available
                        }
                    }
                    const logs = await page.evaluate((maxItems) => {
                        const items = [];
                        const rowSelectors = [
                            '[class*="ConversationRow"]',
                            '[class*="conversation-row"]',
                            '[class*="chat-item"]',
                            "tr[data-row-key]",
                            '[class*="ListRow"]',
                        ];
                        for (const sel of rowSelectors) {
                            if (items.length >= maxItems)
                                break;
                            document.querySelectorAll(sel).forEach((el) => {
                                if (items.length >= maxItems)
                                    return;
                                const contactEl = el.querySelector("[class*='contact'], [class*='Contact'], [class*='name'], td:first-child");
                                const channelEl = el.querySelector("[class*='channel'], [class*='Channel'], [class*='type']");
                                const msgEl = el.querySelector("[class*='message'], [class*='Message'], [class*='last'], p");
                                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge']");
                                const dateEl = el.querySelector("[class*='date'], [class*='Date'], time, [class*='time']");
                                items.push({
                                    contact: contactEl?.textContent?.trim() || "",
                                    channel: channelEl?.textContent?.trim() || "",
                                    lastMessage: msgEl?.textContent?.trim()?.slice(0, 200) || "",
                                    status: statusEl?.textContent?.trim() || "",
                                    date: dateEl?.textContent?.trim() || dateEl?.getAttribute("datetime") || "",
                                    botMessages: 0,
                                    humanMessages: 0,
                                });
                            });
                        }
                        return items;
                    }, limit);
                    return { count: logs.length, status, logs };
                });
            }
            finally {
                await close();
            }
        },
    },
};
