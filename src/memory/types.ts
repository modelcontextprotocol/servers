/**
 * Represents an entity in the knowledge graph
 */
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  lastRead?: string;    // Format: "YYYY-MM-DD"
  lastWrite?: string;   // Format: "YYYY-MM-DD" - Combined creation and update date
  isImportant?: boolean; // Marker for important entities
}

/**
 * Represents a relation between entities in the knowledge graph
 */
export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

/**
 * Represents a knowledge graph with entities and relations
 */
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
} 