#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequest,
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Builder, By, Key, WebDriver, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import firefox from "selenium-webdriver/firefox.js";
import { z } from "zod";

const SERVER_NAME = "Selenium MCP Server";
const SERVER_VERSION = "1.0.0-apex-fuzzer";

const logger = {
    info: (msg: string) => console.error(`[INFO] ${new Date().toISOString()} ${msg}`),
    warn: (msg: string) => console.error(`[WARN] ${new Date().toISOString()} ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
};

const FUZZ_ALLOWED_ELEMENTS = ["input", "button", "a", "form"] as const;
const FUZZ_ALLOWED_CHECKS = ["xss", "sqli", "csrf"] as const;

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function toError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }
    return new Error(String(error));
}

type Stage = "ui_capture" | "element_analysis" | "active_probing" | "vuln_detection" | "report_generation";

interface Artifact {
    stage: Stage;
    data: string;
    metadata?: {
        timestamp?: Date;
        confidence?: number;
        issues?: Array<{ severity: string; description: string }>;
    };
}

interface FuzzingPolicy {
    max_probes: number;
    timeout_ms: number;
    target_elements: string[];
    vulnerability_checks: string[];
}

class FuzzerEngine {
    private policy: FuzzingPolicy;

    constructor(policy?: Partial<FuzzingPolicy>) {
        this.policy = this.enforcePolicy(policy);
    }

    private enforcePolicy(policy?: Partial<FuzzingPolicy>): FuzzingPolicy {
        const sanitizedElements = (policy?.target_elements ?? FUZZ_ALLOWED_ELEMENTS).filter((el) =>
            FUZZ_ALLOWED_ELEMENTS.includes(el as (typeof FUZZ_ALLOWED_ELEMENTS)[number])
        );
        const sanitizedChecks = (policy?.vulnerability_checks ?? FUZZ_ALLOWED_CHECKS).filter((check) =>
            FUZZ_ALLOWED_CHECKS.includes(check as (typeof FUZZ_ALLOWED_CHECKS)[number])
        );
        const maxProbes = Math.min(Math.max(policy?.max_probes ?? 50, 1), 200);
        const timeout = Math.min(Math.max(policy?.timeout_ms ?? 30000, 5000), 120000);
        return {
            max_probes: maxProbes,
            timeout_ms: timeout,
            target_elements: sanitizedElements.length ? sanitizedElements : [...FUZZ_ALLOWED_ELEMENTS],
            vulnerability_checks: sanitizedChecks.length ? sanitizedChecks : [...FUZZ_ALLOWED_CHECKS],
        };
    }

    public updatePolicy(policy?: Partial<FuzzingPolicy>): void {
        this.policy = this.enforcePolicy({ ...this.policy, ...policy });
    }

    async captureUI(driver: WebDriver): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 1: UI Capture");
        const screenshot = await driver.takeScreenshot();
        const pageSource = await driver.getPageSource();
        const currentUrl = await driver.getCurrentUrl();
        return {
            stage: "ui_capture",
            data: JSON.stringify({
                url: currentUrl,
                screenshot_size: screenshot.length,
                dom_size: pageSource.length,
                captured_at: new Date().toISOString(),
            }),
            metadata: { timestamp: new Date(), confidence: 1.0 },
        };
    }

    async analyzeElements(driver: WebDriver, input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 2: Element Analysis");
        const elements: Array<{ type: string; selector: string; attributes: Record<string, string | null> }> = [];
        for (const tagName of this.policy.target_elements) {
            try {
                const found = await driver.findElements(By.css(tagName));
                for (let i = 0; i < Math.min(found.length, 20); i += 1) {
                    const el = found[i];
                    if (!el) continue;
                    const type = await el.getTagName();
                    const id = await el.getAttribute("id");
                    const className = await el.getAttribute("class");
                    const name = await el.getAttribute("name");
                    elements.push({
                        type,
                        selector: id
                            ? `#${id}`
                            : className
                                ? `.${className.split(" ")[0]}`
                                : `${tagName}:nth-child(${i + 1})`,
                        attributes: { id, class: className, name },
                    });
                }
            } catch (error) {
                logger.warn(`[Fuzzer] Error analyzing ${tagName}: ${getErrorMessage(error)}`);
            }
        }
        return {
            stage: "element_analysis",
            data: JSON.stringify({ elements, count: elements.length }),
            metadata: { timestamp: new Date(), confidence: 0.95 },
        };
    }

    async activeProbing(driver: WebDriver, input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 3: Active Probing");
        const parsed = JSON.parse(input.data);
        const elements = parsed.elements ?? [];
        const probeResults: Array<{ element: string; payload: string; result: string }> = [];
        const xssPayloads = [
            "<script>alert('XSS')</script>",
            "'\"><script>alert(1)</script>",
            "javascript:alert(document.cookie)",
        ];
        const sqliPayloads = [
            "' OR '1'='1",
            "'; DROP TABLE users--",
            "1' UNION SELECT NULL--",
        ];
        const allPayloads = [...xssPayloads, ...sqliPayloads];
        for (const element of elements.slice(0, this.policy.max_probes)) {
            if (element.type !== "input") continue;
            for (const payload of allPayloads) {
                try {
                    const el = await driver.findElement(By.css(element.selector));
                    await el.clear();
                    await el.sendKeys(payload);
                    const reflected = (await driver.getPageSource()).includes(payload);
                    probeResults.push({
                        element: element.selector,
                        payload,
                        result: reflected ? "REFLECTED" : "NOT_REFLECTED",
                    });
                    if (reflected) {
                        logger.warn(`[Fuzzer] Potential vulnerability in ${element.selector} with payload: ${payload}`);
                    }
                } catch (error) {
                    probeResults.push({
                        element: element.selector,
                        payload,
                        result: `ERROR: ${getErrorMessage(error)}`,
                    });
                }
            }
        }
        return {
            stage: "active_probing",
            data: JSON.stringify({ probes: probeResults, total: probeResults.length }),
            metadata: { timestamp: new Date(), confidence: 0.85 },
        };
    }

    async detectVulnerabilities(input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 4: Vulnerability Detection");
        const parsed = JSON.parse(input.data);
        const probes = parsed.probes ?? [];
        const vulnerabilities: Array<{ severity: string; description: string; element: string }> = [];
        for (const probe of probes) {
            if (probe.result !== "REFLECTED") continue;
            const payload: string = probe.payload;
            const isXSS = payload.includes("<script>") || payload.includes("javascript:");
            const isSQLi = payload.includes("' OR") || payload.includes("UNION SELECT");
            if (isXSS) {
                vulnerabilities.push({
                    severity: "HIGH",
                    description: `XSS vulnerability detected: ${payload} reflected in ${probe.element}`,
                    element: probe.element,
                });
            } else if (isSQLi) {
                vulnerabilities.push({
                    severity: "CRITICAL",
                    description: `SQL Injection vulnerability detected: ${payload} reflected in ${probe.element}`,
                    element: probe.element,
                });
            }
        }
        return {
            stage: "vuln_detection",
            data: JSON.stringify({ vulnerabilities, count: vulnerabilities.length }),
            metadata: { timestamp: new Date(), confidence: 0.9, issues: vulnerabilities },
        };
    }

    async generateReport(input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 5: Report Generation");
        const parsed = JSON.parse(input.data);
        const vulnerabilities = parsed.vulnerabilities ?? [];
        const report = {
            summary: {
                total_vulnerabilities: vulnerabilities.length,
                critical: vulnerabilities.filter((item: any) => item.severity === "CRITICAL").length,
                high: vulnerabilities.filter((item: any) => item.severity === "HIGH").length,
                medium: vulnerabilities.filter((item: any) => item.severity === "MEDIUM").length,
                low: vulnerabilities.filter((item: any) => item.severity === "LOW").length,
            },
            vulnerabilities,
            recommendations: [
                "Implement input sanitization for all user inputs",
                "Use parameterized queries to prevent SQL injection",
                "Implement Content Security Policy (CSP) headers",
                "Enable HttpOnly and Secure flags on cookies",
            ],
            generated_at: new Date().toISOString(),
        };
        return {
            stage: "report_generation",
            data: JSON.stringify(report, null, 2),
            metadata: { timestamp: new Date(), confidence: 1.0, issues: vulnerabilities },
        };
    }

    async runFullPipeline(driver: WebDriver): Promise<Artifact> {
        const ui = await this.captureUI(driver);
        const elements = await this.analyzeElements(driver, ui);
        const probes = await this.activeProbing(driver, elements);
        const vuln = await this.detectVulnerabilities(probes);
        return this.generateReport(vuln);
    }
}

