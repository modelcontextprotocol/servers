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
  // Null prototype, so any string branchId (even "constructor" or "__proto__")
  // is an ordinary own key rather than an inherited Object.prototype member.
  private branches: Record<string, ThoughtData[]> = Object.create(null);
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

      // Log before touching any state: drawing and writing the box are the
      // steps that can throw, so a failed call leaves thoughtHistory and
      // branches as they were.
      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(input);
        console.error(formattedThought);
      }

      this.thoughtHistory.push(input);

      if (input.branchFromThought && input.branchId) {
        if (!this.branches[input.branchId]) {
          this.branches[input.branchId] = [];
        }
        this.branches[input.branchId].push(input);
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
