#!/usr/bin/env node

import { SQLiteStorage } from './storage/sqlite-storage.js';
import { Entity, Relation } from './types.js';

async function testSQLiteStorage() {
  console.log('Testing SQLite Storage Backend...\n');

  // Create storage instance
  const storage = new SQLiteStorage({
    type: 'sqlite',
    filePath: 'test-memory.db'
  });

  try {
    // Initialize storage
    await storage.initialize();
    console.log('✓ Storage initialized');

    // Test creating entities
    const entities: Entity[] = [
      {
        name: 'Test User',
        entityType: 'Person',
        observations: ['Likes testing', 'Uses SQLite']
      },
      {
        name: 'Test Project',
        entityType: 'Software',
        observations: ['Written in TypeScript', 'Uses MCP']
      }
    ];

    const created = await storage.createEntities(entities);
    console.log(`✓ Created ${created.length} entities`);

    // Test creating relations
    const relations: Relation[] = [
      {
        from: 'Test User',
        to: 'Test Project',
        relationType: 'created'
      }
    ];

    const createdRelations = await storage.createRelations(relations);
    console.log(`✓ Created ${createdRelations.length} relations`);

    // Test adding observations
    const newObservations = await storage.addObservations([
      {
        entityName: 'Test User',
        contents: ['Enjoys automated testing', 'Prefers SQLite over JSON']
      }
    ]);
    console.log(`✓ Added ${newObservations[0].addedObservations.length} new observations`);

    // Test searching
    const searchResults = await storage.searchEntities('SQLite');
    console.log(`✓ Search found ${searchResults.length} entities`);

    // Test loading full graph
    const graph = await storage.loadGraph();
    console.log(`✓ Loaded graph with ${graph.entities.length} entities and ${graph.relations.length} relations`);

    // Test stats
    const stats = await storage.getStats();
    console.log('\nStorage Statistics:');
    console.log(`  Entities: ${stats.entityCount}`);
    console.log(`  Relations: ${stats.relationCount}`);
    console.log(`  Observations: ${stats.observationCount}`);
    console.log(`  Storage Size: ${stats.storageSize} bytes`);

    // Clean up
    await storage.close();
    console.log('\n✓ All tests passed!');

  } catch (error) {
    console.error('Test failed:', error);
    await storage.close();
    process.exit(1);
  }
}

// Run tests
testSQLiteStorage().catch(console.error);