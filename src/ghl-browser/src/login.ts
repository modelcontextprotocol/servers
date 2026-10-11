import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STATE_DIR = join(ROOT, "browser-state");

async function main() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const storageFile = join(STATE_DIR, "storage-state.json");

  console.log("[ghl-browser-login] Launching Chromium (headed) — please log in to GHL manually.");
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await page.goto("https://app.leadconnectorhq.com/");

  console.log("[ghl-browser-login] Waiting for login to complete (any authenticated page)...");
  console.log(
    "[ghl-browser-login] IMPORTANT: complete the FULL login in the browser window (password + any 2FA/verification step)."
  );
  console.log(
    "[ghl-browser-login] When you can see your GHL dashboard, come back to THIS terminal and press ENTER."
  );
  await new Promise<void>((res) => {
    process.stdin.once("data", () => res());
  });

  // sanity check: make sure we're not on a login/2FA page anymore
  const finalUrl = page.url();
  const stillLogin = await page
    .evaluate(
      () =>
        /\/(login|sign-in|signin)|oauth2|two-factor|2fa|verify/i.test(location.href) ||
        !!document.querySelector("input[type=password]")
    )
    .catch(() => false);
  if (stillLogin) {
    console.error(
      `[ghl-browser-login] Browser still shows a login/2FA page (${finalUrl}). Finish logging in, then run this script again.`
    );
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: storageFile });
  console.log(`[ghl-browser-login] Saved auth state to ${storageFile}`);
  console.log("[ghl-browser-login] Closing browser. You can now run the MCP server.");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
