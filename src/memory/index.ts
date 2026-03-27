#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define memory file path using environment variable with fallback
export const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.jsonl');

// Handle backward compatibility: migrate memory.json to memory.jsonl if needed
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

// We are storing our memory using entities, relations, and observations in a graph structure
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  priority: number; // 1-5, 5 is highest
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
export class KnowledgeGraphManager {
  constructor(private memoryFilePath: string) {}

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") {
          graph.entities.push({
            name: item.name,
            entityType: item.entityType,
            observations: item.observations || [],
            tags: item.tags || [],
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString(),
            priority: item.priority || 3
          });
        }
        if (item.type === "relation") {
          graph.relations.push({
            from: item.from,
            to: item.to,
            relationType: item.relationType,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString()
          });
        }
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({
        type: "entity",
        name: e.name,
        entityType: e.entityType,
        observations: e.observations,
        tags: e.tags,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        priority: e.priority
      })),
      ...graph.relations.map(r => JSON.stringify({
        type: "relation",
        from: r.from,
        to: r.to,
        relationType: r.relationType,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      })),
    ];
    await fs.writeFile(this.memoryFilePath, lines.join("\n"));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    const now = new Date().toISOString();
    const entitiesWithDefaults = newEntities.map(e => ({
      ...e,
      tags: e.tags || [],
      createdAt: e.createdAt || now,
      updatedAt: e.updatedAt || now,
      priority: e.priority || 3
    }));
    graph.entities.push(...entitiesWithDefaults);
    await this.saveGraph(graph);
    return entitiesWithDefaults;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(r => !graph.relations.some(existingRelation => 
      existingRelation.from === r.from && 
      existingRelation.to === r.to && 
      existingRelation.relationType === r.relationType
    ));
    const now = new Date().toISOString();
    const relationsWithDefaults = newRelations.map(r => ({
      ...r,
      createdAt: r.createdAt || now,
      updatedAt: r.updatedAt || now
    }));
    graph.relations.push(...relationsWithDefaults);
    await this.saveGraph(graph);
    return relationsWithDefaults;
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      entity.updatedAt = new Date().toISOString();
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async updateEntity(entityName: string, updates: Partial<Entity>): Promise<Entity | null> {
    const graph = await this.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      return null;
    }
    
    // 验证并过滤有效的更新字段
    const validUpdates: Partial<Entity> = {};
    
    // 验证 entityType
    if (updates.entityType !== undefined) {
      if (typeof updates.entityType === 'string' && updates.entityType.trim() !== '') {
        validUpdates.entityType = updates.entityType.trim();
      } else {
        throw new Error('entityType must be a non-empty string');
      }
    }
    
    // 验证 observations
    if (updates.observations !== undefined) {
      if (Array.isArray(updates.observations) && updates.observations.every(o => typeof o === 'string')) {
        validUpdates.observations = updates.observations;
      } else {
        throw new Error('observations must be an array of strings');
      }
    }
    
    // 验证 tags
    if (updates.tags !== undefined) {
      if (Array.isArray(updates.tags) && updates.tags.every(t => typeof t === 'string')) {
        validUpdates.tags = updates.tags;
      } else {
        throw new Error('tags must be an array of strings');
      }
    }
    
    // 验证 priority
    if (updates.priority !== undefined) {
      if (typeof updates.priority === 'number' && updates.priority >= 1 && updates.priority <= 5) {
        validUpdates.priority = updates.priority;
      } else {
        throw new Error('priority must be a number between 1 and 5');
      }
    }
    
    // 应用验证后的更新
    Object.assign(entity, validUpdates);
    entity.updatedAt = new Date().toISOString();
    await this.saveGraph(graph);
    return entity;
  }

  async updateRelation(from: string, to: string, relationType: string, updates: Partial<Relation>): Promise<Relation | null> {
    const graph = await this.loadGraph();
    const relation = graph.relations.find(r => 
      r.from === from && r.to === to && r.relationType === relationType
    );
    if (!relation) {
      return null;
    }
    
    // 验证并过滤有效的更新字段
    const validUpdates: Partial<Relation> = {};
    
    // 验证 from
    if (updates.from !== undefined) {
      if (typeof updates.from === 'string' && updates.from.trim() !== '') {
        validUpdates.from = updates.from.trim();
      } else {
        throw new Error('from must be a non-empty string');
      }
    }
    
    // 验证 to
    if (updates.to !== undefined) {
      if (typeof updates.to === 'string' && updates.to.trim() !== '') {
        validUpdates.to = updates.to.trim();
      } else {
        throw new Error('to must be a non-empty string');
      }
    }
    
    // 验证 relationType
    if (updates.relationType !== undefined) {
      if (typeof updates.relationType === 'string' && updates.relationType.trim() !== '') {
        validUpdates.relationType = updates.relationType.trim();
      } else {
        throw new Error('relationType must be a non-empty string');
      }
    }
    
    // 应用验证后的更新
    Object.assign(relation, validUpdates);
    relation.updatedAt = new Date().toISOString();
    await this.saveGraph(graph);
    return relation;
  }

  async getRelatedEntities(entityName: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      return { entities: [], relations: [] };
    }
    const relatedEntityNames = new Set<string>();
    const relatedRelations = graph.relations.filter(r => {
      if (r.from === entityName) {
        relatedEntityNames.add(r.to);
        return true;
      }
      if (r.to === entityName) {
        relatedEntityNames.add(r.from);
        return true;
      }
      return false;
    });
    const relatedEntities = graph.entities.filter(e => 
      e.name === entityName || relatedEntityNames.has(e.name)
    );
    return {
      entities: relatedEntities,
      relations: relatedRelations
    };
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        const originalLength = entity.observations.length;
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
        // 只有当有观察记录被删除时才更新时间戳
        if (entity.observations.length < originalLength) {
          entity.updatedAt = new Date().toISOString();
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

  // Enhanced search function with priority and relevance sorting
  async searchNodes(query: string, options?: { sortBy?: 'priority' | 'relevance' | 'date'; limit?: number }): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const queryLower = query.toLowerCase();
    
    // Filter and score entities based on relevance
    const scoredEntities = graph.entities
      .map(e => {
        let score = 0;
        
        // Name matching (highest priority)
        if (e.name.toLowerCase() === queryLower) score += 100;
        else if (e.name.toLowerCase().includes(queryLower)) score += 80;
        
        // Entity type matching
        if (e.entityType.toLowerCase() === queryLower) score += 70;
        else if (e.entityType.toLowerCase().includes(queryLower)) score += 50;
        
        // Tag matching
        if (e.tags.some(tag => tag.toLowerCase() === queryLower)) score += 60;
        else if (e.tags.some(tag => tag.toLowerCase().includes(queryLower))) score += 40;
        
        // Observation matching
        const matchingObservations = e.observations.filter(o => 
          o.toLowerCase().includes(queryLower)
        );
        score += matchingObservations.length * 20;
        
        // Priority boost
        score += e.priority * 5;
        
        return { entity: e, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        if (options?.sortBy === 'priority') {
          return b.entity.priority - a.entity.priority;
        } else if (options?.sortBy === 'date') {
          return new Date(b.entity.updatedAt).getTime() - new Date(a.entity.updatedAt).getTime();
        } else { // relevance
          return b.score - a.score;
        }
      });
    
    // Apply limit if specified
    const limitedEntities = options?.limit 
      ? scoredEntities.slice(0, options.limit).map(({ entity }) => entity)
      : scoredEntities.map(({ entity }) => entity);
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(limitedEntities.map(e => e.name));
  
    // Include relations where at least one endpoint matches the search results
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: limitedEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  async searchByTag(tag: string, options?: { sortBy?: 'priority' | 'date'; limit?: number }): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const tagLower = tag.toLowerCase();
    
    // Filter entities by tag
    let filteredEntities = graph.entities.filter(e => 
      e.tags.some(t => t.toLowerCase() === tagLower)
    );
    
    // Apply sorting
    if (options?.sortBy === 'priority') {
      filteredEntities.sort((a, b) => b.priority - a.priority);
    } else if (options?.sortBy === 'date') {
      filteredEntities.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    
    // Apply limit if specified
    if (options?.limit) {
      filteredEntities = filteredEntities.slice(0, options.limit);
    }
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Include relations where at least one endpoint matches the search results
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to)
    );
  
    return {
      entities: filteredEntities,
      relations: filteredRelations
    };
  }

  async getRecentEntities(days: number = 7, limit: number = 10): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const recentEntities = graph.entities
      .filter(e => new Date(e.updatedAt) >= cutoffDate)
      .sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, limit);
    
    const recentEntityNames = new Set(recentEntities.map(e => e.name));
    const recentRelations = graph.relations.filter(r => 
      recentEntityNames.has(r.from) || recentEntityNames.has(r.to)
    );
    
    return {
      entities: recentEntities,
      relations: recentRelations
    };
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Include relations where at least one endpoint is in the requested set.
    // Previously this required BOTH endpoints, which meant relations from a
    // requested node to an unrequested node were silently dropped — making it
    // impossible to discover a node's connections without reading the full graph.
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }
}

