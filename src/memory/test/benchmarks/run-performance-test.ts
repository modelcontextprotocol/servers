import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import { Entity, Relation } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Generate test data
function generateTestData(size: number): { entities: Entity[], relations: Relation[] } {
  const entities: Entity[] = [];
  const relations: Relation[] = [];
  
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

// Measure time for an operation
async function measureTime(name: string, fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  const time = end - start;
  console.log(`${name}: ${time.toFixed(2)}ms`);
  return time;
}

// Run benchmarks
async function runBenchmarks() {
  console.log('=== Performance Comparison: JSON vs SQLite ===\n');
  
  const sizes = [100, 1000, 10000];
  const results: any = {};
  
  for (const size of sizes) {
    console.log(`\n--- Testing with ${size} entities ---`);
    const { entities, relations } = generateTestData(size);
    
    results[size] = { json: {}, sqlite: {} };
    
    // Test JSON Storage
    console.log('\nJSON Storage:');
    const jsonPath = path.join(tmpdir(), `json-test-${Date.now()}.jsonl`);
    const jsonStorage = new JSONStorage(jsonPath);
    
    await measureTime('  Initialize', async () => {
      await jsonStorage.initialize();
    });
    
    results[size].json.create = await measureTime('  Create entities', async () => {
      await jsonStorage.createEntities(entities);
    });
    
    results[size].json.relations = await measureTime('  Create relations', async () => {
      await jsonStorage.createRelations(relations);
    });
    
    results[size].json.search = await measureTime('  Search (10 queries)', async () => {
      for (let i = 0; i < 10; i++) {
        await jsonStorage.searchEntities(entities[i].name);
      }
    });
    
    results[size].json.read = await measureTime('  Read full graph', async () => {
      await jsonStorage.loadGraph();
    });
    
    const jsonMemBefore = process.memoryUsage();
    await jsonStorage.loadGraph();
    const jsonMemAfter = process.memoryUsage();
    results[size].json.memory = (jsonMemAfter.heapUsed - jsonMemBefore.heapUsed) / 1024 / 1024;
    console.log(`  Memory used: ${results[size].json.memory.toFixed(2)}MB`);
    
    await jsonStorage.close();
    await fs.rm(jsonPath, { force: true });
    
    // Test SQLite Storage
    console.log('\nSQLite Storage:');
    const sqlitePath = path.join(tmpdir(), `sqlite-test-${Date.now()}.db`);
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    
    await measureTime('  Initialize', async () => {
      await sqliteStorage.initialize();
    });
    
    results[size].sqlite.create = await measureTime('  Create entities', async () => {
      await sqliteStorage.createEntities(entities);
    });
    
    results[size].sqlite.relations = await measureTime('  Create relations', async () => {
      await sqliteStorage.createRelations(relations);
    });
    
    results[size].sqlite.search = await measureTime('  Search (10 queries)', async () => {
      for (let i = 0; i < 10; i++) {
        await sqliteStorage.searchEntities(entities[i].name);
      }
    });
    
    results[size].sqlite.read = await measureTime('  Read full graph', async () => {
      await sqliteStorage.loadGraph();
    });
    
    const sqliteMemBefore = process.memoryUsage();
    await sqliteStorage.loadGraph();
    const sqliteMemAfter = process.memoryUsage();
    results[size].sqlite.memory = (sqliteMemAfter.heapUsed - sqliteMemBefore.heapUsed) / 1024 / 1024;
    console.log(`  Memory used: ${results[size].sqlite.memory.toFixed(2)}MB`);
    
    await sqliteStorage.close();
    await fs.rm(sqlitePath, { force: true });
  }
  
  // Generate summary report
  console.log('\n\n=== PERFORMANCE SUMMARY ===\n');
  console.log('Performance improvement (SQLite vs JSON):');
  
  for (const size of sizes) {
    console.log(`\n${size} entities:`);
    const r = results[size];
    
    const createImprovement = ((r.json.create / r.sqlite.create) - 1) * 100;
    const searchImprovement = ((r.json.search / r.sqlite.search) - 1) * 100;
    const readImprovement = ((r.json.read / r.sqlite.read) - 1) * 100;
    const memoryReduction = ((r.json.memory - r.sqlite.memory) / r.json.memory) * 100;
    
    console.log(`  Create entities: ${createImprovement > 0 ? '+' : ''}${createImprovement.toFixed(0)}%`);
    console.log(`  Search operations: ${searchImprovement > 0 ? '+' : ''}${searchImprovement.toFixed(0)}%`);
    console.log(`  Read full graph: ${readImprovement > 0 ? '+' : ''}${readImprovement.toFixed(0)}%`);
    console.log(`  Memory usage: ${memoryReduction > 0 ? '-' : '+'}${Math.abs(memoryReduction).toFixed(0)}%`);
  }
  
  console.log('\n✅ Performance benchmarks complete!');
}

// Run the benchmarks
runBenchmarks().catch(console.error);