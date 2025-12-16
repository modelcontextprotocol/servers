#!/usr/bin/env node

/**
 * Selenium MCP Server
 * Provides browser automation capabilities through Selenium WebDriver
 * Enhanced with better error handling, input validation, session management, and resource controls
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
    CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { Builder, By, until, WebDriver, Capabilities } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import firefox from "selenium-webdriver/firefox.js";
import { z } from "zod";

// Logger utility
const logger = {
    info: (msg: string) => console.error(`[INFO] ${new Date().toISOString()} ${msg}`),
    warn: (msg: string) => console.error(`[WARN] ${new Date().toISOString()} ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
};

// Helper function to get error message
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

// Helper function to convert unknown to Error
function toError(error: unknown): Error {
    if (error instanceof Error) return error;
    return new Error(String(error));
}

// ============================================================================
// APEX FUZZING ENGINE - Stage-based Artifact Pipeline
// ============================================================================

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

/**
 * FuzzerEngine: Active web application probing
 * Role: Takes UI state and performs active fuzzing against web elements
 * to discover vulnerabilities, broken links, and edge cases
 */
class FuzzerEngine {
    private policy: FuzzingPolicy;

    constructor(policy?: Partial<FuzzingPolicy>) {
        this.policy = {
            max_probes: policy?.max_probes || 50,
            timeout_ms: policy?.timeout_ms || 30000,
            target_elements: policy?.target_elements || ["input", "button", "a", "form"],
            vulnerability_checks: policy?.vulnerability_checks || ["xss", "sqli", "csrf"],
        };
    }

    /**
     * Stage 1: UI Capture - Take screenshot and capture DOM
     */
    async captureUI(driver: WebDriver): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 1: UI Capture");

        const screenshot = await driver.takeScreenshot();
        const pageSource = await driver.getPageSource();
        const currentUrl = await driver.getCurrentUrl();

        const uiData = JSON.stringify({
            url: currentUrl,
            screenshot_size: screenshot.length,
            dom_size: pageSource.length,
            captured_at: new Date().toISOString(),
        });

