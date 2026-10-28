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
    // and the header's padding are sized from the visible text, not from
    // chalk's escape codes. A missing
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
    // #5205: each line of the thought is a row of its own, and the box is as
    // wide as the longest of them (or the header). Any line ending (\r\n, \n
    // or a lone \r) ends a row: a \r left inside a row would send the cursor
    // back to the left border and draw the rest of the row over it.
    const lines = thought.split(/\r\n|\r|\n/);
    // A reduce rather than Math.max(...lengths): spreading one argument per
    // line would overflow the call stack on a thought with very many lines.
    const width = lines.reduce(
      (widest, line) => Math.max(widest, line.length),
      visibleHeader.length,
    );
    const border = "─".repeat(width + 4);
    // The header row is padded to the border's width like the thought rows, by
    // the visible text's length. Each label's emoji is one surrogate pair, so
    // its length of 2 is also its display width in a terminal.
    const padding = " ".repeat(border.length - 2 - visibleHeader.length);
    const header = `${colour(label)}${counts}${padding}`;
    const rows = lines
      .map((line) => `│ ${line.padEnd(border.length - 2)} │`)
      .join("\n");

    return `
┌${border}┐
│ ${header} │
├${border}┤
${rows}
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
