#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  TextContent,
  ImageContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer, { Browser, Page } from "puppeteer";

// Define the tools once to avoid repetition
const TOOLS: Tool[] = [
  {
    name: "puppeteer_navigate",
    description: "Navigate to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        launchOptions: { type: "object", description: "PuppeteerJS LaunchOptions. Default null. If changed and not null, browser restarts. Example: { headless: true, args: ['--no-sandbox'] }" },
        allowDangerous: { type: "boolean", description: "Allow dangerous LaunchOptions that reduce security. When false, dangerous args like --no-sandbox will throw errors. Default false." },
      },
      required: ["url"],
    },
  },
  {
    name: "puppeteer_screenshot",
    description: "Take a screenshot of the current page or a specific element",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the screenshot" },
        selector: { type: "string", description: "CSS selector for element to screenshot" },
        width: { type: "number", description: "Width in pixels (default: 800)" },
        height: { type: "number", description: "Height in pixels (default: 600)" },
        encoded: { type: "boolean", description: "If true, capture the screenshot as a base64-encoded data URI (as text) instead of binary image content. Default false." },
      },
      required: ["name"],
    },
  },
  {
    name: "puppeteer_click",
    description: "Click an element on the page",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to click" },
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_fill",
    description: "Fill out an input field",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for input field" },
        value: { type: "string", description: "Value to fill" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_select",
    description: "Select an element on the page with Select tag",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to select" },
        value: { type: "string", description: "Value to select" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_hover",
    description: "Hover an element on the page",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to hover" },
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_evaluate",
    description: "Execute JavaScript in the browser console",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["script"],
    },
  },
];

// Global state
let browser: Browser | null;
let page: Page | null;
const consoleLogs: string[] = [];
const screenshots = new Map<string, string>();
let previousLaunchOptions: any = null;
let browserLaunching = false; // Prevent concurrent browser launches

// Clean up orphaned Chrome processes
async function cleanupChromeProcesses(): Promise<void> {
  try {
    // Kill orphaned Chrome processes on macOS
    const { exec } = await import('child_process');
    await new Promise<void>((resolve) => {
      exec('pkill -f "Chrome.*--remote-debugging-port"', (error) => {
        // Ignore errors - processes might not exist
        resolve();
      });
    });
  } catch (error: any) {
    console.warn('Failed to cleanup Chrome processes:', error.message);
  }
}

