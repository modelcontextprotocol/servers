// Quick exploration of the GHL form builder UI structure
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);
const STATE_FILE = resolve(ROOT, "browser-state", "storage-state.json");
const BASE = process.env.GHL_APP_URL || "https://app.leadconnectorhq.com";

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
  const context = await browser.newContext({
    storageState: existsSync(STATE_FILE) ? STATE_FILE : undefined,
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // 1. Go to forms/surveys index page
  console.log("=== Navigating to /sites/forms ===");
  await page.goto(`${BASE}/sites/forms`, { waitUntil: "domcontentloaded" });
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(2000);

  const formListUrl = page.url();
  console.log("Current URL:", formListUrl);

  // 2. Extract the form list structure
  const formList = await page.evaluate(() => {
    const items = [];
    // Look for form rows/cards
    const selectors = [
      '[data-testid*="form"]', '[class*="FormRow"]', '[class*="form-card"]',
      '[class*="FormCard"]', '[class*="form-item"]', 'a[href*="/form/"]',
      'a[href*="forms/"]', '[class*="ListRow"]', 'tr[data-row-key]',
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const a = el.closest("a");
        items.push({
          selector: sel,
          tag: el.tagName,
          text: el.textContent?.slice(0, 150).trim(),
          href: a?.href || "",
          classes: el.className?.toString().slice(0, 200),
          dataAttrs: Array.from(el.attributes || []).filter(a => a.name.startsWith("data-")).map(a => `${a.name}=${a.value}`),
        });
      });
    }
    return items;
  });
  console.log(`Form list items found: ${formList.length}`);
  for (const f of formList.slice(0, 10)) {
    console.log(`  ${f.selector}: ${f.text?.slice(0, 80)} href=${f.href.slice(0, 80)}`);
  }

  // 3. Look at overall page structure
  const pageStructure = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4")).map(el => ({
      tag: el.tagName, text: el.textContent?.trim().slice(0, 80),
    }));
    const buttons = Array.from(document.querySelectorAll("button")).slice(0, 30).map(el => ({
      text: el.textContent?.trim().slice(0, 60),
      classes: el.className?.toString().slice(0, 100),
      disabled: el.disabled,
    }));
    const links = Array.from(document.querySelectorAll("a[href]")).filter(a => a.href.includes("form")).slice(0, 15).map(el => ({
      href: el.href,
      text: el.textContent?.trim().slice(0, 60),
    }));
    return { headings, buttons, links };
  });
  console.log("\n=== Page Structure ===");
  console.log("Headings:", JSON.stringify(pageStructure.headings, null, 2));
  console.log("Buttons:", JSON.stringify(pageStructure.buttons, null, 2));
  console.log("Form links:", JSON.stringify(pageStructure.links, null, 2));

  // 4. Try to find and click on a form to open the builder
  const firstFormLink = pageStructure.links.find(l => l.href.includes("/form/") || l.href.includes("edit"));
  if (firstFormLink) {
    console.log(`\n=== Opening form: ${firstFormLink.href} ===`);
    await page.goto(firstFormLink.href, { waitUntil: "domcontentloaded" });
    try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
    await page.waitForTimeout(3000);
    console.log("Builder URL:", page.url());

    // Examine the builder structure
    const builderStructure = await page.evaluate(() => {
      const fields = [];
      // Look for form field elements in the builder
      const fieldSelectors = [
        '[data-testid*="field"]', '[class*="FormField"]', '[class*="form-field"]',
        '[class*="FieldItem"]', '[class*="field-item"]', '[draggable="true"]',
        '[class*="BuilderField"]', '[class*="DragItem"]',
      ];
      for (const sel of fieldSelectors) {
        document.querySelectorAll(sel).forEach(el => {
          fields.push({
            selector: sel,
            text: el.textContent?.slice(0, 100).trim(),
            classes: el.className?.toString().slice(0, 200),
            draggable: el.getAttribute("draggable"),
          });
        });
      }

      // Toolbar/sidebar items (field palette)
      const toolbarItems = [];
      document.querySelectorAll('[class*="palette"], [class*="sidebar"], [class*="Toolbar"], [class*="field-list"] button, [class*="FieldList"] [class*="item"]').forEach(el => {
        toolbarItems.push({
          text: el.textContent?.slice(0, 60).trim(),
          classes: el.className?.toString().slice(0, 100),
        });
      });

      // Buttons in builder
      const buttons = Array.from(document.querySelectorAll("button")).slice(0, 25).map(el => ({
        text: el.textContent?.trim().slice(0, 60),
        classes: el.className?.toString().slice(0, 100),
      }));

      return { fields, toolbarItems, buttons };
    });
    console.log("Builder fields:", JSON.stringify(builderStructure.fields.slice(0, 10), null, 2));
    console.log("Toolbar items:", JSON.stringify(builderStructure.toolbarItems.slice(0, 10), null, 2));
    console.log("Builder buttons:", JSON.stringify(builderStructure.buttons, null, 2));
  } else {
    console.log("\nNo form links found. Trying create button...");
    const createBtn = pageStructure.buttons.find(b => b.text?.toLowerCase().includes("create") || b.text?.toLowerCase().includes("new"));
    console.log("Create button:", createBtn);
  }

  // 5. Also check the surveys path
  console.log("\n=== Navigating to /surveys ===");
  await page.goto(`${BASE}/surveys`, { waitUntil: "domcontentloaded" });
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(2000);
  console.log("Survey URL:", page.url());

  const surveyStructure = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4")).map(el => ({
      tag: el.tagName, text: el.textContent?.trim().slice(0, 80),
    }));
    const links = Array.from(document.querySelectorAll("a[href]")).filter(a => a.href.includes("survey")).slice(0, 10).map(el => ({
      href: el.href,
      text: el.textContent?.trim().slice(0, 60),
    }));
    return { headings, links };
  });
  console.log("Survey headings:", JSON.stringify(surveyStructure.headings, null, 2));
  console.log("Survey links:", JSON.stringify(surveyStructure.links, null, 2));

  await browser.close();
})();
