#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Default path for the memory file.
 * @internal
 */
export const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.jsonl');

/**
 * Ensures the memory file path is properly configured.
 * Handles backward compatibility by migrating from memory.json to memory.jsonl if needed.
 * @internal
 */
export async function ensureMemoryFilePath(): Promise<string> {
  if (process.env.MEMORY_FILE_PATH) {
    // Custom path provided, use it as-is (with absolute path resolution)
    return path.isAbsolute(process.env.MEMORY_FILE_PATH)
      ? process.env.MEMORY_FILE_PATH
      : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_FILE_PATH);
  }
  
  // No custom path set, check for backward compatibility migration
  const oldMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');
  const newMemoryPath = defaultMemoryPath;
  
  try {
    // Check if old file exists and new file doesn't
    await fs.access(oldMemoryPath);
    try {
      await fs.access(newMemoryPath);
      // Both files exist, use new one (no migration needed)
      return newMemoryPath;
    } catch {
      // Old file exists, new file doesn't - migrate
      console.error('DETECTED: Found legacy memory.json file, migrating to memory.jsonl for JSONL format compatibility');
      await fs.rename(oldMemoryPath, newMemoryPath);
      console.error('COMPLETED: Successfully migrated memory.json to memory.jsonl');
      return newMemoryPath;
    }
  } catch {
    // Old file doesn't exist, use new path
    return newMemoryPath;
  }
}

// Initialize memory file path (will be set during startup)
let MEMORY_FILE_PATH: string;

/**
 * Entity in the knowledge graph.
 * Represents a node with a name, type, and associated observations.
 */
export interface Entity {
  readonly name: string;
  readonly entityType: string;
  readonly observations: readonly string[];
}

/**
 * Relation between two entities in the knowledge graph.
 * Represents a directed edge from one entity to another.
 */
export interface Relation {
  readonly from: string;
  readonly to: string;
  readonly relationType: string;
}

/**
 * The complete knowledge graph structure.
 * Contains all entities and their relationships.
 */
export interface KnowledgeGraph {
  readonly entities: readonly Entity[];
  readonly relations: readonly Relation[];
}

/**
 * Manages all operations for the knowledge graph.
 * Provides methods to create, read, update, and delete entities and relations.
 */
export class KnowledgeGraphManager {
  constructor(private readonly memoryFilePath: string) {}

  /**
   * Loads the knowledge graph from disk.
   * @internal
   */
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: { entities: Entity[], relations: Relation[] }, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") graph.entities.push(item as Entity);
        if (item.type === "relation") graph.relations.push(item as Relation);
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  /**
   * Saves the knowledge graph to disk.
   * @internal
   */
  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({
        type: "entity",
        name: e.name,
        entityType: e.entityType,
        observations: e.observations
      })),
      ...graph.relations.map(r => JSON.stringify({
        type: "relation",
        from: r.from,
        to: r.to,
        relationType: r.relationType
      })),
    ];
    await fs.writeFile(this.memoryFilePath, lines.join("\n"));
  }

  /**
   * Creates new entities in the knowledge graph.
   * Only creates entities that don't already exist.
   * @param entities - Array of entities to create
   * @returns Array of newly created entities
   */
  async createEntities(entities: readonly Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    const updatedGraph = {
      entities: [...graph.entities, ...newEntities],
      relations: [...graph.relations]
    };
    await this.saveGraph(updatedGraph);
    return [...newEntities];
  }

  /**
   * Creates new relations in the knowledge graph.
   * Only creates relations that don't already exist.
   * @param relations - Array of relations to create
   * @returns Array of newly created relations
   */
  async createRelations(relations: readonly Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(r => !graph.relations.some(existingRelation =>
      existingRelation.from === r.from &&
      existingRelation.to === r.to &&
      existingRelation.relationType === r.relationType
    ));
    const updatedGraph = {
      entities: [...graph.entities],
      relations: [...graph.relations, ...newRelations]
    };
    await this.saveGraph(updatedGraph);
    return [...newRelations];
  }

  /**
   * Adds observations to existing entities.
   * Only adds observations that don't already exist for each entity.
   * @param observations - Array of observations to add
   * @returns Array of results showing what was added
   * @throws {Error} If an entity is not found
   */
  async addObservations(observations: readonly { entityName: string; contents: readonly string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results: { entityName: string; addedObservations: string[] }[] = [];
    const updatedEntities = graph.entities.map(entity => {
      const observation = observations.find(o => o.entityName === entity.name);
      if (!observation) return entity;

      const newObservations = observation.contents.filter(content => !entity.observations.includes(content));
      results.push({ entityName: entity.name, addedObservations: [...newObservations] });

      return {
        ...entity,
        observations: [...entity.observations, ...newObservations]
      };
    });

    // Check if all requested entities were found
    observations.forEach(o => {
      if (!graph.entities.some(e => e.name === o.entityName)) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
    });

    await this.saveGraph({
      entities: updatedEntities,
      relations: [...graph.relations]
    });
    return results;
  }

  /**
   * Deletes entities and all relations involving them.
   * @param entityNames - Array of entity names to delete
   */
  async deleteEntities(entityNames: readonly string[]): Promise<void> {
    const graph = await this.loadGraph();
    const updatedGraph = {
      entities: graph.entities.filter(e => !entityNames.includes(e.name)),
      relations: graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to))
    };
    await this.saveGraph(updatedGraph);
  }

  /**
   * Deletes specific observations from entities.
   * @param deletions - Array of deletions specifying entity names and observations to remove
   */
  async deleteObservations(deletions: readonly { entityName: string; observations: readonly string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    const updatedEntities = graph.entities.map(entity => {
      const deletion = deletions.find(d => d.entityName === entity.name);
      if (!deletion) return entity;

      return {
        ...entity,
        observations: entity.observations.filter(o => !deletion.observations.includes(o))
      };
    });
    await this.saveGraph({
      entities: updatedEntities,
      relations: [...graph.relations]
    });
  }

  /**
   * Deletes specific relations from the knowledge graph.
   * @param relations - Array of relations to delete
   */
  async deleteRelations(relations: readonly Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    const updatedGraph = {
      entities: [...graph.entities],
      relations: graph.relations.filter(r => !relations.some(delRelation =>
        r.from === delRelation.from &&
        r.to === delRelation.to &&
        r.relationType === delRelation.relationType
      ))
    };
    await this.saveGraph(updatedGraph);
  }

  /**
   * Reads the entire knowledge graph.
   * @returns The complete knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  /**
   * Searches for nodes in the knowledge graph matching a query.
   * Searches entity names, types, and observations.
   * @param query - The search query
   * @returns A filtered knowledge graph containing matching entities and their relations
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  /**
   * Opens specific nodes by name.
   * @param names - Array of entity names to retrieve
   * @returns A filtered knowledge graph containing the requested entities and their relations
   */
  async openNodes(names: readonly string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }
}

