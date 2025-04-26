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
import fetch from "node-fetch";

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
    name: "puppeteer_click_position",
    description: "Click at specific x,y coordinates on the page",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate in pixels" },
        y: { type: "number", description: "Y coordinate in pixels" },
        button: { type: "string", description: "Mouse button to use (default: left). Options: left, right, middle" },
        clickCount: { type: "number", description: "Number of clicks (default: 1)" },
      },
      required: ["x", "y"],
    },
  },
  // {
  //   name: "puppeteer_click_semantic",
  //   description: "Click on an element based on a semantic description",
  //   inputSchema: {
  //     type: "object",
  //     properties: {
  //       description: { type: "string", description: "Description of the element to click (e.g. 'Submit button', 'Search icon in top right corner', 'Login link')" },
  //     },
  //     required: ["description"],
  //   },
  // },
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
  {
    name: "puppeteer_scroll",
    description: "Scroll the page vertically or to a specific element",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to scroll to" },
        x: { type: "number", description: "Horizontal scroll position in pixels" },
        y: { type: "number", description: "Vertical scroll position in pixels" },
        behavior: { type: "string", description: "Scroll behavior: 'auto' (instant) or 'smooth' (default: 'auto')" },
      },
    },
  },
];

// Global state
let browser: Browser | null;
let page: Page | null;
const consoleLogs: string[] = [];
const screenshots = new Map<string, string>();
let previousLaunchOptions: any = null;

async function ensureBrowser({ launchOptions, allowDangerous }: any) {

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
      throw new Error(`Dangerous browser arguments detected: ${dangerousArgs.join(', ')}. Fround from environment variable and tool call argument. ` +
        'Set allowDangerous: true in the tool call arguments to override.');
    }
  }

  try {
    if ((browser && !browser.connected) ||
      (launchOptions && (JSON.stringify(launchOptions) != JSON.stringify(previousLaunchOptions)))) {
      await browser?.close();
      browser = null;
    }
  }
  catch (error) {
    browser = null;
  }

  previousLaunchOptions = launchOptions;

  if (!browser) {
    const npx_args = { headless: false }
    const docker_args = { headless: true, args: ["--no-sandbox", "--single-process", "--no-zygote"] }
    browser = await puppeteer.launch(deepMerge(
      process.env.DOCKER_CONTAINER ? docker_args : npx_args,
      mergedConfig
    ));
    const pages = await browser.pages();
    page = pages[0];

    page.on("console", (msg) => {
      const logEntry = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(logEntry);
      server.notification({
        method: "notifications/resources/updated",
        params: { uri: "console://logs" },
      });
    });
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

// Function to call Claude for semantic clicking
/* 
async function callClaudeForClick(screenshot: string, description: string): Promise<{x: number, y: number} | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("Error: ANTHROPIC_API_KEY environment variable is not set");
      return null;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 1024,
        temperature: 0,
        system: "You are a helpful assistant that analyzes screenshots and provides coordinates to click on specific elements. Use the computer tools to identify where to click based on the user's description.",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Locate and click on the element described as: "${description}"` },
              { 
                type: "image", 
                source: { type: "base64", media_type: "image/png", data: screenshot }
              }
            ]
          }
        ],
        tools: [
          {
            name: "computer", 
            type: "computer_20250124",
            display_width_px: 800,
            display_height_px: 600
          }
        ]
      })
    });

    const data = await response.json();
    
    // Parse the response to find the click coordinates
    // Look for tool_use content in the Claude response
    if (data.content && Array.isArray(data.content)) {
      for (const content of data.content) {
        if (content.type === "tool_use" && content.name === "computer") {
          const input = content.input;
          if (input && input.action === "click" && typeof input.x === "number" && typeof input.y === "number") {
            return { x: input.x, y: input.y };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error calling Claude:", error);
    return null;
  }
}
*/

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
          {
            type: "image",
            data: screenshot,
            mimeType: "image/png",
          } as ImageContent,
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

    case "puppeteer_click_position":
      try {
        const x = args.x;
        const y = args.y;
        const button = args.button || 'left';
        const clickCount = args.clickCount || 1;
        
        await page.mouse.click(x, y, { button: button as 'left' | 'right' | 'middle', clickCount });
        
        return {
          content: [{
            type: "text",
            text: `Clicked at position (${x}, ${y}) with ${button} button ${clickCount} time(s)`,
          }],
          isError: false,
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to click at position: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }

    // case "puppeteer_click_semantic":
    //   try {
    //     const description = args.description;
        
    //     // Take a screenshot to analyze
    //     const screenshot = await page.screenshot({ encoding: "base64", fullPage: false });
        
    //     // Try up to 3 times to get click coordinates
    //     let clickCoords = null;
    //     let attempts = 0;
        
    //     while (!clickCoords && attempts < 3) {
    //       attempts++;
    //       clickCoords = await callClaudeForClick(screenshot as string, description);
          
    //       if (!clickCoords && attempts < 3) {
    //         // Wait a bit before retrying
    //         await new Promise(resolve => setTimeout(resolve, 1000));
    //       }
    //     }
        
    //     if (!clickCoords) {
    //       return {
    //         content: [{
    //           type: "text",
    //           text: "Internal error: Could not determine where to click. Make sure ANTHROPIC_API_KEY environment variable is set.",
    //         }],
    //         isError: true,
    //       };
    //     }
        
    //     // Perform the click
    //     await page.mouse.click(clickCoords.x, clickCoords.y);
        
    //     return {
    //       content: [{
    //         type: "text",
    //         text: `Semantically clicked "${description}" at position (${clickCoords.x}, ${clickCoords.y})`,
    //       }],
    //       isError: false,
    //     };
    //   } catch (error) {
    //     return {
    //       content: [{
    //         type: "text",
    //         text: `Failed to perform semantic click: ${(error as Error).message}`,
    //       }],
    //       isError: true,
    //     };
    //   }

    case "puppeteer_scroll":
      try {
        if (args.selector) {
          // Scroll to element
          const element = await page.$(args.selector);
          if (!element) {
            return {
              content: [{
                type: "text",
                text: `Element not found: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          await page.evaluate((selector, behavior) => {
            const element = document.querySelector(selector);
            if (element) {
              element.scrollIntoView({ behavior: behavior || 'auto' });
            }
          }, args.selector, args.behavior);
          
          return {
            content: [{
              type: "text",
              text: `Scrolled to element: ${args.selector}`,
            }],
            isError: false,
          };
        } else if (args.x !== undefined || args.y !== undefined) {
          // Scroll to position
          const x = args.x ?? 0;
          const y = args.y ?? 0;
          
          await page.evaluate((x, y, behavior) => {
            window.scrollTo({
              left: x,
              top: y,
              behavior: behavior || 'auto'
            });
          }, x, y, args.behavior);
          
          return {
            content: [{
              type: "text",
              text: `Scrolled to position (${x}, ${y})`,
            }],
            isError: false,
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `No scroll target specified. Please provide a selector or x/y coordinates.`,
            }],
            isError: true,
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Failed to scroll: ${(error as Error).message}`,
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

process.stdin.on("close", () => {
  console.error("Puppeteer MCP Server closed");
  server.close();
});