// Check if browser is healthy and connected
async function isBrowserHealthy(browser: Browser | null): Promise<boolean> {
  if (!browser) return false;
  try {
    const isConnected = browser.connected;
    if (!isConnected) return false;
    
    // Try to get pages to verify browser is responsive
    const pages = await Promise.race([
      browser.pages(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]);
    return Array.isArray(pages);
  } catch (error) {
    return false;
  }
}

async function ensureBrowser({ launchOptions, allowDangerous }: any): Promise<Page> {
  // Prevent concurrent browser launches
  if (browserLaunching) {
    // Wait for ongoing launch to complete
    while (browserLaunching) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // If browser is now available and healthy, return it
    if (await isBrowserHealthy(browser)) {
      return page!;
    }
  }
  
  const DANGEROUS_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--single-process',
    '--disable-web-security',
    '--ignore-certificate-errors',
    '--disable-features=IsolateOrigins',
    '--disable-site-isolation-trials',
    '--allow-running-insecure-content'
  ];
  
  // Parse environment config safely
  let envConfig = {};
  try {
    envConfig = JSON.parse(process.env.PUPPETEER_LAUNCH_OPTIONS || '{}');
  } catch (error: any) {
    console.warn('Failed to parse PUPPETEER_LAUNCH_OPTIONS:', error?.message || error);
  }
  
  // Deep merge environment config with user-provided options
  const mergedConfig = deepMerge(envConfig, launchOptions || {});
  
  // Security validation for merged config
  if (mergedConfig?.args) {
    const dangerousArgs = mergedConfig.args?.filter?.((arg: string) => DANGEROUS_ARGS.some((dangerousArg: string) => arg.startsWith(dangerousArg)));
    if (dangerousArgs?.length > 0 && !(allowDangerous || (process.env.ALLOW_DANGEROUS === 'true'))) {
      throw new Error(`Dangerous browser arguments detected: ${dangerousArgs.join(', ')}. Found from environment variable and tool call argument. ` +
        'Set allowDangerous: true in the tool call arguments to override.');
    }
  }
  
  // Check if we need to restart browser
  const needsRestart = !await isBrowserHealthy(browser) || 
    (launchOptions && (JSON.stringify(launchOptions) !== JSON.stringify(previousLaunchOptions)));
  
  if (needsRestart) {
    browserLaunching = true;
    try {
      // Close existing browser gracefully
      if (browser) {
        try {
          await Promise.race([
            browser.close(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Close timeout')), 5000))
          ]);
        } catch (error: any) {
          console.warn('Failed to close browser gracefully:', error.message);
          // Force cleanup orphaned processes
          await cleanupChromeProcesses();
        }
      }
      browser = null;
      page = null;
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Launch new browser
      const npx_args = { headless: false };
      const docker_args = { headless: true, args: ["--no-sandbox", "--single-process", "--no-zygote"] };
      
      console.log('Launching new browser instance...');
      browser = await puppeteer.launch(deepMerge(
        process.env.DOCKER_CONTAINER ? docker_args : npx_args,
        mergedConfig
      ));
      
      const pages = await browser.pages();
      page = pages[0];
      
      // Set up console logging
      page.on("console", (msg) => {
        const logEntry = `[${msg.type()}] ${msg.text()}`;
        consoleLogs.push(logEntry);
        server.notification({
          method: "notifications/resources/updated",
          params: { uri: "console://logs" },
        });
      });
      
      console.log('Browser launched successfully');
      previousLaunchOptions = launchOptions;
    } finally {
      browserLaunching = false;
    }
  }
  
  return page!;
}

// Deep merge utility function
function deepMerge(target: any, source: any): any {
  const output = Object.assign({}, target);
  if (typeof target !== 'object' || typeof source !== 'object') return source;

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];
    if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      // Deduplicate args/ignoreDefaultArgs, prefer source values
      output[key] = [...new Set([
        ...(key === 'args' || key === 'ignoreDefaultArgs' ?
          targetVal.filter((arg: string) => !sourceVal.some((launchArg: string) => arg.startsWith('--') && launchArg.startsWith(arg.split('=')[0]))) :
          targetVal),
        ...sourceVal
      ])];
    } else if (sourceVal instanceof Object && key in target) {
      output[key] = deepMerge(targetVal, sourceVal);
    } else {
      output[key] = sourceVal;
    }
  }
  return output;
}

declare global {
  interface Window {
    mcpHelper: {
      logs: string[],
      originalConsole: Partial<typeof console>,
    }
  }
}