/**
 * Global instance of the knowledge graph manager.
 * @internal
 */
let knowledgeGraphManager: KnowledgeGraphManager;

/**
 * The MCP server instance.
 * @internal
 */
const server = new Server({
  name: "memory-server",
  version: "0.6.3",
},    {
    capabilities: {
      tools: {},
    },
  },);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "Create multiple new entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents associated with the entity"
                  },
                },
                required: ["name", "entityType", "observations"],
                additionalProperties: false,
              },
            },
          },
          required: ["entities"],
          additionalProperties: false,
        },
      },
      {
        name: "create_relations",
        description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
                additionalProperties: false,
              },
            },
          },
          required: ["relations"],
          additionalProperties: false,
        },
      },
      {
        name: "add_observations",
        description: "Add new observations to existing entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity to add the observations to" },
                  contents: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents to add"
                  },
                },
                required: ["entityName", "contents"],
                additionalProperties: false,
              },
            },
          },
          required: ["observations"],
          additionalProperties: false,
        },
      },
      {
        name: "delete_entities",
        description: "Delete multiple entities and their associated relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entityNames: { 
              type: "array", 
              items: { type: "string" },
              description: "An array of entity names to delete" 
            },
          },
          required: ["entityNames"],
          additionalProperties: false,
        },
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity containing the observations" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observations to delete"
                  },
                },
                required: ["entityName", "observations"],
                additionalProperties: false,
              },
            },
          },
          required: ["deletions"],
          additionalProperties: false,
        },
      },
      {
        name: "delete_relations",
        description: "Delete multiple relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: { 
              type: "array", 
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
                additionalProperties: false,
              },
              description: "An array of relations to delete" 
            },
          },
          required: ["relations"],
          additionalProperties: false,
        },
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve",
            },
          },
          required: ["names"],
          additionalProperties: false,
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "read_graph") {
    return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2) }] };
  }

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "create_entities":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createEntities(args.entities as Entity[]), null, 2) }] };
    case "create_relations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createRelations(args.relations as Relation[]), null, 2) }] };
    case "add_observations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.addObservations(args.observations as { entityName: string; contents: string[] }[]), null, 2) }] };
    case "delete_entities":
      await knowledgeGraphManager.deleteEntities(args.entityNames as string[]);
      return { content: [{ type: "text", text: "Entities deleted successfully" }] };
    case "delete_observations":
      await knowledgeGraphManager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[]);
      return { content: [{ type: "text", text: "Observations deleted successfully" }] };
    case "delete_relations":
      await knowledgeGraphManager.deleteRelations(args.relations as Relation[]);
      return { content: [{ type: "text", text: "Relations deleted successfully" }] };
    case "search_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query as string), null, 2) }] };
    case "open_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.openNodes(args.names as string[]), null, 2) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

/**
 * Main entry point for the memory server.
 * @internal
 */
async function main() {
  // Initialize memory file path with backward compatibility
  MEMORY_FILE_PATH = await ensureMemoryFilePath();

  // Initialize knowledge graph manager with the memory file path
  knowledgeGraphManager = new KnowledgeGraphManager(MEMORY_FILE_PATH);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
