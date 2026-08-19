import { openPage, gotoGhl, waitForAppReady, isAuthenticated, clearState, screenshotError } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SCREENSHOTS_DIR = join(ROOT, "screenshots");

export const utilsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_screenshot",
      description:
        "Navigate to any GHL path and capture a screenshot. Useful for visual debugging of UI state.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "GHL path (e.g. /dashboard) or absolute URL" },
          fullPage: { type: "boolean" },
        },
      },
    },
    {
      name: "ghl_browser_session_check",
      description:
        "Check whether the stored browser session is still authenticated against GHL.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_logout",
      description:
        "Clear the stored browser state so the next run requires a fresh login.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_evaluate",
      description:
        "Navigate to a GHL path and run arbitrary JavaScript in the page context. Returns the JSON-serializable result.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          script: { type: "string", description: "JS expression or function body (must return JSON-serializable value)" },
        },
        required: ["script"],
      },
    },
  ],
  handlers: {
    ghl_browser_screenshot: async (args) => {
      const path = (args.path as string | undefined) || "/dashboard";
      const fullPage = Boolean(args.fullPage);
      const { page, close } = await openPage();
      try {
        if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        const file = join(SCREENSHOTS_DIR, `manual-${Date.now()}.png`);
        await gotoGhl(page, path);
        await page.screenshot({ path: file, fullPage });
        return { path, url: page.url(), screenshot: file, fullPage };
      } catch (err) {
        const shot = await screenshotError(page, "screenshot-fail");
        return {
          error: err instanceof Error ? err.message : String(err),
          fallbackScreenshot: shot,
        };
      } finally {
        await close();
      }
    },

    ghl_browser_session_check: async () => {
      const ok = await isAuthenticated();
      return { authenticated: ok };
    },

    ghl_browser_logout: async () => {
      const removed = await clearState();
      return { clearedState: removed, message: "Re-run `npm run login` to establish a new session." };
    },

    ghl_browser_evaluate: async (args) => {
      const path = (args.path as string | undefined) || "/dashboard";
      const script = String(args.script);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "evaluate", async () => {
          await gotoGhl(page, path);
          // Trust boundary: this MCP server runs locally for the owning user
          // only; the browser session is the user's own GHL session, and
          // arbitrary JS execution is the explicit purpose of this tool.
          // No untrusted input reaches `script` beyond the caller's own prompt.
          const fn = new Function(`return (async () => { ${script} })()`);
          const result = await page.evaluate(fn as unknown as () => unknown);
          return { path, url: page.url(), result };
        });
      } finally {
        await close();
      }
    },
  },
};