let knowledgeGraphManager: KnowledgeGraphManager;

// Zod schemas for entities and relations
const EntitySchema = z.object({
  name: z.string().describe("The name of the entity"),
  entityType: z.string().describe("The type of the entity"),
  observations: z.array(z.string()).describe("An array of observation contents associated with the entity"),
  tags: z.array(z.string()).describe("An array of tags associated with the entity"),
  createdAt: z.string().optional().describe("The creation time of the entity"),
  updatedAt: z.string().optional().describe("The last update time of the entity"),
  priority: z.number().min(1).max(5).optional().describe("The priority of the entity (1-5, 5 is highest)")
});

const RelationSchema = z.object({
  from: z.string().describe("The name of the entity where the relation starts"),
  to: z.string().describe("The name of the entity where the relation ends"),
  relationType: z.string().describe("The type of the relation"),
  createdAt: z.string().optional().describe("The creation time of the relation"),
  updatedAt: z.string().optional().describe("The last update time of the relation")
});

const EntityUpdateSchema = z.object({
  entityName: z.string().describe("The name of the entity to update"),
  updates: z.object({
    entityType: z.string().optional().describe("The updated type of the entity"),
    observations: z.array(z.string()).optional().describe("The updated observations of the entity"),
    tags: z.array(z.string()).optional().describe("The updated tags of the entity"),
    priority: z.number().min(1).max(5).optional().describe("The updated priority of the entity")
  }).describe("The updates to apply to the entity")
});

