import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const domainConnectModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_domains",
      description: "List all connected domains with type (funnel/website), status, and SSL.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Filter: funnel, website" },
        },
      },
    },
    {
      name: "ghl_browser_get_domain_details",
      description: "Get DNS and SSL details for a specific domain.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name" },
        },
        required: ["domain"],
      },
    },
    {
      name: "ghl_browser_connect_domain",
      description: "Connect a custom domain to a funnel or website.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name to connect" },
          target: { type: "string", description: "Funnel or website name to connect" },
          type: { type: "string", description: "Type: funnel or website" },
        },
        required: ["domain", "target"],
      },
    },
    {
      name: "ghl_browser_check_domain_dns",
      description: "Check DNS configuration status for a connected domain.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name to check" },
        },
        required: ["domain"],
      },
    },
    {
      name: "ghl_browser_disconnect_domain",
      description: "Disconnect a domain from its funnel or website.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name to disconnect" },
          confirm: { type: "boolean", description: "Must be true to confirm" },
        },
        required: ["domain", "confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_domains: async (args) => {
      const type = (args.type as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "domains-list", async () => {
          await gotoGhl(page, "/settings/domains");
          await waitForAppReady(page);
          const domains = await page.evaluate((filterType) => {
            const items: Array<{
              domain: string;
              type: string;
              target: string;
              ssl: string;
              status: string;
            }> = [];
            document
              .querySelectorAll('tr, [class*="domain"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const domainEl = el.querySelector(
                  '[class*="domain"], [class*="url"], a, td:first-child',
                );
                if (domainEl && (domainEl.textContent?.trim().length ?? 0) > 3) {
                  const rowType =
                    el.querySelector('[class*="type"], [class*="target-type"]')?.textContent?.trim() ?? "";
                  if (filterType && !rowType.toLowerCase().includes(filterType.toLowerCase())) return;
                  items.push({
                    domain: domainEl.textContent?.trim() ?? "",
                    type: rowType,
                    target:
                      el.querySelector('[class*="target"], [class*="funnel"], [class*="website"]')?.textContent?.trim() ?? "",
                    ssl:
                      el.querySelector('[class*="ssl"], [class*="cert"]')?.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          }, type);
          return { type, count: domains.length, domains };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_domain_details: async (args) => {
      const domain = String(args.domain);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "domain-details", async () => {
          await gotoGhl(page, "/settings/domains");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${domain}"), [class*="domain"]:has-text("${domain}"), a:has-text("${domain}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const getVal = (label: string): string => {
              const lbl = Array.from(
                document.querySelectorAll('label, [class*="label"], dt, th'),
              ).find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase()));
              return (
                lbl?.parentElement?.querySelector("dd, td, [class*='value'], span")?.textContent?.trim() ??
                lbl?.nextElementSibling?.textContent?.trim() ??
                ""
              );
            };
            return {
              domain:
                document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() ?? "",
              type: getVal("type"),
              target: getVal("funnel") || getVal("website") || getVal("target"),
              cname: getVal("cname"),
              aRecord: getVal("a record") || getVal("a-record"),
              sslStatus: getVal("ssl") || getVal("certificate"),
              sslExpiry: getVal("expir"),
              dnsStatus: getVal("dns"),
              connected: getVal("connected") || getVal("date"),
            };
          });
          return data;
        });
      } finally {
        await close();
      }
    },

    ghl_browser_connect_domain: async (args) => {
      const domain = String(args.domain);
      const target = String(args.target);
      const type = (args.type as string) || "funnel";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "domain-connect", async () => {
          await gotoGhl(page, "/settings/domains");
          await waitForAppReady(page);
          const addBtn = page
            .locator('button:has-text("Add"), button:has-text("Connect"), button:has-text("New")')
            .first();
          await addBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const domainInput = page
            .locator('input[placeholder*="domain"], input[name="domain"]')
            .first();
          await domainInput.fill(domain);
          const targetSelect = page
            .locator(`[class*="target"]:has-text("${target}"), option:has-text("${target}"), [class*="funnel"]:has-text("${target}")`)
            .first();
          await targetSelect.click({ timeout: 3000 }).catch(() => {});
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Connect"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { domain, target, type, connected: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_check_domain_dns: async (args) => {
      const domain = String(args.domain);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "domain-dns-check", async () => {
          await gotoGhl(page, "/settings/domains");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${domain}"), [class*="domain"]:has-text("${domain}")`)
            .first();
          const checkBtn = row
            .locator('button:has-text("Check"), button:has-text("Verify"), [class*="check"]')
            .first();
          await checkBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          const data = await page.evaluate(() => {
            const records: Array<{ type: string; name: string; value: string; status: string }> = [];
            document.querySelectorAll('[class*="dns-record"], [class*="record"], tr[class*="dns"]').forEach((el) => {
              const typeEl = el.querySelector('[class*="type"], td:first-child');
              if (typeEl && (typeEl.textContent?.trim().length ?? 0) > 0) {
                records.push({
                  type: typeEl.textContent?.trim() ?? "",
                  name: el.querySelector('[class*="name"], td:nth-child(2)')?.textContent?.trim() ?? "",
                  value: el.querySelector('[class*="value"], td:nth-child(3)')?.textContent?.trim() ?? "",
                  status: el.querySelector('[class*="status"], td:last-child')?.textContent?.trim() ?? "",
                });
              }
            });
            return {
              overall:
                document.querySelector('[class*="dns-status"], [class*="overall"]')?.textContent?.trim() ?? "",
              records,
            };
          });
          return { domain, dns: data };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_disconnect_domain: async (args) => {
      const domain = String(args.domain);
      if (args.confirm !== true) {
        return { error: "Set confirm=true to disconnect this domain" };
      }
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "domain-disconnect", async () => {
          await gotoGhl(page, "/settings/domains");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${domain}"), [class*="domain"]:has-text("${domain}")`)
            .first();
          const deleteBtn = row
            .locator('button:has-text("Delete"), button:has-text("Remove"), button:has-text("Disconnect"), [class*="delete"]')
            .first();
          await deleteBtn.click({ timeout: 5000 });
          const confirmBtn = page
            .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Disconnect")')
            .first();
          await confirmBtn.click({ timeout: 5000 }).catch(() => {});
          await waitForAppReady(page);
          return { domain, disconnected: true };
        });
      } finally {
        await close();
      }
    },
  },
};
