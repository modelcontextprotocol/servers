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
import { Entity, Relation, KnowledgeGraph } from './types.js';
import { searchGraph, ScoredKnowledgeGraph } from './query-language.js';

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');

// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

// Helper function to format dates in YYYY-MM-DD format
function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      const graph = lines.reduce((graph: KnowledgeGraph, line) => {
        try {
          const item = JSON.parse(line);
          if (item.type === "entity") graph.entities.push(item as Entity);
          if (item.type === "relation") graph.relations.push(item as Relation);
        } catch (error) {
          console.error(`Error parsing line: ${line}`, error);
        }
        return graph;
      }, { entities: [], relations: [] });

      // Ensure all entities have date fields
      const todayFormatted = formatDate();
      graph.entities.forEach(entity => {
        // Ensure the fields exist
        if (!entity.lastWrite) entity.lastWrite = todayFormatted;
        if (!entity.lastRead) entity.lastRead = todayFormatted;
      });

      return graph;
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({ type: "entity", ...e })),
      ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
    ];
    await fs.writeFile(MEMORY_FILE_PATH, lines.join("\n"));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const todayFormatted = formatDate();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name))
      .map(entity => ({
        ...entity,
        lastRead: todayFormatted,
        lastWrite: todayFormatted,
        isImportant: entity.isImportant || false // Default to false if not specified
      }));
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(r => !graph.relations.some(existingRelation => 
      existingRelation.from === r.from && 
      existingRelation.to === r.to && 
      existingRelation.relationType === r.relationType
    ));
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const todayFormatted = formatDate();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      if (newObservations.length > 0) {
        entity.observations.push(...newObservations);
        entity.lastWrite = todayFormatted;
      }
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    const todayFormatted = formatDate();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        const originalLength = entity.observations.length;
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
        // Only update the date if observations were actually deleted
        if (entity.observations.length < originalLength) {
          entity.lastWrite = todayFormatted;
        }
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
      r.from === delRelation.from && 
      r.to === delRelation.to && 
      r.relationType === delRelation.relationType
    ));
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  /**
   * Searches the knowledge graph with a structured query language.
   * 
   * The query language supports:
   * - type:value - Filter entities by type
   * - name:value - Filter entities by name
   * - +word - Require this term (AND logic)
   * - -word - Exclude this term (NOT logic)
   * - word1|word2|word3 - Match any of these terms (OR logic)
   * - Any other text - Used for fuzzy matching
   * 
   * Example: "type:person +programmer -manager frontend|backend|fullstack" searches for
   * entities of type "person" that contain "programmer", don't contain "manager",
   * and contain at least one of "frontend", "backend", or "fullstack".
   * 
   * Results are sorted by relevance, with exact name matches ranked highest.
   * 
   * @param query The search query string
   * @returns A filtered knowledge graph containing matching entities and their relations
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Get the basic search results with scores
    const searchResult = searchGraph(query, graph);
    
    // Create a map of entity name to search score for quick lookup
    // const searchScores = new Map<string, number>();
    // searchResult.scoredEntities.forEach(scored => {
      // searchScores.set(scored.entity.name, scored.score);
    // });
    
    // Find the maximum search score for normalization
    const maxSearchScore = searchResult.scoredEntities.length > 0 
      ? Math.max(...searchResult.scoredEntities.map(scored => scored.score))
      : 1.0;
    
    // Get all entities sorted by lastRead date (most recent first)
    const entitiesByRecency = [...graph.entities]
      .filter(e => e.lastRead) // Filter out entities without lastRead
      .sort((a, b) => {
        // Sort in descending order (newest first)
        return new Date(b.lastRead!).getTime() - new Date(a.lastRead!).getTime();
      });
    
    // Get the 20 most recently accessed entities
    const top20Recent = new Set(entitiesByRecency.slice(0, 20).map(e => e.name));
    
    // Get the 10 most recently accessed entities (subset of top20)
    const top10Recent = new Set(entitiesByRecency.slice(0, 10).map(e => e.name));
    
    // Score the entities based on the criteria
    const scoredEntities = searchResult.scoredEntities.map(scoredEntity => {
      let score = 0;
      
      // Score based on recency
      if (top20Recent.has(scoredEntity.entity.name)) score += 1;
      if (top10Recent.has(scoredEntity.entity.name)) score += 1;
      
      // Score based on importance
      if (scoredEntity.entity.isImportant) {
        score += 1;
        score *= 2; // Double the score for important entities
      }
      
      // Add normalized search score (0-1 range)
      const searchScore = scoredEntity.score || 0;
      score += searchScore / maxSearchScore;
      
      return { entity: scoredEntity.entity, score };
    });
    
    // Sort by score (highest first) and take top 10
    const topEntities = scoredEntities
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.entity);
    
    // Create a filtered graph with only the top entities
    const filteredEntityNames = new Set(topEntities.map(e => e.name));
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to)
    );
    
    const result: KnowledgeGraph = {
      entities: topEntities,
      relations: filteredRelations
    };
    
    // Update access dates for found entities
    const todayFormatted = formatDate();
    result.entities.forEach(foundEntity => {
      // Find the actual entity in the original graph and update its access date
      const originalEntity = graph.entities.find(e => e.name === foundEntity.name);
      if (originalEntity) {
        originalEntity.lastRead = todayFormatted;
      }
    });
    
    // Save the updated access dates
    await this.saveGraph(graph);
    
    return result;
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const todayFormatted = formatDate();
    
    // Filter entities and update read dates
    const filteredEntities = graph.entities.filter(e => {
      if (names.includes(e.name)) {
        // Update the lastRead whenever an entity is opened
        e.lastRead = todayFormatted;
        return true;
      }
      return false;
    });
  
    // Since we're modifying entities, we need to save the graph
    await this.saveGraph(graph);
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to include those where either from or to entity is in the filtered set
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }

  async setEntityImportance(entityNames: string[], isImportant: boolean): Promise<void> {
    const graph = await this.loadGraph();
    const todayFormatted = formatDate();
    
    entityNames.forEach(name => {
      const entity = graph.entities.find(e => e.name === name);
      if (entity) {
        entity.isImportant = isImportant;
        entity.lastWrite = todayFormatted; // Update lastWrite since we're modifying the entity
      }
    });
    
    await this.saveGraph(graph);
  }
}

const knowledgeGraphManager = new KnowledgeGraphManager();


// The server instance and tools exposed to Claude
const server = new Server({
  name: "memory-server",
  version: "1.0.0",
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
              },
            },
          },
          required: ["entities"],
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
              },
            },
          },
          required: ["relations"],
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
              },
            },
          },
          required: ["observations"],
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
              },
            },
          },
          required: ["deletions"],
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
              },
              description: "An array of relations to delete" 
            },
          },
          required: ["relations"],
        },
      },
      /* {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }, */
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
          type: "object",
          properties: {
            query: { 
              type: "string", 
              description: "The search query to match against entity names, types, and observation content. Supports a query language with these operators: 'type:value' to filter by entity type, 'name:value' to filter by entity name, '+word' to require a term (AND logic), '-word' to exclude a term (NOT logic). Any remaining text is used for fuzzy matching. Example: 'type:person +programmer -manager frontend|backend|fullstack' searches for entities of type 'person' that contain 'programmer', don't contain 'manager', and contain at least one of 'frontend', 'backend', or 'fullstack'." 
            },
          },
          required: ["query"],
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
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
    case "read_graph":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2) }] };
    case "search_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query as string), null, 2) }] };
    case "open_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.openNodes(args.names as string[]), null, 2) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
