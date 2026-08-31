
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { applyFileEdits } from '../lib.js';

describe('Bug #4157 Reproduction', () => {
  const testFile = path.join(process.cwd(), 'test_repro.txt');

  beforeEach(async () => {
    await fs.writeFile(testFile, 'Value: OLD_VALUE\n');
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFile);
    } catch {}
  });

  it('should preserve literal $ characters in newText', async () => {
    const edits = [
      {
        oldText: 'OLD_VALUE',
        newText: '$100'
      }
    ];

    await applyFileEdits(testFile, edits, false);
    const result = await fs.readFile(testFile, 'utf-8');
    expect(result).toContain('$100');
  });

  it('should preserve complex $ patterns in newText', async () => {
    const edits = [
      {
        oldText: 'OLD_VALUE',
        newText: '$& $1 $` $\''
      }
    ];

    await applyFileEdits(testFile, edits, false);
    const result = await fs.readFile(testFile, 'utf-8');
    expect(result).toContain('$& $1 $` $\'');
  });
});