const RelationUpdateSchema = z.object({
  from: z.string().describe("The name of the entity where the relation starts"),
  to: z.string().describe("The name of the entity where the relation ends"),
  relationType: z.string().describe("The type of the relation"),
  updates: z.object({
    from: z.string().optional().describe("The updated name of the entity where the relation starts"),
    to: z.string().optional().describe("The updated name of the entity where the relation ends"),
    relationType: z.string().optional().describe("The updated type of the relation")
  }).describe("The updates to apply to the relation")
});

const TagSearchSchema = z.object({
  tag: z.string().describe("The tag to search for"),
  sortBy: z.enum(["priority", "date"]).optional().describe("The sorting criteria"),
  limit: z.number().optional().describe("The maximum number of results to return")
});

const RecentEntitiesSchema = z.object({
  days: z.number().optional().describe("The number of days to look back"),
  limit: z.number().optional().describe("The maximum number of results to return")
});

const RelatedEntitiesSchema = z.object({
  entityName: z.string().describe("The name of the entity to find related entities for")
});

const SearchNodesSchema = z.object({
  query: z.string().describe("The search query to match against entity names, types, and observation content"),
  sortBy: z.enum(["priority", "relevance", "date"]).optional().describe("The sorting criteria"),
  limit: z.number().optional().describe("The maximum number of results to return")
});

// The server instance and tools exposed to Claude
const server = new McpServer({
  name: "memory-server",
  version: "0.6.3",
});

// Register create_entities tool
server.registerTool(
  "create_entities",
  {
    title: "Create Entities",
    description: "Create multiple new entities in the knowledge graph",
    inputSchema: {
      entities: z.array(z.object({
        name: z.string().describe("The name of the entity"),
        entityType: z.string().describe("The type of the entity"),
        observations: z.array(z.string()).describe("An array of observation contents associated with the entity"),
        tags: z.array(z.string()).optional().describe("An array of tags associated with the entity"),
        priority: z.number().min(1).max(5).optional().describe("The priority of the entity (1-5, 5 is highest)")
      }))
    },
    outputSchema: {
      entities: z.array(EntitySchema)
    }
  },
  async ({ entities }) => {
    const result = await knowledgeGraphManager.createEntities(entities as Entity[]);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { entities: result }
    };
  }
);

// Register create_relations tool
server.registerTool(
  "create_relations",
  {
    title: "Create Relations",
    description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
    inputSchema: {
      relations: z.array(z.object({
        from: z.string().describe("The name of the entity where the relation starts"),
        to: z.string().describe("The name of the entity where the relation ends"),
        relationType: z.string().describe("The type of the relation")
      }))
    },
    outputSchema: {
      relations: z.array(RelationSchema)
    }
  },
  async ({ relations }) => {
    const result = await knowledgeGraphManager.createRelations(relations as Relation[]);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { relations: result }
    };
  }
);

// Register add_observations tool
server.registerTool(
  "add_observations",
  {
    title: "Add Observations",
    description: "Add new observations to existing entities in the knowledge graph",
    inputSchema: {
      observations: z.array(z.object({
        entityName: z.string().describe("The name of the entity to add the observations to"),
        contents: z.array(z.string()).describe("An array of observation contents to add")
      }))
    },
    outputSchema: {
      results: z.array(z.object({
        entityName: z.string(),
        addedObservations: z.array(z.string())
      }))
    }
  },
  async ({ observations }) => {
    const result = await knowledgeGraphManager.addObservations(observations);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { results: result }
    };
  }
);

