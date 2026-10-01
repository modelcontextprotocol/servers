#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { SERVER_VERSION } from './version.js';
import { withDirectoryLock } from './file-lock.js';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MemoryRequestError,
  parseRequestTimeout,
  validateLimit,
} from './request-lifecycle.js';

export { MemoryRequestError } from './request-lifecycle.js';

// Define memory file path using environment variable with fallback
export const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.jsonl');

// Expand a leading "~" to the user's home directory. MCP clients pass
// MEMORY_FILE_PATH from JSON config, where no shell performs tilde expansion,
// so an unexpanded "~" would otherwise be treated as a relative path and
// joined onto the package directory. Mirrors the helper of the same name in
// the filesystem server (src/filesystem/path-utils.ts).
export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Handle backward compatibility: migrate memory.json to memory.jsonl if needed
export async function ensureMemoryFilePath(): Promise<string> {
  if (process.env.MEMORY_FILE_PATH) {
    // Custom path provided. Expand a leading "~" first, then resolve relative
    // paths against the package directory (absolute paths are used as-is).
    const customPath = expandHome(process.env.MEMORY_FILE_PATH);
    return path.isAbsolute(customPath)
      ? customPath
      : path.join(path.dirname(fileURLToPath(import.meta.url)), customPath);
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

export interface KnowledgeGraphManagerOptions {
  // Default budget for mutation calls that do not supply their own signal.
  requestTimeoutMs?: number;
  // Mutations admitted but not yet drained, including the executing one.
  // Bounds bookkeeping, not latency or payload bytes.
  maxPendingMutations?: number;
}

export const DEFAULT_MAX_PENDING_MUTATIONS = 256;

// The only way to replace the graph file: ownership, then the caller's
// lifetime, then a synchronously dispatched rename.
type Publish = (tempFilePath: string) => Promise<void>;

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
export class KnowledgeGraphManager {
  private readonly requestTimeoutMs: number;
  private readonly maxPendingMutations: number;

  constructor(private memoryFilePath: string, options: KnowledgeGraphManagerOptions = {}) {
    this.requestTimeoutMs = validateLimit(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 'request timeout');
    this.maxPendingMutations = validateLimit(
      options.maxPendingMutations ?? DEFAULT_MAX_PENDING_MUTATIONS,
      'pending mutation capacity',
      Number.MAX_SAFE_INTEGER,
    );
  }

  // Manager-local FIFO preserves this instance's mutation order and reduces
  // contention on the directory lease, which is what actually protects the
  // shared read-modify-write transaction. See #1819.
  private mutationQueue: Promise<unknown> = Promise.resolve();
  // Entries enqueued but not yet drained, including the executing one.
  private pendingMutations = 0;

  // The single transaction entry for all six mutations. `change` performs the
  // in-memory validation/transformation only; this method owns admission,
  // queueing, lease acquisition, loading, publication and draining. The
  // caller awaits the real execution, so outcomes come from throw sites:
  // `NOT_COMMITTED` before the rename is dispatched, `COMMIT_UNKNOWN` when
  // the rename itself rejects, and business errors from `change` unchanged.
  private mutateGraph<R>(
    change: (graph: KnowledgeGraph) => R,
    signal: AbortSignal = AbortSignal.timeout(this.requestTimeoutMs),
  ): Promise<R> {
    if (this.pendingMutations >= this.maxPendingMutations) {
      return Promise.reject(new MemoryRequestError('NOT_COMMITTED', 'memory write queue is full; retry later'));
    }
    this.pendingMutations++;
    let businessError = false;
    const run = async (): Promise<R> => {
      try {
        signal.throwIfAborted();
        return await withDirectoryLock(this.memoryFilePath, async assertOwned => {
          const graph = await this.loadGraph();
          signal.throwIfAborted();
          let result: R;
          try {
            result = change(graph);
          } catch (error) {
            businessError = true;
            throw error;
          }
          await this.saveGraph(graph, async tempFilePath => {
            await assertOwned(); // Detects lease loss; not storage-side fencing.
            signal.throwIfAborted(); // No await between this check and the rename.
            try {
              await fs.rename(tempFilePath, this.memoryFilePath);
            } catch (error) {
              throw new MemoryRequestError('COMMIT_UNKNOWN', 'graph publication failed; read the graph before retrying', { cause: error });
            }
          });
          return result;
        }, { signal });
      } catch (error) {
        // Business errors from `change` propagate unchanged. Every other
        // failure happened before the rename was dispatched: queueing, lease
        // acquisition or loss, loading, or writing the temporary file.
        if (businessError || error instanceof MemoryRequestError) throw error;
        throw new MemoryRequestError(
          'NOT_COMMITTED',
          signal.aborted ? 'request was cancelled or expired before the graph was changed' : 'graph was not changed',
          { cause: error },
        );
      }
    };
    const result = this.mutationQueue.then(run, run);
    // Drain the counter on either outcome; a failed job must not wedge the queue.
    const drain = () => { this.pendingMutations--; };
    this.mutationQueue = result.then(drain, drain);
    return result;
  }

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
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
              parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(", ")
            );
          }
        } else if (record.type === "relation") {
          const parsed = RelationSchema.safeParse(item);
          if (parsed.success) {
            graph.relations.push(parsed.data);
          } else {
            console.error(
              "Skipping invalid relation in memory file:",
              parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(", ")
            );
          }
        }
      }

      return graph;
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph, publish: Publish): Promise<void> {
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
      `${path.basename(this.memoryFilePath)}.${randomBytes(16).toString('hex')}.tmp`
    );

    try {
      await fs.writeFile(tempFilePath, lines.join("\n") + "\n");
      await publish(tempFilePath);
    } catch (error) {
      // Never leave a stray temp file behind on failure.
      await fs.unlink(tempFilePath).catch(() => {});
      throw error;
    }
  }

  async createEntities(entities: Entity[], signal?: AbortSignal): Promise<Entity[]> {
    return this.mutateGraph(graph => {
      const newEntities = entities.filter((e, index) =>
        !graph.entities.some(existingEntity => existingEntity.name === e.name) &&
        // Also skip duplicates appearing earlier in this same batch
        !entities.slice(0, index).some(earlier => earlier.name === e.name)
      );
      graph.entities.push(...newEntities);
      return newEntities;
    }, signal);
  }

  async createRelations(relations: Relation[], signal?: AbortSignal): Promise<Relation[]> {
    return this.mutateGraph(graph => {
      const entityNames = new Set(graph.entities.map(e => e.name));

      relations.forEach(r => {
        if (!entityNames.has(r.from)) {
          throw new Error(`Entity with name ${r.from} not found`);
        }
        if (!entityNames.has(r.to)) {
          throw new Error(`Entity with name ${r.to} not found`);
        }
      });

      const isSameRelation = (a: Relation, b: Relation) =>
        a.from === b.from &&
        a.to === b.to &&
        a.relationType === b.relationType;
      const newRelations = relations.filter((r, index) =>
        !graph.relations.some(existingRelation => isSameRelation(existingRelation, r)) &&
        // Also skip duplicates appearing earlier in this same batch
        !relations.slice(0, index).some(earlier => isSameRelation(earlier, r))
      );
      graph.relations.push(...newRelations);
      return newRelations;
    }, signal);
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[],
    signal?: AbortSignal,
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    return this.mutateGraph(graph => {
      const results = observations.map(o => {
        const entity = graph.entities.find(e => e.name === o.entityName);
        if (!entity) {
          throw new Error(`Entity with name ${o.entityName} not found`);
        }
        const newObservations = o.contents.filter(content => !entity.observations.includes(content));
        entity.observations.push(...newObservations);
        return { entityName: o.entityName, addedObservations: newObservations };
      });
      return results;
    }, signal);
  }

  async deleteEntities(entityNames: string[], signal?: AbortSignal): Promise<{ deleted: string[]; notFound: string[] }> {
    return this.mutateGraph(graph => {
      const present = new Set(graph.entities.map(e => e.name));
      const deleted = entityNames.filter(name => present.has(name));
      const notFound = entityNames.filter(name => !present.has(name));
      graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
      graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
      return { deleted, notFound };
    }, signal);
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
    signal?: AbortSignal,
  ): Promise<{ deletedCount: number; missingEntities: string[] }> {
    return this.mutateGraph(graph => {
      let deletedCount = 0;
      const missingEntities: string[] = [];
      deletions.forEach(d => {
        const entity = graph.entities.find(e => e.name === d.entityName);
        if (entity) {
          const before = entity.observations.length;
          entity.observations = entity.observations.filter(o => !d.observations.includes(o));
          deletedCount += before - entity.observations.length;
        } else {
          missingEntities.push(d.entityName);
        }
      });
      return { deletedCount, missingEntities };
    }, signal);
  }

  async deleteRelations(relations: Relation[], signal?: AbortSignal): Promise<{ deletedCount: number }> {
    return this.mutateGraph(graph => {
      const before = graph.relations.length;
      graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
        r.from === delRelation.from && 
        r.to === delRelation.to && 
        r.relationType === delRelation.relationType
      ));
      return { deletedCount: before - graph.relations.length };
    }, signal);
  }

  // Reads are lock-free snapshots. A supplied signal only discards work.
  async readGraph(signal?: AbortSignal): Promise<KnowledgeGraph> {
    signal?.throwIfAborted();
    const graph = await this.loadGraph();
    signal?.throwIfAborted();
    return graph;
  }

  // Very basic search function
  async searchNodes(query: string, signal?: AbortSignal): Promise<KnowledgeGraph> {
    const graph = await this.readGraph(signal);
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Include relations where at least one endpoint matches the search results.
    // This lets callers discover connections to nodes outside the result set.
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  async openNodes(names: string[], signal?: AbortSignal): Promise<KnowledgeGraph> {
    const graph = await this.readGraph(signal);
    
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
  observations: z.array(z.string()).describe("An array of observation contents associated with the entity")
});

