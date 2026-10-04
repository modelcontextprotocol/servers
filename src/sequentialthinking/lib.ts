import chalk from "chalk";

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging =
      (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  private formatThought(thoughtData: ThoughtData): string {
    const {
      thoughtNumber,
      totalThoughts,
      thought,
      isRevision,
      revisesThought,
      branchFromThought,
      branchId,
    } = thoughtData;

    // The label is coloured only after the header is measured, so the border
    // is sized from the visible text, not from chalk's escape codes. A missing
    // revisesThought or branchId is left out of the header rather than printed
    // as "undefined".
    let label: string;
    let colour: (text: string) => string;
    let context = "";

    if (isRevision) {
      label = "🔄 Revision";
      colour = chalk.yellow;
      if (revisesThought !== undefined) {
        context = ` (revising thought ${revisesThought})`;
      }
    } else if (branchFromThought) {
      label = "🌿 Branch";
      colour = chalk.green;
      context =
        branchId !== undefined
          ? ` (from thought ${branchFromThought}, ID: ${branchId})`
          : ` (from thought ${branchFromThought})`;
    } else {
      label = "💭 Thought";
      colour = chalk.blue;
    }

    const counts = ` ${thoughtNumber}/${totalThoughts}${context}`;
    const visibleHeader = `${label}${counts}`;
    const header = `${colour(label)}${counts}`;
    const border = "─".repeat(
      Math.max(visibleHeader.length, thought.length) + 4,
    );

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  public processThought(input: ThoughtData): {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  } {
    try {
      // Validation happens at the tool registration layer via Zod
      // Adjust totalThoughts if thoughtNumber exceeds it
      if (input.thoughtNumber > input.totalThoughts) {
        input.totalThoughts = input.thoughtNumber;
      }

      this.thoughtHistory.push(input);

      if (input.branchFromThought && input.branchId) {
        if (!this.branches[input.branchId]) {
          this.branches[input.branchId] = [];
        }
        this.branches[input.branchId].push(input);
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(input);
        console.error(formattedThought);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                thoughtNumber: input.thoughtNumber,
                totalThoughts: input.totalThoughts,
                nextThoughtNeeded: input.nextThoughtNeeded,
                branches: Object.keys(this.branches),
                thoughtHistoryLength: this.thoughtHistory.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                status: "failed",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  }
}
