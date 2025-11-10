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
import { randomBytes } from 'crypto';

// Define memory file path using environment variable with fallback
export const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.jsonl');

// Validate memory file path to prevent path traversal attacks
function validateMemoryFilePath(filePath: string): string {
  // SECURITY: Prevent path traversal in environment variable
  const normalized = path.normalize(filePath);

  // Block directory traversal patterns
  if (normalized.includes('..')) {
    throw new Error(
      'SECURITY: Memory file path contains directory traversal (..) which is forbidden'
    );
  }

  // Block absolute paths to sensitive system directories
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : path.join(path.dirname(fileURLToPath(import.meta.url)), normalized);

  const resolvedPath = path.resolve(absolutePath);

  // Forbidden system paths (add more as needed for your environment)
  const forbiddenPaths = [
    '/etc',
    '/proc',
    '/sys',
    '/dev',
    '/boot',
    '/root',
    'C:\\Windows',
    'C:\\Program Files'
  ];

  for (const forbidden of forbiddenPaths) {
    if (resolvedPath.startsWith(forbidden)) {
      throw new Error(
        `SECURITY: Memory file path cannot be in system directory (${forbidden})`
      );
    }
  }

  // Ensure the resolved path is either in the module directory or an explicitly allowed location
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  if (!resolvedPath.startsWith(moduleDir) && !path.isAbsolute(normalized)) {
    throw new Error(
      'SECURITY: Memory file path must be within the module directory or an absolute path'
    );
  }

  return resolvedPath;
}

// Handle backward compatibility: migrate memory.json to memory.jsonl if needed
export async function ensureMemoryFilePath(): Promise<string> {
  if (process.env.MEMORY_FILE_PATH) {
    // SECURITY: Validate custom path to prevent path traversal attacks
    return validateMemoryFilePath(process.env.MEMORY_FILE_PATH);
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

// Resource limits for DoS protection and stability
const MAX_ENTITIES = 100000;
const MAX_RELATIONS = 500000;
const MAX_OBSERVATIONS_PER_ENTITY = 10000;
const MAX_STRING_LENGTH = 10000; // Max length for names, types, observations
const MAX_OBSERVATION_CONTENT_LENGTH = 50000; // Max length for observation content

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

// Dangerous property names that could cause prototype pollution or JSONL injection
const FORBIDDEN_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
]);