interface BrowserSession {
    id: string;
    driver: WebDriver;
    browser: "chrome" | "firefox";
    createdAt: Date;
    lastAccessed: Date;
    timeoutId?: NodeJS.Timeout;
}

class SessionManager {
    private sessions = new Map<string, BrowserSession>();
    private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000;

    public createSession(id: string, driver: WebDriver, browser: "chrome" | "firefox"): BrowserSession {
        const session: BrowserSession = {
            id,
            driver,
            browser,
            createdAt: new Date(),
            lastAccessed: new Date(),
        };
        this.sessions.set(id, session);
        this.scheduleTimeout(session);
        return session;
    }

    public getSession(id: string): BrowserSession | undefined {
        const session = this.sessions.get(id);
        if (session) {
            session.lastAccessed = new Date();
            this.resetTimeout(session);
        }
        return session;
    }

    public getAllSessions(): BrowserSession[] {
        return Array.from(this.sessions.values());
    }

    public async destroySession(id: string, reason?: string): Promise<void> {
        await this.disposeSession(id, false, reason);
    }

    public async closeAll(reason = "shutdown"): Promise<void> {
        for (const id of this.sessions.keys()) {
            await this.disposeSession(id, false, reason);
        }
    }

    private scheduleTimeout(session: BrowserSession): void {
        session.timeoutId = setTimeout(() => {
            this.disposeSession(session.id, true).catch((error) => {
                logger.error(`Failed to close timed-out session ${session.id}: ${getErrorMessage(error)}`);
            });
        }, this.SESSION_TIMEOUT_MS);
    }

