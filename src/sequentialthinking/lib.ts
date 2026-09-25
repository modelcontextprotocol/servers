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

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  // CSI escape sequences produced by chalk (e.g. "\x1b[34m...\x1b[39m") inflate
  // `string.length` without adding any visible columns. Strip them before
  // measuring width so the box frame and padding match what the user actually
  // sees on screen.
  private static readonly ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g;

  private visibleWidth(s: string): number {
    return s.replace(SequentialThinkingServer.ANSI_PATTERN, '').length;
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
    const headerWidth = this.visibleWidth(header);

    // Support multi-line thoughts: break on \n and size the box to the widest
    // line. Previously a thought containing newlines produced a single very
    // long row with the trailing "│" pushed onto a new line, breaking the box.
    const thoughtLines = thought.split('\n');
    const widestThoughtLine = thoughtLines.reduce(
      (max, line) => Math.max(max, line.length),
      0,
    );

    const innerWidth = Math.max(headerWidth, widestThoughtLine);
    const border = '─'.repeat(innerWidth + 2);
    const headerPadding = ' '.repeat(innerWidth - headerWidth);
    const bodyLines = thoughtLines
      .map((line) => `│ ${line.padEnd(innerWidth)} │`)
      .join('\n');

    return `
┌${border}┐
│ ${header}${headerPadding} │
├${border}┤
${bodyLines}
└${border}┘`;
  }

  public processThought(input: ThoughtData): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
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
