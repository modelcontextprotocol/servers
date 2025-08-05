import { Entity, Relation, KnowledgeGraph } from '../types.js';

/**
 * Storage backend interface for the MCP memory server.
 * All storage implementations must implement this interface.
 */
export interface IStorageBackend {
  /**
   * Initialize the storage backend.
   * This method should handle creating necessary tables, files, or connections.
   */
  initialize(): Promise<void>;

  /**
   * Load the entire knowledge graph from storage.
   */
  loadGraph(): Promise<KnowledgeGraph>;

  /**
   * Save the entire knowledge graph to storage.
   * This is primarily for JSON compatibility - other backends may implement more efficiently.
   */
  saveGraph(graph: KnowledgeGraph): Promise<void>;

  /**
   * Create new entities in storage.
   * Returns the entities that were actually created (excluding duplicates).
   */
  createEntities(entities: Entity[]): Promise<Entity[]>;

  /**
   * Create new relations in storage.
   * Returns the relations that were actually created (excluding duplicates).
   */
  createRelations(relations: Relation[]): Promise<Relation[]>;

  /**
   * Add observations to existing entities.
   * Returns the observations that were actually added (excluding duplicates).
   */
  addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]>;

  /**
   * Delete entities by name.
   * Also deletes all relations involving these entities.
   */
  deleteEntities(entityNames: string[]): Promise<void>;

  /**
   * Delete specific observations from entities.
   */
  deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void>;

  /**
   * Delete specific relations.
   */
  deleteRelations(relations: Relation[]): Promise<void>;

  /**
   * Search for entities matching a query.
   * Should search in entity names, types, and observation content.
   */
  searchEntities(query: string): Promise<Entity[]>;

  /**
   * Get specific entities by name.
   */
  getEntities(names: string[]): Promise<Entity[]>;

  /**
   * Get relations involving specific entities.
   * If entityNames is empty, returns all relations.
   */
  getRelations(entityNames: string[]): Promise<Relation[]>;

  /**
   * Perform any cleanup operations (close connections, etc).
   */
  close(): Promise<void>;

  /**
   * Get storage backend statistics for monitoring.
   */
  getStats(): Promise<{
    entityCount: number;
    relationCount: number;
    observationCount: number;
    storageSize?: number;
  }>;
}

/**
 * Storage backend configuration options.
 */
export interface IStorageConfig {
  type: 'json' | 'sqlite' | 'postgres' | 'custom';
  connectionString?: string;
  filePath?: string;
  options?: Record<string, any>;
}

/**
 * Factory for creating storage backends.
 */
export interface IStorageFactory {
  create(config: IStorageConfig): Promise<IStorageBackend>;
}