// Input validation and sanitization
function validateAndSanitizeString(value: string, maxLength: number, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  // CRITICAL SECURITY: Remove ALL control characters including newlines and carriage returns
  // This prevents JSONL injection attacks where embedded newlines corrupt the JSONL format
  const sanitized = value.replace(/[\x00-\x1F\x7F]/g, '');

  if (sanitized.length === 0) {
    throw new Error(`${fieldName} cannot be empty after sanitization`);
  }

  if (sanitized.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters (got ${sanitized.length})`);
  }

  // CRITICAL SECURITY: Prevent prototype pollution by blocking dangerous property names
  const trimmed = sanitized.trim();
  const normalized = trimmed.toLowerCase();

  if (FORBIDDEN_PROPERTY_NAMES.has(normalized)) {
    throw new Error(
      `${fieldName} contains forbidden property name "${trimmed}" that could cause prototype pollution`
    );
  }

  return trimmed;
}

function validateEntity(entity: Entity): Entity {
  return {
    name: validateAndSanitizeString(entity.name, MAX_STRING_LENGTH, 'Entity name'),
    entityType: validateAndSanitizeString(entity.entityType, MAX_STRING_LENGTH, 'Entity type'),
    observations: entity.observations.map((obs, idx) =>
      validateAndSanitizeString(obs, MAX_OBSERVATION_CONTENT_LENGTH, `Observation ${idx + 1}`)
    )
  };
}

function validateRelation(relation: Relation): Relation {
  return {
    from: validateAndSanitizeString(relation.from, MAX_STRING_LENGTH, 'Relation from'),
    to: validateAndSanitizeString(relation.to, MAX_STRING_LENGTH, 'Relation to'),
    relationType: validateAndSanitizeString(relation.relationType, MAX_STRING_LENGTH, 'Relation type')
  };
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
export class KnowledgeGraphManager {
  constructor(private memoryFilePath: string) {}

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      const errors: Array<{line: number, error: string}> = [];

      const graph = lines.reduce((graph: KnowledgeGraph, line, index) => {
        try {
          const item = JSON.parse(line);
          if (item.type === "entity") graph.entities.push(item as Entity);
          if (item.type === "relation") graph.relations.push(item as Relation);
        } catch (parseError) {
          errors.push({line: index + 1, error: String(parseError)});
          console.error(`Failed to parse line ${index + 1}: ${line.substring(0, 100)}...`);
        }
        return graph;
      }, { entities: [], relations: [] });

      if (errors.length > 0) {
        console.error(`WARNING: Knowledge graph loaded with ${errors.length} corrupted lines (partial data loss)`);
      }

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
    const content = lines.join("\n") + "\n";

    // SECURITY: Use atomic write with temporary file + rename to prevent:
    // 1. Concurrent save corruption
    // 2. Partial write corruption on crash
    // 3. Lost updates from race conditions
    const tempPath = `${this.memoryFilePath}.${randomBytes(16).toString('hex')}.tmp`;
    try {
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, this.memoryFilePath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    // Validate and sanitize all input entities
    const validatedEntities = entities.map(e => validateEntity(e));

    const graph = await this.loadGraph();

    // Check resource limits
    if (graph.entities.length + validatedEntities.length > MAX_ENTITIES) {
      throw new Error(
        `Entity limit exceeded. Current: ${graph.entities.length}, ` +
        `Attempting to add: ${validatedEntities.length}, ` +
        `Maximum: ${MAX_ENTITIES}`
      );
    }

    // Check observations limit per entity
    for (const entity of validatedEntities) {
      if (entity.observations.length > MAX_OBSERVATIONS_PER_ENTITY) {
        throw new Error(
          `Entity "${entity.name}" has ${entity.observations.length} observations, ` +
          `exceeding maximum of ${MAX_OBSERVATIONS_PER_ENTITY}`
        );
      }
    }

    // OPTIMIZATION: Use Set for O(1) lookup instead of O(n) array.some()
    const existingNames = new Set(graph.entities.map(e => e.name));
    const newEntities = validatedEntities.filter(e => !existingNames.has(e.name));

    if (newEntities.length === 0) {
      return []; // No new entities to add
    }

    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    // Validate and sanitize all input relations
    const validatedRelations = relations.map(r => validateRelation(r));

    const graph = await this.loadGraph();

    // Check resource limits
    if (graph.relations.length + validatedRelations.length > MAX_RELATIONS) {
      throw new Error(
        `Relation limit exceeded. Current: ${graph.relations.length}, ` +
        `Attempting to add: ${validatedRelations.length}, ` +
        `Maximum: ${MAX_RELATIONS}`
      );
    }

    // Validate that referenced entities exist
    const entityNames = new Set(graph.entities.map(e => e.name));
    for (const relation of validatedRelations) {
      if (!entityNames.has(relation.from)) {
        throw new Error(`Entity "${relation.from}" does not exist (referenced in relation)`);
      }
      if (!entityNames.has(relation.to)) {
        throw new Error(`Entity "${relation.to}" does not exist (referenced in relation)`);
      }
    }

    // OPTIMIZATION: Use Set for O(1) lookup instead of O(n) array.some()
    const existingRelationKeys = new Set(
      graph.relations.map(r => `${r.from}|${r.to}|${r.relationType}`)
    );
    const newRelations = validatedRelations.filter(
      r => !existingRelationKeys.has(`${r.from}|${r.to}|${r.relationType}`)
    );

    if (newRelations.length === 0) {
      return []; // No new relations to add
    }

    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();

    // Build entity lookup map for O(1) access
    const entityMap = new Map(graph.entities.map(e => [e.name, e]));

    const results = observations.map(o => {
      // Validate entity name
      const entityName = validateAndSanitizeString(o.entityName, MAX_STRING_LENGTH, 'Entity name');

      const entity = entityMap.get(entityName);
      if (!entity) {
        throw new Error(`Entity with name ${entityName} not found`);
      }

      // Validate and sanitize observation contents
      const validatedContents = o.contents.map((content, idx) =>
        validateAndSanitizeString(content, MAX_OBSERVATION_CONTENT_LENGTH, `Observation ${idx + 1}`)
      );

      // Check if adding observations would exceed limit
      const potentialTotal = entity.observations.length + validatedContents.length;
      if (potentialTotal > MAX_OBSERVATIONS_PER_ENTITY) {
        throw new Error(
          `Adding ${validatedContents.length} observations to entity "${entityName}" ` +
          `would exceed maximum of ${MAX_OBSERVATIONS_PER_ENTITY} ` +
          `(current: ${entity.observations.length})`
        );
      }

      // OPTIMIZATION: Use Set for O(1) lookup instead of O(n) includes()
      const existingObservations = new Set(entity.observations);
      const newObservations = validatedContents.filter(content => !existingObservations.has(content));

      entity.observations.push(...newObservations);
      return { entityName, addedObservations: newObservations };
    });

    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    // VALIDATION: Validate and sanitize entity names before deletion
    const validatedNames = entityNames.map(name =>
      validateAndSanitizeString(name, MAX_STRING_LENGTH, 'Entity name')
    );

    const graph = await this.loadGraph();

    // OPTIMIZATION: Use Set for O(1) lookup instead of O(n) includes()
    // This changes complexity from O(n²) to O(n)
    const namesToDelete = new Set(validatedNames);
    graph.entities = graph.entities.filter(e => !namesToDelete.has(e.name));
    graph.relations = graph.relations.filter(r =>
      !namesToDelete.has(r.from) && !namesToDelete.has(r.to)
    );

    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();

    // OPTIMIZATION: Build entity lookup map for O(1) access instead of O(n) find()
    const entityMap = new Map(graph.entities.map(e => [e.name, e]));

    deletions.forEach(d => {
      // VALIDATION: Validate and sanitize entity name and observations
      const entityName = validateAndSanitizeString(d.entityName, MAX_STRING_LENGTH, 'Entity name');
      const validatedObservations = d.observations.map((obs, idx) =>
        validateAndSanitizeString(obs, MAX_OBSERVATION_CONTENT_LENGTH, `Observation ${idx + 1}`)
      );

      const entity = entityMap.get(entityName);
      if (entity) {
        // OPTIMIZATION: Use Set for O(1) lookup instead of O(n) includes()
        const observationsToDelete = new Set(validatedObservations);
        entity.observations = entity.observations.filter(o => !observationsToDelete.has(o));
      }
    });

    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    // VALIDATION: Validate and sanitize all input relations
    const validatedRelations = relations.map(r => validateRelation(r));

    const graph = await this.loadGraph();

    // OPTIMIZATION: Use Set with composite keys for O(1) lookup instead of O(n*m) some()
    // This changes complexity from O(n*m) to O(n+m)
    const relationsToDelete = new Set(
      validatedRelations.map(r => `${r.from}|${r.to}|${r.relationType}`)
    );

    graph.relations = graph.relations.filter(r =>
      !relationsToDelete.has(`${r.from}|${r.to}|${r.relationType}`)
    );

    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  // Very basic search function
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

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
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

let knowledgeGraphManager: KnowledgeGraphManager;


// The server instance and tools exposed to Claude
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
