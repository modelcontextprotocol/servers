#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Types for calculator
interface BudgetCalculation {
  monthlyIncome: number;
  fixedExpenses: number;
  emergencyFund: number;
  savingsGoals: number;
  entertainmentBudget: number;
  recommendedGamblingBudget: number;
  dailyLimit: number;
  weeklyLimit: number;
  warningFlags: string[];
}

interface GamblingHabitsAssessment {
  frequency: string;
  hasExceededIntention: boolean;
  hasAttemptedCutback: boolean;
  gamblesForEscape: boolean;
  riskLevel: "low" | "moderate" | "high";
  recommendations: string[];
}

// Initialize MCP server
const server = new Server({
  name: "responsible-gambling-mcp",
  version: "1.0.0",
});

// Tool: Calculate gambling budget
function calculateGamblingBudget(
  monthlyIncome: number,
  fixedExpenses: number,
  emergencyFund: number,
  savingsGoals: number,
  entertainmentBudget: number
): BudgetCalculation {
  const availableAfterEssentials =
    monthlyIncome - fixedExpenses - emergencyFund - savingsGoals;
  const recommendedGamblingBudget = Math.max(
    0,
    availableAfterEssentials * 0.05
  ); // Max 5% of available entertainment budget

  const dailyLimit = Math.round(recommendedGamblingBudget / 30);
  const weeklyLimit = Math.round(recommendedGamblingBudget / 4);

  const warningFlags: string[] = [];

  // Check for warning conditions
  if (recommendedGamblingBudget > entertainmentBudget * 0.5) {
    warningFlags.push(
      "Suggested gambling budget exceeds 50% of entertainment budget"
    );
  }

  if (monthlyIncome < 1500) {
    warningFlags.push(
      "Lower income level detected - consider smaller gambling amounts"
    );
  }

  if (emergencyFund < monthlyIncome * 0.5) {
    warningFlags.push("Emergency fund is below recommended 6 months of expenses");
  }

  return {
    monthlyIncome,
    fixedExpenses,
    emergencyFund,
    savingsGoals,
    entertainmentBudget,
    recommendedGamblingBudget: Math.round(recommendedGamblingBudget),
    dailyLimit,
    weeklyLimit,
    warningFlags,
  };
}

