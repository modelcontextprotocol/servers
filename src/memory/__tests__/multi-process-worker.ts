/**
 * Worker script for multi-process lock testing.
 * Spawned by multi-process-lock.test.ts to simulate multiple MCP server instances.
 * 
 * Usage: npx tsx multi-process-worker.ts <memoryFilePath> <workerId> <numWrites>
 */

import { KnowledgeGraphManager } from '../index.js';

const [,, memoryFilePath, workerId, numWritesStr] = process.argv;

if (!memoryFilePath || !workerId || !numWritesStr) {
  console.error('Usage: npx tsx multi-process-worker.ts <memoryFilePath> <workerId> <numWrites>');
  process.exit(1);
}

const numWrites = parseInt(numWritesStr, 10);

async function main() {
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

main().catch((error) => {
  console.error(`Worker ${workerId} crashed:`, error);
  process.exit(1);
});
