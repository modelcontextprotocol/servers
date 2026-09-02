import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const contactScoringModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_scoring_models",
      description:
        "List contact scoring models with name, status, and the number of rules in each model.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_get_scoring_model",
      description:
        "Get the rules and criteria of a specific scoring model: point values, conditions, thresholds.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: { type: "string", description: "Scoring model name to retrieve" },
        },
        required: ["modelName"],
      },
    },
    {
      name: "ghl_browser_create_scoring_model",
      description: "Create a new contact scoring model with a name and description.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Scoring model name" },
          description: { type: "string", description: "Model description" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_add_scoring_rule",
      description: "Add a scoring rule to a model: field condition, point value, and operator.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: { type: "string", description: "Scoring model to add rule to" },
          field: { type: "string", description: "Contact field name (e.g. 'Email', 'Phone', 'Tag')" },
          condition: { type: "string", description: "Condition: equals, contains, exists, not_exists" },
          points: { type: "number", description: "Points to add (positive) or subtract (negative)" },
        },
        required: ["modelName", "field", "condition", "points"],
      },
    },
    {
      name: "ghl_browser_get_contact_scores",
      description: "Get scoring results for a contact: model scores, total score, and breakdown.",
      inputSchema: {
        type: "object",
        properties: {
          contactName: { type: "string", description: "Contact name to get scores for" },
        },
        required: ["contactName"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_scoring_models: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "scoring-models-list", async () => {
          await gotoGhl(page, "/scoring");
          await waitForAppReady(page);
          const models = await page.evaluate(() => {
            const rows: Array<{ name: string; status: string; ruleCount: string }> = [];
            document
              .querySelectorAll('tr, [class*="model"], [class*="card"], [role="row"]')
              .forEach((el) => {
                const nameEl = el.querySelector('[class*="name"], [class*="title"], a, td:first-child');
                if (nameEl && (nameEl.textContent?.trim().length ?? 0) > 1) {
                  rows.push({
                    name: nameEl.textContent?.trim() ?? "",
                    status:
                      el.querySelector('[class*="status"], [class*="badge"]')?.textContent?.trim() ?? "",
                    ruleCount:
                      el.querySelector('[class*="rule"], [class*="count"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return rows;
          });
          return { count: models.length, models };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_scoring_model: async (args) => {
      const modelName = String(args.modelName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "scoring-model-get", async () => {
          await gotoGhl(page, "/scoring");
          await waitForAppReady(page);
          const row = page
            .locator(`tr:has-text("${modelName}"), [class*="model"]:has-text("${modelName}"), a:has-text("${modelName}")`)
            .first();
          await row.click({ timeout: 5000 });
          await waitForAppReady(page);
          const rules = await page.evaluate(() => {
            const items: Array<{ field: string; condition: string; points: string }> = [];
            document
              .querySelectorAll('[class*="rule"], [class*="criteria"], tr, [role="row"]')
              .forEach((el) => {
                const fieldEl = el.querySelector('[class*="field"], [class*="name"], td:first-child');
                if (fieldEl && (fieldEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    field: fieldEl.textContent?.trim() ?? "",
                    condition:
                      el.querySelector('[class*="condition"], [class*="operator"]')?.textContent?.trim() ?? "",
                    points:
                      el.querySelector('[class*="point"], [class*="value"], [class*="score"]')?.textContent?.trim() ?? "",
                  });
                }
              });
            return items;
          });
          return { modelName, ruleCount: rules.length, rules };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_scoring_model: async (args) => {
      const name = String(args.name);
      const description = (args.description as string) || "";
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "scoring-model-create", async () => {
          await gotoGhl(page, "/scoring");
          await waitForAppReady(page);
          const createBtn = page
            .locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")')
            .first();
          await createBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const nameInput = page.locator('input[name="name"], input[placeholder*="name"], input[type="text"]').first();
          await nameInput.fill(name);
          if (description) {
            const descInput = page.locator('textarea, input[name="description"]').first();
            await descInput.fill(description).catch(() => {});
          }
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { name, description, created: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_add_scoring_rule: async (args) => {
      const modelName = String(args.modelName);
      const field = String(args.field);
      const condition = String(args.condition);
      const points = Number(args.points);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "scoring-add-rule", async () => {
          await gotoGhl(page, "/scoring");
          await waitForAppReady(page);
          const modelRow = page
            .locator(`tr:has-text("${modelName}"), [class*="model"]:has-text("${modelName}")`)
            .first();
          await modelRow.click({ timeout: 5000 });
          await waitForAppReady(page);
          const addRuleBtn = page
            .locator('button:has-text("Add Rule"), button:has-text("Add"), button:has-text("New Rule")')
            .first();
          await addRuleBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          const fieldSelect = page.locator('select, [role="combobox"], input[placeholder*="field"]').first();
          await fieldSelect.fill(field).catch(async () => {
            await fieldSelect.click();
            await page.locator(`[role="option"]:has-text("${field}")`).first().click({ timeout: 3000 }).catch(() => {});
          });
          const condSelect = page.locator('select, [role="combobox"]').nth(1);
          await condSelect.click();
          await page.locator(`[role="option"]:has-text("${condition}")`).first().click({ timeout: 3000 }).catch(() => {});
          const pointsInput = page.locator('input[type="number"], input[placeholder*="point"]').first();
          await pointsInput.fill(String(points));
          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Add"), button[type="submit"]')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await waitForAppReady(page);
          return { modelName, field, condition, points, added: true };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_contact_scores: async (args) => {
      const contactName = String(args.contactName);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "scoring-contact-scores", async () => {
          await gotoGhl(page, `/contacts`);
          await waitForAppReady(page);
          const searchInput = page.locator('input[type="search"], input[placeholder*="search"]').first();
          await searchInput.fill(contactName).catch(() => {});
          await waitForAppReady(page);
          const contactRow = page
            .locator(`tr:has-text("${contactName}"), a:has-text("${contactName}")`)
            .first();
          await contactRow.click({ timeout: 5000 });
          await waitForAppReady(page);
          const scoreTab = page
            .locator('[role="tab"]:has-text("Score"), [role="tab"]:has-text("Scoring"), button:has-text("Score")')
            .first();
          await scoreTab.click({ timeout: 3000 }).catch(() => {});
          await waitForAppReady(page);
          const scores = await page.evaluate(() => {
            const items: Array<{ model: string; score: string; breakdown: string }> = [];
            document
              .querySelectorAll('[class*="score"], [class*="scoring"], [class*="model"]')
              .forEach((el) => {
                const modelEl = el.querySelector('[class*="name"], [class*="model"], [class*="title"]');
                const scoreEl = el.querySelector('[class*="score"], [class*="value"], [class*="total"]');
                if (modelEl && (modelEl.textContent?.trim().length ?? 0) > 1) {
                  items.push({
                    model: modelEl.textContent?.trim() ?? "",
                    score: scoreEl?.textContent?.trim() ?? "",
                    breakdown: el.textContent?.trim()?.slice(0, 200) ?? "",
                  });
                }
              });
            return items;
          });
          return { contactName, scoreCount: scores.length, scores };
        });
      } finally {
        await close();
      }
    },
  },
};