    private resetTimeout(session: BrowserSession): void {
        if (session.timeoutId) {
            clearTimeout(session.timeoutId);
        }
        this.scheduleTimeout(session);
    }

    private async disposeSession(id: string, dueToTimeout: boolean, reason?: string): Promise<void> {
        const session = this.sessions.get(id);
        if (!session) return;
        if (session.timeoutId) {
            clearTimeout(session.timeoutId);
        }
        this.sessions.delete(id);
        try {
            await session.driver.quit();
        } catch (error) {
            logger.error(`Error quitting driver for session ${id}: ${getErrorMessage(error)}`);
        }
        const suffix = dueToTimeout ? " (timeout)" : "";
        const detail = reason ? ` - ${reason}` : "";
        logger.info(`Session ${id} closed${suffix}${detail}`);
    }
}

const sessionManager = new SessionManager();
let currentSessionId: string | null = null;

const selectorEnum = z.enum(["css", "xpath", "id", "name", "class", "tag"]);
const SelectorSchema = z.object({ by: selectorEnum, value: z.string() });

const StartBrowserSchema = z.object({
    browser: z.enum(["chrome", "firefox"]).optional().default("chrome"),
    options: z
        .object({
            headless: z.boolean().optional().default(false),
            window_size: z.string().optional().default("1920x1080"),
            incognito: z.boolean().optional().default(false),
            disable_gpu: z.boolean().optional().default(false),
        })
        .optional()
        .default({}),
});

const NavigateSchema = z.object({
    url: z.string().url(),
    wait_for_load: z.boolean().optional().default(true),
});

