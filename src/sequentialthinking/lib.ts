import chalk from 'chalk';
import { z } from 'zod';

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

const thoughtDataSchema = z.object({
  thought: z.string().min(1, "Invalid thought: must be a non-empty string"),
  thoughtNumber: z.number({ invalid_type_error: "Invalid thoughtNumber: must be a number" }).int().min(1),
  totalThoughts: z.number({ invalid_type_error: "Invalid totalThoughts: must be a number" }).int().min(1),
  nextThoughtNeeded: z.boolean({ invalid_type_error: "Invalid nextThoughtNeeded: must be a boolean" }),
  isRevision: z.boolean().optional(),
  revisesThought: z.number().int().min(1).optional(),
  branchFromThought: z.number().int().min(1).optional(),
  branchId: z.string().optional(),
  needsMoreThoughts: z.boolean().optional()
});

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
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

  public processThought(input: unknown): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
    try {
      // Validate input with Zod
      const validatedInput = thoughtDataSchema.parse(input);

      // Adjust totalThoughts if thoughtNumber exceeds it
      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(validatedInput);
        console.error(formattedThought);
      }

      return {
        content: [{
          type: "text" as const,
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
        // Extract the first validation error and format it nicely
        const firstError = error.errors[0];
        const field = firstError.path[0];

        if (firstError.code === 'invalid_type' && firstError.received === 'undefined') {
          errorMessage = `Invalid ${field}: must be ${firstError.expected === 'string' ? 'a string' : firstError.expected === 'number' ? 'a number' : 'a boolean'}`;
        } else if (firstError.code === 'invalid_type') {
          errorMessage = `Invalid ${field}: must be ${firstError.expected === 'string' ? 'a string' : firstError.expected === 'number' ? 'a number' : 'a boolean'}`;
        } else if (firstError.code === 'too_small' && firstError.minimum === 1) {
          errorMessage = firstError.message;
        } else {
          errorMessage = firstError.message;
        }
      } else {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      return {
        content: [{
          type: "text" as const,
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
