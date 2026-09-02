import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const documentsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_documents",
      description: "List documents (contracts, agreements, forms) with name, status, and recipient.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_create_document",
      description: "Create a new document with title and optional template.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          templateName: { type: "string", description: "Use an existing template by name" },
          contactName: { type: "string", description: "Assign document to a contact" },
        },
        required: ["title"],
      },
    },
    {
      name: "ghl_browser_get_document_details",
      description: "Open a document and return its content, fields, signatures, and status.",
      inputSchema: {
        type: "object",
        properties: { documentName: { type: "string" } },
        required: ["documentName"],
      },
    },
    {
      name: "ghl_browser_send_document_signature",
      description: "Send a document to a contact for e-signature.",
      inputSchema: {
        type: "object",
        properties: {
          documentName: { type: "string" },
          contactName: { type: "string" },
          message: { type: "string" },
        },
        required: ["documentName", "contactName"],
      },
    },
    {
      name: "ghl_browser_delete_document",
      description: "Delete a document.",
      inputSchema: {
        type: "object",
        properties: {
          documentName: { type: "string" },
          confirm: { type: "boolean" },
        },
        required: ["documentName", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_documents: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "documents-list", async () => {
          await gotoGhl(page, "/documents");
          await waitForAppReady(page);
          const rows = await page.evaluate(() => {
            const items: Array<{ name: string; status: string; recipient: string; date: string }> = [];
            document.querySelectorAll('tr, [class*="document"], [class*="row"], [role="row"]').forEach((el) => {
              const nameEl = el.querySelector('a, h4, [class*="name"], td:first-child');
              const statusEl = el.querySelector('[class*="status"], [class*="badge"]');
              const recipientEl = el.querySelector('[class*="recipient"], [class*="contact"]');
              const dateEl = el.querySelector('[class*="date"], time, td:last-child');
              if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 2) {
                items.push({
                  name: nameEl.textContent?.trim() ?? "",
                  status: statusEl?.textContent?.trim() || "",
                  recipient: recipientEl?.textContent?.trim() || "",
                  date: dateEl?.textContent?.trim() || "",
                });
              }
            });
            return items;
          });
          return { count: rows.length, rows };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_document: async (args) => {
      const title = String(args.title);
      const templateName = (args.templateName as string) || "";
      const contactName = (args.contactName as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "documents-create", async () => {
          await gotoGhl(page, "/documents");
          await waitForAppReady(page);
          await page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")').first().click();
          await waitForAppReady(page);
          if (templateName) {
            try {
              await page.locator(`[class*="template"]:has-text("${templateName}"), [role="option"]:has-text("${templateName}")`).first().click({ timeout: 3000 });
            } catch { /* template may not exist */ }
          }
          await page.locator('input[name="title"], input[placeholder*="Title"], input[name="name"]').first().fill(title);
          if (contactName) {
            try {
              const contactInput = page.locator('input[placeholder*="contact" i], input[name*="contact"]').first();
              await contactInput.fill(contactName);
              await page.waitForTimeout(500);
              await page.locator(`[role="option"]:has-text("${contactName}")`).first().click();
            } catch { /* optional */ }
          }
          await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
          await waitForAppReady(page);
          return { title, templateName: templateName || null, contactName: contactName || null, created: true, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_document_details: async (args) => {
      const documentName = String(args.documentName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "documents-detail", async () => {
          await gotoGhl(page, "/documents");
          await waitForAppReady(page);
          await page.locator(`a:has-text("${documentName}"), [class*="name"]:has-text("${documentName}")`).first().click();
          await waitForAppReady(page);
          const details = await page.evaluate(() => {
            const fields: Record<string, string> = {};
            document.querySelectorAll('[class*="field"], label, dt').forEach((el) => {
              const label = el.textContent?.trim() || "";
              const valueEl = el.parentElement?.querySelector('[class*="value"], dd, span');
              if (label && valueEl) fields[label] = valueEl.textContent?.trim() || "";
            });
            return {
              status: document.querySelector('[class*="status"]')?.textContent?.trim() || "",
              signatures: Array.from(document.querySelectorAll('[class*="signature"]')).map((s) => s.textContent?.trim() || ""),
              fields,
            };
          });
          return { documentName, ...details, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_send_document_signature: async (args) => {
      const documentName = String(args.documentName);
      const contactName = String(args.contactName);
      const message = (args.message as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "documents-send", async () => {
          await gotoGhl(page, "/documents");
          await waitForAppReady(page);
          await page.locator(`a:has-text("${documentName}"), [class*="name"]:has-text("${documentName}")`).first().click();
          await waitForAppReady(page);
          await page.locator('button:has-text("Send"), button:has-text("Request Signature")').first().click();
          await waitForAppReady(page);
          const contactInput = page.locator('input[placeholder*="contact" i], input[name*="recipient"]').first();
          await contactInput.fill(contactName);
          await page.waitForTimeout(500);
          await page.locator(`[role="option"]:has-text("${contactName}")`).first().click();
          if (message) {
            await page.locator('textarea, [contenteditable="true"]').first().fill(message);
          }
          await page.locator('button:has-text("Send"), button:has-text("Confirm")').first().click();
          await waitForAppReady(page);
          return { documentName, contactName, sent: true, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_document: async (args) => {
      const documentName = String(args.documentName);
      if (!args.confirm) throw new Error("confirm: true is required to delete a document");
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "documents-delete", async () => {
          await gotoGhl(page, "/documents");
          await waitForAppReady(page);
          const row = page.locator(`[class*="row"]:has-text("${documentName}"), tr:has-text("${documentName}")`).first();
          await row.locator('button:has-text("Delete"), [aria-label*="delete"], [class*="delete"]').first().click();
          await page.locator('button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Yes")').first().click();
          await waitForAppReady(page);
          return { documentName, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
