import { Entity, Relation, KnowledgeGraph } from './types.js';
import { IStorageBackend } from './storage/interface.js';

/**
 * KnowledgeGraphManager with pluggable storage backend.
 */
export class KnowledgeGraphManager {
  constructor(private storage: IStorageBackend) {}

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    return this.storage.createEntities(entities);
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    return this.storage.createRelations(relations);
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    return this.storage.addObservations(observations);
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    return this.storage.deleteEntities(entityNames);
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    return this.storage.deleteObservations(deletions);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    return this.storage.deleteRelations(relations);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.storage.loadGraph();
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const entities = await this.storage.searchEntities(query);
    
    // Get entity names for relation filtering
    const entityNames = entities.map(e => e.name);
    
    // Get relations between these entities
    const allRelations = await this.storage.getRelations([]);
    const filteredRelations = allRelations.filter(r => 
      entityNames.includes(r.from) && entityNames.includes(r.to)
    );
    
    return {
      entities,
      relations: filteredRelations,
    };
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const entities = await this.storage.getEntities(names);
    
    // Get relations between these entities
    const allRelations = await this.storage.getRelations(names);
    const entityNameSet = new Set(entities.map(e => e.name));
    const filteredRelations = allRelations.filter(r => 
      entityNameSet.has(r.from) && entityNameSet.has(r.to)
    );
    
    return {
      entities,
      relations: filteredRelations,
    };
  }

  async getStats(): Promise<{
    entityCount: number;
    relationCount: number;
    observationCount: number;
    storageSize?: number;
  }> {
    return this.storage.getStats();
  }
}