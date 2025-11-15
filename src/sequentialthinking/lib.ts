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

// Maximum thought string size to prevent DoS (100KB)
const MAX_THOUGHT_SIZE = 100 * 1024;

// Parse and validate environment variable as integer with bounds
function parseEnvInt(envVar: string, defaultValue: number, min: number, max: number): number {
  const value = parseInt(process.env[envVar] || String(defaultValue), 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${envVar}: must be between ${min} and ${max}`);
  }
  return value;
}

// Maximum number of thoughts to retain in history (per instance)
const MAX_THOUGHT_HISTORY = parseEnvInt('MAX_THOUGHT_HISTORY', 1000, 1, 100000);

// Maximum number of branches to track simultaneously
const MAX_BRANCHES = parseEnvInt('MAX_BRANCHES', 100, 1, 100000);

// Maximum thoughts per branch
const MAX_THOUGHTS_PER_BRANCH = parseEnvInt('MAX_THOUGHTS_PER_BRANCH', 1000, 1, 100000);

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (data.thought.length > MAX_THOUGHT_SIZE) {
      throw new Error(`Invalid thought: exceeds maximum size of ${MAX_THOUGHT_SIZE} bytes`);
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!Number.isInteger(data.thoughtNumber)) {
      throw new Error('Invalid thoughtNumber: must be an integer');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (!Number.isInteger(data.totalThoughts)) {
      throw new Error('Invalid totalThoughts: must be an integer');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    // Validate optional integer fields
    if (data.revisesThought !== undefined) {
      if (typeof data.revisesThought !== 'number') {
        throw new Error('Invalid revisesThought: must be a number');
      }
      if (!Number.isInteger(data.revisesThought)) {
        throw new Error('Invalid revisesThought: must be an integer');
      }
    }

    if (data.branchFromThought !== undefined) {
      if (typeof data.branchFromThought !== 'number') {
        throw new Error('Invalid branchFromThought: must be a number');
      }
      if (!Number.isInteger(data.branchFromThought)) {
        throw new Error('Invalid branchFromThought: must be an integer');
      }
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

        // Enforce maximum thoughts per branch using FIFO eviction
        if (this.branches[validatedInput.branchId].length > MAX_THOUGHTS_PER_BRANCH) {
          this.branches[validatedInput.branchId].shift(); // Remove oldest thought in branch
        }

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