const FindElementSchema = SelectorSchema.extend({ timeout: z.number().optional().default(5000) });
const ClickElementSchema = SelectorSchema.extend({ force_click: z.boolean().optional().default(false) });
const WaitForElementSchema = SelectorSchema.extend({
    timeout: z.number().optional().default(10000),
    wait_for_visible: z.boolean().optional().default(true),
});
const SendKeysSchema = SelectorSchema.extend({
    text: z.string(),
    clear_first: z.boolean().optional().default(false),
});
const PressKeySchema = z.object({ key: z.string().min(1) });
const DragAndDropSchema = z.object({ source: SelectorSchema, target: SelectorSchema });
const UploadFileSchema = SelectorSchema.extend({ file_path: z.string() });
const TakeScreenshotSchema = z.object({ full_page: z.boolean().optional().default(false) });
const ExecuteScriptSchema = z.object({ script: z.string().min(1) });
const CookieSchema = z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string().optional(),
    path: z.string().optional(),
    secure: z.boolean().optional(),
    httpOnly: z.boolean().optional(),
    expiry: z.number().optional(),
});
const AddCookieSchema = z.object({ cookie: CookieSchema });
const DeleteCookieSchema = z.object({ name: z.string() });
const GetPageInfoSchema = z.object({
    include_title: z.boolean().optional().default(true),
    include_url: z.boolean().optional().default(true),
    include_source: z.boolean().optional().default(false),
});
const SwitchWindowSchema = z.object({ window_handle: z.string() });
const CloseSessionSchema = z.object({ session_id: z.string().optional() });
const SwitchSessionSchema = z.object({ session_id: z.string() });
const FuzzCurrentPageSchema = z.object({
    max_probes: z.number().optional(),
    target_elements: z.array(z.string()).optional(),
    vulnerability_checks: z.array(z.string()).optional(),
});
const FuzzStageSchema = z.object({
    stage: z.enum(["ui_capture", "element_analysis", "active_probing", "vuln_detection", "report_generation"]),
    input_artifact: z.string().optional(),
});