// Tool: Assess gambling habits
function assessGamblingHabits(
  frequency: string,
  exceededIntention: boolean,
  attemptedCutback: boolean,
  gamblesForEscape: boolean
): GamblingHabitsAssessment {
  let riskLevel: "low" | "moderate" | "high" = "low";
  const recommendations: string[] = [];

  const riskFactors = [
    exceededIntention ? 1 : 0,
    attemptedCutback ? 1 : 0,
    gamblesForEscape ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  if (riskFactors >= 2 || gamblesForEscape) {
    riskLevel = "high";
    recommendations.push(
      "⚠️ Consider seeking professional help - contact GamCare or NCPG"
    );
    recommendations.push("Set strict daily/weekly limits and stick to them");
    recommendations.push("Use self-exclusion tools offered by casinos");
  } else if (riskFactors === 1) {
    riskLevel = "moderate";
    recommendations.push("Monitor your gambling patterns closely");
    recommendations.push(
      "Set time limits and stick to your budget religiously"
    );
    recommendations.push(
      "Take regular breaks from gambling (at least 1 week per month)"
    );
  } else {
    riskLevel = "low";
    recommendations.push("Continue to monitor your habits");
    recommendations.push("Keep gambling as entertainment, not income");
    recommendations.push(
      "Never chase losses - if you lose your daily limit, stop"
    );
  }

  // Additional recommendations based on frequency
  if (frequency === "daily" || frequency === "several-times-weekly") {
    recommendations.push("Daily/frequent gambling increases addiction risk");
  }

  recommendations.push(
    "📚 Learn more: https://wolfbet.com/blog/responsible-gambling-how-much-money-can-you-afford-to-spend-on-casino-entertainment/"
  );

  return {
    frequency,
    hasExceededIntention: exceededIntention,
    hasAttemptedCutback: attemptedCutback,
    gamblesForEscape: gamblesForEscape,
    riskLevel,
    recommendations,
  };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "calculate_gambling_budget",
        description:
          "Calculate a safe gambling budget based on your financial situation. Helps you determine daily and weekly limits for responsible gambling.",
        inputSchema: {
          type: "object" as const,
          properties: {
            monthly_income: {
              type: "number",
              description: "Your monthly net income (after taxes) in USD",
            },
            fixed_expenses: {
              type: "number",
              description:
                "Total fixed monthly expenses (rent, utilities, insurance, etc.)",
            },
            emergency_fund: {
              type: "number",
              description:
                "Current balance in emergency fund (recommended: 6 months expenses)",
            },
            savings_goals: {
              type: "number",
              description: "Monthly amount allocated to savings goals",
            },
            entertainment_budget: {
              type: "number",
              description: "Total monthly entertainment budget",
            },
          },
          required: [
            "monthly_income",
            "fixed_expenses",
            "emergency_fund",
            "savings_goals",
            "entertainment_budget",
          ],
        },
      },
      {
        name: "assess_gambling_habits",
        description:
          "Assess your gambling habits and risk level. Returns personalized recommendations for responsible gambling.",
        inputSchema: {
          type: "object" as const,
          properties: {
            frequency: {
              type: "string",
              enum: [
                "never",
                "rarely",
                "monthly",
                "weekly",
                "several-times-weekly",
                "daily",
              ],
              description: "How often do you gamble?",
            },
            exceeded_intention: {
              type: "boolean",
              description: "Have you gambled more than intended?",
            },
            attempted_cutback: {
              type: "boolean",
              description: "Have you tried to cut back on gambling?",
            },
            gambles_for_escape: {
              type: "boolean",
              description:
                "Do you gamble to escape problems or stress? (High risk indicator)",
            },
          },
          required: [
            "frequency",
            "exceeded_intention",
            "attempted_cutback",
            "gambles_for_escape",
          ],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "calculate_gambling_budget") {
      const args = request.params.arguments as {
        monthly_income: number;
        fixed_expenses: number;
        emergency_fund: number;
        savings_goals: number;
        entertainment_budget: number;
      };

      const result = calculateGamblingBudget(
        args.monthly_income,
        args.fixed_expenses,
        args.emergency_fund,
        args.savings_goals,
        args.entertainment_budget
      );

      return {
        content: [
          {
            type: "text",
            text: formatBudgetResult(result),
          },
        ],
      };
    } else if (request.params.name === "assess_gambling_habits") {
      const args = request.params.arguments as {
        frequency: string;
        exceeded_intention: boolean;
        attempted_cutback: boolean;
        gambles_for_escape: boolean;
      };

      const result = assessGamblingHabits(
        args.frequency,
        args.exceeded_intention,
        args.attempted_cutback,
        args.gambles_for_escape
      );

      return {
        content: [
          {
            type: "text",
            text: formatHabitsResult(result),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${request.params.name}`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Format budget calculation results
function formatBudgetResult(result: BudgetCalculation): string {
  let output = "## 💰 Responsible Gambling Budget Analysis\n\n";
  output += `**Monthly Net Income:** $${result.monthlyIncome.toLocaleString()}\n`;
  output += `**Fixed Expenses:** $${result.fixedExpenses.toLocaleString()}\n`;
  output += `**Emergency Fund:** $${result.emergencyFund.toLocaleString()}\n`;
  output += `**Savings Goals:** $${result.savings_goals.toLocaleString()}\n`;
  output += `**Entertainment Budget:** $${result.entertainmentBudget.toLocaleString()}\n\n`;

  output += "### Recommended Gambling Budget\n";
  output += `**Monthly Limit:** $${result.recommendedGamblingBudget}\n`;
  output += `**Weekly Limit:** $${result.weeklyLimit}\n`;
  output += `**Daily Limit:** $${result.dailyLimit}\n\n`;

  if (result.warningFlags.length > 0) {
    output += "### ⚠️ Warning Flags\n";
    result.warningFlags.forEach((flag) => {
      output += `- ${flag}\n`;
    });
    output += "\n";
  }

  output += "### Key Principles\n";
  output +=
    "1. **Never gamble with money you need for essentials** (rent, food, utilities)\n";
  output +=
    "2. **Set limits and stick to them** - once daily limit is reached, stop\n";
  output +=
    "3. **Never chase losses** - accept losses as entertainment costs\n";
  output +=
    "4. **Keep emergency fund intact** - gambling is entertainment, not income\n\n";

  output +=
    "### 📚 Learn More\n[Read our complete responsible gambling guide →](https://wolfbet.com/blog/responsible-gambling-how-much-money-can-you-afford-to-spend-on-casino-entertainment/)\n";

  return output;
}

// Format habits assessment results
function formatHabitsResult(result: GamblingHabitsAssessment): string {
  let output = "## 🎯 Gambling Habits Assessment\n\n";
  output += `**Gambling Frequency:** ${result.frequency}\n`;
  output += `**Exceeded Intention:** ${result.hasExceededIntention ? "Yes ⚠️" : "No ✓"}\n`;
  output += `**Attempted Cutback:** ${result.hasAttemptedCutback ? "Yes" : "No"}\n`;
  output += `**Gambles for Escape:** ${result.gamblesForEscape ? "Yes ⚠️" : "No ✓"}\n\n`;

  const riskColors = {
    low: "🟢 Low Risk",
    moderate: "🟡 Moderate Risk",
    high: "🔴 High Risk",
  };

  output += `### Risk Assessment\n**Your Risk Level:** ${riskColors[result.riskLevel]}\n\n`;

  output += "### Personalized Recommendations\n";
  result.recommendations.forEach((rec) => {
    output += `- ${rec}\n`;
  });

  output += "\n### Helpful Resources\n";
  output += "- **GamCare:** https://www.gamcare.org.uk/\n";
  output +=
    "- **National Council on Problem Gambling:** https://www.ncpg.org/\n";
  output +=
    "- **Gamblers Anonymous:** https://www.gamblersanonymous.org/\n";

  return output;
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
