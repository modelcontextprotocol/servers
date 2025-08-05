#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSONStorage } from './storage/json-storage.js';
import { SQLiteStorage } from './storage/sqlite-storage.js';
import { IStorageConfig } from './storage/interface.js';

/**
 * Migration tool to convert JSON memory storage to SQLite.
 */
async function migrateJSONToSQLite(
  jsonPath?: string,
  sqlitePath?: string,
  options: { backup?: boolean; verify?: boolean } = {}
) {
  console.log('MCP Memory Migration Tool: JSON → SQLite\n');

  // Configure storage paths
  const jsonConfig: IStorageConfig = {
    type: 'json',
    filePath: jsonPath || process.env.MEMORY_FILE_PATH
  };

  const sqliteConfig: IStorageConfig = {
    type: 'sqlite',
    filePath: sqlitePath || process.env.SQLITE_PATH || 'memory.db'
  };

  // Create storage instances
  const jsonStorage = new JSONStorage(jsonConfig);
  const sqliteStorage = new SQLiteStorage(sqliteConfig);

  try {
    // Initialize storages
    await jsonStorage.initialize();
    await sqliteStorage.initialize();

    // Load data from JSON
    console.log('📖 Reading JSON data...');
    const graph = await jsonStorage.loadGraph();
    const jsonStats = await jsonStorage.getStats();
    
    console.log(`   Found ${jsonStats.entityCount} entities`);
    console.log(`   Found ${jsonStats.relationCount} relations`);
    console.log(`   Found ${jsonStats.observationCount} observations`);
    console.log(`   JSON file size: ${jsonStats.storageSize} bytes\n`);

    // Create backup if requested
    if (options.backup && jsonPath) {
      const backupPath = `${jsonPath}.backup-${Date.now()}`;
      console.log(`💾 Creating backup: ${backupPath}`);
      await fs.copyFile(jsonPath, backupPath);
    }

    // Migrate data to SQLite
    console.log('🔄 Migrating to SQLite...');
    
    // Clear any existing data in SQLite
    await sqliteStorage.deleteEntities(
      (await sqliteStorage.loadGraph()).entities.map(e => e.name)
    );

    // Create entities with observations
    let createdCount = 0;
    for (const entity of graph.entities) {
      const created = await sqliteStorage.createEntities([entity]);
      createdCount += created.length;
      if (createdCount % 100 === 0) {
        process.stdout.write(`   Created ${createdCount} entities...\r`);
      }
    }
    console.log(`   ✓ Created ${createdCount} entities         `);

    // Create relations
    const createdRelations = await sqliteStorage.createRelations(graph.relations);
    console.log(`   ✓ Created ${createdRelations.length} relations`);

    // Verify migration if requested
    if (options.verify) {
      console.log('\n🔍 Verifying migration...');
      
      const sqliteGraph = await sqliteStorage.loadGraph();
      const sqliteStats = await sqliteStorage.getStats();

      const entitiesMatch = sqliteStats.entityCount === jsonStats.entityCount;
      const relationsMatch = sqliteStats.relationCount === jsonStats.relationCount;
      const observationsMatch = sqliteStats.observationCount === jsonStats.observationCount;

      console.log(`   Entities: ${entitiesMatch ? '✓' : '✗'} (${sqliteStats.entityCount})`);
      console.log(`   Relations: ${relationsMatch ? '✓' : '✗'} (${sqliteStats.relationCount})`);
      console.log(`   Observations: ${observationsMatch ? '✓' : '✗'} (${sqliteStats.observationCount})`);

      if (!entitiesMatch || !relationsMatch || !observationsMatch) {
        throw new Error('Migration verification failed - counts do not match');
      }

      // Spot check some entities
      const sampleSize = Math.min(5, graph.entities.length);
      for (let i = 0; i < sampleSize; i++) {
        const originalEntity = graph.entities[i];
        const migratedEntities = await sqliteStorage.getEntities([originalEntity.name]);
        
        if (migratedEntities.length !== 1) {
          throw new Error(`Entity '${originalEntity.name}' not found in SQLite`);
        }

        const migratedEntity = migratedEntities[0];
        if (migratedEntity.observations.length !== originalEntity.observations.length) {
          throw new Error(`Observation count mismatch for entity '${originalEntity.name}'`);
        }
      }

      console.log(`   ✓ Spot check passed (${sampleSize} entities verified)`);
    }

    // Show final stats
    const sqliteStats = await sqliteStorage.getStats();
    console.log('\n✅ Migration completed successfully!');
    console.log(`   SQLite database size: ${sqliteStats.storageSize} bytes`);
    console.log(`   Size reduction: ${Math.round((1 - (sqliteStats.storageSize! / jsonStats.storageSize!)) * 100)}%`);

    // Close connections
    await jsonStorage.close();
    await sqliteStorage.close();

    console.log('\n📌 Next steps:');
    console.log('   1. Set STORAGE_TYPE=sqlite in your environment');
    console.log(`   2. Set SQLITE_PATH=${sqliteConfig.filePath} (or use default)`);
    console.log('   3. Test the migration with your MCP client');
    console.log('   4. Keep the JSON backup until you verify everything works\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await jsonStorage.close();
    await sqliteStorage.close();
    process.exit(1);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node migrate.js [options]');
    console.log('\nOptions:');
    console.log('  --json <path>     Path to JSON memory file (default: from env or memory.json)');
    console.log('  --sqlite <path>   Path to SQLite database (default: from env or memory.db)');
    console.log('  --backup          Create backup of JSON file before migration');
    console.log('  --verify          Verify data integrity after migration');
    console.log('  --help            Show this help message');
    console.log('\nExample:');
    console.log('  node migrate.js --json memory.json --sqlite memory.db --backup --verify');
    process.exit(0);
  }

  const jsonIndex = args.indexOf('--json');
  const sqliteIndex = args.indexOf('--sqlite');
  
  const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : undefined;
  const sqlitePath = sqliteIndex >= 0 ? args[sqliteIndex + 1] : undefined;
  
  const options = {
    backup: args.includes('--backup'),
    verify: args.includes('--verify')
  };

  migrateJSONToSQLite(jsonPath, sqlitePath, options).catch(console.error);
}

export { migrateJSONToSQLite };