#!/usr/bin/env node

// The memory server: a knowledge graph of entities, relations and
// observations, persisted as JSONL and served over MCP as nine tools and one
// subscribable resource. createServer() builds a server over a graph file so
// tests can run it in-process; main() connects it to stdio, and runs only
// when this file is the process entry point, so importing it starts nothing.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { promises as fs, realpathSync } from "fs";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { SERVER_VERSION } from "./version.js";

// The package directory: where the default graph file lives, and what a
// relative MEMORY_FILE_PATH resolves against.
const defaultMemoryDir = path.dirname(fileURLToPath(import.meta.url));

// Define memory file path using environment variable with fallback
export const defaultMemoryPath = path.join(defaultMemoryDir, "memory.jsonl");

// Expand a leading "~" to the user's home directory. MCP clients pass
// MEMORY_FILE_PATH from JSON config, where no shell performs tilde expansion,
// so an unexpanded "~" would otherwise be treated as a relative path and
// joined onto the package directory. Mirrors the helper of the same name in
// the filesystem server (src/filesystem/path-utils.ts).
export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Handle backward compatibility: migrate memory.json to memory.jsonl if needed.
// baseDir is the directory the default files live in. The server never passes
// it; it exists so tests can run the migration in a temporary directory rather
// than in the package directory, which every importer of this module shares.
export async function ensureMemoryFilePath(
  baseDir: string = defaultMemoryDir,
): Promise<string> {
  if (process.env.MEMORY_FILE_PATH) {
    // Custom path provided. Expand a leading "~" first, then resolve relative
    // paths against the package directory (absolute paths are used as-is).
    const customPath = expandHome(process.env.MEMORY_FILE_PATH);
    return path.isAbsolute(customPath)
      ? customPath
      : path.join(baseDir, customPath);
  }

  // No custom path set, check for backward compatibility migration
  const oldMemoryPath = path.join(baseDir, "memory.json");
  const newMemoryPath = path.join(baseDir, "memory.jsonl");

  try {
    // Check if old file exists and new file doesn't
    await fs.access(oldMemoryPath);
    try {
      await fs.access(newMemoryPath);
      // Both files exist, use new one (no migration needed)
      return newMemoryPath;
    } catch {
      // Old file exists, new file doesn't - migrate
      console.error(
        "DETECTED: Found legacy memory.json file, migrating to memory.jsonl for JSONL format compatibility",
      );
      await fs.rename(oldMemoryPath, newMemoryPath);
      console.error(
        "COMPLETED: Successfully migrated memory.json to memory.jsonl",
      );
      return newMemoryPath;
    }
  } catch {
    // Old file doesn't exist, use new path
    return newMemoryPath;
  }
}

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

// Names of requested entities that createEntities did not create: the name
// already existed, or repeated earlier in the same batch. createEntities
// returns the created entities themselves, so identity tells them apart.
export function skippedEntityNames(requested: Entity[], created: Entity[]): string[] {
  return requested.filter(e => !created.includes(e)).map(e => e.name);
}

