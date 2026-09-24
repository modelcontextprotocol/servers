import { screenshotError, waitForAppReady } from "./browser.js";
export async function safeClick(page, selector, timeout = 10_000) {
    await page.locator(selector).first().click({ timeout });
}
export async function safeFill(page, selector, value, timeout = 10_000) {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout });
    await loc.fill(value);
}
export async function safeGetText(page, selector) {
    try {
        return (await page.locator(selector).first().innerText()).trim();
    }
    catch {
        return "";
    }
}
export async function waitForUrl(page, pattern, timeout = 30_000) {
    await page.waitForURL(pattern, { timeout });
    await waitForAppReady(page);
}
export async function withPageError(page, label, fn) {
    try {
        return await fn();
    }
    catch (err) {
        const shot = await screenshotError(page, label);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${label} failed: ${msg} (screenshot: ${shot})`);
    }
}
export function asString(v) {
    if (v === undefined || v === null)
        return "";
    return String(v);
}
export function asNumber(v) {
    if (v === undefined || v === null || v === "")
        return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
