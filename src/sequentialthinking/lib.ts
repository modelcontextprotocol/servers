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

/**
 * How many thoughts one server instance retains when MAX_THOUGHT_HISTORY is
 * unset (#2912). A server lives as long as its client's connection, so without
 * a cap a long-lived connection grows its history without bound.
 */
export const DEFAULT_MAX_THOUGHT_HISTORY = 1000;

/**
 * The thought cap from MAX_THOUGHT_HISTORY: a positive integer, or the default
 * when the variable is unset or empty. Any other value is reported on stderr
 * and replaced by the default, so a typo cannot remove the bound.
 */
function readMaxThoughtHistory(): number {
  const raw = (process.env.MAX_THOUGHT_HISTORY ?? "").trim();
  if (raw === "") {
    return DEFAULT_MAX_THOUGHT_HISTORY;
  }
  const value = Number(raw);
  if (/^\d+$/.test(raw) && Number.isSafeInteger(value) && value >= 1) {
    return value;
  }
  console.error(
    `MAX_THOUGHT_HISTORY must be a positive integer, got "${raw}"; using ${DEFAULT_MAX_THOUGHT_HISTORY}`,
  );
  return DEFAULT_MAX_THOUGHT_HISTORY;
}

export class SequentialThinkingServer {
  // At most maxThoughtHistory thoughts, oldest first. Each branch holds the
  // retained thoughts recorded on it, so evicting the oldest thought also
  // removes it from its branch, and a branch left empty is dropped: the
  // branches together never hold more than the history does.
  private thoughtHistory: ThoughtData[] = [];
  // Null prototype, so any string branchId (even "constructor" or "__proto__")
  // is an ordinary own key rather than an inherited Object.prototype member.
  private branches: Record<string, ThoughtData[]> = Object.create(null);
  private disableThoughtLogging: boolean;
  private maxThoughtHistory: number;

  constructor() {
    this.disableThoughtLogging =
      (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
    this.maxThoughtHistory = readMaxThoughtHistory();
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
    const border = "─".repeat(
      Math.max(visibleHeader.length, thought.length) + 4,
    );
    // The header row is padded to the border's width like the thought row, by
    // the visible text's length. Each label's emoji is one surrogate pair, so
    // its length of 2 is also its display width in a terminal.
    const padding = " ".repeat(border.length - 2 - visibleHeader.length);
    const header = `${colour(label)}${counts}${padding}`;

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

      // One thought in, at most one out. Thoughts enter a branch in the order
      // they enter the history, so the evicted thought is its branch's first.
      if (this.thoughtHistory.length > this.maxThoughtHistory) {
        const [oldest] = this.thoughtHistory.splice(0, 1);
        if (oldest.branchFromThought && oldest.branchId) {
          const branch = this.branches[oldest.branchId];
          branch.shift();
          if (branch.length === 0) {
            delete this.branches[oldest.branchId];
          }
        }
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
                // Both describe the retained thoughts: once the cap is
                // reached the length stays at MAX_THOUGHT_HISTORY, and a
                // branch whose thoughts were all evicted is no longer listed.
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
