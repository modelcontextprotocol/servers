import { describe, bench, beforeAll, afterAll } from 'vitest';
import { IStorageBackend } from '../../storage/interface.js';
import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import { Entity, Relation } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Quick benchmark with smaller datasets
const DATASET_SIZES = [100, 1000];

// Generate test data
function generateTestData(size: number): { entities: Entity[], relations: Relation[] } {
  const entities: Entity[] = [];
  const relations: Relation[] = [];
  
  // Generate entities
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
  
  // Generate relations (roughly 2x entities)
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

// Quick comparison benchmark
describe('Quick Performance Comparison', () => {
  DATASET_SIZES.forEach(size => {
    const { entities, relations } = generateTestData(size);
    
    describe(`${size} entities`, () => {
      bench('JSON - Full workflow', async () => {
        const testPath = path.join(tmpdir(), `json-quick-${Date.now()}.jsonl`);
        const storage = new JSONStorage(testPath);
        
        await storage.initialize();
        await storage.createEntities(entities);
        await storage.createRelations(relations);
        await storage.searchNodes(entities[0].name);
        await storage.readGraph();
        await storage.close();
        
        await fs.rm(testPath, { force: true });
      });
      
      bench('SQLite - Full workflow', async () => {
        const testPath = path.join(tmpdir(), `sqlite-quick-${Date.now()}.db`);
        const storage = new SQLiteStorage(testPath);
        
        await storage.initialize();
        await storage.createEntities(entities);
        await storage.createRelations(relations);
        await storage.searchNodes(entities[0].name);
        await storage.readGraph();
        await storage.close();
        
        await fs.rm(testPath, { force: true });
      });
    });
  });
});