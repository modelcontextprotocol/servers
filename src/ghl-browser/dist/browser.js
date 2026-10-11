import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STATE_DIR = join(ROOT, "browser-state");
const SCREENSHOTS_DIR = join(ROOT, "screenshots");
let browser = null;
let context = null;
let initPromise = null;
export async function ensureBrowser() {
    if (context && !context.pages()[0]?.isClosed())
        return context;
    if (initPromise)
        return initPromise;
    initPromise = (async () => {
        if (!existsSync(STATE_DIR))
            mkdirSync(STATE_DIR, { recursive: true });
        if (!existsSync(SCREENSHOTS_DIR))
            mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        const headless = (process.env.GHL_BROWSER_HEADLESS ?? "true") !== "false";
        const slowMo = Number(process.env.GHL_SLOW_MO ?? 0);
        browser = await chromium.launch({
            headless,
            slowMo,
            args: ["--disable-blink-features=AutomationControlled"],
        });
        const stateFile = storageStatePath();
        context = await browser.newContext({
            ...(existsSync(stateFile) ? { storageState: stateFile } : {}),
            viewport: { width: 1440, height: 900 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        });
        context.setDefaultTimeout(30_000);
        context.setDefaultNavigationTimeout(60_000);
        return context;
    })();
    return initPromise;
}
export async function openPage() {
    const ctx = await ensureBrowser();
    const page = await ctx.newPage();
    return {
        page,
        close: async () => {
            try {
                await page.close();
            }
            catch {
                // ignore
            }
        },
    };
}
export function isLoginUrl(url) {
    const u = url.toLowerCase();
    return (u.includes("/login") ||
        u.includes("/auth/") ||
        u.includes("/sign-in") ||
        u.includes("/signin") ||
        u.includes("oauth2") ||
        u.includes("accounts.google.com") ||
        /[?&]redirect=/i.test(u));
}
export async function gotoGhl(page, path) {
    const base = process.env.GHL_APP_URL || "https://app.leadconnectorhq.com";
    const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    const attempts = 3;
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await waitForAppReady(page);
            const finalUrl = page.url();
            if (isLoginUrl(finalUrl)) {
                throw new Error("GHL session expired or not logged in. Run `npm run login` to refresh the stored browser state.");
            }
            return;
        }
        catch (err) {
            lastErr = err;
            const errMsg = (err && typeof err === "object" && "message" in err && typeof err.message === "string")
                ? err.message
                : String(err);
            if (errMsg.includes("session expired"))
                throw err;
            if (i < attempts - 1)
                await page.waitForTimeout(1000);
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
export async function isAuthenticated() {
    const { page, close } = await openPage();
    try {
        const base = process.env.GHL_APP_URL || "https://app.leadconnectorhq.com";
        await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded" });
        await waitForAppReady(page);
        return !isLoginUrl(page.url());
    }
    catch {
        return false;
    }
    finally {
        await close();
    }
}
export async function clearState() {
    try {
        await context?.close();
    }
    catch {
        // ignore
    }
    try {
        await browser?.close();
    }
    catch {
        // ignore
    }
    context = null;
    browser = null;
    initPromise = null;
    const stateFile = storageStatePath();
    if (existsSync(stateFile)) {
        const { unlinkSync } = await import("node:fs");
        try {
            unlinkSync(stateFile);
            return stateFile;
        }
        catch {
            // ignore
        }
    }
    return "(no state file)";
}
export async function waitForAppReady(page) {
    try {
        await page.waitForLoadState("networkidle", { timeout: 30_000 });
    }
    catch {
        // networkidle often times out on SPAs; fall through
    }
    await page.waitForTimeout(500);
}
export async function screenshotError(page, label) {
    if (!existsSync(SCREENSHOTS_DIR))
        mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const file = join(SCREENSHOTS_DIR, `${label}-${Date.now()}.png`);
    try {
        await page.screenshot({ path: file, fullPage: false });
    }
    catch {
        // ignore screenshot failure
    }
    return file;
}
export function storageStatePath() {
    return join(STATE_DIR, "storage-state.json");
}
export async function shutdown() {
    try {
        await context?.close();
    }
    catch {
        // ignore
    }
    try {
        await browser?.close();
    }
    catch {
        // ignore
    }
    context = null;
    browser = null;
    initPromise = null;
}
