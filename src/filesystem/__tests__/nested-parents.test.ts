import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATH_VALIDATION_REASON, PathValidationError, setAllowedDirectories, validatePath } from '../lib.js';

// Regression coverage for #4629: validatePath must accept a path whose
// ancestors are missing several levels deep, so create_directory can mkdir -p.
describe('validatePath with multiple missing ancestors', () => {
  let allowedDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    allowedDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-nested-allowed-')));
    outsideDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-nested-outside-')));
    setAllowedDirectories([allowedDir]);
  });

  afterEach(async () => {
    setAllowedDirectories([]);
    await fs.rm(allowedDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it('rejects paths outside allowed directories with a stable reason code', async () => {
    let caughtError: unknown;
    try {
      await validatePath(path.join(outsideDir, 'file.txt'));
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PathValidationError);
    expect(caughtError).toMatchObject({
      reason: PATH_VALIDATION_REASON.PATH_OUTSIDE_ALLOWED,
    });
  });

  it('returns the full path when several ancestors do not exist', async () => {
    const requested = path.join(allowedDir, 'a', 'b', 'c');
    await expect(validatePath(requested)).resolves.toBe(requested);
  });

  it('rejects when the nearest existing ancestor is a symlink out of the allowed tree', async () => {
    await fs.symlink(outsideDir, path.join(allowedDir, 'link'), 'junction');

    let caughtError: unknown;
    try {
      await validatePath(path.join(allowedDir, 'link', 'a', 'b'));
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PathValidationError);
    expect(caughtError).toMatchObject({
      reason: PATH_VALIDATION_REASON.PARENT_OUTSIDE_ALLOWED,
    });
    expect((caughtError as Error).message).toContain('Access denied');
  });

  it('rejects an existing symlink whose target is outside allowed directories', async () => {
    const escapedFile = path.join(outsideDir, 'secret.txt');
    await fs.writeFile(escapedFile, 'secret');
    await fs.symlink(escapedFile, path.join(allowedDir, 'link.txt'), 'file');

    let caughtError: unknown;
    try {
      await validatePath(path.join(allowedDir, 'link.txt'));
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(PathValidationError);
    expect(caughtError).toMatchObject({
      reason: PATH_VALIDATION_REASON.SYMLINK_TARGET_OUTSIDE_ALLOWED,
    });
  });
});