const RelationSchema = z.object({
  from: z.string().describe("The name of the entity where the relation starts"),
  to: z.string().describe("The name of the entity where the relation ends"),
  relationType: z.string().describe("The type of the relation")
});

const server = new McpServer({
  name: "memory-server",
  version: SERVER_VERSION,
});

const RESOURCE_URI = "memory://knowledge-graph";

// Track which resource URIs the connected client has subscribed to, so we only
// emit notifications/resources/updated to a client that asked for them.
const resourceSubscribers = new Set<string>();

// Notify subscribers that the knowledge graph resource changed. No-op when the
// client has not subscribed.
function notifyGraphUpdated() {
  if (resourceSubscribers.has(RESOURCE_URI)) {
    server.server.sendResourceUpdated({ uri: RESOURCE_URI });
  }
}

// Validated at startup; see MEMORY_REQUEST_TIMEOUT_MS in the README.
let requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;

// One signal per tool/resource callback: the SDK's cancellation signal
// combined with the server's request budget.
function requestSignal(extra: { signal: AbortSignal }): AbortSignal {
  return AbortSignal.any([extra.signal, AbortSignal.timeout(requestTimeoutMs)]);
}

// Register create_entities tool
server.registerTool(
  "create_entities",
  {
    title: "Create Entities",
    description: "Create multiple new entities in the knowledge graph",
    inputSchema: {
      entities: z.array(EntitySchema)
    },
    outputSchema: {
      entities: z.array(EntitySchema)
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    }
  },
  async ({ entities }, extra) => {
    const result = await knowledgeGraphManager.createEntities(entities, requestSignal(extra));
    notifyGraphUpdated();
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
      relations: z.array(RelationSchema)
    },
    outputSchema: {
      relations: z.array(RelationSchema)
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    }
  },
  async ({ relations }, extra) => {
    const result = await knowledgeGraphManager.createRelations(relations, requestSignal(extra));
    notifyGraphUpdated();
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    }
  },
  async ({ observations }, extra) => {
    const result = await knowledgeGraphManager.addObservations(observations, requestSignal(extra));
    notifyGraphUpdated();
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    }
  },
  async ({ entityNames }, extra) => {
    const { deleted, notFound } = await knowledgeGraphManager.deleteEntities(entityNames, requestSignal(extra));
    notifyGraphUpdated();
    const message = notFound.length === 0
      ? "Entities deleted successfully"
      : `Deleted ${deleted.length} of ${entityNames.length} entities. Not found: ${notFound.join(", ")}`;
    return {
      content: [{ type: "text" as const, text: message }],
      structuredContent: { success: true, message }
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    }
  },
  async ({ deletions }, extra) => {
    const { deletedCount, missingEntities } = await knowledgeGraphManager.deleteObservations(deletions, requestSignal(extra));
    notifyGraphUpdated();
    const requested = deletions.reduce((total, d) => total + d.observations.length, 0);
    const message = deletedCount === requested
      ? "Observations deleted successfully"
      : `Deleted ${deletedCount} of ${requested} observations.` +
        (missingEntities.length ? ` Entities not found: ${missingEntities.join(", ")}` : "");
    return {
      content: [{ type: "text" as const, text: message }],
      structuredContent: { success: true, message }
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
      relations: z.array(RelationSchema).describe("An array of relations to delete")
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    }
  },
  async ({ relations }, extra) => {
    const { deletedCount } = await knowledgeGraphManager.deleteRelations(relations, requestSignal(extra));
    notifyGraphUpdated();
    const message = deletedCount === relations.length
      ? "Relations deleted successfully"
      : `Deleted ${deletedCount} of ${relations.length} relations. The rest matched nothing.`;
    return {
      content: [{ type: "text" as const, text: message }],
      structuredContent: { success: true, message }
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
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    }
  },
  async (_args, extra) => {
    const graph = await knowledgeGraphManager.readGraph(requestSignal(extra));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

export const SEARCH_QUERY_MAX_LENGTH = 2048;

export const SearchNodesQuerySchema = z
  .string()
  .max(SEARCH_QUERY_MAX_LENGTH)
  .describe("The search query to match against entity names, types, and observation content");

// Register search_nodes tool
server.registerTool(
  "search_nodes",
  {
    title: "Search Nodes",
    description: "Search for nodes in the knowledge graph based on a query",
    inputSchema: {
      query: SearchNodesQuerySchema
    },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    }
  },
  async ({ query }, extra) => {
    const graph = await knowledgeGraphManager.searchNodes(query, requestSignal(extra));
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
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    }
  },
  async ({ names }, extra) => {
    const graph = await knowledgeGraphManager.openNodes(names, requestSignal(extra));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

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
    async (uri, extra) => {
      const graph = await manager.readGraph(requestSignal(extra));
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
export function registerKnowledgeGraphSubscriptions(server: McpServer) {
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

async function main() {
  requestTimeoutMs = parseRequestTimeout(process.env.MEMORY_REQUEST_TIMEOUT_MS);
  MEMORY_FILE_PATH = await ensureMemoryFilePath();
  knowledgeGraphManager = new KnowledgeGraphManager(MEMORY_FILE_PATH, { requestTimeoutMs });
  registerKnowledgeGraphResource(server, knowledgeGraphManager);
  registerKnowledgeGraphSubscriptions(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