async function retry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error = new Error("Unknown error");
    for (let i = 0; i <= maxRetries; i += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = toError(error);
            if (i < maxRetries) {
                const delay = Math.pow(2, i) * 500;
                logger.warn(`Operation failed, retrying in ${delay}ms: ${getErrorMessage(error)}`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error(`Operation failed after ${maxRetries} retries: ${lastError.message}`);
}

function getLocator(by: z.infer<typeof selectorEnum>, value: string) {
    switch (by) {
        case "css":
            return By.css(value);
        case "xpath":
            return By.xpath(value);
        case "id":
            return By.id(value);
        case "name":
            return By.name(value);
        case "class":
            return By.className(value);
        case "tag":
            return By.tagName(value);
        default:
            return By.css(value);
    }
}

async function waitForElement(driver: WebDriver, locator: ReturnType<typeof getLocator>, timeout: number) {
    await driver.wait(until.elementLocated(locator), timeout);
    const element = await driver.findElement(locator);
    await driver.wait(until.elementIsVisible(element), timeout);
    return element;
}

function resolveKeyInput(key: string): string {
    const upper = key.toUpperCase();
    const mapped = (Key as unknown as Record<string, unknown>)[upper];
    return typeof mapped === "string" ? mapped : key;
}

async function withActiveSession<T>(cb: (session: BrowserSession) => Promise<T>): Promise<T> {
    if (!currentSessionId) {
        throw new Error("No active session. Start a browser first.");
    }
    const session = sessionManager.getSession(currentSessionId);
    if (!session) {
        throw new Error(`Session ${currentSessionId} not found.`);
    }
    return cb(session);
}

async function buildDriver(browser: "chrome" | "firefox", options: z.infer<typeof StartBrowserSchema>["options"]): Promise<WebDriver> {
    if (browser === "chrome") {
        const chromeOptions = new chrome.Options();
        if (options.headless) chromeOptions.addArguments("--headless=new");
        if (options.incognito) chromeOptions.addArguments("--incognito");
        if (options.disable_gpu) chromeOptions.addArguments("--disable-gpu");
        chromeOptions.addArguments(`--window-size=${options.window_size}`);
        return new Builder().forBrowser("chrome").setChromeOptions(chromeOptions).build();
    }
    const firefoxOptions = new firefox.Options();
    if (options.headless) firefoxOptions.addArguments("--headless");
    const [width, height] = options.window_size.split("x");
    firefoxOptions.addArguments(`--width=${width}`, `--height=${height}`);
    return new Builder().forBrowser("firefox").setFirefoxOptions(firefoxOptions).build();
}

async function createFuzzingDriver(sourceSession: BrowserSession): Promise<WebDriver> {
    const driver = await buildDriver(sourceSession.browser, {
        headless: true,
        window_size: "1280x720",
        incognito: false,
        disable_gpu: true,
    });
    const currentUrl = await sourceSession.driver.getCurrentUrl();
    try {
        await driver.get(currentUrl);
    } catch (error) {
        await driver.quit().catch(() => undefined);
        throw new Error(`Failed to prepare fuzzing session: ${getErrorMessage(error)}`);
    }
    return driver;
}

const SELENIUM_TOOLS: Tool[] = [
    { name: "start_browser", description: "Launch a new browser session", inputSchema: StartBrowserSchema as any },
    { name: "navigate", description: "Navigate to a URL", inputSchema: NavigateSchema as any },
    { name: "find_element", description: "Find an element on the page", inputSchema: FindElementSchema as any },
    { name: "click_element", description: "Click an element", inputSchema: ClickElementSchema as any },
    { name: "double_click", description: "Double click an element", inputSchema: ClickElementSchema as any },
    { name: "right_click", description: "Right click an element", inputSchema: ClickElementSchema as any },
    { name: "send_keys", description: "Type text into an element", inputSchema: SendKeysSchema as any },
    { name: "press_key", description: "Press a keyboard key", inputSchema: PressKeySchema as any },
    { name: "hover", description: "Hover over an element", inputSchema: FindElementSchema as any },
    { name: "drag_and_drop", description: "Drag and drop between elements", inputSchema: DragAndDropSchema as any },
    { name: "get_element_text", description: "Read text content", inputSchema: FindElementSchema as any },
    { name: "wait_for_element", description: "Wait for an element", inputSchema: WaitForElementSchema as any },
    { name: "upload_file", description: "Upload a file", inputSchema: UploadFileSchema as any },
    { name: "take_screenshot", description: "Capture a screenshot", inputSchema: TakeScreenshotSchema as any },
    { name: "execute_script", description: "Execute JavaScript", inputSchema: ExecuteScriptSchema as any },
    { name: "get_cookies", description: "List cookies", inputSchema: z.object({}).passthrough() as any },
    { name: "add_cookie", description: "Add a cookie", inputSchema: AddCookieSchema as any },
    { name: "delete_cookie", description: "Delete a cookie", inputSchema: DeleteCookieSchema as any },
    { name: "get_page_info", description: "Get page metadata", inputSchema: GetPageInfoSchema as any },
    { name: "switch_window", description: "Switch window", inputSchema: SwitchWindowSchema as any },
    { name: "list_windows", description: "List open windows", inputSchema: z.object({}).passthrough() as any },
    { name: "close_window", description: "Close current window", inputSchema: z.object({}).passthrough() as any },
    { name: "list_sessions", description: "List browser sessions", inputSchema: z.object({}).passthrough() as any },
    { name: "switch_session", description: "Switch active session", inputSchema: SwitchSessionSchema as any },
    { name: "close_session", description: "Close a session", inputSchema: CloseSessionSchema as any },
    { name: "get_server_version", description: "Get server version", inputSchema: z.object({}).passthrough() as any },
    { name: "fuzz_current_page", description: "Run full fuzzing pipeline", inputSchema: FuzzCurrentPageSchema as any },
    { name: "fuzz_stage", description: "Run a specific fuzzing stage", inputSchema: FuzzStageSchema as any },
    { name: "ai_generate", description: "Generate text using AI service", inputSchema: z.object({ prompt: z.string().optional(), messages: z.array(z.object({ role: z.string(), content: z.string() })).optional(), max_new_tokens: z.number().optional(), temperature: z.number().optional() }).passthrough() as any },
    { name: "ai_analyze_page", description: "AI-powered page analysis", inputSchema: z.object({ analysis_type: z.enum(["summary", "accessibility", "seo", "security"]).optional() }).passthrough() as any },
];

async function startBrowser(rawParams: unknown) {
    const params = StartBrowserSchema.parse(rawParams);
    const driver = await buildDriver(params.browser, params.options);
    const sessionId = `session-${Date.now().toString(36)}`;
    sessionManager.createSession(sessionId, driver, params.browser);
    currentSessionId = sessionId;
    return { status: "success", session_id: sessionId, browser: params.browser };
}

async function navigate(rawParams: unknown) {
    const params = NavigateSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        await retry(async () => {
            await session.driver.get(params.url);
            if (params.wait_for_load) {
                await session.driver.wait(until.elementLocated(By.css("body")), 10000);
            }
        });
        return { status: "success", url: params.url };
    });
}

