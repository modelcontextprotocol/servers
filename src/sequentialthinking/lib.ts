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

// Maximum number of thoughts to retain in history to prevent unbounded memory growth
// Configurable via MAX_THOUGHT_HISTORY environment variable (default: 1000)
const MAX_THOUGHT_HISTORY = parseInt(process.env.MAX_THOUGHT_HISTORY || '1000', 10);

// Maximum number of branches to track simultaneously
// Configurable via MAX_BRANCHES environment variable (default: 100)
const MAX_BRANCHES = parseInt(process.env.MAX_BRANCHES || '100', 10);

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    // Validate required fields
    if (typeof data.thought !== 'string' || data.thought.length === 0) {
      throw new Error('Invalid thought: must be a non-empty string');
    }

    if (typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!Number.isFinite(data.thoughtNumber)) {
      throw new Error('Invalid thoughtNumber: thoughtNumber must be a valid number');
    }
    if (data.thoughtNumber < 1) {
      throw new Error('Invalid thoughtNumber: thoughtNumber must be >= 1');
    }

    if (typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (!Number.isFinite(data.totalThoughts)) {
      throw new Error('Invalid totalThoughts: totalThoughts must be a valid number');
    }
    if (data.totalThoughts < 1) {
      throw new Error('Invalid totalThoughts: totalThoughts must be >= 1');
    }

    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    // Validate optional fields if present
    if (data.isRevision !== undefined && typeof data.isRevision !== 'boolean') {
      throw new Error('Invalid isRevision: isRevision must be a boolean');
    }

    if (data.revisesThought !== undefined) {
      if (typeof data.revisesThought !== 'number') {
        throw new Error('Invalid revisesThought: revisesThought must be a number');
      }
      if (!Number.isFinite(data.revisesThought)) {
        throw new Error('Invalid revisesThought: revisesThought must be a valid number');
      }
      if (data.revisesThought < 1) {
        throw new Error('Invalid revisesThought: revisesThought must be >= 1');
      }
    }

    if (data.branchFromThought !== undefined) {
      if (typeof data.branchFromThought !== 'number') {
        throw new Error('Invalid branchFromThought: branchFromThought must be a number');
      }
      if (!Number.isFinite(data.branchFromThought)) {
        throw new Error('Invalid branchFromThought: branchFromThought must be a valid number');
      }
      if (data.branchFromThought < 1) {
        throw new Error('Invalid branchFromThought: branchFromThought must be >= 1');
      }
    }

    if (data.branchId !== undefined) {
      if (typeof data.branchId !== 'string') {
        throw new Error('Invalid branchId: branchId must be a string');
      }
      if (data.branchId.length === 0) {
        throw new Error('Invalid branchId: branchId cannot be empty');
      }
    }

    if (data.needsMoreThoughts !== undefined && typeof data.needsMoreThoughts !== 'boolean') {
      throw new Error('Invalid needsMoreThoughts: needsMoreThoughts must be a boolean');
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
    };
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

  public processThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      // Enforce maximum history size using FIFO eviction
      if (this.thoughtHistory.length > MAX_THOUGHT_HISTORY) {
        this.thoughtHistory.shift(); // Remove oldest thought
      }

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);

        // Enforce maximum branches using LRU-style eviction
        const branchKeys = Object.keys(this.branches);
        if (branchKeys.length > MAX_BRANCHES) {
          // Remove oldest branch (first key)
          delete this.branches[branchKeys[0]];
        }
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(validatedInput);
        console.error(formattedThought);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber: validatedInput.thoughtNumber,
            totalThoughts: validatedInput.totalThoughts,
            nextThoughtNeeded: validatedInput.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
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