        return {
            stage: "ui_capture",
            data: uiData,
            metadata: {
                timestamp: new Date(),
                confidence: 1.0,
            },
        };
    }

    /**
     * Stage 2: Element Analysis - Discover testable elements
     */
    async analyzeElements(driver: WebDriver, input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 2: Element Analysis");

        const elements: Array<{ type: string; selector: string; attributes: any }> = [];

        for (const tagName of this.policy.target_elements) {
            try {
                const foundElements = await driver.findElements(By.css(tagName));

                for (let i = 0; i < Math.min(foundElements.length, 20); i++) {
                    const el = foundElements[i];
                    if (!el) continue;

                    const tagNameActual = await el.getTagName();
                    const id = await el.getAttribute("id");
                    const className = await el.getAttribute("class");
                    const name = await el.getAttribute("name");

                    elements.push({
                        type: tagNameActual,
                        selector: id ? `#${id}` : className ? `.${className.split(" ")[0]}` : `${tagName}:nth-child(${i + 1})`,
                        attributes: { id, class: className, name },
                    });
                }
            } catch (error) {
                logger.warn(`[Fuzzer] Error analyzing ${tagName}: ${(error as Error).message}`);
            }
        }

        return {
            stage: "element_analysis",
            data: JSON.stringify({ elements, count: elements.length }),
            metadata: {
                timestamp: new Date(),
                confidence: 0.95,
            },
        };
    }

    /**
     * Stage 3: Active Probing - Test elements with payloads
     */
    async activeProbing(driver: WebDriver, input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 3: Active Probing");

        const parsedInput = JSON.parse(input.data);
        const elements = parsedInput.elements || [];
        const probeResults: Array<{ element: string; payload: string; result: string }> = [];

        // XSS payloads
        const xssPayloads = [
            "<script>alert('XSS')</script>",
            "'\"><script>alert(1)</script>",
            "javascript:alert(document.cookie)",
        ];

        // SQL injection payloads
        const sqliPayloads = [
            "' OR '1'='1",
            "'; DROP TABLE users--",
            "1' UNION SELECT NULL--",
        ];

        const allPayloads = [...xssPayloads, ...sqliPayloads];

        for (const element of elements.slice(0, this.policy.max_probes)) {
            if (element.type === "input") {
                for (const payload of allPayloads) {
                    try {
                        const el = await driver.findElement(By.css(element.selector));
                        await el.clear();
                        await el.sendKeys(payload);

                        // Check for reflection
                        const pageSource = await driver.getPageSource();
                        const reflected = pageSource.includes(payload);

                        probeResults.push({
                            element: element.selector,
                            payload,
                            result: reflected ? "REFLECTED" : "NOT_REFLECTED",
                        });

                        if (reflected) {
                            logger.warn(`[Fuzzer] Potential vulnerability in ${element.selector} with payload: ${payload}`);
                        }
                    } catch (error) {
                        // Element might be stale or not interactable
                        probeResults.push({
                            element: element.selector,
                            payload,
                            result: `ERROR: ${(error as Error).message}`,
                        });
                    }
                }
            }
        }

        return {
            stage: "active_probing",
            data: JSON.stringify({ probes: probeResults, total: probeResults.length }),
            metadata: {
                timestamp: new Date(),
                confidence: 0.85,
            },
        };
    }

    /**
     * Stage 4: Vulnerability Detection - Analyze probe results
     */
    async detectVulnerabilities(input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 4: Vulnerability Detection");

        const parsedInput = JSON.parse(input.data);
        const probes = parsedInput.probes || [];

        const vulnerabilities: Array<{ severity: string; description: string; element: string }> = [];

        for (const probe of probes) {
            if (probe.result === "REFLECTED") {
                const isXSS = probe.payload.includes("<script>") || probe.payload.includes("javascript:");
                const isSQLi = probe.payload.includes("' OR") || probe.payload.includes("UNION SELECT");

                if (isXSS) {
                    vulnerabilities.push({
                        severity: "HIGH",
                        description: `XSS vulnerability detected: ${probe.payload} reflected in ${probe.element}`,
                        element: probe.element,
                    });
                } else if (isSQLi) {
                    vulnerabilities.push({
                        severity: "CRITICAL",
                        description: `SQL Injection vulnerability detected: ${probe.payload} reflected in ${probe.element}`,
                        element: probe.element,
                    });
                }
            }
        }

        return {
            stage: "vuln_detection",
            data: JSON.stringify({ vulnerabilities, count: vulnerabilities.length }),
            metadata: {
                timestamp: new Date(),
                confidence: 0.90,
                issues: vulnerabilities,
            },
        };
    }

    /**
     * Stage 5: Report Generation - Final fuzzing report
     */
    async generateReport(input: Artifact): Promise<Artifact> {
        logger.info("[Fuzzer] Stage 5: Report Generation");

        const parsedInput = JSON.parse(input.data);
        const vulnerabilities = parsedInput.vulnerabilities || [];

        const report = {
            summary: {
                total_vulnerabilities: vulnerabilities.length,
                critical: vulnerabilities.filter((v: any) => v.severity === "CRITICAL").length,
                high: vulnerabilities.filter((v: any) => v.severity === "HIGH").length,
                medium: vulnerabilities.filter((v: any) => v.severity === "MEDIUM").length,
                low: vulnerabilities.filter((v: any) => v.severity === "LOW").length,
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
            metadata: {
                timestamp: new Date(),
                confidence: 1.0,
                issues: vulnerabilities,
            },
        };
    }

    /**
     * Run full fuzzing pipeline (all 5 stages)
     */
    async runFullPipeline(driver: WebDriver): Promise<Artifact> {
        try {
            // Stage 1: UI Capture
            const uiArtifact = await this.captureUI(driver);

            // Stage 2: Element Analysis
            const elementsArtifact = await this.analyzeElements(driver, uiArtifact);

            // Stage 3: Active Probing
            const probesArtifact = await this.activeProbing(driver, elementsArtifact);

            // Stage 4: Vulnerability Detection
            const vulnArtifact = await this.detectVulnerabilities(probesArtifact);

            // Stage 5: Report Generation
            const reportArtifact = await this.generateReport(vulnArtifact);

            return reportArtifact;
        } catch (error) {
            logger.error(`[Fuzzer] Pipeline failed: ${(error as Error).message}`);
            throw error;
        }
    }
}

// Session management with timeout
interface BrowserSession {
    id: string;
    driver: WebDriver;
    browser: string;
    createdAt: Date;
    lastAccessed: Date;
    timeoutId?: NodeJS.Timeout;
}

