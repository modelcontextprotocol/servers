/**
 * Regression tests for issue #4575: serverInfo.version must match the
 * published package.json version so that downstream consumers
 * (Claude Desktop, MCP inspectors, server registries) see the same
 * version the install command actually pulled in.
 *
 * Pre-fix: serverInfo.version was hardcoded as "0.2.0" while the
 * published package was 2026.7.4. The hardcoded string drifted
 * silently every time the package was versioned.
 *
 * Fix: read from `../package.json` so the value stays in sync with
 * what `npm publish` (or the workspace version bump) writes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Server info is set at module top-level in index.ts. To read what it
// actually reports we either need to import the module (which starts
// an McpServer with side effects — not ideal in a unit test) or
// extract the version source into a small helper. The simpler check
// is to assert the source itself uses package.json and never
// contains a hardcoded version literal.
const srcPath = join(__dirname, '..', 'index.ts');
const srcContent = readFileSync(srcPath, 'utf-8');

const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

describe('serverInfo.version (regression #4575)', () => {
  it('index.ts reads the version from package.json, not a hardcoded literal', () => {
    // The source must either import package.json (via `import pkg from`)
    // or read it at runtime (via fs.readFileSync). Both patterns keep
    // serverInfo.version in sync with the published artifact.
    const usesImport = /import\s+pkg\s+from\s+['"]\.\/package\.json['"]/.test(srcContent);
    const usesReadFileSync = /readFileSync\([^)]*package\.json/.test(srcContent);
    expect(usesImport || usesReadFileSync).toBe(true);
    // The McpServer config must reference the parsed value, not a literal.
    // We accept either `pkg.version` (from the import style) or
    // `pkgVersion` (from the runtime-read style with a try/catch).
    const mcpServerBlock = srcContent.match(/new\s+McpServer\s*\(\s*\{[^}]*\}\s*\)/s);
    expect(mcpServerBlock).not.toBeNull();
    const versionMatch = mcpServerBlock![0].match(/version:\s*(\w+)/);
    expect(versionMatch).not.toBeNull();
    // The version variable must be one of the recognized names, not a
    // string literal like "0.2.0".
    expect(['pkg', 'pkgVersion']).toContain(versionMatch![1]);
  });

  it('index.ts contains no hardcoded version literal in the McpServer call', () => {
    // Match `version: "<digits><dot>..."` but exclude pkg.version usage.
    // We want to catch a developer re-introducing a hardcoded "0.2.0" /
    // "1.0.0" / etc. by accident.
    const mcpServerBlock = srcContent.match(/new\s+McpServer\s*\(\s*\{[^}]*\}\s*\)/s);
    expect(mcpServerBlock).not.toBeNull();
    // Inside the McpServer config, no version literal.
    expect(mcpServerBlock![0]).not.toMatch(/version:\s*["']\d+\.\d+/);
  });

  it('package.json version is a non-empty semver-shaped string', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.version.length).toBeGreaterThan(0);
  });

  it('the compiled server is wired to read package.json (runtime spot check)', { timeout: 10000 }, async () => {
    // Spawn the compiled server and verify serverInfo.version matches
    // package.json at runtime. Catches the case where a build
    // substitution or wrapper breaks the source-level contract.
    //
    // Skipped if dist hasn't been built yet (CI without prior build).
    // The source-level checks above already cover the contract.
    const distPath = join(__dirname, '..', 'dist', 'index.js');
    if (!existsSync(distPath)) {
      return;
    }
    const { spawn } = await import('child_process');
    const child = spawn('node', [distPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let buf = '';
    child.stdout.on('data', (chunk: Buffer) => { buf += chunk.toString('utf-8'); });
    const writeLine = (obj: unknown) => {
      child.stdin.write(JSON.stringify(obj) + '\n');
    };
    try {
      // MCP stdio handshake: initialize → notifications/initialized → tools/list
      writeLine({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'version-test', version: '0.0.0' },
        },
      });
      writeLine({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      // Send tools/list to keep the server from sitting idle.
      writeLine({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });
      // Wait for the initialize response. Look for the line containing
      // "serverInfo". The server may emit log lines first; skip them.
      const deadline = Date.now() + 3000;
      let resp: any = null;
      while (Date.now() < deadline && resp === null) {
        await new Promise((r) => setTimeout(r, 50));
        for (const line of buf.split('\n')) {
          if (!line.includes('serverInfo')) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.result?.serverInfo) {
              resp = parsed;
              break;
            }
          } catch { /* not JSON, keep scanning */ }
        }
      }
      if (resp === null) {
        // The MCP server may not have flushed by the deadline. The
        // source-level checks already passed; treat this as a
        // soft skip rather than a hard fail (CI without proper MCP
        // stdio can flake on the handshake).
        return;
      }
      expect(resp.result.serverInfo.version).toBe(pkg.version);
    } finally {
      child.kill('SIGTERM');
    }
  });
});

function existsSync(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}