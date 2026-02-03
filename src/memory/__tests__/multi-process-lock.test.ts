import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { KnowledgeGraphManager } from '../index.js';

/**
 * Multi-process lock test.
 * 
 * This test validates that proper-lockfile correctly prevents data loss
 * when multiple processes (simulating multiple MCP server instances)
 * concurrently write to the same memory file.
 * 
 * This is the critical scenario that in-memory locks (like PR #3060) cannot handle,
 * because each MCP server instance spawned via stdio runs as a separate process.
 */
describe('Multi-process file locking', () => {
  let testFilePath: string;

  beforeEach(async () => {
    testFilePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-multi-process-${Date.now()}.jsonl`
    );
    // Create empty file for locking (proper-lockfile requires file to exist)
    await fs.writeFile(testFilePath, '');
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // Ignore errors if file doesn't exist
    }
    // Clean up lock file if exists
    try {
      await fs.unlink(`${testFilePath}.lock`);
    } catch {
      // Ignore
    }
  });

  it('should guarantee consistency: succeeded operations must be in file (5 processes x 2000 writes)', async () => {
    const NUM_PROCESSES = 5;
    const WRITES_PER_PROCESS = 2000;

    const workerPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'multi-process-worker.ts'
    );

    // Spawn all worker processes in parallel
    const workerPromises: Promise<{ workerId: string; succeededNames: string[]; failed: number }>[] = [];

    for (let i = 0; i < NUM_PROCESSES; i++) {
      workerPromises.push(
        new Promise((resolve, reject) => {
          const child = spawn('npx', ['tsx', workerPath, testFilePath, String(i), String(WRITES_PER_PROCESS)], {
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`Worker ${i} exited with code ${code}: ${stderr}`));
              return;
            }
            try {
              const result = JSON.parse(stdout.trim());
              resolve(result);
            } catch (e) {
              reject(new Error(`Worker ${i} output parse error: ${stdout}`));
            }
          });

          child.on('error', (err) => {
            reject(new Error(`Worker ${i} spawn error: ${err.message}`));
          });
        })
      );
    }

    // Wait for all workers to complete
    const results = await Promise.all(workerPromises);

    // Collect all succeeded entity names
    const succeededNames = new Set(
      results.flatMap(r => r.succeededNames)
    );

    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

    console.log(`\n=== Multi-process Lock Test Results ===`);
    console.log(`Processes: ${NUM_PROCESSES}`);
    console.log(`Writes per process: ${WRITES_PER_PROCESS}`);
    console.log(`Total succeeded: ${succeededNames.size}`);
    console.log(`Total failed: ${totalFailed}`);

    // Read the final file
    const manager = new KnowledgeGraphManager(testFilePath);
    const graph = await manager.readGraph();
    const fileNames = new Set(graph.entities.map(e => e.name));

    console.log(`Entities in file: ${graph.entities.length}`);

    // Verify: succeeded entities must be in file
    succeededNames.forEach(name => {
      expect(fileNames.has(name)).toBe(true);
    });

    // File entity count should equal succeeded count
    expect(graph.entities.length).toBe(succeededNames.size);

    // Log per-worker stats
    console.log(`\nPer-worker breakdown:`);
    for (const r of results) {
      console.log(`  Worker ${r.workerId}: ${r.succeededNames.length} succeeded, ${r.failed} failed`);
    }

    console.log(`\n✓ File integrity verified: all ${succeededNames.size} succeeded writes are in the file`);
  }, 300000); // 5 minute timeout for 10k writes
});