// Text telling the agent which entities create_entities skipped.
export function skippedEntitiesNotice(skipped: string[]): string {
  const one = skipped.length === 1;
  return `Skipped ${skipped.length} ${one ? "entity that already exists" : "entities that already exist"}: ` +
    `${skipped.join(", ")}. ${one ? "Its" : "Their"} observations were not added; ` +
    "use add_observations for existing entities.";
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
export class KnowledgeGraphManager {
  constructor(private memoryFilePath: string) {}

  // Serializes all read-modify-write graph mutations behind a single queue.
  // Without this, concurrent tool calls (e.g. multiple mutations dispatched
  // from one LLM turn) each independently load the graph, mutate their own
  // copy, and write it back — so whichever write lands last silently
  // overwrites the other's changes, and interleaved writes to the same file
  // can corrupt it outright. See #1819.
  private mutationQueue: Promise<unknown> = Promise.resolve();

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    // Always resolve the queue itself, even if this operation failed, so a
    // single failed mutation doesn't permanently wedge every call after it.
    // The failure still propagates normally to whoever awaited `result`.
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter((line) => line.trim() !== "");
      const graph: KnowledgeGraph = { entities: [], relations: [] };

      for (const line of lines) {
        let item: unknown;
        try {
          item = JSON.parse(line);
        } catch {
          console.error("Skipping malformed line in memory file");
          continue;
        }

        if (typeof item !== "object" || item === null) {
          console.error("Skipping non-object line in memory file");
          continue;
        }

        const record = item as Record<string, unknown>;
        if (record.type === "entity") {
          const parsed = EntitySchema.safeParse(item);
          if (parsed.success) {
            graph.entities.push(parsed.data);
          } else {
            console.error(
              "Skipping invalid entity in memory file:",
              parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(", "),
            );
          }
        } else if (record.type === "relation") {
          const parsed = RelationSchema.safeParse(item);
          if (parsed.success) {
            graph.relations.push(parsed.data);
          } else {
            console.error(
              "Skipping invalid relation in memory file:",
              parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(", "),
            );
          }
        }
      }

      return graph;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map((e) =>
        JSON.stringify({
          type: "entity",
          name: e.name,
          entityType: e.entityType,
          observations: e.observations,
        }),
      ),
      ...graph.relations.map((r) =>
        JSON.stringify({
          type: "relation",
          from: r.from,
          to: r.to,
          relationType: r.relationType,
        }),
      ),
    ];

    // Write to a temporary file in the same directory, then rename it over
    // the target. fs.writeFile would truncate the memory file before writing,
    // so an interruption (SIGKILL, container stop, OOM, power loss) would
    // leave the only copy of the graph truncated and unrecoverable.
    // rename(2) is atomic on POSIX filesystems: readers see either the
    // complete old file or the complete new one, never a partial state.
    // The temp file is kept in the same directory so the rename stays on one
    // filesystem — renaming across mount points fails with EXDEV.
    const directory = path.dirname(this.memoryFilePath);
    const tempFilePath = path.join(
      directory,
      `${path.basename(this.memoryFilePath)}.${randomBytes(16).toString("hex")}.tmp`,
    );

    try {
      await fs.writeFile(tempFilePath, lines.join("\n") + "\n");
      await fs.rename(tempFilePath, this.memoryFilePath);
    } catch (error) {
      // Never leave a stray temp file behind on failure.
      await fs.unlink(tempFilePath).catch(() => {});
      throw error;
    }
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    return this.withLock(async () => {
      const graph = await this.loadGraph();
      const newEntities = entities.filter(
        (e, index) =>
          !graph.entities.some(
            (existingEntity) => existingEntity.name === e.name,
          ) &&
          // Also skip duplicates appearing earlier in this same batch
          !entities.slice(0, index).some((earlier) => earlier.name === e.name),
      );
      graph.entities.push(...newEntities);
      await this.saveGraph(graph);
      return newEntities;
    });
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    return this.withLock(async () => {
      const graph = await this.loadGraph();
      const entityNames = new Set(graph.entities.map((e) => e.name));

      relations.forEach((r) => {
        if (!entityNames.has(r.from)) {
          throw new Error(`Entity with name ${r.from} not found`);
        }
        if (!entityNames.has(r.to)) {
          throw new Error(`Entity with name ${r.to} not found`);
        }
      });

      const isSameRelation = (a: Relation, b: Relation) =>
        a.from === b.from && a.to === b.to && a.relationType === b.relationType;
      const newRelations = relations.filter(
        (r, index) =>
          !graph.relations.some((existingRelation) =>
            isSameRelation(existingRelation, r),
          ) &&
          // Also skip duplicates appearing earlier in this same batch
          !relations
            .slice(0, index)
            .some((earlier) => isSameRelation(earlier, r)),
      );
      graph.relations.push(...newRelations);
      await this.saveGraph(graph);
      return newRelations;
    });
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[],
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    return this.withLock(async () => {
      const graph = await this.loadGraph();
      const results = observations.map((o) => {
        const entity = graph.entities.find((e) => e.name === o.entityName);
        if (!entity) {
          throw new Error(`Entity with name ${o.entityName} not found`);
        }
        const newObservations = o.contents.filter(
          (content) => !entity.observations.includes(content),
        );
        entity.observations.push(...newObservations);
        return { entityName: o.entityName, addedObservations: newObservations };
      });
      await this.saveGraph(graph);
      return results;
    });
  }

  async deleteEntities(
    entityNames: string[],
  ): Promise<{ deleted: string[]; notFound: string[] }> {
    return this.withLock(async () => {
      const graph = await this.loadGraph();
      const present = new Set(graph.entities.map((e) => e.name));
      const deleted = entityNames.filter((name) => present.has(name));
      const notFound = entityNames.filter((name) => !present.has(name));
      graph.entities = graph.entities.filter(
        (e) => !entityNames.includes(e.name),
      );
      graph.relations = graph.relations.filter(
        (r) => !entityNames.includes(r.from) && !entityNames.includes(r.to),
      );
      await this.saveGraph(graph);
      return { deleted, notFound };
    });
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
  ): Promise<{ deletedCount: number; missingEntities: string[] }> {
    return this.withLock(async () => {
      const graph = await this.loadGraph();
      let deletedCount = 0;
      const missingEntities: string[] = [];
      deletions.forEach((d) => {
        const entity = graph.entities.find((e) => e.name === d.entityName);
        if (entity) {
          const before = entity.observations.length;
          entity.observations = entity.observations.filter(
            (o) => !d.observations.includes(o),
          );
          deletedCount += before - entity.observations.length;
        } else {
          missingEntities.push(d.entityName);
        }
      });
      await this.saveGraph(graph);
      return { deletedCount, missingEntities };
    });
  }

  async deleteRelations(
    relations: Relation[],
  ): Promise<{ deletedCount: number }> {
    return this.withLock(async () => {
      const graph = await this.loadGraph();
      const before = graph.relations.length;
      graph.relations = graph.relations.filter(
        (r) =>
          !relations.some(
            (delRelation) =>
              r.from === delRelation.from &&
              r.to === delRelation.to &&
              r.relationType === delRelation.relationType,
          ),
      );
      await this.saveGraph(graph);
      return { deletedCount: before - graph.relations.length };
    });
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  // Very basic search function
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter(
      (e) =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.entityType.toLowerCase().includes(query.toLowerCase()) ||
        e.observations.some((o) =>
          o.toLowerCase().includes(query.toLowerCase()),
        ),
    );

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

    // Include relations where at least one endpoint matches the search results.
    // This lets callers discover connections to nodes outside the result set.
    const filteredRelations = graph.relations.filter(
      (r) => filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to),
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
    const filteredEntities = graph.entities.filter((e) =>
      names.includes(e.name),
    );

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

    // Include relations where at least one endpoint is in the requested set.
    // Previously this required BOTH endpoints, which meant relations from a
    // requested node to an unrequested node were silently dropped — making it
    // impossible to discover a node's connections without reading the full graph.
    const filteredRelations = graph.relations.filter(
      (r) => filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to),
    );

    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };

    return filteredGraph;
  }
}