async function findElement(rawParams: unknown) {
    const params = FindElementSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const locator = getLocator(params.by, params.value);
        await retry(async () => waitForElement(session.driver, locator, params.timeout));
        return { status: "success" };
    });
}

async function clickElement(rawParams: unknown) {
    const params = ClickElementSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const locator = getLocator(params.by, params.value);
        await retry(async () => {
            const element = await waitForElement(session.driver, locator, 5000);
            if (params.force_click) {
                await session.driver.executeScript("arguments[0].click();", element);
            } else {
                await element.click();
            }
        });
        return { status: "success" };
    });
}

async function hover(rawParams: unknown) {
    const params = FindElementSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const element = await waitForElement(session.driver, getLocator(params.by, params.value), 5000);
        const actions = session.driver.actions({ bridge: true });
        await actions.move({ origin: element }).perform();
        return { status: "success" };
    });
}

async function dragAndDrop(rawParams: unknown) {
    const params = DragAndDropSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const source = await waitForElement(session.driver, getLocator(params.source.by, params.source.value), 5000);
        const target = await waitForElement(session.driver, getLocator(params.target.by, params.target.value), 5000);
        const actions = session.driver.actions({ bridge: true });
        await actions.dragAndDrop(source, target).perform();
        return { status: "success" };
    });
}

async function getElementText(rawParams: unknown) {
    const params = FindElementSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const element = await waitForElement(session.driver, getLocator(params.by, params.value), 5000);
        const text = await element.getText();
        return { status: "success", text };
    });
}

async function sendKeys(rawParams: unknown) {
    const params = SendKeysSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const element = await waitForElement(session.driver, getLocator(params.by, params.value), 5000);
        if (params.clear_first) {
            await element.clear();
        }
        await element.sendKeys(params.text);
        return { status: "success" };
    });
}

async function pressKey(rawParams: unknown) {
    const params = PressKeySchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const resolvedKey = resolveKeyInput(params.key);
        await session.driver.actions({ bridge: true }).sendKeys(resolvedKey).perform();
        return { status: "success" };
    });
}

async function takeScreenshot(rawParams: unknown) {
    TakeScreenshotSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const screenshot = await session.driver.takeScreenshot();
        return { status: "success", format: "base64.png", content: screenshot };
    });
}

async function executeScript(rawParams: unknown) {
    const params = ExecuteScriptSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const result = await session.driver.executeScript(params.script);
        return { status: "success", result };
    });
}

async function getCookies() {
    return withActiveSession(async (session) => ({ status: "success", cookies: await session.driver.manage().getCookies() }));
}

async function addCookie(rawParams: unknown) {
    const params = AddCookieSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        await session.driver.manage().addCookie(params.cookie as any);
        return { status: "success" };
    });
}

async function deleteCookie(rawParams: unknown) {
    const params = DeleteCookieSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        await session.driver.manage().deleteCookie(params.name);
        return { status: "success" };
    });
}

async function getPageInfo(rawParams: unknown) {
    const params = GetPageInfoSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const info: Record<string, any> = { status: "success" };
        if (params.include_title) info.title = await session.driver.getTitle();
        if (params.include_url) info.url = await session.driver.getCurrentUrl();
        if (params.include_source) info.source = await session.driver.getPageSource();
        return info;
    });
}

async function switchWindow(rawParams: unknown) {
    const params = SwitchWindowSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        await session.driver.switchTo().window(params.window_handle);
        return { status: "success" };
    });
}

