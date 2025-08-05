import { describe, bench, beforeAll, afterAll } from 'vitest';
import { IStorageBackend } from '../../storage/interface.js';
import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import { Entity, Relation } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Dataset sizes to test
const DATASET_SIZES = [100, 1000, 10000, 100000];

// Generate test data
function generateTestData(size: number): { entities: Entity[], relations: Relation[] } {
  const entities: Entity[] = [];
  const relations: Relation[] = [];
  
  // Generate entities (people, organizations, projects)
  for (let i = 0; i < size; i++) {
    const entityType = ['Person', 'Organization', 'Project'][i % 3];
    entities.push({
      name: `${entityType}_${i}`,
      entityType,
      observations: [
        `Observation 1 for ${entityType}_${i}`,
        `Observation 2 for ${entityType}_${i}`,
        `Detailed description of ${entityType}_${i} with some longer text content`
      ]
    });
  }
  
  // Generate relations (roughly 2x entities for realistic graph)
  for (let i = 0; i < size * 2; i++) {
    const fromIdx = Math.floor(Math.random() * size);
    const toIdx = Math.floor(Math.random() * size);
    if (fromIdx !== toIdx) {
      relations.push({
        from: entities[fromIdx].name,
        to: entities[toIdx].name,
        relationType: ['works_for', 'collaborates_with', 'manages', 'funds'][i % 4]
      });
    }
  }
  
  return { entities, relations };
}

// Benchmark suite for a specific storage backend
function benchmarkStorage(name: string, createStorage: () => IStorageBackend) {
  describe(`${name} Performance Benchmarks`, () => {
    let storage: IStorageBackend;
    let testDir: string;
    
    beforeAll(async () => {
      testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-bench-'));
    });
    
    afterAll(async () => {
      if (storage) {
        await storage.close();
      }
      await fs.rm(testDir, { recursive: true, force: true });
    });

    DATASET_SIZES.forEach(size => {
      describe(`Dataset size: ${size.toLocaleString()} entities`, () => {
        const { entities, relations } = generateTestData(size);
        
        bench('initialize storage', async () => {
          storage = createStorage();
          await storage.initialize();
          await storage.close();
        });
        
        bench('create entities', async () => {
          storage = createStorage();
          await storage.initialize();
          
          // Create entities in batches of 100 for efficiency
          const batchSize = 100;
          for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);
            await storage.createEntities(batch);
          }
          
          await storage.close();
        });
        
        bench('create relations', async () => {
          storage = createStorage();
          await storage.initialize();
          
          // First create all entities
          await storage.createEntities(entities);
          
          // Then create relations in batches
          const batchSize = 100;
          for (let i = 0; i < relations.length; i += batchSize) {
            const batch = relations.slice(i, i + batchSize);
            await storage.createRelations(batch);
          }
          
          await storage.close();
        });
        
        bench('search nodes (25% of dataset)', async () => {
          storage = createStorage();
          await storage.initialize();
          await storage.createEntities(entities);
          await storage.createRelations(relations);
          
          // Search for 25% of entities by name
          const searchCount = Math.floor(size * 0.25);
          for (let i = 0; i < searchCount; i++) {
            const idx = Math.floor(Math.random() * size);
            await storage.searchNodes(`${entities[idx].entityType}_${idx}`);
          }
          
          await storage.close();
        });
        
        bench('read full graph', async () => {
          storage = createStorage();
          await storage.initialize();
          await storage.createEntities(entities);
          await storage.createRelations(relations);
          
          await storage.readGraph();
          
          await storage.close();
        });
        
        bench('open specific nodes (10% of dataset)', async () => {
          storage = createStorage();
          await storage.initialize();
          await storage.createEntities(entities);
          await storage.createRelations(relations);
          
          // Open 10% of entities
          const openCount = Math.floor(size * 0.1);
          const nodesToOpen: string[] = [];
          for (let i = 0; i < openCount; i++) {
            const idx = Math.floor(Math.random() * size);
            nodesToOpen.push(entities[idx].name);
          }
          
          await storage.openNodes(nodesToOpen);
          
          await storage.close();
        });
        
        bench('delete operations (5% of dataset)', async () => {
          storage = createStorage();
          await storage.initialize();
          await storage.createEntities(entities);
          await storage.createRelations(relations);
          
          // Delete 5% of entities
          const deleteCount = Math.floor(size * 0.05);
          const entitiesToDelete: string[] = [];
          for (let i = 0; i < deleteCount; i++) {
            const idx = Math.floor(Math.random() * size);
            entitiesToDelete.push(entities[idx].name);
          }
          
          await storage.deleteEntities(entitiesToDelete);
          
          await storage.close();
        });
      });
    });
  });
}

// Memory usage benchmark
describe('Memory Usage Comparison', () => {
  DATASET_SIZES.forEach(size => {
    bench(`JSON - Memory after loading ${size.toLocaleString()} entities`, async () => {
      const testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-mem-json-'));
      const storage = new JSONStorage(path.join(testDir, 'test.jsonl'));
      await storage.initialize();
      
      const { entities, relations } = generateTestData(size);
      await storage.createEntities(entities);
      await storage.createRelations(relations);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Measure memory
      const memUsage = process.memoryUsage();
      console.log(`JSON Memory (${size} entities): RSS=${(memUsage.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      await storage.close();
      await fs.rm(testDir, { recursive: true, force: true });
    });
    
    bench(`SQLite - Memory after loading ${size.toLocaleString()} entities`, async () => {
      const testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-mem-sqlite-'));
      const storage = new SQLiteStorage(path.join(testDir, 'test.db'));
      await storage.initialize();
      
      const { entities, relations } = generateTestData(size);
      await storage.createEntities(entities);
      await storage.createRelations(relations);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Measure memory
      const memUsage = process.memoryUsage();
      console.log(`SQLite Memory (${size} entities): RSS=${(memUsage.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      await storage.close();
      await fs.rm(testDir, { recursive: true, force: true });
    });
  });
});

// Run benchmarks for both storage backends
benchmarkStorage('JSON', () => {
  const testPath = path.join(tmpdir(), `json-bench-${Date.now()}.jsonl`);
  return new JSONStorage(testPath);
});

benchmarkStorage('SQLite', () => {
  const testPath = path.join(tmpdir(), `sqlite-bench-${Date.now()}.db`);
  return new SQLiteStorage(testPath);
});