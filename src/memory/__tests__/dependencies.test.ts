import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { builtinModules } from 'module';

/**
 * Guards against phantom dependencies: modules that are imported by the shipped
 * source but not declared in package.json. Such imports resolve by accident
 * under npm's hoisted node_modules layout, then fail at startup for anyone
 * using a strict layout (pnpm, yarn PnP) with ERR_MODULE_NOT_FOUND.
 */
describe('declared dependencies', () => {
  const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

  const packageJson = JSON.parse(
    readFileSync(path.join(packageDir, 'package.json'), 'utf-8')
  ) as { dependencies?: Record<string, string> };

  // Source files that get compiled into dist/, i.e. everything except tests and configs.
  const sourceFiles = readdirSync(packageDir)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => !file.endsWith('.test.ts') && file !== 'vitest.config.ts');

  const IMPORT_PATTERN = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  /** Reduces a specifier like `zod/v4` or `@scope/pkg/sub` to its package name. */
  const toPackageName = (specifier: string): string => {
    const segments = specifier.split('/');
    return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  };

  const isBareSpecifier = (specifier: string): boolean =>
    !specifier.startsWith('.') &&
    !specifier.startsWith('node:') &&
    !builtinModules.includes(toPackageName(specifier));

  it('finds source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(sourceFiles)('%s imports only declared packages', (file) => {
    const contents = readFileSync(path.join(packageDir, file), 'utf-8');
    const declared = Object.keys(packageJson.dependencies ?? {});

    const imported = new Set<string>();
    for (const match of contents.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (specifier && isBareSpecifier(specifier)) {
        imported.add(toPackageName(specifier));
      }
    }

    expect(declared).toEqual(expect.arrayContaining([...imported]));
  });
});
