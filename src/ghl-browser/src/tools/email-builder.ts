import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError, asString } from "../helpers.js";

export const emailBuilderModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_email_templates",
      description:
        "List email templates available in the GHL Email Builder. " +
        "Returns template name, type (builder/html/imported), and last updated date.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional search term to filter by name" },
        },
      },
    },
    {
      name: "ghl_browser_create_email_template",
      description:
        "Create a new email template in the GHL Email Builder. " +
        "Supports starting from blank, HTML paste, or a template library template.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name" },
          type: {
            type: "string",
            description: "'builder' (drag-drop, default), 'html' (paste raw HTML), or 'blank'",
          },
          html: { type: "string", description: "Raw HTML content (only used when type='html')" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_edit_email_template",
      description:
        "Open an email template in the builder and update its subject line, preheader, " +
        "and/or body HTML. Saves the changes.",
      inputSchema: {
        type: "object",
        properties: {
          templateName: { type: "string", description: "Template name to edit" },
          templateId: { type: "string", description: "Template ID (preferred)" },
          subject: { type: "string", description: "New subject line" },
          preheader: { type: "string", description: "Preheader text" },
          bodyHtml: { type: "string", description: "Replace the body HTML" },
        },
      },
    },
    {
      name: "ghl_browser_get_email_preview",
      description:
        "Open an email template and capture a screenshot of its rendered preview. " +
        "Returns the screenshot path and any preview URL.",
      inputSchema: {
        type: "object",
        properties: {
          templateName: { type: "string" },
          templateId: { type: "string", description: "Template ID (preferred)" },
          device: {
            type: "string",
            description: "'desktop' (default) or 'mobile'",
          },
        },
      },
    },
    {
      name: "ghl_browser_send_test_email",
      description:
        "Send a test email for a template to one or more addresses. " +
        "Useful for verifying rendering before sending to contacts.",
      inputSchema: {
        type: "object",
        properties: {
          templateName: { type: "string" },
          templateId: { type: "string", description: "Template ID (preferred)" },
          to: {
            type: "array",
            items: { type: "string" },
            description: "Email addresses to send the test to",
          },
        },
        required: ["to"],
      },
    },
    {
      name: "ghl_browser_delete_email_template",
      description:
        "Delete an email template. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          templateName: { type: "string" },
          templateId: { type: "string" },
          confirm: { type: "boolean", description: "Must be true to proceed" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_email_templates: async (args) => {
      const search = asString(args.search);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "email-list", async () => {
          await gotoGhl(page, "/emails/builder");
          await waitForAppReady(page);

          if (search) {
            const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
            try {
              await searchInput.fill(search, { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // search not available
            }
          }

          const rows = await page.evaluate(() => {
            const items: Array<{ name: string; type: string; updatedAt: string; href: string }> = [];
            const selectors = [
              "tr[data-row-key]",
              '[class*="TemplateRow"]',
              '[class*="template-card"]',
              '[class*="TemplateCard"]',
              '[class*="email-item"]',
              'a[href*="/email/"]',
              '[data-testid*="template"]',
            ];
            for (const sel of selectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const anchor = el.closest("a") || el.querySelector("a");
                const nameEl = el.querySelector("h3, h4, [class*='name'], [class*='Name'], td:first-child");
                const typeEl = el.querySelector("[class*='type'], [class*='Type'], [class*='badge']");
                const dateEl = el.querySelector("time, [class*='date'], [class*='Date'], [class*='updated']");
                const href = anchor?.getAttribute("href") || "";
                items.push({
                  name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                  type: typeEl?.textContent?.trim() || "",
                  updatedAt: dateEl?.textContent?.trim() || dateEl?.getAttribute("datetime") || "",
                  href,
                });
              });
            }
            return items;
          });

          const deduped = Array.from(new Map(rows.map((r) => [r.name + r.href, r])).values());
          return { count: deduped.length, templates: deduped };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_email_template: async (args) => {
      const name = asString(args.name);
      const type = asString(args.type) || "builder";
      const html = asString(args.html);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "email-create", async () => {
          await gotoGhl(page, "/emails/builder");
          await waitForAppReady(page);

          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add Template")')
            .first();
          await createBtn.click();
          await page.waitForTimeout(800);

          if (type === "html") {
            const htmlOption = page.locator('button:has-text("HTML"), [data-type="html"]').first();
            try {
              await htmlOption.click({ timeout: 3000 });
              await page.waitForTimeout(500);
            } catch {
              // html option may not be a separate step
            }
          } else if (type === "blank") {
            const blankOption = page.locator('button:has-text("Blank"), [data-type="blank"]').first();
            try {
              await blankOption.click({ timeout: 3000 });
              await page.waitForTimeout(500);
            } catch {
              // fallback
            }
          }

          const nameInput = page
            .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="name"], input[type="text"]')
            .first();
          await nameInput.fill(name);

          if (type === "html" && html) {
            const htmlInput = page.locator("textarea, [class*='editor'], [class*='html-editor']").first();
            try {
              await htmlInput.fill(html, { timeout: 5000 });
            } catch {
              // HTML editor may use a different input
            }
          }

          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Next")')
            .first();
          await saveBtn.click();
          await waitForAppReady(page);

          return { name, type, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_edit_email_template: async (args) => {
      const name = asString(args.templateName);
      const id = asString(args.templateId);
      const subject = asString(args.subject);
      const preheader = asString(args.preheader);
      const bodyHtml = asString(args.bodyHtml);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "email-edit", async () => {
          if (id) {
            await gotoGhl(page, `/emails/builder/${id}`);
          } else if (name) {
            await gotoGhl(page, "/emails/builder");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`).first().click();
          } else {
            throw new Error("templateName or templateId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          if (subject) {
            const subjectInput = page
              .locator('input[name="subject"], input[placeholder*="Subject"], [class*="subject"] input')
              .first();
            try {
              await subjectInput.fill(subject, { timeout: 5000 });
            } catch {
              // subject may be in a settings panel
              const settingsBtn = page.locator('button:has-text("Settings"), [class*="settings"]').first();
              try {
                await settingsBtn.click({ timeout: 3000 });
                await page.waitForTimeout(500);
                await page.locator('input[name="subject"], input[placeholder*="Subject"]').first().fill(subject, { timeout: 3000 });
              } catch {
                // skip
              }
            }
          }

          if (preheader) {
            const preheaderInput = page
              .locator('input[name="preheader"], input[placeholder*="Preheader"], [class*="preheader"] input')
              .first();
            try {
              await preheaderInput.fill(preheader, { timeout: 5000 });
            } catch {
              // preheader may not be available in all builders
            }
          }

          if (bodyHtml) {
            const htmlToggle = page.locator('button:has-text("HTML"), button:has-text("Source"), [class*="html-toggle"]').first();
            try {
              await htmlToggle.click({ timeout: 3000 });
              await page.waitForTimeout(500);
              const htmlEditor = page.locator("textarea, [class*='html-editor'], .CodeMirror").first();
              await htmlEditor.fill(bodyHtml, { timeout: 5000 });
            } catch {
              // HTML editing not available in this builder mode
            }
          }

          const saveBtn = page.locator('button:has-text("Save")').first();
          await saveBtn.click();
          await page.waitForTimeout(1500);

          return { templateName: name, templateId: id, subject: subject || null, preheader: preheader || null, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_email_preview: async (args) => {
      const name = asString(args.templateName);
      const id = asString(args.templateId);
      const device = asString(args.device) || "desktop";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "email-preview", async () => {
          if (id) {
            await gotoGhl(page, `/emails/builder/${id}`);
          } else if (name) {
            await gotoGhl(page, "/emails/builder");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("templateName or templateId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          if (device === "mobile") {
            const mobileBtn = page.locator('button:has-text("Mobile"), [data-device="mobile"], [class*="mobile-toggle"]').first();
            try {
              await mobileBtn.click({ timeout: 3000 });
              await page.waitForTimeout(500);
            } catch {
              // mobile toggle not available
            }
          }

          const previewBtn = page.locator('button:has-text("Preview"), [class*="preview"]').first();
          try {
            await previewBtn.click({ timeout: 5000 });
            await page.waitForTimeout(1500);
          } catch {
            // preview may already be visible
          }

          const shotPath = `./screenshots/email-preview-${id || name}-${device}-${Date.now()}.png`;
          await page.screenshot({ path: shotPath, fullPage: false });

          return { templateName: name, templateId: id, device, screenshot: shotPath, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_send_test_email: async (args) => {
      const name = asString(args.templateName);
      const id = asString(args.templateId);
      const to = args.to as string[];
      if (!to || to.length === 0) throw new Error("At least one 'to' address is required");
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "email-send-test", async () => {
          if (id) {
            await gotoGhl(page, `/emails/builder/${id}`);
          } else if (name) {
            await gotoGhl(page, "/emails/builder");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("templateName or templateId is required");
          }
          await waitForAppReady(page);

          const testBtn = page
            .locator('button:has-text("Send Test"), button:has-text("Test Email"), button:has-text("Preview & Test")')
            .first();
          await testBtn.click({ timeout: 10000 });
          await page.waitForTimeout(1000);

          const emailInput = page
            .locator('input[type="email"], input[placeholder*="email"], input[name="email"]')
            .first();
          await emailInput.fill(to.join(", "));

          const sendBtn = page.locator('button:has-text("Send"), button:has-text("Submit")').first();
          await sendBtn.click();
          await page.waitForTimeout(2000);

          return { templateName: name, templateId: id, to, sent: true, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_email_template: async (args) => {
      const name = asString(args.templateName);
      const id = asString(args.templateId);
      const confirm = Boolean(args.confirm);
      if (!confirm) throw new Error("confirm must be true to delete a template");
      if (!name && !id) throw new Error("templateName or templateId is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "email-delete", async () => {
          await gotoGhl(page, "/emails/builder");
          await waitForAppReady(page);

          const rowSelector = id
            ? `tr[data-row-key="${id}"], [data-id="${id}"]`
            : `[class*="row"]:has-text("${name}"), tr:has-text("${name}")`;

          const row = page.locator(rowSelector).first();
          const menuBtn = row
            .locator('button:has-text("⋮"), button:has-text("⋯"), [class*="menu"], [class*="actions"] button')
            .first();
          await menuBtn.click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const deleteOption = page.locator('text="Delete", text="delete", [class*="delete"]').first();
          await deleteOption.click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")').first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);

          return { templateName: name, templateId: id, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
