
// We are storing our memory using entities, relations, and observations in a graph structure
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// The KnowledgeGraphMemory interface contains all operations to interact with the knowledge graph
export interface KnowledgeGraphMemory {

  createEntities(entities: Entity[]): Promise<Entity[]>;

  createRelations(relations: Relation[]): Promise<Relation[]>;

  addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]>;
  
  deleteEntities(entityNames: string[]): Promise<void>;

  deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void>;

  deleteRelations(relations: Relation[]): Promise<void>;

  readGraph(): Promise<KnowledgeGraph>;

  // Very basic search function
  searchNodes(query: string): Promise<KnowledgeGraph>;

  openNodes(names: string[]): Promise<KnowledgeGraph>;

}