// Register delete_entities tool
server.registerTool(
  "delete_entities",
  {
    title: "Delete Entities",
    description: "Delete multiple entities and their associated relations from the knowledge graph",
    inputSchema: {
      entityNames: z.array(z.string()).describe("An array of entity names to delete")
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async ({ entityNames }) => {
    await knowledgeGraphManager.deleteEntities(entityNames);
    return {
      content: [{ type: "text" as const, text: "Entities deleted successfully" }],
      structuredContent: { success: true, message: "Entities deleted successfully" }
    };
  }
);

// Register delete_observations tool
server.registerTool(
  "delete_observations",
  {
    title: "Delete Observations",
    description: "Delete specific observations from entities in the knowledge graph",
    inputSchema: {
      deletions: z.array(z.object({
        entityName: z.string().describe("The name of the entity containing the observations"),
        observations: z.array(z.string()).describe("An array of observations to delete")
      }))
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async ({ deletions }) => {
    await knowledgeGraphManager.deleteObservations(deletions);
    return {
      content: [{ type: "text" as const, text: "Observations deleted successfully" }],
      structuredContent: { success: true, message: "Observations deleted successfully" }
    };
  }
);

// Register delete_relations tool
server.registerTool(
  "delete_relations",
  {
    title: "Delete Relations",
    description: "Delete multiple relations from the knowledge graph",
    inputSchema: {
      relations: z.array(z.object({
        from: z.string().describe("The name of the entity where the relation starts"),
        to: z.string().describe("The name of the entity where the relation ends"),
        relationType: z.string().describe("The type of the relation")
      })).describe("An array of relations to delete")
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async ({ relations }) => {
    await knowledgeGraphManager.deleteRelations(relations as Relation[]);
    return {
      content: [{ type: "text" as const, text: "Relations deleted successfully" }],
      structuredContent: { success: true, message: "Relations deleted successfully" }
    };
  }
);

// Register read_graph tool
server.registerTool(
  "read_graph",
  {
    title: "Read Graph",
    description: "Read the entire knowledge graph",
    inputSchema: {},
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async () => {
    const graph = await knowledgeGraphManager.readGraph();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register search_nodes tool
server.registerTool(
  "search_nodes",
  {
    title: "Search Nodes",
    description: "Search for nodes in the knowledge graph based on a query with sorting and limit options",
    inputSchema: SearchNodesSchema,
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ query, sortBy, limit }) => {
    const graph = await knowledgeGraphManager.searchNodes(query, { sortBy, limit });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register update_entity tool
server.registerTool(
  "update_entity",
  {
    title: "Update Entity",
    description: "Update an existing entity in the knowledge graph",
    inputSchema: EntityUpdateSchema,
    outputSchema: {
      entity: z.union([EntitySchema, z.null()])
    }
  },
  async ({ entityName, updates }) => {
    const entity = await knowledgeGraphManager.updateEntity(entityName, updates);
    return {
      content: [{ type: "text" as const, text: entity ? JSON.stringify(entity, null, 2) : "Entity not found" }],
      structuredContent: { entity }
    };
  }
);

// Register update_relation tool
server.registerTool(
  "update_relation",
  {
    title: "Update Relation",
    description: "Update an existing relation in the knowledge graph",
    inputSchema: RelationUpdateSchema,
    outputSchema: {
      relation: z.union([RelationSchema, z.null()])
    }
  },
  async ({ from, to, relationType, updates }) => {
    const relation = await knowledgeGraphManager.updateRelation(from, to, relationType, updates);
    return {
      content: [{ type: "text" as const, text: relation ? JSON.stringify(relation, null, 2) : "Relation not found" }],
      structuredContent: { relation }
    };
  }
);

// Register search_by_tag tool
server.registerTool(
  "search_by_tag",
  {
    title: "Search by Tag",
    description: "Search for entities in the knowledge graph based on a tag",
    inputSchema: TagSearchSchema,
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ tag, sortBy, limit }) => {
    const graph = await knowledgeGraphManager.searchByTag(tag, { sortBy, limit });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register get_recent_entities tool
server.registerTool(
  "get_recent_entities",
  {
    title: "Get Recent Entities",
    description: "Get entities that have been updated recently",
    inputSchema: RecentEntitiesSchema,
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ days, limit }) => {
    const graph = await knowledgeGraphManager.getRecentEntities(days, limit);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register get_related_entities tool
server.registerTool(
  "get_related_entities",
  {
    title: "Get Related Entities",
    description: "Get entities related to a specific entity",
    inputSchema: RelatedEntitiesSchema,
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ entityName }) => {
    const graph = await knowledgeGraphManager.getRelatedEntities(entityName);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register open_nodes tool
server.registerTool(
  "open_nodes",
  {
    title: "Open Nodes",
    description: "Open specific nodes in the knowledge graph by their names",
    inputSchema: {
      names: z.array(z.string()).describe("An array of entity names to retrieve")
    },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ names }) => {
    const graph = await knowledgeGraphManager.openNodes(names);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

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
