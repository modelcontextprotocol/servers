            isError: true,
          },
        };
      }

    case "puppeteer_screenshot": {
      const width = args.width ?? config.screenshotOptions.defaultWidth;
      const height = args.height ?? config.screenshotOptions.defaultHeight;
      
      try {
        await page.setViewport({ width, height });
        
        // Wait for any animations to complete
        await page.waitForTimeout(500);
        
        let screenshot;
        if (args.selector) {
          const element = await withTimeout(
            page.waitForSelector(args.selector, { timeout: 5000 })
          );
          if (!element) {
            throw new Error(`Element not found: ${args.selector}`);
          }
          screenshot = await element.screenshot({ 
            encoding: "base64",
            quality: config.screenshotOptions.quality
          });
        } else {
          screenshot = await page.screenshot({ 
            encoding: "base64", 
            fullPage: false,
            captureBeyondViewport: false,
            quality: config.screenshotOptions.quality
          });
        }
        
        if (!screenshot) {
          throw new Error('Screenshot capture failed');
        }

        screenshots.set(args.name, screenshot as string);
        server.notification({
          method: "notifications/resources/list_changed",
        });

        return {
          toolResult: {
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
          },
        };
      } catch (error) {
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Screenshot failed: ${(error as Error).message}`,
            }],
            isError: true,
          },
        };
      }
    }

    case "puppeteer_click":
      try {
        const element = await withTimeout(
          page.waitForSelector(args.selector, { timeout: 5000 })
        );
        if (!element) {
          throw new Error(`Element not found: ${args.selector}`);
        }
        await element.click();
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Clicked: ${args.selector}`,
            }],
            isError: false,
          },
        };
      } catch (error) {
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Failed to click ${args.selector}: ${(error as Error).message}`,
            }],
            isError: true,
          },
        };
      }

    case "puppeteer_fill":
      try {
        const element = await withTimeout(
          page.waitForSelector(args.selector, { timeout: 5000 })
        );
        if (!element) {
          throw new Error(`Element not found: ${args.selector}`);
        }
        await element.type(args.value);
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Filled ${args.selector} with: ${args.value}`,
            }],
            isError: false,
          },
        };
      } catch (error) {
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Failed to fill ${args.selector}: ${(error as Error).message}`,
            }],
            isError: true,
          },
        };
      }

    case "puppeteer_select":
      try {
        const element = await withTimeout(
          page.waitForSelector(args.selector, { timeout: 5000 })
        );
        if (!element) {
          throw new Error(`Element not found: ${args.selector}`);
        }
        await page.select(args.selector, args.value);
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Selected ${args.selector} with: ${args.value}`,
            }],
            isError: false,
          },
        };
      } catch (error) {
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Failed to select ${args.selector}: ${(error as Error).message}`,
            }],
            isError: true,
          },
        };
      }

    case "puppeteer_hover":
      try {
        const element = await withTimeout(
          page.waitForSelector(args.selector, { timeout: 5000 })
        );
        if (!element) {
          throw new Error(`Element not found: ${args.selector}`);
        }
        await element.hover();
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Hovered ${args.selector}`,
            }],
            isError: false,
          },
        };
      } catch (error) {
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Failed to hover ${args.selector}: ${(error as Error).message}`,
            }],
            isError: true,
          },
        };
      }

    case "puppeteer_evaluate":
      try {
        const result = await withTimeout(
          page.evaluate((script) => {
            const logs: string[] = [];
            const originalConsole = { ...console };

            ['log', 'info', 'warn', 'error'].forEach(method => {
              (console as any)[method] = (...args: any[]) => {
                logs.push(`[${method}] ${args.join(' ')}`);
                (originalConsole as any)[method](...args);
              };
            });

            try {
              const result = eval(script);
              Object.assign(console, originalConsole);
              return { result, logs };
            } catch (error) {
              Object.assign(console, originalConsole);
              throw error;
            }
          }, args.script)
        );

        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Execution result:\n${JSON.stringify(result.result, null, 2)}\n\nConsole output:\n${result.logs.join('\n')}`,
              },
            ],
            isError: false,
          },
        };
      } catch (error) {
        return {
          toolResult: {
            content: [{
              type: "text",
              text: `Script execution failed: ${(error as Error).message}`,
            }],
            isError: true,
          },
        };
      }

    default:
      return {
        toolResult: {
          content: [{
            type: "text",
            text: `Unknown tool: ${name}`,
          }],
          isError: true,
        },
      };
  }
}

const server = new Server(
  {
    name: "example-servers/puppeteer",
    version: "0.5.2",
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
}));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

// Add signal handlers for cleanup
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Add global error handler
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