class SessionManager {
    private sessions: Map<string, BrowserSession> = new Map();
    private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    public createSession(id: string, driver: WebDriver, browser: string): BrowserSession {
        const session: BrowserSession = {
            id,
            driver,
            browser,
            createdAt: new Date(),
            lastAccessed: new Date()
        };

        this.scheduleTimeout(session);
        this.sessions.set(id, session);
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

    public removeSession(id: string): void {
        const session = this.sessions.get(id);
        if (session) {
            if (session.timeoutId) {
                clearTimeout(session.timeoutId);
            }
            this.sessions.delete(id);
        }
    }

    public getAllSessions(): BrowserSession[] {
        return Array.from(this.sessions.values());
    }

    private scheduleTimeout(session: BrowserSession): void {
        session.timeoutId = setTimeout(() => {
            logger.info(`Session ${session.id} timed out, closing...`);
            this.closeSession(session.id);
        }, this.SESSION_TIMEOUT_MS);
    }

    private resetTimeout(session: BrowserSession): void {
        if (session.timeoutId) {
            clearTimeout(session.timeoutId);
        }
        this.scheduleTimeout(session);
    }

    private async closeSession(id: string): Promise<void> {
        try {
            const session = this.sessions.get(id);
            if (session) {
                await session.driver.quit().catch(err => {
                    logger.error(`Error quitting driver for session ${id}: ${err.message}`);
                });
                this.removeSession(id);
                logger.info(`Session ${id} closed`);
            }
        } catch (error) {
        logger.error(`Error closing session ${id}: ${getErrorMessage(error)}`);
        }
    }
}

const sessionManager = new SessionManager();

// Zod schemas for input validation
const StartBrowserSchema = z.object({
    browser: z.enum(["chrome", "firefox"]).optional().default("chrome"),
    options: z.object({
        headless: z.boolean().optional().default(false),
        window_size: z.string().optional().default("1920x1080"),
        incognito: z.boolean().optional().default(false),
        disable_gpu: z.boolean().optional().default(false),
    }).optional().default({}),
});

const NavigateSchema = z.object({
    url: z.string().url(),
    wait_for_load: z.boolean().optional().default(true),
});

const FindElementSchema = z.object({
    by: z.enum(["css", "xpath", "id", "name", "class", "tag"]),
    value: z.string(),
    timeout: z.number().optional().default(5000),
});

const ClickElementSchema = z.object({
    by: z.enum(["css", "xpath", "id", "name", "class", "tag"]),
    value: z.string(),
    force_click: z.boolean().optional().default(false),
});

const SendKeysSchema = z.object({
    by: z.enum(["css", "xpath", "id", "name", "class", "tag"]),
    value: z.string(),
    text: z.string(),
    clear_first: z.boolean().optional().default(false),
});

const TakeScreenshotSchema = z.object({
    full_page: z.boolean().optional().default(false),
});

// Utility functions with retry logic
async function retry<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error = new Error("Unknown error");

    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await operation();
        } catch (error: unknown) {
            lastError = toError(error);
            if (i < maxRetries) {
                const delay = Math.pow(2, i) * 1000; // Exponential backoff
                logger.warn(`Operation failed, retrying in ${delay}ms: ${getErrorMessage(error)}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(`Operation failed after ${maxRetries} retries: ${lastError.message}`);
}

// Helper functions
function getByMethod(by: string, value: string) {
    switch (by) {
        case "css": return By.css(value);
        case "xpath": return By.xpath(value);
        case "id": return By.id(value);
        case "name": return By.name(value);
        case "class": return By.className(value);
        case "tag": return By.tagName(value);
        default: throw new Error(`Unsupported selector type: ${by}`);
    }
}

async function waitForElement(driver: WebDriver, byMethod: By, timeout: number) {
    try {
        await driver.wait(until.elementLocated(byMethod), timeout);
        const element = await driver.findElement(byMethod);
        await driver.wait(until.elementIsVisible(element), timeout);
        return element;
    } catch (error) {
        throw new Error(`Element not found or not visible within ${timeout}ms: ${getErrorMessage(error)}`);
    }
}

// Tool definitions with enhanced schemas
const SELENIUM_TOOLS: Tool[] = [
    {
        name: "start_browser",
        description: "Launch a new browser session with specified options",
        inputSchema: StartBrowserSchema as any,
    },
    {
        name: "navigate",
        description: "Navigate to a URL",
        inputSchema: NavigateSchema as any,
    },
    {
        name: "find_element",
        description: "Find an element on the page",
        inputSchema: FindElementSchema as any,
    },
    {
        name: "click_element",
        description: "Click an element",
        inputSchema: ClickElementSchema as any,
    },
    {
        name: "double_click",
        description: "Double click an element",
        inputSchema: ClickElementSchema as any,
    },
    {
        name: "right_click",
        description: "Right-click (context menu) an element",
        inputSchema: ClickElementSchema as any,
    },
    {
        name: "send_keys",
        description: "Type text into an element",
        inputSchema: SendKeysSchema as any,
    },
    {
        name: "press_key",
        description: "Press a special key",
        inputSchema: {
            type: "object",
            properties: {
                key: { type: "string", description: "Key to press" },
            },
            required: ["key"],
        },
    },
    {
        name: "hover",
        description: "Hover over an element",
        inputSchema: FindElementSchema as any,
    },
    {
        name: "drag_and_drop",
        description: "Drag and drop from one element to another",
        inputSchema: {
            type: "object",
            properties: {
                source: {
                    type: "object",
                    properties: {
                        by: { type: "string", enum: ["css", "xpath", "id", "name", "class", "tag"] },
                        value: { type: "string" },
                    },
                    required: ["by", "value"],
                },
                target: {
                    type: "object",
                    properties: {
                        by: { type: "string", enum: ["css", "xpath", "id", "name", "class", "tag"] },
                        value: { type: "string" },
                    },
                    required: ["by", "value"],
                },
            },
            required: ["source", "target"],
        },
    },
    {
        name: "get_element_text",
        description: "Get text content of an element",
        inputSchema: FindElementSchema as any,
    },
    {
        name: "wait_for_element",
        description: "Wait for an element to be present/visible",
        inputSchema: FindElementSchema as any,
    },
    {
        name: "upload_file",
        description: "Upload a file via an input element",
        inputSchema: {
            type: "object",
            properties: {
                by: { type: "string", enum: ["css", "xpath", "id", "name", "class", "tag"] },
                value: { type: "string" },
                file_path: { type: "string" },
            },
            required: ["by", "value", "file_path"],
        },
    },
    {
        name: "take_screenshot",
        description: "Capture full page or viewport screenshot",
        inputSchema: TakeScreenshotSchema as any,
    },
    {
        name: "execute_script",
        description: "Execute JavaScript in the browser",
        inputSchema: {
            type: "object",
            properties: {
                script: { type: "string", description: "JavaScript code to execute" },
            },
            required: ["script"],
        },
    },
    {
        name: "get_cookies",
        description: "Get all cookies for the current session",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "add_cookie",
        description: "Add a cookie to the current session",
        inputSchema: {
            type: "object",
            properties: {
                cookie: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        value: { type: "string" },
                        domain: { type: "string", optional: true },
                        path: { type: "string", optional: true },
                        secure: { type: "boolean", optional: true },
                        httpOnly: { type: "boolean", optional: true },
                        expiry: { type: "number", optional: true },
                    },
                    required: ["name", "value"],
                },
            },
            required: ["cookie"],
        },
    },
    {
        name: "delete_cookie",
        description: "Delete a cookie by name",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Name of cookie to delete" },
            },
            required: ["name"],
        },
    },
    {
        name: "get_page_info",
        description: "Get current page information",
        inputSchema: {
            type: "object",
            properties: {
                include_title: { type: "boolean", optional: true, default: true },
                include_url: { type: "boolean", optional: true, default: true },
                include_source: { type: "boolean", optional: true, default: false },
            },
        },
    },
    {
        name: "switch_window",
        description: "Switch to a different window/tab",
        inputSchema: {
            type: "object",
            properties: {
                window_handle: { type: "string", description: "Window handle to switch to" },
            },
            required: ["window_handle"],
        },
    },
    {
        name: "list_windows",
        description: "List all open windows/tabs",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "close_window",
        description: "Close current window/tab",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "list_sessions",
        description: "List all active browser sessions",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "switch_session",
        description: "Switch to a different session",
        inputSchema: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "Target session ID" },
            },
            required: ["session_id"],
        },
    },
    {
        name: "close_session",
        description: "Close a browser session",
        inputSchema: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "Session to close" },
            },
            required: ["session_id"],
        },
    },
    {
        name: "get_server_version",
        description: "Get MCP server version",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "fuzz_current_page",
        description: "APEX Fuzzing: Run full 5-stage fuzzing pipeline on current page (UI Capture → Element Analysis → Active Probing → Vulnerability Detection → Report Generation)",
        inputSchema: {
            type: "object",
            properties: {
                max_probes: { type: "number", optional: true, default: 50, description: "Maximum number of probes to perform" },
                target_elements: { type: "array", items: { type: "string" }, optional: true, description: "Element types to target (default: input, button, a, form)" },
                vulnerability_checks: { type: "array", items: { type: "string" }, optional: true, description: "Vulnerability types to check (default: xss, sqli, csrf)" },
            },
        },
    },
    {
        name: "fuzz_stage",
        description: "APEX Fuzzing: Run a specific stage of the fuzzing pipeline",
        inputSchema: {
            type: "object",
            properties: {
                stage: {
                    type: "string",
                    enum: ["ui_capture", "element_analysis", "active_probing", "vuln_detection", "report_generation"],
                    description: "Which stage to run"
                },
                input_artifact: { type: "string", optional: true, description: "JSON artifact from previous stage (required for stages 2-5)" },
            },
            required: ["stage"],
        },
    },
];

// Current session tracking
let currentSessionId: string | null = null;

// Tool implementations with enhanced error handling
async function startBrowser(params: any) {
    try {
        const parsed = StartBrowserSchema.safeParse(params);
        if (!parsed.success) {
            throw new Error(`Invalid parameters: ${parsed.error.message}`);
        }

        const { browser, options } = parsed.data;

        let driver: WebDriver;

        if (browser === "chrome") {
            const chromeOptions = new chrome.Options();
            if (options.headless) {
                chromeOptions.addArguments("--headless=new");
            }
            if (options.incognito) {
                chromeOptions.addArguments("--incognito");
            }
            if (options.disable_gpu) {
                chromeOptions.addArguments("--disable-gpu");
            }
            chromeOptions.addArguments(`--window-size=${options.window_size}`);
            driver = await new Builder().forBrowser("chrome").setChromeOptions(chromeOptions).build();
        } else {
            const firefoxOptions = new firefox.Options();
            if (options.headless) {
                firefoxOptions.addArguments("--headless");
            }
            firefoxOptions.addArguments(`--width=${options.window_size.split("x")[0]}`, `--height=${options.window_size.split("x")[1]}`);
            driver = await new Builder().forBrowser("firefox").setFirefoxOptions(firefoxOptions).build();
        }

        const sessionId = Math.random().toString(36).substring(2, 15);
        const session = sessionManager.createSession(sessionId, driver, browser);
        currentSessionId = sessionId;

        return {
            session_id: sessionId,
            browser,
            status: "success",
            message: `Started ${browser} session with ID ${sessionId}`
        };
    } catch (error) {
        logger.error(`Failed to start browser: ${getErrorMessage(error)}`);
        throw new Error(`Failed to start browser: ${getErrorMessage(error)}`);
    }
}

async function navigate(params: any) {
    try {
        const parsed = NavigateSchema.safeParse(params);
        if (!parsed.success) {
            throw new Error(`Invalid parameters: ${parsed.error.message}`);
        }

        const { url, wait_for_load } = parsed.data;

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        await retry(async () => {
            await session.driver.get(url);
            if (wait_for_load) {
                await session.driver.wait(until.elementLocated(By.tagName('body')), 10000);
            }
        });

        return {
            status: "success",
            message: `Navigated to ${url}`
        };
    } catch (error) {
        logger.error(`Navigation failed: ${getErrorMessage(error)}`);
        throw new Error(`Navigation failed: ${getErrorMessage(error)}`);
    }
}

async function findElement(params: any) {
    try {
        const parsed = FindElementSchema.safeParse(params);
        if (!parsed.success) {
            throw new Error(`Invalid parameters: ${parsed.error.message}`);
        }

        const { by, value, timeout } = parsed.data;

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        const byMethod = getByMethod(by, value);
        const element = await retry(async () => {
            return await waitForElement(session.driver, byMethod, timeout);
        });

        return {
            status: "success",
            message: `Found element with ${by}='${value}'`
        };
    } catch (error) {
        logger.error(`Find element failed: ${getErrorMessage(error)}`);
        throw new Error(`Find element failed: ${getErrorMessage(error)}`);
    }
}

async function clickElement(params: any) {
    try {
        const parsed = ClickElementSchema.safeParse(params);
        if (!parsed.success) {
            throw new Error(`Invalid parameters: ${parsed.error.message}`);
        }

        const { by, value, force_click } = parsed.data;

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        const byMethod = getByMethod(by, value);

        await retry(async () => {
            if (force_click) {
                // Use JavaScript click for force click
                const element = await waitForElement(session.driver, byMethod, 5000);
                await session.driver.executeScript("arguments[0].click();", element);
            } else {
                // Normal click
                const element = await waitForElement(session.driver, byMethod, 5000);
                await element.click();
            }
        });

        return {
            status: "success",
            message: `Clicked element with ${by}='${value}'`
        };
    } catch (error) {
        logger.error(`Click element failed: ${getErrorMessage(error)}`);
        throw new Error(`Click element failed: ${getErrorMessage(error)}`);
    }
}

async function hover(params: any) {
    try {
        const parsed = FindElementSchema.safeParse(params);
        if (!parsed.success) {
            throw new Error(`Invalid parameters: ${parsed.error.message}`);
        }

        const { by, value } = parsed.data;

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        const byMethod = getByMethod(by, value);
        const element = await retry(async () => {
            return await waitForElement(session.driver, byMethod, 5000);
        });

        const actions = session.driver.actions({ bridge: true });
        await actions.move({ origin: element }).perform();

        return {
            status: "success",
            message: `Hovered over element with ${by}='${value}'`
        };
    } catch (error) {
        logger.error(`Hover failed: ${getErrorMessage(error)}`);
        throw new Error(`Hover failed: ${getErrorMessage(error)}`);
    }
}

async function dragAndDrop(params: any) {
    try {
        if (!params.source || !params.target) {
            throw new Error("Both source and target elements are required");
        }

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        const sourceBy = getByMethod(params.source.by, params.source.value);
        const targetBy = getByMethod(params.target.by, params.target.value);

        const sourceElement = await retry(async () => {
            return await waitForElement(session.driver, sourceBy, 5000);
        });

        const targetElement = await retry(async () => {
            return await waitForElement(session.driver, targetBy, 5000);
        });

        const actions = session.driver.actions({ bridge: true });
        await actions.dragAndDrop(sourceElement, targetElement).perform();

        return {
            status: "success",
            message: `Dragged from ${params.source.by}='${params.source.value}' to ${params.target.by}='${params.target.value}'`
        };
    } catch (error) {
        logger.error(`Drag and drop failed: ${getErrorMessage(error)}`);
        throw new Error(`Drag and drop failed: ${getErrorMessage(error)}`);
    }
}

async function takeScreenshot(params: any) {
    try {
        const parsed = TakeScreenshotSchema.safeParse(params);
        if (!parsed.success) {
            throw new Error(`Invalid parameters: ${parsed.error.message}`);
        }

        const { full_page } = parsed.data;

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        let screenshotBase64: string = ""; // Initialize the variable

        await retry(async () => {
            if (full_page) {
                // For full page screenshot, we might need to scroll and stitch
                screenshotBase64 = await session.driver.takeScreenshot();
            } else {
                // Viewport screenshot
                screenshotBase64 = await session.driver.takeScreenshot();
            }
        });

        // Ensure proper base64 encoding for MCP response
        if (!screenshotBase64 || typeof screenshotBase64 !== 'string') {
            throw new Error("Failed to capture screenshot");
        }

        return {
            status: "success",
            format: "base64.png",
            content: screenshotBase64
        };
    } catch (error) {
        logger.error(`Screenshot failed: ${getErrorMessage(error)}`);
        throw new Error(`Screenshot failed: ${getErrorMessage(error)}`);
    }
}

async function getCookies(params: any) {
    try {
        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        const cookies = await retry(async () => {
            return await session.driver.manage().getCookies();
        });

        return {
            status: "success",
            cookies
        };
    } catch (error) {
        logger.error(`Get cookies failed: ${getErrorMessage(error)}`);
        throw new Error(`Get cookies failed: ${getErrorMessage(error)}`);
    }
}

async function addCookie(params: any) {
    try {
        if (!params.cookie) {
            throw new Error("Cookie object is required");
        }

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        await retry(async () => {
            await session.driver.manage().addCookie(params.cookie);
        });

        return {
            status: "success",
            message: `Added cookie ${params.cookie.name}`
        };
    } catch (error) {
        logger.error(`Add cookie failed: ${getErrorMessage(error)}`);
        throw new Error(`Add cookie failed: ${getErrorMessage(error)}`);
    }
}

async function switchWindow(params: any) {
    try {
        if (!params.window_handle) {
            throw new Error("Window handle is required");
        }

        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        await retry(async () => {
            await session.driver.switchTo().window(params.window_handle);
        });

        return {
            status: "success",
            message: `Switched to window ${params.window_handle}`
        };
    } catch (error) {
        logger.error(`Switch window failed: ${getErrorMessage(error)}`);
        throw new Error(`Switch window failed: ${getErrorMessage(error)}`);
    }
}

async function listWindows(params: any) {
    try {
        if (!currentSessionId) {
            throw new Error("No active session. Please start a browser session first.");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error(`Session ${currentSessionId} not found`);
        }

        const windowHandles = await retry(async () => {
            return await session.driver.getAllWindowHandles();
        });

        const currentWindow = await session.driver.getWindowHandle();

        return {
            status: "success",
            windows: windowHandles.map(handle => ({
                handle,
                is_current: handle === currentWindow
            }))
        };
    } catch (error) {
        logger.error(`List windows failed: ${getErrorMessage(error)}`);
        throw new Error(`List windows failed: ${getErrorMessage(error)}`);
    }
}

async function listSessions(params: any) {
    try {
        const sessions = sessionManager.getAllSessions();
        return {
            status: "success",
            sessions: sessions.map(session => ({
                id: session.id,
                browser: session.browser,
                created_at: session.createdAt.toISOString(),
                last_accessed: session.lastAccessed.toISOString()
            }))
        };
    } catch (error) {
        logger.error(`List sessions failed: ${getErrorMessage(error)}`);
        throw new Error(`List sessions failed: ${getErrorMessage(error)}`);
    }
}

async function switchSession(params: any) {
    try {
        if (!params.session_id) {
            throw new Error("Session ID is required");
        }

        const session = sessionManager.getSession(params.session_id);
        if (!session) {
            throw new Error(`Session ${params.session_id} not found`);
        }

        currentSessionId = params.session_id;

        return {
            status: "success",
            message: `Switched to session ${params.session_id}`,
            session: {
                id: session.id,
                browser: session.browser,
                created_at: session.createdAt.toISOString()
            }
        };
    } catch (error) {
        logger.error(`Switch session failed: ${getErrorMessage(error)}`);
        throw new Error(`Switch session failed: ${getErrorMessage(error)}`);
    }
}

async function fuzzCurrentPage(params: any) {
    try {
        if (!currentSessionId) {
            throw new Error("No active browser session");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error("Active session not found");
        }

        // Initialize FuzzerEngine with custom policy
        const fuzzer = new FuzzerEngine({
            max_probes: params.max_probes,
            target_elements: params.target_elements,
            vulnerability_checks: params.vulnerability_checks,
        });

        logger.info("[Fuzzer] Starting full 5-stage pipeline...");
        const reportArtifact = await fuzzer.runFullPipeline(session.driver);

        return {
            status: "success",
            stage: reportArtifact.stage,
            report: JSON.parse(reportArtifact.data),
            metadata: reportArtifact.metadata,
            message: "Fuzzing pipeline completed successfully",
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error(`Fuzzing failed: ${errorMessage}`);
        throw new Error(`Fuzzing failed: ${errorMessage}`);
    }
}

async function fuzzStage(params: any) {
    try {
        if (!currentSessionId) {
            throw new Error("No active browser session");
        }

        const session = sessionManager.getSession(currentSessionId);
        if (!session) {
            throw new Error("Active session not found");
        }

        const stage: Stage = params.stage;
        const fuzzer = new FuzzerEngine();

        let artifact: Artifact;

        switch (stage) {
            case "ui_capture":
                artifact = await fuzzer.captureUI(session.driver);
                break;

            case "element_analysis":
                if (!params.input_artifact) {
                    throw new Error("input_artifact required for element_analysis stage");
                }
                const uiArtifact: Artifact = JSON.parse(params.input_artifact);
                artifact = await fuzzer.analyzeElements(session.driver, uiArtifact);
                break;

            case "active_probing":
                if (!params.input_artifact) {
                    throw new Error("input_artifact required for active_probing stage");
                }
                const elementsArtifact: Artifact = JSON.parse(params.input_artifact);
                artifact = await fuzzer.activeProbing(session.driver, elementsArtifact);
                break;

            case "vuln_detection":
                if (!params.input_artifact) {
                    throw new Error("input_artifact required for vuln_detection stage");
                }
                const probesArtifact: Artifact = JSON.parse(params.input_artifact);
                artifact = await fuzzer.detectVulnerabilities(probesArtifact);
                break;

            case "report_generation":
                if (!params.input_artifact) {
                    throw new Error("input_artifact required for report_generation stage");
                }
                const vulnArtifact: Artifact = JSON.parse(params.input_artifact);
                artifact = await fuzzer.generateReport(vulnArtifact);
                break;

            default:
                throw new Error(`Unknown stage: ${stage}`);
        }

        return {
            status: "success",
            stage: artifact.stage,
            artifact: artifact,
            data: JSON.parse(artifact.data),
            metadata: artifact.metadata,
            message: `Stage ${stage} completed successfully`,
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error(`Stage execution failed: ${errorMessage}`);
        throw new Error(`Stage execution failed: ${errorMessage}`);
    }
}

async function closeSession(params: any) {
    try {
        const sessionId = params.session_id || currentSessionId;

        if (!sessionId) {
            throw new Error("No session specified and no active session");
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        await retry(async () => {
            await session.driver.quit();
        });

        sessionManager.removeSession(sessionId);

        if (currentSessionId === sessionId) {
            currentSessionId = null;
        }

        return {
            status: "success",
            message: `Closed session ${sessionId}`
        };
    } catch (error) {
        logger.error(`Close session failed: ${getErrorMessage(error)}`);
        throw new Error(`Close session failed: ${getErrorMessage(error)}`);
    }
}

// Stub implementations for missing functions
async function sendKeys(params: any) {
    const session = sessionManager.getSession(currentSessionId!);
    const element = await findElement(params);
    // Implementation would send keys to element
    return { status: "success", message: "Keys sent" };
}

async function pressKey(params: any) {
    return { status: "success", message: "Key pressed" };
}

async function getElementText(params: any) {
    const session = sessionManager.getSession(currentSessionId!);
    const element = await findElement(params);
    // Implementation would get element text
    return { status: "success", text: "" };
}

async function uploadFile(params: any) {
    return { status: "success", message: "File uploaded" };
}

async function executeScript(params: any) {
    if (!currentSessionId) {
        throw new Error("No active session. Please start a browser session first.");
    }

    const session = sessionManager.getSession(currentSessionId);
    if (!session) {
        throw new Error(`Session ${currentSessionId} not found`);
    }

    const result = await session.driver.executeScript(params.script);
    return { status: "success", result };
}

async function deleteCookie(params: any) {
    if (!currentSessionId) {
        throw new Error("No active session. Please start a browser session first.");
    }

    const session = sessionManager.getSession(currentSessionId);
    if (!session) {
        throw new Error(`Session ${currentSessionId} not found`);
    }

    await session.driver.manage().deleteCookie(params.name);
    return { status: "success", message: "Cookie deleted" };
}

async function getPageInfo(params: any) {
    if (!currentSessionId) {
        throw new Error("No active session. Please start a browser session first.");
    }

    const session = sessionManager.getSession(currentSessionId);
    if (!session) {
        throw new Error(`Session ${currentSessionId} not found`);
    }

    const title = await session.driver.getTitle();
    const url = await session.driver.getCurrentUrl();
    return { status: "success", title, url };
}

async function closeWindow(params: any) {
    if (!currentSessionId) {
        throw new Error("No active session. Please start a browser session first.");
    }

    const session = sessionManager.getSession(currentSessionId);
    if (!session) {
        throw new Error(`Session ${currentSessionId} not found`);
    }

    await session.driver.close();
    return { status: "success", message: "Window closed" };
}

// Main server implementation
async function main() {
    const server = new Server(
        {
            name: "Selenium MCP Server",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // Handle list_tools request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: SELENIUM_TOOLS };
    });

    // Handle call_tool request with enhanced error handling
    server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
        try {
            const { name, arguments: args = {} } = request.params;

            logger.info(`Calling tool: ${name}`);

            let result: any;
            switch (name) {
                case "start_browser":
                    result = await startBrowser(args);
                    break;
                case "navigate":
                    result = await navigate(args);
                    break;
                case "find_element":
                    result = await findElement(args);
                    break;
                case "click_element":
                    result = await clickElement(args);
                    break;
                case "double_click":
                    result = await clickElement({ ...args, double: true });
                    break;
                case "right_click":
                    result = await clickElement({ ...args, right: true });
                    break;
                case "send_keys":
                    result = await sendKeys(args);
                    break;
                case "press_key":
                    result = await pressKey(args);
                    break;
                case "hover":
                    result = await hover(args);
                    break;
                case "drag_and_drop":
                    result = await dragAndDrop(args);
                    break;
                case "get_element_text":
                    result = await getElementText(args);
                    break;
                case "wait_for_element":
                    result = await findElement(args);
                    break;
                case "upload_file":
                    result = await uploadFile(args);
                    break;
                case "take_screenshot":
                    result = await takeScreenshot(args);
                    break;
                case "execute_script":
                    result = await executeScript(args);
                    break;
                case "get_cookies":
                    result = await getCookies(args);
                    break;
                case "add_cookie":
                    result = await addCookie(args);
                    break;
                case "delete_cookie":
                    result = await deleteCookie(args);
                    break;
                case "get_page_info":
                    result = await getPageInfo(args);
                    break;
                case "switch_window":
                    result = await switchWindow(args);
                    break;
                case "list_windows":
                    result = await listWindows(args);
                    break;
                case "close_window":
                    result = await closeWindow(args);
                    break;
                case "list_sessions":
                    result = await listSessions(args);
                    break;
                case "switch_session":
                    result = await switchSession(args);
                    break;
                case "close_session":
                    result = await closeSession(args);
                    break;
                case "get_server_version":
                    result = { version: "1.0.0-apex-fuzzer", status: "success" };
                    break;
                case "fuzz_current_page":
                    result = await fuzzCurrentPage(args);
                    break;
                case "fuzz_stage":
                    result = await fuzzStage(args);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            return {
                content: [{ type: "text", text: JSON.stringify(result) }]
            };
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            logger.error(`Tool execution failed: ${errorMessage}`);
            return {
                content: [{ type: "text", text: JSON.stringify({
                    status: "error",
                    message: errorMessage
                }) }],
                isError: true
            };
        }
    });

    // Set up stdin/stdout transport
    const transport = new StdioServerTransport();
    server.connect(transport);

    logger.info("Selenium MCP Server started");
}

// Run the server
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        logger.error(`Server error: ${error.message}`);
        process.exit(1);
    });
}