async function handleToolCall(name: string, args: any): Promise<CallToolResult> {
  const page = await ensureBrowser(args);

  switch (name) {
    case "puppeteer_navigate":
      await page.goto(args.url);
      return {
        content: [{
          type: "text",
          text: `Navigated to ${args.url}`,
        }],
        isError: false,
      };

    case "puppeteer_screenshot": {
      const width = args.width ?? 800;
      const height = args.height ?? 600;
      const encoded = args.encoded ?? false;
      await page.setViewport({ width, height });

      const screenshot = await (args.selector ?
        (await page.$(args.selector))?.screenshot({ encoding: "base64" }) :
        page.screenshot({ encoding: "base64", fullPage: false }));

      if (!screenshot) {
        return {
          content: [{
            type: "text",
            text: args.selector ? `Element not found: ${args.selector}` : "Screenshot failed",
          }],
          isError: true,
        };
      }

      screenshots.set(args.name, screenshot as string);
      server.notification({
        method: "notifications/resources/list_changed",
      });

      return {
        content: [
          {
            type: "text",
            text: `Screenshot '${args.name}' taken at ${width}x${height}`,
          } as TextContent,
          encoded ? ({
            type: "text",
            text: `data:image/png;base64,${screenshot}`,
          } as TextContent) : ({
            type: "image",
            data: screenshot,
            mimeType: "image/png",
          } as ImageContent),
        ],
        isError: false,
      };
    }

    case "puppeteer_click":
      try {
        await page.click(args.selector);
        return {
          content: [{
            type: "text",
            text: `Clicked: ${args.selector}`,
          }],
          isError: false,
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to click ${args.selector}: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }

    case "puppeteer_fill":
      try {
        await page.waitForSelector(args.selector);
        await page.type(args.selector, args.value);
        return {
          content: [{
            type: "text",
            text: `Filled ${args.selector} with: ${args.value}`,
          }],
          isError: false,
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to fill ${args.selector}: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }

    case "puppeteer_select":
      try {
        await page.waitForSelector(args.selector);
        await page.select(args.selector, args.value);
        return {
          content: [{
            type: "text",
            text: `Selected ${args.selector} with: ${args.value}`,
          }],
          isError: false,
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to select ${args.selector}: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }

    case "puppeteer_hover":
      try {
        await page.waitForSelector(args.selector);
        await page.hover(args.selector);
        return {
          content: [{
            type: "text",
            text: `Hovered ${args.selector}`,
          }],
          isError: false,
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to hover ${args.selector}: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }

    case "puppeteer_evaluate":
      try {
        await page.evaluate(() => {
          window.mcpHelper = {
            logs: [],
            originalConsole: { ...console },
          };

          ['log', 'info', 'warn', 'error'].forEach(method => {
            (console as any)[method] = (...args: any[]) => {
              window.mcpHelper.logs.push(`[${method}] ${args.join(' ')}`);
              (window.mcpHelper.originalConsole as any)[method](...args);
            };
          });
        });

        const result = await page.evaluate(args.script);

        const logs = await page.evaluate(() => {
          Object.assign(console, window.mcpHelper.originalConsole);
          const logs = window.mcpHelper.logs;
          delete (window as any).mcpHelper;
          return logs;
        });

        return {
          content: [
            {
              type: "text",
              text: `Execution result:\n${JSON.stringify(result, null, 2)}\n\nConsole output:\n${logs.join('\n')}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Script execution failed: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }

    default:
      return {
        content: [{
          type: "text",
          text: `Unknown tool: ${name}`,
        }],
        isError: true,
      };
  }
}

const server = new Server(
  {
    name: "example-servers/puppeteer",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);


// Setup request handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "console://logs",
      mimeType: "text/plain",
      name: "Browser console logs",
    },
    ...Array.from(screenshots.keys()).map(name => ({
      uri: `screenshot://${name}`,
      mimeType: "image/png",
      name: `Screenshot: ${name}`,
    })),
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  if (uri === "console://logs") {
    return {
      contents: [{
        uri,
        mimeType: "text/plain",
        text: consoleLogs.join("\n"),
      }],
    };
  }

  if (uri.startsWith("screenshot://")) {
    const name = uri.split("://")[1];
    const screenshot = screenshots.get(name);
    if (screenshot) {
      return {
        contents: [{
          uri,
          mimeType: "image/png",
          blob: screenshot,
        }],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

// Graceful shutdown handling
async function gracefulShutdown(): Promise<void> {
  console.log("Shutting down Puppeteer MCP Server...");
  try {
    if (browser) {
      await Promise.race([
        browser.close(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 5000))
      ]);
    }
    await cleanupChromeProcesses();
  } catch (error: any) {
    console.warn('Error during shutdown:', error.message);
    await cleanupChromeProcesses(); // Force cleanup
  }
  server.close();
  process.exit(0);
}

// Handle various process signals
process.stdin.on("close", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("SIGHUP", gracefulShutdown);

// Handle uncaught exceptions
process.on("uncaughtException", async (error: Error) => {
  console.error("Uncaught exception:", error);
  await gracefulShutdown();
});