async function listWindows() {
    return withActiveSession(async (session) => {
        const handles = await session.driver.getAllWindowHandles();
        const current = await session.driver.getWindowHandle();
        return {
            status: "success",
            windows: handles.map((handle) => ({ handle, is_current: handle === current })),
        };
    });
}

async function closeWindow() {
    return withActiveSession(async (session) => {
        await session.driver.close();
        return { status: "success" };
    });
}

async function listSessions() {
    const sessions = sessionManager.getAllSessions().map((session) => ({
        id: session.id,
        browser: session.browser,
        created_at: session.createdAt.toISOString(),
        last_accessed: session.lastAccessed.toISOString(),
        is_current: session.id === currentSessionId,
    }));
    return { status: "success", sessions };
}

async function switchSession(rawParams: unknown) {
    const params = SwitchSessionSchema.parse(rawParams);
    const session = sessionManager.getSession(params.session_id);
    if (!session) {
        throw new Error(`Session ${params.session_id} not found`);
    }
    currentSessionId = params.session_id;
    return { status: "success", session_id: params.session_id };
}

async function closeSession(rawParams: unknown) {
    const params = CloseSessionSchema.parse(rawParams);
    const sessionId = params.session_id ?? currentSessionId;
    if (!sessionId) {
        throw new Error("No active session.");
    }
    await sessionManager.destroySession(sessionId, "manual-close");
    if (currentSessionId === sessionId) {
        currentSessionId = null;
    }
    return { status: "success", session_id: sessionId };
}

async function fuzzCurrentPage(rawParams: unknown) {
    const params = FuzzCurrentPageSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const fuzzDriver = await createFuzzingDriver(session);
        const engine = new FuzzerEngine(params);
        try {
            const report = await engine.runFullPipeline(fuzzDriver);
            return { status: "success", report: JSON.parse(report.data), metadata: report.metadata };
        } finally {
            await fuzzDriver.quit().catch(() => undefined);
        }
    });
}

async function fuzzStage(rawParams: unknown) {
    const params = FuzzStageSchema.parse(rawParams);
    return withActiveSession(async (session) => {
        const driver = await createFuzzingDriver(session);
        const engine = new FuzzerEngine();
        try {
            let artifact: Artifact;
            switch (params.stage) {
                case "ui_capture":
                    artifact = await engine.captureUI(driver);
                    break;
                case "element_analysis":
                    if (!params.input_artifact) throw new Error("input_artifact required");
                    artifact = await engine.analyzeElements(driver, JSON.parse(params.input_artifact));
                    break;
                case "active_probing":
                    if (!params.input_artifact) throw new Error("input_artifact required");
                    artifact = await engine.activeProbing(driver, JSON.parse(params.input_artifact));
                    break;
                case "vuln_detection":
                    if (!params.input_artifact) throw new Error("input_artifact required");
                    artifact = await engine.detectVulnerabilities(JSON.parse(params.input_artifact));
                    break;
                case "report_generation":
                    if (!params.input_artifact) throw new Error("input_artifact required");
                    artifact = await engine.generateReport(JSON.parse(params.input_artifact));
                    break;
                default:
                    throw new Error(`Unknown stage ${params.stage}`);
            }
            return { status: "success", artifact, data: JSON.parse(artifact.data) };
        } finally {
            await driver.quit().catch(() => undefined);
        }
    });
}

