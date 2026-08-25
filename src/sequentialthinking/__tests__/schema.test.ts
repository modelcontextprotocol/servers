import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const coercedBoolean = z.union([
  z.boolean(),
  z.string().transform((val, ctx) => {
    const lower = val.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected boolean string (\"true\" or \"false\")",
    });
    return z.NEVER;
  }),
]);

const inputSchema = {
  thought: z.string().describe("Your current thinking step"),
  nextThoughtNeeded: coercedBoolean.describe("Whether another thought step is needed"),
  thoughtNumber: z.coerce.number().int().min(1).describe("Current thought number (numeric value, e.g., 1, 2, 3)"),
  totalThoughts: z.coerce.number().int().min(1).describe("Estimated total thoughts needed (numeric value, e.g., 5, 10)"),
  isRevision: coercedBoolean.optional().describe("Whether this revises previous thinking"),
  revisesThought: z.coerce.number().int().min(1).optional().describe("Which thought is being reconsidered"),
  branchFromThought: z.coerce.number().int().min(1).optional().describe("Branching point thought number"),
  branchId: z.string().optional().describe("Branch identifier"),
  needsMoreThoughts: coercedBoolean.optional().describe("If more thoughts are needed")
};

describe('coercedBoolean & Tool Schema', () => {
  it('correctly parses native boolean values', () => {
    expect(coercedBoolean.parse(true)).toBe(true);
    expect(coercedBoolean.parse(false)).toBe(false);
  });

  it('correctly coerces boolean strings case-insensitively', () => {
    expect(coercedBoolean.parse('true')).toBe(true);
    expect(coercedBoolean.parse('TRUE')).toBe(true);
    expect(coercedBoolean.parse('True')).toBe(true);
    expect(coercedBoolean.parse('false')).toBe(false);
    expect(coercedBoolean.parse('FALSE')).toBe(false);
    expect(coercedBoolean.parse('False')).toBe(false);
  });

  it('rejects invalid boolean strings and types', () => {
    expect(() => coercedBoolean.parse('notaboolean')).toThrow();
    expect(() => coercedBoolean.parse(123)).toThrow();
    expect(() => coercedBoolean.parse({})).toThrow();
  });

  it('preserves nextThoughtNeeded in schema required fields', () => {
    const objectSchema = z.object(inputSchema);
    const jsonSchema = z.toJSONSchema(objectSchema, { io: 'input' }) as { required?: string[] };
    expect(jsonSchema.required).toBeDefined();
    expect(jsonSchema.required).toContain('thought');
    expect(jsonSchema.required).toContain('nextThoughtNeeded');
    expect(jsonSchema.required).toContain('thoughtNumber');
    expect(jsonSchema.required).toContain('totalThoughts');
    expect(jsonSchema.required).not.toContain('isRevision');
    expect(jsonSchema.required).not.toContain('needsMoreThoughts');
  });
});
