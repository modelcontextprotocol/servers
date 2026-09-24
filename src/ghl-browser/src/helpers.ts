import type { Page } from "playwright";
import { screenshotError, waitForAppReady } from "./browser.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
    [k: string]: unknown;
  };
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export interface ToolModule {
  tools: ToolDef[];
  handlers: Record<string, ToolHandler>;
}

export async function safeClick(page: Page, selector: string, timeout = 10_000): Promise<void> {
  await page.locator(selector).first().click({ timeout });
}

export async function safeFill(page: Page, selector: string, value: string, timeout = 10_000): Promise<void> {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout });
  await loc.fill(value);
}

export async function safeGetText(page: Page, selector: string): Promise<string> {
  try {
    return (await page.locator(selector).first().innerText()).trim();
  } catch {
    return "";
  }
}

export async function waitForUrl(page: Page, pattern: RegExp | string, timeout = 30_000): Promise<void> {
  await page.waitForURL(pattern, { timeout });
  await waitForAppReady(page);
}

export async function withPageError<T>(page: Page, label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const shot = await screenshotError(page, label);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} failed: ${msg} (screenshot: ${shot})`);
  }
}

export function asString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

export function asNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