// Zod schemas for entities and relations
const EntitySchema = z.object({
  name: z.string().describe("The name of the entity"),
  entityType: z.string().describe("The type of the entity"),
  observations: z
    .array(z.string())
    .describe("An array of observation contents associated with the entity"),
});

const RelationSchema = z.object({
  from: z.string().describe("The name of the entity where the relation starts"),
  to: z.string().describe("The name of the entity where the relation ends"),
  relationType: z.string().describe("The type of the relation"),
});

const RESOURCE_URI = "memory://knowledge-graph";

export const SEARCH_QUERY_MAX_LENGTH = 2048;

export const SearchNodesQuerySchema = z
  .string()
  .max(SEARCH_QUERY_MAX_LENGTH)
  .describe(
    "The search query to match against entity names, types, and observation content",
  );

// Build a memory server over the graph file at memoryFilePath: the nine
// tools, the knowledge-graph resource and its subscriptions. main() connects
// the result to stdio; tests connect it to an in-memory transport, so each
// call returns an independent server with its own subscriber set.
export function createServer(memoryFilePath: string): McpServer {
  const knowledgeGraphManager = new KnowledgeGraphManager(memoryFilePath);

  const server = new McpServer({
    name: "memory-server",
    version: SERVER_VERSION,
  });

  // Track which resource URIs the connected client has subscribed to, so we only
  // emit notifications/resources/updated to a client that asked for them.
  const resourceSubscribers = new Set<string>();

  // Notify subscribers that the knowledge graph resource changed. No-op when the
  // client has not subscribed.
  function notifyGraphUpdated() {
    if (resourceSubscribers.has(RESOURCE_URI)) {
      // Fire-and-forget: the tool result must not wait on (or fail because of)
      // the notification, so a delivery failure is logged rather than thrown.
      server.server
        .sendResourceUpdated({ uri: RESOURCE_URI })
        .catch((error: unknown) => {
          console.error("Failed to send resource updated notification:", error);
        });
    }
  }

  // Register create_entities tool
  server.registerTool(
    "create_entities",
    {
      title: "Create Entities",
      description: "Create multiple new entities in the knowledge graph",
      inputSchema: {
        entities: z.array(EntitySchema),
      },
      outputSchema: {
        entities: z.array(EntitySchema),
        skipped: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ entities }) => {
      const result = await knowledgeGraphManager.createEntities(entities);
      notifyGraphUpdated();
      // Existing names are ignored (see README). Say so: otherwise an agent
      // reads the response as its observations having been stored.
      const skipped = skippedEntityNames(entities, result);
      const content = [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ];
      if (skipped.length > 0) {
        content.push({
          type: "text" as const,
          text: skippedEntitiesNotice(skipped),
        });
      }
      return {
        content,
        structuredContent: { entities: result, skipped },
      };
    },
  );

  // Register create_relations tool
  server.registerTool(
    "create_relations",
    {
      title: "Create Relations",
      description:
        "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
      inputSchema: {
        relations: z.array(RelationSchema),
      },
      outputSchema: {
        relations: z.array(RelationSchema),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ relations }) => {
      const result = await knowledgeGraphManager.createRelations(relations);
      notifyGraphUpdated();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: { relations: result },
      };
    },
  );

  // Register add_observations tool
  server.registerTool(
    "add_observations",
    {
      title: "Add Observations",
      description:
        "Add new observations to existing entities in the knowledge graph",
      inputSchema: {
        observations: z.array(
          z.object({
            entityName: z
              .string()
              .describe("The name of the entity to add the observations to"),
            contents: z
              .array(z.string())
              .describe("An array of observation contents to add"),
          }),
        ),
      },
      outputSchema: {
        results: z.array(
          z.object({
            entityName: z.string(),
            addedObservations: z.array(z.string()),
          }),
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ observations }) => {
      const result = await knowledgeGraphManager.addObservations(observations);
      notifyGraphUpdated();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: { results: result },
      };
    },
  );

  // Register delete_entities tool
  server.registerTool(
    "delete_entities",
    {
      title: "Delete Entities",
      description:
        "Delete multiple entities and their associated relations from the knowledge graph",
      inputSchema: {
        entityNames: z
          .array(z.string())
          .describe("An array of entity names to delete"),
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ entityNames }) => {
      const { deleted, notFound } =
        await knowledgeGraphManager.deleteEntities(entityNames);
      notifyGraphUpdated();
      const message =
        notFound.length === 0
          ? "Entities deleted successfully"
          : `Deleted ${deleted.length} of ${entityNames.length} entities. Not found: ${notFound.join(", ")}`;
      return {
        content: [{ type: "text" as const, text: message }],
        structuredContent: { success: true, message },
      };
    },
  );

  // Register delete_observations tool
  server.registerTool(
    "delete_observations",
    {
      title: "Delete Observations",
      description:
        "Delete specific observations from entities in the knowledge graph",
      inputSchema: {
        deletions: z.array(
          z.object({
            entityName: z
              .string()
              .describe("The name of the entity containing the observations"),
            observations: z
              .array(z.string())
              .describe("An array of observations to delete"),
          }),
        ),
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ deletions }) => {
      const { deletedCount, missingEntities } =
        await knowledgeGraphManager.deleteObservations(deletions);
      notifyGraphUpdated();
      const requested = deletions.reduce(
        (total, d) => total + d.observations.length,
        0,
      );
      const message =
        deletedCount === requested
          ? "Observations deleted successfully"
          : `Deleted ${deletedCount} of ${requested} observations.` +
            (missingEntities.length
              ? ` Entities not found: ${missingEntities.join(", ")}`
              : "");
      return {
        content: [{ type: "text" as const, text: message }],
        structuredContent: { success: true, message },
      };
    },
  );

  // Register delete_relations tool
  server.registerTool(
    "delete_relations",
    {
      title: "Delete Relations",
      description: "Delete multiple relations from the knowledge graph",
      inputSchema: {
        relations: z
          .array(RelationSchema)
          .describe("An array of relations to delete"),
      },
      outputSchema: {
        success: z.boolean(),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ relations }) => {
      const { deletedCount } =
        await knowledgeGraphManager.deleteRelations(relations);
      notifyGraphUpdated();
      const message =
        deletedCount === relations.length
          ? "Relations deleted successfully"
          : `Deleted ${deletedCount} of ${relations.length} relations. The rest matched nothing.`;
      return {
        content: [{ type: "text" as const, text: message }],
        structuredContent: { success: true, message },
      };
    },
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
        relations: z.array(RelationSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const graph = await knowledgeGraphManager.readGraph();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(graph, null, 2) },
        ],
        structuredContent: { ...graph },
      };
    },
  );

  // Register search_nodes tool
  server.registerTool(
    "search_nodes",
    {
      title: "Search Nodes",
      description: "Search for nodes in the knowledge graph based on a query",
      inputSchema: {
        query: SearchNodesQuerySchema,
      },
      outputSchema: {
        entities: z.array(EntitySchema),
        relations: z.array(RelationSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query }) => {
      const graph = await knowledgeGraphManager.searchNodes(query);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(graph, null, 2) },
        ],
        structuredContent: { ...graph },
      };
    },
  );

  // Register open_nodes tool
  server.registerTool(
    "open_nodes",
    {
      title: "Open Nodes",
      description: "Open specific nodes in the knowledge graph by their names",
      inputSchema: {
        names: z
          .array(z.string())
          .describe("An array of entity names to retrieve"),
      },
      outputSchema: {
        entities: z.array(EntitySchema),
        relations: z.array(RelationSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ names }) => {
      const graph = await knowledgeGraphManager.openNodes(names);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(graph, null, 2) },
        ],
        structuredContent: { ...graph },
      };
    },
  );

  registerKnowledgeGraphResource(server, knowledgeGraphManager);
  registerKnowledgeGraphSubscriptions(server, resourceSubscribers);

  return server;
}

