import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { Entity, Relation, KnowledgeGraph } from '../types.js';
import { IStorageBackend, IStorageConfig } from './interface.js';

/**
 * SQLite storage backend for scalable knowledge graph storage.
 */
export class SQLiteStorage implements IStorageBackend {
  private db: Database.Database;
  private filePath: string;

  constructor(config: IStorageConfig) {
    // Use provided file path or default
    const defaultPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)), 
      '..', 
      'memory.db'
    );

    this.filePath = config.filePath || defaultPath;

    // Handle relative paths
    if (!path.isAbsolute(this.filePath)) {
      this.filePath = path.join(
        path.dirname(fileURLToPath(import.meta.url)), 
        '..', 
        this.filePath
      );
    }

    // Initialize database connection
    this.db = new Database(this.filePath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.db.pragma('foreign_keys = ON');  // Enable foreign key constraints
  }

  async initialize(): Promise<void> {
    // Create tables if they don't exist
    this.db.exec(`
      -- Entities table
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        entity_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Observations table
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        UNIQUE(entity_id, content)
      );

      -- Relations table
      CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id INTEGER NOT NULL,
        to_entity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        UNIQUE(from_entity_id, to_entity_id, relation_type)
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
      CREATE INDEX IF NOT EXISTS idx_observations_content ON observations(content);
      CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);

      -- Trigger to update updated_at timestamp
      CREATE TRIGGER IF NOT EXISTS update_entity_timestamp 
      AFTER UPDATE ON entities 
      BEGIN
        UPDATE entities SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  }

  async loadGraph(): Promise<KnowledgeGraph> {
    // Load all entities with their observations
    const entities = this.db.prepare(`
      SELECT e.id, e.name, e.entity_type
      FROM entities e
      ORDER BY e.name
    `).all() as Array<{ id: number; name: string; entity_type: string }>;

    // Load observations for each entity
    const getObservations = this.db.prepare(`
      SELECT content FROM observations WHERE entity_id = ? ORDER BY created_at
    `);

    const entitiesWithObservations: Entity[] = entities.map(entity => ({
      name: entity.name,
      entityType: entity.entity_type,
      observations: (getObservations.all(entity.id) as Array<{ content: string }>)
        .map(obs => obs.content)
    }));

    // Load all relations
    const relations = this.db.prepare(`
      SELECT 
        e1.name as from_name,
        e2.name as to_name,
        r.relation_type
      FROM relations r
      JOIN entities e1 ON r.from_entity_id = e1.id
      JOIN entities e2 ON r.to_entity_id = e2.id
      ORDER BY r.created_at
    `).all() as Array<{
      from_name: string;
      to_name: string;
      relation_type: string;
    }>;

    return {
      entities: entitiesWithObservations,
      relations: relations.map(r => ({
        from: r.from_name,
        to: r.to_name,
        relationType: r.relation_type
      }))
    };
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // This method is primarily for JSON compatibility
    // For SQLite, we'll implement it as a complete replacement
    const transaction = this.db.transaction(() => {
      // Clear existing data
      this.db.prepare('DELETE FROM relations').run();
      this.db.prepare('DELETE FROM observations').run();
      this.db.prepare('DELETE FROM entities').run();

      // Insert entities and observations
      const insertEntity = this.db.prepare(
        'INSERT INTO entities (name, entity_type) VALUES (?, ?)'
      );
      const insertObservation = this.db.prepare(
        'INSERT INTO observations (entity_id, content) VALUES (?, ?)'
      );

      for (const entity of graph.entities) {
        const result = insertEntity.run(entity.name, entity.entityType);
        const entityId = result.lastInsertRowid;

        for (const observation of entity.observations) {
          insertObservation.run(entityId, observation);
        }
      }

      // Insert relations
      const insertRelation = this.db.prepare(`
        INSERT INTO relations (from_entity_id, to_entity_id, relation_type)
        SELECT e1.id, e2.id, ?
        FROM entities e1, entities e2
        WHERE e1.name = ? AND e2.name = ?
      `);

      for (const relation of graph.relations) {
        insertRelation.run(relation.relationType, relation.from, relation.to);
      }
    });

    transaction();
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const created: Entity[] = [];
    const insertEntity = this.db.prepare(
      'INSERT OR IGNORE INTO entities (name, entity_type) VALUES (?, ?)'
    );
    const insertObservation = this.db.prepare(
      'INSERT OR IGNORE INTO observations (entity_id, content) VALUES (?, ?)'
    );

    const transaction = this.db.transaction(() => {
      for (const entity of entities) {
        const result = insertEntity.run(entity.name, entity.entityType);
        
        if (result.changes > 0) {
          // Entity was created
          const entityId = result.lastInsertRowid;
          
          // Add observations
          for (const observation of entity.observations) {
            insertObservation.run(entityId, observation);
          }
          
          created.push(entity);
        }
      }
    });

    transaction();
    return created;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const created: Relation[] = [];
    const insertRelation = this.db.prepare(`
      INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type)
      SELECT e1.id, e2.id, ?
      FROM entities e1, entities e2
      WHERE e1.name = ? AND e2.name = ?
    `);

    const transaction = this.db.transaction(() => {
      for (const relation of relations) {
        const result = insertRelation.run(
          relation.relationType, 
          relation.from, 
          relation.to
        );
        
        if (result.changes > 0) {
          created.push(relation);
        }
      }
    });

    transaction();
    return created;
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const results: { entityName: string; addedObservations: string[] }[] = [];
    
    const getEntityId = this.db.prepare('SELECT id FROM entities WHERE name = ?');
    const insertObservation = this.db.prepare(
      'INSERT OR IGNORE INTO observations (entity_id, content) VALUES (?, ?)'
    );

    const transaction = this.db.transaction(() => {
      for (const obs of observations) {
        const entity = getEntityId.get(obs.entityName) as { id: number } | undefined;
        
        if (!entity) {
          throw new Error(`Entity with name ${obs.entityName} not found`);
        }

        const added: string[] = [];
        for (const content of obs.contents) {
          const result = insertObservation.run(entity.id, content);
          if (result.changes > 0) {
            added.push(content);
          }
        }

        results.push({
          entityName: obs.entityName,
          addedObservations: added
        });
      }
    });

    transaction();
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const deleteEntity = this.db.prepare('DELETE FROM entities WHERE name = ?');
    
    const transaction = this.db.transaction(() => {
      for (const name of entityNames) {
        deleteEntity.run(name);
      }
    });

    transaction();
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    const deleteObservation = this.db.prepare(`
      DELETE FROM observations 
      WHERE entity_id = (SELECT id FROM entities WHERE name = ?)
      AND content = ?
    `);

    const transaction = this.db.transaction(() => {
      for (const del of deletions) {
        for (const observation of del.observations) {
          deleteObservation.run(del.entityName, observation);
        }
      }
    });

    transaction();
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const deleteRelation = this.db.prepare(`
      DELETE FROM relations 
      WHERE from_entity_id = (SELECT id FROM entities WHERE name = ?)
      AND to_entity_id = (SELECT id FROM entities WHERE name = ?)
      AND relation_type = ?
    `);

    const transaction = this.db.transaction(() => {
      for (const relation of relations) {
        deleteRelation.run(relation.from, relation.to, relation.relationType);
      }
    });

    transaction();
  }

  async searchEntities(query: string): Promise<Entity[]> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    
    // Search in entity names, types, and observation content
    const searchResults = this.db.prepare(`
      SELECT DISTINCT e.id, e.name, e.entity_type
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      WHERE LOWER(e.name) LIKE ?
         OR LOWER(e.entity_type) LIKE ?
         OR LOWER(o.content) LIKE ?
      ORDER BY e.name
    `).all(lowerQuery, lowerQuery, lowerQuery) as Array<{
      id: number;
      name: string;
      entity_type: string;
    }>;

    // Get observations for each entity
    const getObservations = this.db.prepare(`
      SELECT content FROM observations WHERE entity_id = ? ORDER BY created_at
    `);

    return searchResults.map(entity => ({
      name: entity.name,
      entityType: entity.entity_type,
      observations: (getObservations.all(entity.id) as Array<{ content: string }>)
        .map(obs => obs.content)
    }));
  }

  async getEntities(names: string[]): Promise<Entity[]> {
    if (names.length === 0) return [];

    const placeholders = names.map(() => '?').join(',');
    const entities = this.db.prepare(`
      SELECT id, name, entity_type
      FROM entities
      WHERE name IN (${placeholders})
      ORDER BY name
    `).all(...names) as Array<{ id: number; name: string; entity_type: string }>;

    const getObservations = this.db.prepare(`
      SELECT content FROM observations WHERE entity_id = ? ORDER BY created_at
    `);

    return entities.map(entity => ({
      name: entity.name,
      entityType: entity.entity_type,
      observations: (getObservations.all(entity.id) as Array<{ content: string }>)
        .map(obs => obs.content)
    }));
  }

  async getRelations(entityNames: string[]): Promise<Relation[]> {
    let query: string;
    let params: string[] = [];

    if (entityNames.length === 0) {
      // Get all relations
      query = `
        SELECT 
          e1.name as from_name,
          e2.name as to_name,
          r.relation_type
        FROM relations r
        JOIN entities e1 ON r.from_entity_id = e1.id
        JOIN entities e2 ON r.to_entity_id = e2.id
        ORDER BY r.created_at
      `;
    } else {
      // Get relations involving specific entities
      const placeholders = entityNames.map(() => '?').join(',');
      query = `
        SELECT 
          e1.name as from_name,
          e2.name as to_name,
          r.relation_type
        FROM relations r
        JOIN entities e1 ON r.from_entity_id = e1.id
        JOIN entities e2 ON r.to_entity_id = e2.id
        WHERE e1.name IN (${placeholders})
           OR e2.name IN (${placeholders})
        ORDER BY r.created_at
      `;
      params = [...entityNames, ...entityNames];
    }

    const relations = this.db.prepare(query).all(...params) as Array<{
      from_name: string;
      to_name: string;
      relation_type: string;
    }>;

    return relations.map(r => ({
      from: r.from_name,
      to: r.to_name,
      relationType: r.relation_type
    }));
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async getStats(): Promise<{
    entityCount: number;
    relationCount: number;
    observationCount: number;
    storageSize?: number;
  }> {
    const stats = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM entities) as entity_count,
        (SELECT COUNT(*) FROM relations) as relation_count,
        (SELECT COUNT(*) FROM observations) as observation_count
    `).get() as {
      entity_count: number;
      relation_count: number;
      observation_count: number;
    };

    // Get database file size
    const pageCountResult = this.db.pragma('page_count');
    const pageSizeResult = this.db.pragma('page_size');
    const pageCount = typeof pageCountResult === 'number' ? pageCountResult : 0;
    const pageSize = typeof pageSizeResult === 'number' ? pageSizeResult : 0;
    const storageSize = pageCount * pageSize;

    return {
      entityCount: stats.entity_count,
      relationCount: stats.relation_count,
      observationCount: stats.observation_count,
      storageSize
    };
  }
}