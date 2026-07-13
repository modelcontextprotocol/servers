/// <reference types="vitest/globals" />
import { existsSync, promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager } from '../index.js';

const isStressMode = process.env.RUN_MEMORY_LOCK_STRESS === '1';
const defaultProcessCount = 3;
const defaultWritesPerProcess = 50;
const stressProcessCount = 5;
const stressWritesPerProcess = 2000;
const smokeMinimumSuccess = 120;
const stressMinimumSuccess = 7500;

function getTsxExecutable(currentFilePath: string): { command: string; args: string[] } {
  const localTsx = path.resolve(path.dirname(currentFilePath), '../../../node_modules/.bin/tsx');
  if (existsSync(localTsx)) {
    return { command: localTsx, args: [currentFilePath] };
  }

  return { command: 'npx', args: ['tsx', currentFilePath] };
}

// Check if running in worker mode
const isWorker = process.argv.includes('--worker');

if (isWorker) {
  runWorker().catch((error) => {
    console.error(`Worker crashed:`, error);
    process.exit(1);
  });
} else {
  // Main Test Suite
  describe('Multi-process file locking', () => {
    let testFilePath: string;
    const currentFilePath = fileURLToPath(import.meta.url);

    beforeEach(async () => {
      testFilePath = path.join(
        path.dirname(currentFilePath),
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

    it('should guarantee consistency: succeeded operations must be in file', async () => {
      const NUM_PROCESSES = isStressMode ? stressProcessCount : defaultProcessCount;
      const WRITES_PER_PROCESS = isStressMode ? stressWritesPerProcess : defaultWritesPerProcess;
      const minSuccessfulOperations = isStressMode ? stressMinimumSuccess : smokeMinimumSuccess;
      const workerExecutable = getTsxExecutable(currentFilePath);

      // Spawn all worker processes in parallel
      const workerPromises: Promise<{ workerId: string; succeededNames: string[]; failed: number }>[] = [];

      for (let i = 0; i < NUM_PROCESSES; i++) {
        workerPromises.push(
          new Promise((resolve, reject) => {
            const child = spawn(workerExecutable.command, [...workerExecutable.args, '--worker', testFilePath, String(i), String(WRITES_PER_PROCESS)], {
              stdio: ['ignore', 'pipe', 'pipe'],
              env: { ...process.env },
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
                const lines = stdout.trim().split('\n');
                let result: any = null;
                for (let j = lines.length - 1; j >= 0; j--) {
                  try {
                    const parsed = JSON.parse(lines[j]);
                    if (parsed && typeof parsed === 'object' && parsed.workerId !== undefined) {
                      result = parsed;
                      break;
                    }
                  } catch {
                    continue;
                  }
                }

                if (!result) {
                  try {
                    result = JSON.parse(stdout.trim());
                  } catch {
                    // ignore
                  }
                }

                if (!result) {
                  reject(new Error(`Worker ${i} output parse error: ${stdout}`));
                  return;
                }

                resolve(result);
              } catch (e: any) {
                reject(new Error(`Worker ${i} output parse error: ${stdout}. Error: ${e.message}`));
              }
            });

            child.on('error', (err) => {
              reject(new Error(`Worker ${i} spawn error: ${err.message}`));
            });
          })
        );
      }

      const results = await Promise.all(workerPromises);
      const succeededNames = new Set(results.flatMap(r => r.succeededNames));
      const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

      console.log(`\n=== Multi-process Lock Test Results ===`);
      console.log(`Mode: ${isStressMode ? 'stress' : 'smoke'}`);
      console.log(`Processes: ${NUM_PROCESSES}`);
      console.log(`Writes per process: ${WRITES_PER_PROCESS}`);
      console.log(`Minimum success required: ${minSuccessfulOperations}`);
      console.log(`Total succeeded: ${succeededNames.size}`);
      console.log(`Total failed: ${totalFailed}`);

      expect(succeededNames.size).toBeGreaterThanOrEqual(minSuccessfulOperations);

      const manager = new KnowledgeGraphManager(testFilePath);
      const graph = await manager.readGraph();
      const fileNames = new Set(graph.entities.map(e => e.name));

      console.log(`Entities in file: ${graph.entities.length}`);

      succeededNames.forEach(name => {
        expect(fileNames.has(name)).toBe(true);
      });

      expect(graph.entities.length).toBe(succeededNames.size);

      console.log(`\nPer-worker breakdown:`);
      for (const r of results) {
        console.log(`  Worker ${r.workerId}: ${r.succeededNames.length} succeeded, ${r.failed} failed`);
      }

      console.log(`\n✓ File integrity verified: all ${succeededNames.size} succeeded writes are in the file`);
    }, isStressMode ? 300000 : 30000);
  });
}

/**
 * Worker Logic
 */
async function runWorker() {
  const workerFlagIndex = process.argv.indexOf('--worker');
  const memoryFilePath = process.argv[workerFlagIndex + 1];
  const workerId = process.argv[workerFlagIndex + 2];
  const numWritesStr = process.argv[workerFlagIndex + 3];

  if (!memoryFilePath || !workerId || !numWritesStr) {
    console.error('Usage: npx tsx multi-process-lock.test.ts --worker <memoryFilePath> <workerId> <numWrites>');
    process.exit(1);
  }

  const numWrites = parseInt(numWritesStr, 10);

  // Low retry count to speed up test - failures are expected under heavy contention
  const manager = new KnowledgeGraphManager(memoryFilePath, {
    retries: {
      retries: 10,
      minTimeout: 10,
      factor: 1.5,
      maxTimeout: 50,
    },
  });

  const succeededNames: string[] = [];
  let failed = 0;

  for (let i = 0; i < numWrites; i++) {
    const entityName = `Worker${workerId}_Entity${i}`;
    try {
      const created = await manager.createEntities([
        {
          name: entityName,
          entityType: 'test',
          observations: [`Created by worker ${workerId}`],
        },
      ]);
      // Only count as succeeded if entity was actually created
      if (created.length > 0) {
        succeededNames.push(entityName);
      }
    } catch {
      failed++;
    }
  }

  // Output result as JSON for parent process to parse
  console.log(JSON.stringify({ workerId, succeededNames, failed }));
}