export function registerKnowledgeGraphResource(
  server: McpServer,
  manager: KnowledgeGraphManager,
) {
  server.registerResource(
    "knowledge-graph",
    RESOURCE_URI,
    {
      title: "Knowledge Graph",
      description: "The full knowledge graph with all entities and relations",
      mimeType: "application/json",
    },
    async (uri) => {
      const graph = await manager.readGraph();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(graph, null, 2),
          },
        ],
      };
    },
  );
}

// Enable clients to subscribe to the knowledge-graph resource and receive
// notifications/resources/updated when mutation tools change the graph.
export function registerKnowledgeGraphSubscriptions(
  server: McpServer,
  resourceSubscribers: Set<string>,
) {
  server.server.registerCapabilities({ resources: { subscribe: true } });
  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    resourceSubscribers.add(request.params.uri);
    return {};
  });
  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    resourceSubscribers.delete(request.params.uri);
    return {};
  });
}

// Start the server on stdio, writing the graph to the file
// ensureMemoryFilePath picks. The transport is a parameter so a test can run
// this whole startup path in-process; the bin always uses stdio.
export async function main(
  transport: Transport = new StdioServerTransport(),
): Promise<McpServer> {
  const memoryFilePath = await ensureMemoryFilePath();
  const server = createServer(memoryFilePath);
  await server.connect(transport);
  console.error("Knowledge Graph MCP Server running on stdio");
  return server;
}

// True when this module is the program node was asked to run, rather than a
// module imported by a test. Both sides go through realpath, because npm runs
// the bin through a symlink (node_modules/.bin/mcp-server-memory).
export function isMainModule(
  entryPath: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (!entryPath) {
    return false;
  }
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
