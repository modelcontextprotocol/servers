import chalk from 'chalk';
import { z } from 'zod';

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

// Zod schema for thought data validation
export const ThoughtDataSchema = z.object({
  thought: z
    .string()
    .min(1, 'thought field must contain at least one character')
    .max(MAX_THOUGHT_SIZE, `thought field exceeds maximum size of ${MAX_THOUGHT_SIZE} bytes`)
    .describe('Your current thinking step'),

  thoughtNumber: z
    .number()
    .int('thoughtNumber must be an integer')
    .min(1, 'thoughtNumber must be at least 1')
    .describe('Current thought number (numeric value, e.g., 1, 2, 3)'),

  totalThoughts: z
    .number()
    .int('totalThoughts must be an integer')
    .min(1, 'totalThoughts must be at least 1')
    .describe('Estimated total thoughts needed (numeric value, e.g., 5, 10)'),

  nextThoughtNeeded: z
    .boolean()
    .describe('Whether another thought step is needed'),

  // Optional fields
  isRevision: z
    .boolean()
    .optional()
    .describe('Whether this revises previous thinking'),

  revisesThought: z
    .number()
    .int('revisesThought must be an integer')
    .min(1, 'revisesThought must be at least 1')
    .optional()
    .describe('Which thought is being reconsidered'),

  branchFromThought: z
    .number()
    .int('branchFromThought must be an integer')
    .min(1, 'branchFromThought must be at least 1')
    .optional()
    .describe('Branching point thought number'),

  branchId: z
    .string()
    .min(1, 'branchId cannot be empty')
    .max(256, 'branchId exceeds maximum length of 256')
    .optional()
    .describe('Branch identifier'),

  needsMoreThoughts: z
    .boolean()
    .optional()
    .describe('If more thoughts are needed')
}).refine(
  (data) => {
    // If isRevision is true, revisesThought must be provided
    if (data.isRevision && data.revisesThought === undefined) {
      return false;
    }
    return true;
  },
  {
    message: 'When isRevision is true, revisesThought must be provided'
  }
).refine(
  (data) => {
    // If branchFromThought is provided, branchId must be provided
    if (data.branchFromThought !== undefined && !data.branchId) {
      return false;
    }
    return true;
  },
  {
    message: 'When branchFromThought is provided, branchId must also be provided'
  }
).refine(
  (data) => {
    // revisesThought must be less than thoughtNumber
    if (data.revisesThought !== undefined && data.revisesThought >= data.thoughtNumber) {
      return false;
    }
    return true;
  },
  {
    message: 'revisesThought must be less than thoughtNumber'
  }
).refine(
  (data) => {
    // branchFromThought must be less than thoughtNumber
    if (data.branchFromThought !== undefined && data.branchFromThought >= data.thoughtNumber) {
      return false;
    }
    return true;
  },
  {
    message: 'branchFromThought must be less than thoughtNumber'
  }
);

// Type inferred from Zod schema for type safety
export type ThoughtData = z.infer<typeof ThoughtDataSchema>;

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  private validateThoughtData(input: unknown): ThoughtData {
    return ThoughtDataSchema.parse(input);
  }

  // Strip ANSI escape codes to calculate visual width
  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\u001b\[[0-9;]*m/g, '');
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
    // Use visual length (without ANSI codes) for border calculation
    const headerVisualLength = this.stripAnsi(header).length;
    const border = '─'.repeat(Math.max(headerVisualLength, thought.length) + 4);

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

        // Enforce maximum branches using FIFO eviction (oldest branch first)
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
      let errorMessage: string;

      if (error instanceof z.ZodError) {
        // Format Zod validation errors for better readability
        errorMessage = error.errors.map(err => {
          const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
          return `${path}${err.message}`;
        }).join('; ');
      } else {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: errorMessage,
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}
