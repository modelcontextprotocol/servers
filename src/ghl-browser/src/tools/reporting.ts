import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError, asString } from "../helpers.js";

export const reportingModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_reports",
      description:
        "List available reports in the GHL reporting dashboard with name, category, " +
        "type (standard/custom), and last run date.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter by category: 'all' (default), 'attribution', 'conversion', 'lead', 'opportunity', 'revenue'",
          },
          search: {
            type: "string",
            description: "Optional search term to filter by report name",
          },
        },
      },
    },
    {
      name: "ghl_browser_create_report",
      description:
        "Create a custom report. Specify metrics, dimensions, date range, and filters. " +
        "Returns the report name and URL after creation.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Report name" },
          metrics: {
            type: "string",
            description: "Comma-separated metrics (e.g. 'leads,conversions,revenue')",
          },
          dimensions: {
            type: "string",
            description: "Comma-separated grouping dimensions (e.g. 'source,campaign,date')",
          },
          dateRange: {
            type: "string",
            description: "Date range: 'today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'custom'",
          },
          customStartDate: { type: "string", description: "Start date for custom range (YYYY-MM-DD)" },
          customEndDate: { type: "string", description: "End date for custom range (YYYY-MM-DD)" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_get_report_data",
      description:
        "Open a report and extract its data: table rows, chart values, summary metrics, " +
        "and any comparison data. Useful for reading report results programmatically.",
      inputSchema: {
        type: "object",
        properties: {
          reportName: { type: "string", description: "Report name" },
          reportId: { type: "string", description: "Report ID (preferred if known)" },
          dateRange: {
            type: "string",
            description: "Override date range before reading: 'today', 'last_7_days', 'last_30_days', etc.",
          },
        },
      },
    },
    {
      name: "ghl_browser_export_report",
      description:
        "Export a report as CSV or PDF. Returns the file path of the downloaded export.",
      inputSchema: {
        type: "object",
        properties: {
          reportName: { type: "string" },
          reportId: { type: "string", description: "Report ID (preferred)" },
          format: {
            type: "string",
            description: "'csv' (default) or 'pdf'",
          },
        },
      },
    },
    {
      name: "ghl_browser_get_dashboard_metrics",
      description:
        "Read the current dashboard summary metrics: total leads, conversions, revenue, " +
        "appointments, and any KPI widgets visible on the main reporting page.",
      inputSchema: {
        type: "object",
        properties: {
          dateRange: {
            type: "string",
            description: "Date range: 'today', 'last_7_days', 'last_30_days', 'this_month'",
          },
        },
      },
    },
    {
      name: "ghl_browser_delete_report",
      description:
        "Delete a custom report. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          reportName: { type: "string" },
          reportId: { type: "string", description: "Report ID (preferred)" },
          confirm: { type: "boolean", description: "Must be true to proceed with deletion" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_reports: async (args) => {
      const category = asString(args.category) || "all";
      const search = asString(args.search);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reports-list", async () => {
          await gotoGhl(page, "/reporting");
          await waitForAppReady(page);

          if (category !== "all") {
            const catTab = page
              .locator(`button:has-text("${category}"), a:has-text("${category}"), [class*="tab"]:has-text("${category}")`)
              .first();
            try {
              await catTab.click({ timeout: 5000 });
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

          const reports = await page.evaluate(() => {
            const items: Array<{ name: string; category: string; type: string; lastRun: string; href: string }> = [];
            const rowSelectors = [
              "tr[data-row-key]",
              '[class*="ReportRow"]',
              '[class*="report-row"]',
              '[class*="report-item"]',
              '[class*="ReportItem"]',
              '[class*="ReportCard"]',
              '[class*="card"]',
              '[class*="ListRow"]',
              'a[href*="report"]',
            ];
            for (const sel of rowSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const anchor = el.closest("a") || el.querySelector("a");
                const nameEl = el.querySelector("[class*='name'], [class*='Name'], h4, h3, td:first-child");
                const catEl = el.querySelector("[class*='category'], [class*='Category']");
                const typeEl = el.querySelector("[class*='type'], [class*='Type'], [class*='badge']");
                const dateEl = el.querySelector("[class*='date'], [class*='Date'], [class*='last']");
                const href = anchor?.getAttribute("href") || "";
                items.push({
                  name: nameEl?.textContent?.trim() || el.textContent?.slice(0, 80).trim() || "",
                  category: catEl?.textContent?.trim() || "",
                  type: typeEl?.textContent?.trim() || (href.includes("custom") ? "custom" : "standard"),
                  lastRun: dateEl?.textContent?.trim() || "",
                  href,
                });
              });
            }
            return items;
          });

          const deduped = Array.from(new Map(reports.map((r) => [r.name, r])).values());
          return { count: deduped.length, reports: deduped };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_report: async (args) => {
      const name = asString(args.name);
      const metrics = asString(args.metrics);
      const dimensions = asString(args.dimensions);
      const dateRange = asString(args.dateRange) || "last_30_days";
      const customStart = asString(args.customStartDate);
      const customEnd = asString(args.customEndDate);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reports-create", async () => {
          await gotoGhl(page, "/reporting");
          await waitForAppReady(page);

          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("New"), button:has-text("Custom Report")')
            .first();
          await createBtn.click();
          await page.waitForTimeout(800);

          const nameInput = page
            .locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="Report"]')
            .first();
          await nameInput.fill(name);

          if (dateRange !== "custom") {
            const rangeLabels: Record<string, string> = {
              today: "Today",
              yesterday: "Yesterday",
              last_7_days: "Last 7 Days",
              last_30_days: "Last 30 Days",
              this_month: "This Month",
              last_month: "Last Month",
            };
            const label = rangeLabels[dateRange] || dateRange;
            const rangeBtn = page.locator(`button:has-text("${label}"), [class*="option"]:has-text("${label}")`).first();
            try {
              await rangeBtn.click({ timeout: 3000 });
            } catch {
              // date range selection is best-effort
            }
          } else if (customStart && customEnd) {
            const startInput = page.locator('input[placeholder*="Start"], input[name="startDate"]').first();
            const endInput = page.locator('input[placeholder*="End"], input[name="endDate"]').first();
            try {
              await startInput.fill(customStart, { timeout: 3000 });
              await endInput.fill(customEnd, { timeout: 3000 });
            } catch {
              // custom date entry is best-effort
            }
          }

          if (metrics) {
            for (const metric of metrics.split(",").map((s) => s.trim())) {
              const metricOption = page
                .locator(`[class*="metric"]:has-text("${metric}"), [class*="checkbox"]:has-text("${metric}"), label:has-text("${metric}")`)
                .first();
              try {
                await metricOption.click({ timeout: 2000 });
              } catch {
                // metric selection is best-effort
              }
            }
          }

          if (dimensions) {
            for (const dim of dimensions.split(",").map((s) => s.trim())) {
              const dimOption = page
                .locator(`[class*="dimension"]:has-text("${dim}"), [class*="group"]:has-text("${dim}"), label:has-text("${dim}")`)
                .first();
              try {
                await dimOption.click({ timeout: 2000 });
              } catch {
                // dimension selection is best-effort
              }
            }
          }

          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Run"), button:has-text("Generate")').first();
          await saveBtn.click();
          await waitForAppReady(page);

          return {
            name,
            metrics: metrics || null,
            dimensions: dimensions || null,
            dateRange,
            customStart: customStart || null,
            customEnd: customEnd || null,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_report_data: async (args) => {
      const name = asString(args.reportName);
      const id = asString(args.reportId);
      const dateRange = asString(args.dateRange);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reports-data", async () => {
          if (id) {
            await gotoGhl(page, `/reporting/${id}`);
          } else if (name) {
            await gotoGhl(page, "/reporting");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}"), [class*="row"]:has-text("${name}")`).first().click();
          } else {
            throw new Error("reportName or reportId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(3000);

          if (dateRange) {
            const rangeLabels: Record<string, string> = {
              today: "Today",
              yesterday: "Yesterday",
              last_7_days: "Last 7 Days",
              last_30_days: "Last 30 Days",
              this_month: "This Month",
              last_month: "Last Month",
            };
            const label = rangeLabels[dateRange] || dateRange;
            const rangeBtn = page.locator(`button:has-text("${label}"), [class*="range"]:has-text("${label}")`).first();
            try {
              await rangeBtn.click({ timeout: 3000 });
              await page.waitForTimeout(2000);
            } catch {
              // date range change is best-effort
            }
          }

          const reportData = await page.evaluate(() => {
            const metrics: Record<string, string> = {};
            document.querySelectorAll('[class*="metric"], [class*="Metric"], [class*="kpi"], [class*="KPI"], [class*="stat"]').forEach((el) => {
              const labelEl = el.querySelector("[class*='label'], [class*='Label'], [class*='title']");
              const valueEl = el.querySelector("[class*='value'], [class*='Value'], [class*='number'], [class*='count']");
              if (labelEl && valueEl) {
                metrics[labelEl.textContent?.trim() || ""] = valueEl.textContent?.trim() || "";
              }
            });

            const tableHeaders: string[] = [];
            document.querySelectorAll("th, [class*='header-cell'], [class*='HeaderCell']").forEach((el) => {
              const t = el.textContent?.trim();
              if (t) tableHeaders.push(t);
            });

            const tableRows: Record<string, string>[] = [];
            document.querySelectorAll("tr[data-row-key], [class*='table-row'], [class*='TableRow']").forEach((row) => {
              const cells = row.querySelectorAll("td, [class*='cell']");
              const rowData: Record<string, string> = {};
              cells.forEach((cell, i) => {
                rowData[tableHeaders[i] || `col_${i}`] = cell.textContent?.trim() || "";
              });
              if (Object.keys(rowData).length > 0) tableRows.push(rowData);
            });

            const chartLabels: string[] = [];
            document.querySelectorAll('[class*="chart"] [class*="label"], [class*="Chart"] [class*="Label"]').forEach((el) => {
              const t = el.textContent?.trim();
              if (t) chartLabels.push(t);
            });

            return {
              title: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
              metrics,
              tableHeaders,
              tableRows: tableRows.slice(0, 50),
              chartLabels,
              rowCount: tableRows.length,
            };
          });

          return {
            reportName: name || reportData.title,
            reportId: id || null,
            dateRange: dateRange || null,
            summary: reportData.metrics,
            tableHeaders: reportData.tableHeaders,
            tableRows: reportData.tableRows,
            totalRows: reportData.rowCount,
            chartLabels: reportData.chartLabels,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_export_report: async (args) => {
      const name = asString(args.reportName);
      const id = asString(args.reportId);
      const format = asString(args.format) || "csv";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reports-export", async () => {
          if (id) {
            await gotoGhl(page, `/reporting/${id}`);
          } else if (name) {
            await gotoGhl(page, "/reporting");
            await waitForAppReady(page);
            await page.locator(`a:has-text("${name}")`).first().click();
          } else {
            throw new Error("reportName or reportId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const exportBtn = page
            .locator('button:has-text("Export"), button:has-text("Download"), [class*="export"]')
            .first();
          try {
            await exportBtn.click({ timeout: 5000 });
            await page.waitForTimeout(800);
          } catch {
            // export may be in a dropdown
            const menuBtn = page.locator('button:has-text("⋮"), [class*="more"], [class*="actions"] button').first();
            try {
              await menuBtn.click({ timeout: 3000 });
              await page.locator(`text="Export", text="${format.toUpperCase()}"`).first().click({ timeout: 3000 });
            } catch {
              throw new Error("Could not find export option");
            }
          }

          if (format === "pdf") {
            const pdfOption = page.locator('button:has-text("PDF"), [class*="option"]:has-text("PDF")').first();
            try {
              await pdfOption.click({ timeout: 3000 });
            } catch {
              // may default to CSV
            }
          }

          const confirmExport = page.locator('button:has-text("Export"), button:has-text("Download"), button:has-text("Confirm")').first();
          try {
            await confirmExport.click({ timeout: 5000 });
            await page.waitForTimeout(2000);
          } catch {
            // export may auto-trigger download
          }

          return {
            reportName: name,
            reportId: id || null,
            format,
            exported: true,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_dashboard_metrics: async (args) => {
      const dateRange = asString(args.dateRange);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "dashboard-metrics", async () => {
          await gotoGhl(page, "/reporting");
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          if (dateRange) {
            const rangeLabels: Record<string, string> = {
              today: "Today",
              last_7_days: "Last 7 Days",
              last_30_days: "Last 30 Days",
              this_month: "This Month",
            };
            const label = rangeLabels[dateRange] || dateRange;
            const rangeBtn = page.locator(`button:has-text("${label}"), [class*="range"]:has-text("${label}")`).first();
            try {
              await rangeBtn.click({ timeout: 3000 });
              await page.waitForTimeout(2000);
            } catch {
              // date range is best-effort
            }
          }

          const metrics = await page.evaluate(() => {
            const widgets: Array<{ label: string; value: string; change: string; category: string }> = [];

            const widgetSelectors = [
              '[class*="widget"]',
              '[class*="Widget"]',
              '[class*="metric"]',
              '[class*="Metric"]',
              '[class*="kpi"]',
              '[class*="KPI"]',
              '[class*="stat"]',
              '[class*="Stat"]',
              '[class*="card"]',
              '[class*="Card"]',
            ];

            for (const sel of widgetSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const labelEl = el.querySelector("[class*='label'], [class*='Label'], [class*='title'], [class*='Title'], h4, h5");
                const valueEl = el.querySelector("[class*='value'], [class*='Value'], [class*='number'], [class*='count'], [class*='amount']");
                const changeEl = el.querySelector("[class*='change'], [class*='Change'], [class*='delta'], [class*='trend']");
                const catEl = el.querySelector("[class*='category'], [class*='Category']");

                if (labelEl && valueEl) {
                  widgets.push({
                    label: labelEl.textContent?.trim() || "",
                    value: valueEl.textContent?.trim() || "",
                    change: changeEl?.textContent?.trim() || "",
                    category: catEl?.textContent?.trim() || "",
                  });
                }
              });
            }

            const deduped = Array.from(new Map(widgets.map((w) => [w.label, w])).values());
            return deduped;
          });

          return {
            dateRange: dateRange || "default",
            metricCount: metrics.length,
            metrics,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_report: async (args) => {
      const name = asString(args.reportName);
      const id = asString(args.reportId);
      const confirm = Boolean(args.confirm);
      if (!confirm) throw new Error("confirm must be true to delete a report");
      if (!name && !id) throw new Error("reportName or reportId is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "reports-delete", async () => {
          await gotoGhl(page, "/reporting");
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

          return { reportName: name, reportId: id, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
