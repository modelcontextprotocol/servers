/**
 * Core types for the MCP memory server.
 */

/**
 * An entity in the knowledge graph.
 */
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

/**
 * A relation between two entities.
 */
export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

/**
 * The complete knowledge graph structure.
 */
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

/**
 * Metadata about an entity (for future enhancements).
 */
export interface EntityMetadata {
  createdAt?: Date;
  updatedAt?: Date;
  namespace?: string;
  tags?: string[];
}