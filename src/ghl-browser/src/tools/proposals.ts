import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError, asString, asNumber } from "../helpers.js";

export const proposalsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_proposals",
      description:
        "List proposals and estimates with name, contact, amount, status (draft/sent/viewed/accepted/declined), " +
        "and last updated date.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status: 'all' (default), 'draft', 'sent', 'accepted', 'declined'",
          },
          search: {
            type: "string",
            description: "Optional search term to filter by name or contact",
          },
        },
      },
    },
    {
      name: "ghl_browser_create_proposal",
      description:
        "Create a new proposal or estimate. Returns the proposal name and URL after creation.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Proposal/estimate title" },
          contactName: { type: "string", description: "Contact or client name to assign" },
          templateName: { type: "string", description: "Optional template to use as starting point" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_proposal_details",
      description:
        "Open a proposal and return its full structure: title, description, sections, " +
        "line items (name, quantity, price), terms, and status.",
      inputSchema: {
        type: "object",
        properties: {
          proposalName: { type: "string", description: "Proposal name (used to find on index)" },
          proposalId: { type: "string", description: "Proposal ID (preferred if known)" },
        },
      },
    },
    {
      name: "ghl_browser_add_proposal_section",
      description:
        "Add a section or line item to a proposal. " +
        "Sections can be: heading, text_block, line_item, table, terms, signature, payment.",
      inputSchema: {
        type: "object",
        properties: {
          proposalName: { type: "string" },
          proposalId: { type: "string", description: "Proposal ID (preferred)" },
          sectionType: {
            type: "string",
            description: "Section type: 'heading', 'text_block', 'line_item', 'table', 'terms', 'signature', 'payment'",
          },
          title: { type: "string", description: "Section title or line item description" },
          amount: { type: "number", description: "Amount for line items" },
          quantity: { type: "number", description: "Quantity for line items (default 1)" },
        },
        required: ["sectionType"],
      },
    },
    {
      name: "ghl_browser_send_proposal",
      description:
        "Send a proposal to the assigned contact via email. Returns the send status.",
      inputSchema: {
        type: "object",
        properties: {
          proposalName: { type: "string" },
          proposalId: { type: "string", description: "Proposal ID (preferred)" },
          emailSubject: { type: "string", description: "Custom email subject line" },
          emailBody: { type: "string", description: "Custom email body message" },
        },
      },
    },
    {
      name: "ghl_browser_update_proposal_status",
      description:
        "Update the status of a proposal: mark as draft, sent, accepted, or declined.",
      inputSchema: {
        type: "object",
        properties: {
          proposalName: { type: "string" },
          proposalId: { type: "string", description: "Proposal ID (preferred)" },
          status: {
            type: "string",
            description: "New status: 'draft', 'sent', 'accepted', 'declined'",
          },
        },
        required: ["status"],
      },
    },
    {
      name: "ghl_browser_delete_proposal",
      description:
        "Delete a proposal or estimate. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          proposalName: { type: "string" },
          proposalId: { type: "string", description: "Proposal ID (preferred)" },
          confirm: { type: "boolean", description: "Must be true to proceed with deletion" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_proposals: async (args) => {
      const status = asString(args.status) || "all";
      const search = asString(args.search);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "proposals-list", async () => {
          await gotoGhl(page, "/proposals");
          await waitForAppReady(page);

          if (status !== "all") {
            const statusTab = page.locator(`button:has-text("${status}"), a:has-text("${status}"), [class*="tab"]:has-text("${status}")`).first();
            try {
              await statusTab.click({ timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // tab may not exist
            }
          }

          if (search) {
            const searchInput = page
              .locator('input[placeholder*="Search"], input[type="search"], input[name="search"]')
              .first();
            try {
              await searchInput.fill(search, { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // search not available
            }
          }

          const proposals = await page.evaluate(() => {
            const items: Array<{
              name: string;
              contact: string;
              amount: string;
              status: string;
              updated: string;
              href: string;
            }> = [];
            const rowSelectors = [
              "tr[data-row-key]",
              '[class*="ProposalRow"]',
              '[class*="proposal-row"]',
              '[class*="proposal-item"]',
              '[class*="ListRow"]',
              'a[href*="proposal"]',
            ];
            for (const sel of rowSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const anchor = el.closest("a") || el.querySelector("a");
                const cells = el.querySelectorAll("td, [class*='cell']");
                const nameEl = el.querySelector("[class*='name'], [class*='Name'], h4, td:first-child");
                const contactEl = cells[1] || el.querySelector("[class*='contact'], [class*='Contact']");
                const amountEl = cells[2] || el.querySelector("[class*='amount'], [class*='Amount']");
                const statusEl = el.querySelector("[class*='status'], [class*='Status'], [class*='badge']");
                const dateEl = cells[4] || el.querySelector("[class*='date'], [class*='Date'], [class*='updated']");
                const href = anchor?.getAttribute("href") || "";
                items.push({
                  name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                  contact: contactEl?.textContent?.trim() || "",
                  amount: amountEl?.textContent?.trim() || "",
                  status: statusEl?.textContent?.trim() || "",
                  updated: dateEl?.textContent?.trim() || "",
                  href,
                });
              });
            }
            return items;
          });

          const deduped = Array.from(new Map(proposals.map((r) => [r.name, r])).values());
          return { count: deduped.length, proposals: deduped };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_proposal: async (args) => {
      const name = asString(args.name);
      const contactName = asString(args.contactName);
      const templateName = asString(args.templateName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "proposals-create", async () => {
          await gotoGhl(page, "/proposals");
          await waitForAppReady(page);

          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add")')
            .first();
          await createBtn.click();
          await page.waitForTimeout(800);

          if (templateName) {
            const templateOption = page.locator(`[class*="template"]:has-text("${templateName}"), button:has-text("${templateName}")`).first();
            try {
              await templateOption.click({ timeout: 3000 });
              await page.waitForTimeout(500);
            } catch {
              // template selection is optional
            }
          }

          const nameInput = page
            .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="name"], input[placeholder*="Title"]')
            .first();
          await nameInput.fill(name);

          if (contactName) {
            const contactInput = page
              .locator('input[name="contact"], input[placeholder*="Contact"], input[placeholder*="contact"]')
              .first();
            try {
              await contactInput.fill(contactName, { timeout: 3000 });
              await page.waitForTimeout(500);
              await page.keyboard.press("Enter");
            } catch {
              // contact assignment is optional
            }
          }

          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Next")')
            .first();
          await saveBtn.click();
          await waitForAppReady(page);

          return { name, contact: contactName || null, template: templateName || null, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_proposal_details: async (args) => {
      const name = asString(args.proposalName);
      const id = asString(args.proposalId);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "proposals-details", async () => {
          if (id) {
            await gotoGhl(page, `/proposals/${id}`);
          } else if (name) {
            await gotoGhl(page, "/proposals");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`).first().click();
          } else {
            throw new Error("proposalName or proposalId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const details = await page.evaluate(() => {
            const sections: Array<{ type: string; title: string; content: string }> = [];
            const sectionSelectors = [
              '[class*="section"]',
              '[class*="Section"]',
              '[class*="block"]',
              '[class*="Block"]',
              '[data-section-type]',
            ];
            for (const sel of sectionSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const typeAttr = el.getAttribute("data-section-type") || "";
                const typeFromClass = el.className?.toString().match(/(?:section|block)-(\w+)/)?.[1] || "";
                const titleEl = el.querySelector("h1, h2, h3, h4, [class*='title']");
                sections.push({
                  type: typeAttr || typeFromClass || "",
                  title: titleEl?.textContent?.trim() || "",
                  content: el.textContent?.slice(0, 300).trim() || "",
                });
              });
            }

            const lineItems: Array<{ description: string; qty: string; price: string; total: string }> = [];
            const itemSelectors = [
              "tr[class*='item']",
              '[class*="LineItem"]',
              '[class*="line-item"]',
              '[class*="item-row"]',
            ];
            for (const sel of itemSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const cells = el.querySelectorAll("td, [class*='cell']");
                lineItems.push({
                  description: cells[0]?.textContent?.trim() || "",
                  qty: cells[1]?.textContent?.trim() || "",
                  price: cells[2]?.textContent?.trim() || "",
                  total: cells[3]?.textContent?.trim() || "",
                });
              });
            }

            return {
              title: document.querySelector("h1, [class*='title'], [class*='Title']")?.textContent?.trim() || "",
              status: document.querySelector("[class*='status'], [class*='Status'], [class*='badge']")?.textContent?.trim() || "",
              sections,
              lineItems,
              total: document.querySelector("[class*='total'], [class*='Total']")?.textContent?.trim() || "",
            };
          });

          return {
            proposalName: name || details.title,
            proposalId: id || null,
            status: details.status,
            total: details.total,
            sectionCount: details.sections.length,
            sections: details.sections,
            lineItems: details.lineItems,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_add_proposal_section: async (args) => {
      const name = asString(args.proposalName);
      const id = asString(args.proposalId);
      const sectionType = asString(args.sectionType);
      const title = asString(args.title);
      const amount = asNumber(args.amount);
      const quantity = asNumber(args.quantity) ?? 1;
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "proposals-add-section", async () => {
          if (id) {
            await gotoGhl(page, `/proposals/${id}`);
          } else if (name) {
            await gotoGhl(page, "/proposals");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("proposalName or proposalId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const addBtn = page
            .locator('button:has-text("Add"), button:has-text("+"), [class*="add-section"]')
            .first();
          try {
            await addBtn.click({ timeout: 5000 });
            await page.waitForTimeout(800);
          } catch {
            // add may be in toolbar
          }

          const sectionOption = page
            .locator(
              `button:has-text("${sectionType}"), ` +
                `[class*="option"]:has-text("${sectionType}"), ` +
                `[data-section-type="${sectionType}"]`,
            )
            .first();
          try {
            await sectionOption.click({ timeout: 5000 });
          } catch {
            throw new Error(`Could not find section type "${sectionType}" in the proposal builder`);
          }
          await page.waitForTimeout(1000);

          if (title) {
            const titleInput = page.locator('input[placeholder*="Title"], input[placeholder*="Description"], input[type="text"]:focus').first();
            try {
              await titleInput.fill(title, { timeout: 3000 });
            } catch {
              // title may be inline editable
            }
          }

          if (amount !== undefined && sectionType === "line_item") {
            const priceInput = page.locator('input[placeholder*="Price"], input[placeholder*="Amount"], input[type="number"]').first();
            try {
              await priceInput.fill(String(amount), { timeout: 3000 });
            } catch {
              // amount entry may vary
            }
          }

          return {
            proposalName: name,
            proposalId: id || null,
            sectionType,
            title: title || null,
            amount: amount ?? null,
            quantity,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_send_proposal: async (args) => {
      const name = asString(args.proposalName);
      const id = asString(args.proposalId);
      const emailSubject = asString(args.emailSubject);
      const emailBody = asString(args.emailBody);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "proposals-send", async () => {
          if (id) {
            await gotoGhl(page, `/proposals/${id}`);
          } else if (name) {
            await gotoGhl(page, "/proposals");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("proposalName or proposalId is required");
          }
          await waitForAppReady(page);

          const sendBtn = page
            .locator('button:has-text("Send"), button:has-text("Share"), button:has-text("Email")')
            .first();
          await sendBtn.click({ timeout: 5000 });
          await page.waitForTimeout(1000);

          if (emailSubject) {
            const subjectInput = page.locator('input[placeholder*="Subject"], input[name="subject"]').first();
            try {
              await subjectInput.fill(emailSubject, { timeout: 3000 });
            } catch {
              // subject may not be editable
            }
          }

          if (emailBody) {
            const bodyInput = page.locator('textarea[placeholder*="Message"], textarea[name="body"], [contenteditable="true"]').first();
            try {
              await bodyInput.fill(emailBody, { timeout: 3000 });
            } catch {
              // body may not be editable
            }
          }

          const confirmSend = page.locator('button:has-text("Send"), button:has-text("Confirm"), button:has-text("Submit")').first();
          await confirmSend.click({ timeout: 5000 });
          await page.waitForTimeout(1500);

          return {
            proposalName: name,
            proposalId: id || null,
            sent: true,
            emailSubject: emailSubject || null,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_proposal_status: async (args) => {
      const name = asString(args.proposalName);
      const id = asString(args.proposalId);
      const status = asString(args.status);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "proposals-status", async () => {
          if (id) {
            await gotoGhl(page, `/proposals/${id}`);
          } else if (name) {
            await gotoGhl(page, "/proposals");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("proposalName or proposalId is required");
          }
          await waitForAppReady(page);

          const statusDropdown = page
            .locator('[class*="status"], [class*="Status"], button:has-text("Status"), select[name="status"]')
            .first();
          try {
            await statusDropdown.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            await page.locator(`button:has-text("${status}"), [class*="option"]:has-text("${status}")`).first().click({ timeout: 3000 });
          } catch {
            const selectEl = page.locator('select[name="status"], select[class*="status"]').first();
            try {
              await selectEl.selectOption({ label: status }, { timeout: 3000 });
            } catch {
              throw new Error(`Could not update status to "${status}"`);
            }
          }
          await page.waitForTimeout(1000);

          return {
            proposalName: name,
            proposalId: id || null,
            status,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_proposal: async (args) => {
      const name = asString(args.proposalName);
      const id = asString(args.proposalId);
      const confirm = Boolean(args.confirm);
      if (!confirm) throw new Error("confirm must be true to delete a proposal");
      if (!name && !id) throw new Error("proposalName or proposalId is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "proposals-delete", async () => {
          await gotoGhl(page, "/proposals");
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

          return { proposalName: name, proposalId: id, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
