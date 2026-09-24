import { openPage, gotoGhl, waitForAppReady, screenshotError } from "../browser.js";
export const discoveryModule = {
    tools: [
        {
            name: "ghl_browser_capture_network",
            description: "Navigate to a GHL path and capture all XHR/fetch requests made by the page, including undocumented API endpoints. " +
                "Useful for discovering new REST endpoints to add to ghl-mcp.",
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string", description: "GHL path to load (e.g. /automation/workflows)" },
                    urlPattern: {
                        type: "string",
                        description: "Only include URLs matching this substring (e.g. '/api/')",
                    },
                    resourceTypes: {
                        type: "array",
                        items: { type: "string" },
                        description: "Filter by resource type: 'xhr', 'fetch', 'document', 'script', etc.",
                    },
                    waitMs: {
                        type: "integer",
                        description: "Extra wait after navigation to let async requests fire (default 3000)",
                    },
                    includeBodies: {
                        type: "boolean",
                        description: "If true, include request bodies (can be large)",
                    },
                },
            },
        },
        {
            name: "ghl_browser_audit_api_calls",
            description: "Capture API calls made by a specific tool action. Navigate to `path`, perform `triggerAction` (a JS snippet), " +
                "and return only the XHR/fetch calls that fired during the action.",
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    triggerAction: {
                        type: "string",
                        description: "JS snippet to execute (e.g. 'document.querySelector(\"button\").click()')",
                    },
                    urlPattern: { type: "string" },
                },
                required: ["triggerAction"],
            },
        },
        {
            name: "ghl_browser_extract_state",
            description: "Extract the server-rendered state embedded in the GHL page HTML. " +
                "Returns all `window.__*` globals (e.g. __NEXT_DATA__, __NUXT__, __APP_STATE__) plus any large " +
                "JSON blobs injected via <script> tags. Useful for discovering the full entity graph when the SPA " +
                "does not issue REST calls to load data.",
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string", description: "GHL path to load (e.g. /contacts/list)" },
                    maxBytes: {
                        type: "integer",
                        description: "Truncate each captured blob to this many bytes (default 50000)",
                    },
                },
            },
        },
    ],
    handlers: {
        ghl_browser_capture_network: async (args) => {
            const path = args.path || "/dashboard";
            const urlPattern = args.urlPattern;
            const resourceTypes = args.resourceTypes || ["xhr", "fetch"];
            const waitMs = args.waitMs ?? 3000;
            const includeBodies = Boolean(args.includeBodies);
            const { page, close } = await openPage();
            const captured = [];
            const finished = new WeakSet();
            const wsFrames = [];
            try {
                page.on("request", (req) => {
                    if (!resourceTypes.includes(req.resourceType()))
                        return;
                    const url = req.url();
                    if (urlPattern && !url.includes(urlPattern))
                        return;
                    captured.push({
                        method: req.method(),
                        url,
                        resourceType: req.resourceType(),
                        status: null,
                        requestBody: includeBodies ? req.postData() ?? null : null,
                        timing: { startedAt: Date.now(), finishedAt: null },
                    });
                });
                page.on("response", (resp) => {
                    const req = resp.request();
                    if (finished.has(req))
                        return;
                    finished.add(req);
                    const match = captured.find((c) => c.url === req.url() && c.method === req.method() && c.status === null);
                    if (match) {
                        match.status = resp.status();
                        match.timing.finishedAt = Date.now();
                    }
                });
                page.on("websocket", (ws) => {
                    const url = ws.url();
                    ws.on("framereceived", (frame) => {
                        const payload = frame.payload;
                        const text = typeof payload === "string" ? payload : payload.toString("utf8");
                        wsFrames.push({ url, direction: "in", size: text.length, preview: text.slice(0, 500), ts: Date.now() });
                    });
                    ws.on("framesent", (frame) => {
                        const payload = frame.payload;
                        const text = typeof payload === "string" ? payload : payload.toString("utf8");
                        wsFrames.push({ url, direction: "out", size: text.length, preview: text.slice(0, 500), ts: Date.now() });
                    });
                });
                await gotoGhl(page, path);
                await waitForAppReady(page);
                if (waitMs > 0)
                    await page.waitForTimeout(waitMs);
                const summary = {
                    path,
                    url: page.url(),
                    total: captured.length,
                    byStatus: captured.reduce((acc, c) => {
                        const k = c.status === null ? "pending" : String(c.status);
                        acc[k] = (acc[k] || 0) + 1;
                        return acc;
                    }, {}),
                    endpoints: Array.from(new Set(captured.map((c) => {
                        try {
                            const u = new URL(c.url);
                            return `${c.method} ${u.pathname}`;
                        }
                        catch {
                            return `${c.method} ${c.url}`;
                        }
                    }))).sort(),
                    requests: captured,
                    wsFrames,
                    wsSummary: {
                        total: wsFrames.length,
                        in: wsFrames.filter((f) => f.direction === "in").length,
                        out: wsFrames.filter((f) => f.direction === "out").length,
                        urls: Array.from(new Set(wsFrames.map((f) => f.url))),
                    },
                };
                return summary;
            }
            catch (err) {
                const shot = await screenshotError(page, "capture-network");
                return {
                    error: err instanceof Error ? err.message : String(err),
                    screenshot: shot,
                    partial: captured,
                };
            }
            finally {
                await close();
            }
        },
        ghl_browser_audit_api_calls: async (args) => {
            const path = args.path || "/dashboard";
            const triggerAction = String(args.triggerAction);
            const urlPattern = args.urlPattern;
            const resourceTypes = ["xhr", "fetch"];
            const { page, close } = await openPage();
            const captured = [];
            const wsFrames = [];
            try {
                page.on("request", (req) => {
                    if (!resourceTypes.includes(req.resourceType()))
                        return;
                    const url = req.url();
                    if (urlPattern && !url.includes(urlPattern))
                        return;
                    captured.push({
                        method: req.method(),
                        url,
                        resourceType: req.resourceType(),
                        status: null,
                        requestBody: req.postData() ?? null,
                        timing: { startedAt: Date.now(), finishedAt: null },
                    });
                });
                page.on("response", (resp) => {
                    const req = resp.request();
                    const match = captured.find((c) => c.url === req.url() && c.method === req.method() && c.status === null);
                    if (match) {
                        match.status = resp.status();
                        match.timing.finishedAt = Date.now();
                    }
                });
                page.on("websocket", (ws) => {
                    const url = ws.url();
                    ws.on("framereceived", (frame) => {
                        const payload = frame.payload;
                        const text = typeof payload === "string" ? payload : payload.toString("utf8");
                        wsFrames.push({
                            url,
                            direction: "in",
                            size: text.length,
                            preview: text.slice(0, 500),
                            ts: Date.now(),
                        });
                    });
                    ws.on("framesent", (frame) => {
                        const payload = frame.payload;
                        const text = typeof payload === "string" ? payload : payload.toString("utf8");
                        wsFrames.push({
                            url,
                            direction: "out",
                            size: text.length,
                            preview: text.slice(0, 500),
                            ts: Date.now(),
                        });
                    });
                });
                await gotoGhl(page, path);
                await waitForAppReady(page);
                // Trust boundary: this MCP server runs locally for the owning user
                // only; the browser session is the user's own GHL session, and
                // arbitrary JS execution is the explicit purpose of this tool.
                // No untrusted input reaches `triggerAction` beyond the caller's own prompt.
                const fn = new Function(`return (async () => { ${triggerAction} })()`);
                await page.evaluate(fn);
                await page.waitForTimeout(3000);
                const byHost = {};
                for (const c of captured) {
                    try {
                        const host = new URL(c.url).hostname;
                        byHost[host] = (byHost[host] || 0) + 1;
                    }
                    catch { /* ignore */ }
                }
                return {
                    path,
                    triggerAction,
                    total: captured.length,
                    byHost,
                    endpoints: Array.from(new Set(captured.map((c) => {
                        try {
                            const u = new URL(c.url);
                            return `${c.method} ${u.pathname}`;
                        }
                        catch {
                            return `${c.method} ${c.url}`;
                        }
                    }))).sort(),
                    requests: captured,
                    wsFrames,
                    wsSummary: {
                        total: wsFrames.length,
                        in: wsFrames.filter((f) => f.direction === "in").length,
                        out: wsFrames.filter((f) => f.direction === "out").length,
                        urls: Array.from(new Set(wsFrames.map((f) => f.url))),
                    },
                };
            }
            catch (err) {
                const shot = await screenshotError(page, "audit-api-calls");
                return {
                    error: err instanceof Error ? err.message : String(err),
                    screenshot: shot,
                    partial: captured,
                };
            }
            finally {
                await close();
            }
        },
        ghl_browser_extract_state: async (args) => {
            const path = args.path || "/dashboard";
            const maxBytes = args.maxBytes ?? 50_000;
            const { page, close } = await openPage();
            try {
                await gotoGhl(page, path);
                await waitForAppReady(page);
                // Trust boundary: this MCP server runs locally for the owning user
                // only; the browser session is the user's own GHL session. We
                // enumerate window globals to discover SSR-embedded state; no
                // untrusted input reaches the evaluated script.
                const extracted = await page.evaluate((max) => {
                    const globals = [];
                    for (const key of Object.getOwnPropertyNames(window)) {
                        if (!key.startsWith("__") || key.length < 3)
                            continue;
                        try {
                            const val = window[key];
                            if (val === undefined || val === null)
                                continue;
                            const isFn = typeof val === "function";
                            const text = isFn ? `[Function: ${val.name || "anonymous"}]` : JSON.stringify(val);
                            if (!text)
                                continue;
                            globals.push({
                                name: key,
                                kind: isFn ? "function" : typeof val,
                                size: text.length,
                                preview: text.slice(0, max),
                            });
                        }
                        catch {
                            // skip inaccessible / cross-origin globals
                        }
                    }
                    // Also harvest inline <script> tags that assign window.X = {...} or contain JSON
                    const inlineScripts = [];
                    for (const el of document.querySelectorAll("script:not([src])")) {
                        const text = (el.textContent || "").trim();
                        if (text.length < 200)
                            continue;
                        if (!/window\.\w+\s*=|__\w+__\s*=|\{[\s\S]{200,}/.test(text))
                            continue;
                        inlineScripts.push({ size: text.length, preview: text.slice(0, max) });
                    }
                    return { globals, inlineScripts };
                }, maxBytes);
                return {
                    path,
                    url: page.url(),
                    globalsFound: extracted.globals.length,
                    inlineScriptBlobs: extracted.inlineScripts.length,
                    globals: extracted.globals.map((g) => ({
                        name: g.name,
                        kind: g.kind,
                        size: g.size,
                        preview: g.preview,
                    })),
                    inlineScripts: extracted.inlineScripts,
                };
            }
            catch (err) {
                const shot = await screenshotError(page, "extract-state");
                return {
                    error: err instanceof Error ? err.message : String(err),
                    screenshot: shot,
                };
            }
            finally {
                await close();
            }
        },
    },
};
