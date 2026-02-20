import chalk from 'chalk';

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

// Default maximum number of thoughts to retain in history.
// Can be overridden via the SEQUENTIAL_THINKING_MAX_HISTORY environment variable.
const DEFAULT_MAX_HISTORY = 1000;

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;
  private maxHistory: number;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
    const envMax = parseInt(process.env.SEQUENTIAL_THINKING_MAX_HISTORY || "", 10);
    this.maxHistory = Number.isFinite(envMax) && envMax > 0 ? envMax : DEFAULT_MAX_HISTORY;
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  /**
   * Clears all stored thought history and branch data.
   * Useful for freeing memory in long-running sessions.
   */
  public clearHistory(): { content: Array<{ type: "text"; text: string }> } {
    const previousLength = this.thoughtHistory.length;
    const previousBranches = Object.keys(this.branches).length;
    this.thoughtHistory = [];
    this.branches = {};
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          cleared: true,
          previousThoughtCount: previousLength,
          previousBranchCount: previousBranches
        }, null, 2)
      }]
    };
  }

  public processThought(input: ThoughtData): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
    try {
      // Validation happens at the tool registration layer via Zod
      // Adjust totalThoughts if thoughtNumber exceeds it
      if (input.thoughtNumber > input.totalThoughts) {
        input.totalThoughts = input.thoughtNumber;
      }

      this.thoughtHistory.push(input);

      // Trim history when it exceeds the configured maximum to prevent
      // unbounded memory growth during long-running sessions (see #2912).
      if (this.thoughtHistory.length > this.maxHistory) {
        const excess = this.thoughtHistory.length - this.maxHistory;
        this.thoughtHistory.splice(0, excess);
      }

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
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            thoughtNumber: input.thoughtNumber,
            totalThoughts: input.totalThoughts,
            nextThoughtNeeded: input.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}