async function getServerVersion() {
    return { status: "success", name: SERVER_NAME, version: SERVER_VERSION };
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

async function aiGenerate(rawParams: unknown) {
    const params = rawParams as { prompt?: string; messages?: Array<{ role: string; content: string }>; max_new_tokens?: number; temperature?: number };
    try {
        const response = await fetch(`${AI_SERVICE_URL}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: params.prompt,
                messages: params.messages,
                max_new_tokens: params.max_new_tokens || 128,
                temperature: params.temperature || 0.7,
            }),
        });
        if (!response.ok) {
            throw new Error(`AI service error: ${response.statusText}`);
        }
        const result = await response.json();
        return { status: "success", ...result };
    } catch (error) {
        logger.error(`AI generation failed: ${getErrorMessage(error)}`);
        throw new Error(`AI service unavailable: ${getErrorMessage(error)}`);
    }
}

async function aiAnalyzePage(rawParams: unknown) {
    const params = rawParams as { analysis_type?: "summary" | "accessibility" | "seo" | "security" };
    return withActiveSession(async (session) => {
        const pageSource = await session.driver.getPageSource();
        const currentUrl = await session.driver.getCurrentUrl();
        const title = await session.driver.getTitle();

        const analysisType = params.analysis_type || "summary";
        const prompts: Record<string, string> = {
            summary: `Analyze this webpage and provide a concise summary:\nURL: ${currentUrl}\nTitle: ${title}\n\nHTML:\n${pageSource.slice(0, 2000)}`,
            accessibility: `Evaluate the accessibility of this webpage and suggest improvements:\nURL: ${currentUrl}\n\nHTML:\n${pageSource.slice(0, 2000)}`,
            seo: `Analyze the SEO of this webpage and provide recommendations:\nURL: ${currentUrl}\nTitle: ${title}\n\nHTML:\n${pageSource.slice(0, 2000)}`,
            security: `Identify potential security issues in this webpage:\nURL: ${currentUrl}\n\nHTML:\n${pageSource.slice(0, 2000)}`,
        };

        const aiResult = await aiGenerate({
            prompt: prompts[analysisType],
            max_new_tokens: 256,
            temperature: 0.5,
        });

        return {
            status: "success",
            analysis_type: analysisType,
            url: currentUrl,
            title,
            analysis: aiResult,
        };
    });
}

async function handleCallTool(name: string, args: unknown) {
    switch (name) {
        case "start_browser":
            return startBrowser(args);
        case "navigate":
            return navigate(args);
        case "find_element":
            return findElement(args);
        case "click_element":
        case "double_click":
        case "right_click":
            return clickElement(args);
        case "send_keys":
            return sendKeys(args);
        case "press_key":
            return pressKey(args);
        case "hover":
            return hover(args);
        case "drag_and_drop":
            return dragAndDrop(args);
        case "get_element_text":
            return getElementText(args);
        case "wait_for_element":
            return findElement(args);
        case "upload_file":
            return withActiveSession(async (session) => {
                const params = UploadFileSchema.parse(args);
                const element = await waitForElement(session.driver, getLocator(params.by, params.value), 5000);
                await element.sendKeys(params.file_path);
                return { status: "success" };
            });
        case "take_screenshot":
            return takeScreenshot(args);
        case "execute_script":
            return executeScript(args);
        case "get_cookies":
            return getCookies();
        case "add_cookie":
            return addCookie(args);
        case "delete_cookie":
            return deleteCookie(args);
        case "get_page_info":
            return getPageInfo(args);
        case "switch_window":
            return switchWindow(args);
        case "list_windows":
            return listWindows();
        case "close_window":
            return closeWindow();
        case "list_sessions":
            return listSessions();
        case "switch_session":
            return switchSession(args);
        case "close_session":
            return closeSession(args);
        case "get_server_version":
            return getServerVersion();
        case "fuzz_current_page":
            return fuzzCurrentPage(args);
        case "fuzz_stage":
            return fuzzStage(args);
        case "ai_generate":
            return aiGenerate(args);
        case "ai_analyze_page":
            return aiAnalyzePage(args);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

async function main() {
    const server = new Server(
        { name: SERVER_NAME, version: SERVER_VERSION },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: SELENIUM_TOOLS }));

    server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
        const { name, arguments: args = {} } = request.params;
        try {
            logger.info(`Calling tool: ${name}`);
            const result = await handleCallTool(name, args);
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
            const message = getErrorMessage(error);
            logger.error(`Tool execution failed: ${message}`);
            return {
                isError: true,
                content: [{ type: "text", text: JSON.stringify({ status: "error", message }) }],
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info(`${SERVER_NAME} started`);

    const shutdown = async () => {
        logger.info("Shutting down Selenium MCP server");
        await sessionManager.closeAll();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        logger.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}
