#!/usr/bin/env node

/**
 * Selenium MCP Server
 * Provides browser automation capabilities through Selenium WebDriver
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

// Session management
interface BrowserSession {
    id: string;
    driver: WebDriver;
    browser: string;
    createdAt: Date;
}

const sessions = new Map<string, BrowserSession>();
let currentSessionId: string | null = null;

// Tool definitions
const SELENIUM_TOOLS: Tool[] = [
    {
        name: "start_browser",
        description: "Launch a new browser session with specified options",
        inputSchema: {
            type: "object",
            properties: {
                browser: {
                    type: "string",
                    enum: ["chrome", "firefox"],
                    description: "Browser type",
                    default: "chrome",
                },
                options: {
                    type: "object",
                    properties: {
                        headless: { type: "boolean", default: false },
                        window_size: { type: "string", default: "1920x1080" },
                        incognito: { type: "boolean", default: false },
                        disable_gpu: { type: "boolean", default: false },
                    },
                },
            },
        },
    },
    {
        name: "navigate",
        description: "Navigate to a URL",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string", description: "Target URL" },
                wait_for_load: { type: "boolean", default: true },
            },
            required: ["url"],
        },
    },
    {
        name: "find_element",
        description: "Find an element on the page",
        inputSchema: {
            type: "object",
            properties: {
                by: {
                    type: "string",
                    enum: ["css", "xpath", "id", "name", "class", "tag"],
                    description: "Selector type",
                },
                value: { type: "string", description: "Selector value" },
                timeout: { type: "number", default: 5000 },
            },
            required: ["by", "value"],
        },
    },
    {
        name: "click_element",
        description: "Click an element",
        inputSchema: {
            type: "object",
            properties: {
                by: { type: "string", enum: ["css", "xpath", "id", "name", "class", "tag"] },
                value: { type: "string" },
                force_click: { type: "boolean", default: false },
            },
            required: ["by", "value"],
        },
    },
    {
        name: "send_keys",
        description: "Type text into an element",
        inputSchema: {
            type: "object",
            properties: {
                by: { type: "string", enum: ["css", "xpath", "id", "name", "class", "tag"] },
                value: { type: "string" },
                text: { type: "string", description: "Text to type" },
                clear_first: { type: "boolean", default: false },
            },
            required: ["by", "value", "text"],
        },
    },
    {
        name: "take_screenshot",
        description: "Capture a screenshot",
        inputSchema: {
            type: "object",
            properties: {
                full_page: { type: "boolean", default: true },
                filename: { type: "string" },
            },
        },
    },
    {
        name: "get_page_info",
        description: "Get current page information",
        inputSchema: {
            type: "object",
            properties: {
                include_title: { type: "boolean", default: true },
                include_url: { type: "boolean", default: true },
                include_source: { type: "boolean", default: false },
            },
        },
    },
    {
        name: "execute_script",
        description: "Execute JavaScript in the browser",
        inputSchema: {
            type: "object",
            properties: {
                script: { type: "string", description: "JavaScript code" },
            },
            required: ["script"],
        },
    },
    {
        name: "wait_for_element",
        description: "Wait for an element to appear",
        inputSchema: {
            type: "object",
            properties: {
                by: { type: "string", enum: ["css", "xpath", "id", "name", "class", "tag"] },
                value: { type: "string" },
                wait_for_visible: { type: "boolean", default: true },
                timeout: { type: "number", default: 10000 },
            },
            required: ["by", "value"],
        },
    },
    {
        name: "get_element_text",
        description: "Get text content of an element",
        inputSchema: {
            type: "object",
            properties: {
                by: { type: "string", enum: ["css", "xpath", "id", "name", "class", "tag"] },
                value: { type: "string" },
            },
            required: ["by", "value"],
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
                session_id: { type: "string" },
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
                session_id: { type: "string" },
            },
            required: ["session_id"],
        },
    },
];

// Helper functions
function getLocator(by: string, value: string): By {
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

function getCurrentDriver(): WebDriver {
    if (!currentSessionId || !sessions.has(currentSessionId)) {
        throw new Error("No active browser session. Start a browser first.");
    }
    return sessions.get(currentSessionId)!.driver;
}

// Tool handlers
async function handleStartBrowser(args: any): Promise<any> {
    const browser = args.browser || "chrome";
    const options = args.options || {};

    let driver: WebDriver;
    const sessionId = `session-${Date.now()}`;

    if (browser === "chrome") {
        const chromeOptions = new chrome.Options();
        if (options.headless) chromeOptions.addArguments("--headless");
        if (options.window_size) chromeOptions.addArguments(`--window-size=${options.window_size}`);
        if (options.incognito) chromeOptions.addArguments("--incognito");
        if (options.disable_gpu) chromeOptions.addArguments("--disable-gpu");

        driver = await new Builder()
            .forBrowser("chrome")
            .setChromeOptions(chromeOptions)
            .build();
    } else {
        const firefoxOptions = new firefox.Options();
        if (options.headless) firefoxOptions.addArguments("-headless");
        if (options.window_size) {
            const [width, height] = options.window_size.split("x");
            firefoxOptions.addArguments(`--width=${width}`, `--height=${height}`);
        }

        driver = await new Builder()
            .forBrowser("firefox")
            .setFirefoxOptions(firefoxOptions)
            .build();
    }

    sessions.set(sessionId, {
        id: sessionId,
        driver,
        browser,
        createdAt: new Date(),
    });

    currentSessionId = sessionId;

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    session_id: sessionId,
                    browser,
                    message: `Browser ${browser} started successfully`,
                }),
            },
        ],
    };
}

async function handleNavigate(args: any): Promise<any> {
    const driver = getCurrentDriver();
    await driver.get(args.url);

    if (args.wait_for_load !== false) {
        await driver.wait(until.elementLocated(By.css("body")), 10000);
    }

    const currentUrl = await driver.getCurrentUrl();

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    url: currentUrl,
                    message: `Navigated to ${args.url}`,
                }),
            },
        ],
    };
}

async function handleFindElement(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const locator = getLocator(args.by, args.value);
    const timeout = args.timeout || 5000;

    const element = await driver.wait(until.elementLocated(locator), timeout);
    const isDisplayed = await element.isDisplayed();

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    found: true,
                    displayed: isDisplayed,
                    selector: `${args.by}: ${args.value}`,
                }),
            },
        ],
    };
}

async function handleClickElement(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const locator = getLocator(args.by, args.value);
    const element = await driver.wait(until.elementLocated(locator), 5000);

    if (args.force_click) {
        await driver.executeScript("arguments[0].click();", element);
    } else {
        await element.click();
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    message: `Clicked element: ${args.by}: ${args.value}`,
                }),
            },
        ],
    };
}

async function handleSendKeys(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const locator = getLocator(args.by, args.value);
    const element = await driver.wait(until.elementLocated(locator), 5000);

    if (args.clear_first) {
        await element.clear();
    }

    await element.sendKeys(args.text);

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    message: `Sent keys to element: ${args.by}: ${args.value}`,
                    text: args.text,
                }),
            },
        ],
    };
}

async function handleTakeScreenshot(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const screenshot = await driver.takeScreenshot();

    return {
        content: [
            {
                type: "image",
                data: screenshot,
                mimeType: "image/png",
            },
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    message: "Screenshot captured",
                    size: screenshot.length,
                }),
            },
        ],
    };
}

async function handleGetPageInfo(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const info: any = {};

    if (args.include_title !== false) {
        info.title = await driver.getTitle();
    }

    if (args.include_url !== false) {
        info.url = await driver.getCurrentUrl();
    }

    if (args.include_source) {
        info.source = await driver.getPageSource();
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    ...info,
                }),
            },
        ],
    };
}

async function handleExecuteScript(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const result = await driver.executeScript(args.script);

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    result,
                    script: args.script,
                }),
            },
        ],
    };
}

async function handleWaitForElement(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const locator = getLocator(args.by, args.value);
    const timeout = args.timeout || 10000;

    const element = await driver.wait(until.elementLocated(locator), timeout);

    if (args.wait_for_visible !== false) {
        await driver.wait(until.elementIsVisible(element), timeout);
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    message: `Element found: ${args.by}: ${args.value}`,
                }),
            },
        ],
    };
}

async function handleGetElementText(args: any): Promise<any> {
    const driver = getCurrentDriver();
    const locator = getLocator(args.by, args.value);
    const element = await driver.wait(until.elementLocated(locator), 5000);
    const text = await element.getText();

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    text,
                    selector: `${args.by}: ${args.value}`,
                }),
            },
        ],
    };
}

async function handleListSessions(): Promise<any> {
    const sessionList = Array.from(sessions.values()).map((session) => ({
        id: session.id,
        browser: session.browser,
        created_at: session.createdAt,
        is_current: session.id === currentSessionId,
    }));

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    sessions: sessionList,
                    current_session: currentSessionId,
                }),
            },
        ],
    };
}

async function handleSwitchSession(args: any): Promise<any> {
    if (!sessions.has(args.session_id)) {
        throw new Error(`Session not found: ${args.session_id}`);
    }

    currentSessionId = args.session_id;

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    message: `Switched to session: ${args.session_id}`,
                }),
            },
        ],
    };
}

async function handleCloseSession(args: any): Promise<any> {
    if (!sessions.has(args.session_id)) {
        throw new Error(`Session not found: ${args.session_id}`);
    }

    const session = sessions.get(args.session_id)!;
    await session.driver.quit();
    sessions.delete(args.session_id);

    if (currentSessionId === args.session_id) {
        currentSessionId = sessions.size > 0 ? Array.from(sessions.keys())[0] : null;
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: true,
                    message: `Closed session: ${args.session_id}`,
                }),
            },
        ],
    };
}

// Main server
async function main() {
    const server = new Server(
        {
            name: "selenium-mcp-server",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: SELENIUM_TOOLS,
    }));

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case "start_browser":
                    return await handleStartBrowser(args);
                case "navigate":
                    return await handleNavigate(args);
                case "find_element":
                    return await handleFindElement(args);
                case "click_element":
                    return await handleClickElement(args);
                case "send_keys":
                    return await handleSendKeys(args);
                case "take_screenshot":
                    return await handleTakeScreenshot(args);
                case "get_page_info":
                    return await handleGetPageInfo(args);
                case "execute_script":
                    return await handleExecuteScript(args);
                case "wait_for_element":
                    return await handleWaitForElement(args);
                case "get_element_text":
                    return await handleGetElementText(args);
                case "list_sessions":
                    return await handleListSessions();
                case "switch_session":
                    return await handleSwitchSession(args);
                case "close_session":
                    return await handleCloseSession(args);
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: error.message,
                            tool: name,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });

    // Cleanup on exit
    process.on("SIGINT", async () => {
        console.error("Shutting down...");
        for (const session of sessions.values()) {
            await session.driver.quit();
        }
        process.exit(0);
    });

    // Start server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Selenium MCP server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
