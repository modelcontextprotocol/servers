// Quick exploration of the GHL form builder UI structure — v2 with better waits
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);
const STATE_FILE = resolve(ROOT, "browser-state", "storage-state.json");
const SCREENSHOTS = resolve(ROOT, "screenshots");
const BASE = process.env.GHL_APP_URL || "https://app.leadconnectorhq.com";

if (!existsSync(SCREENSHOTS)) mkdirSync(SCREENSHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
  const context = await browser.newContext({
    storageState: existsSync(STATE_FILE) ? STATE_FILE : undefined,
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Try multiple possible form paths
  const paths = ["/sites/forms", "/funnels/forms", "/marketing/forms", "/forms"];
  for (const p of paths) {
    console.log(`\n=== Trying ${p} ===`);
    try {
      await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch { continue; }
    try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
    await page.waitForTimeout(5000); // longer settle for Vue hydration

    const url = page.url();
    console.log("URL:", url);

    // Check if redirected to login
    if (url.includes("/login") || url.includes("/auth")) {
      console.log("REDIRECTED TO LOGIN — session expired");
      break;
    }

    // Take screenshot
    const shotFile = join(SCREENSHOTS, `forms-explore-${p.replace(/\//g, "_")}.png`);
    await page.screenshot({ path: shotFile, fullPage: false });
    console.log("Screenshot:", shotFile);

    // Get full body text to understand what rendered
    const bodyInfo = await page.evaluate(() => {
      const body = document.body;
      const text = body.innerText?.slice(0, 2000);
      const childCount = body.children.length;
      const divsWithContent = Array.from(body.querySelectorAll("div")).filter(d => d.children.length > 2).length;
      const allLinks = Array.from(document.querySelectorAll("a[href]")).map(a => a.href).filter(h => !h.includes("javascript")).slice(0, 20);
      return { text, childCount, divsWithContent, allLinks };
    });
    console.log("Body text preview:", bodyInfo.text?.slice(0, 300));
    console.log("Children:", bodyInfo.childCount, "divs with >2 children:", bodyInfo.divsWithContent);
    console.log("Links:", bodyInfo.allLinks);

    // If we found content, stop
    if (bodyInfo.divsWithContent > 3) break;
  }

  // Also try the direct form list path from the federated app
  console.log("\n=== Checking /sites for form-related navigation ===");
  await page.goto(`${BASE}/sites`, { waitUntil: "domcontentloaded", timeout: 15000 });
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(5000);

  const sitesInfo = await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('a, [role="menuitem"], [class*="nav"] a, [class*="sidebar"] a'))
      .map(el => ({ text: el.textContent?.trim().slice(0, 60), href: el.href || "" }))
      .filter(x => x.text && (x.text.toLowerCase().includes("form") || x.text.toLowerCase().includes("survey") || x.href.includes("form") || x.href.includes("survey")));
    const allNav = Array.from(document.querySelectorAll('a, [role="menuitem"]'))
      .map(el => ({ text: el.textContent?.trim().slice(0, 40), href: el.href || "" }))
      .filter(x => x.text)
      .slice(0, 40);
    return { formNavItems: navItems, allNav: allNav };
  });
  console.log("Form-related nav:", JSON.stringify(sitesInfo.formNavItems, null, 2));
  console.log("All nav (first 40):", JSON.stringify(sitesInfo.allNav, null, 2));

  await browser.close();
})();
