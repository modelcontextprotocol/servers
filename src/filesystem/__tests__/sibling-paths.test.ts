import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAllowedDirectories, validatePath } from '../lib.js';

// A request path must be checked exactly as it will be used: a sibling directory
// whose name is the allowed directory's name plus a quote or whitespace is outside it.
describe('validatePath with sibling names that differ by quotes or whitespace', () => {
  let parentDir: string;
  let allowedDir: string;

  beforeEach(async () => {
    parentDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sibling-')));
    allowedDir = path.join(parentDir, 'allowed');
    await fs.mkdir(allowedDir);
    setAllowedDirectories([allowedDir]);
  });

  afterEach(async () => {
    setAllowedDirectories([]);
    await fs.rm(parentDir, { recursive: true, force: true });
  });

  it.each(["'", '"', ' ', '\t'])('rejects an existing sibling named allowed%j', async (suffix) => {
    await fs.mkdir(allowedDir + suffix);
    await fs.writeFile(path.join(allowedDir + suffix, 'secret.txt'), 'outside');
    await expect(validatePath(allowedDir + suffix)).rejects.toThrow('Access denied');
    await expect(validatePath(path.join(allowedDir + suffix, 'secret.txt'))).rejects.toThrow('Access denied');
  });

  it('rejects a new file next to the allowed directory', async () => {
    await expect(validatePath(allowedDir + '\t')).rejects.toThrow('Access denied');
  });

  it('still allows a file inside the allowed directory whose name ends with a quote', async () => {
    const file = path.join(allowedDir, "it's'");
    await fs.writeFile(file, 'inside');
    await expect(validatePath(file)).resolves.toBe(file);
  });
});
