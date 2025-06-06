#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ScoredKnowledgeGraph, searchGraph } from './query-language.js';
import { KnowledgeGraph, Relation } from './types.js';

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(process.cwd(), 'memory.json');

// If MEMORY_FILE_PATH is just a filename, put it in the current working directory
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(process.cwd(), process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

/**
 * Loads the knowledge graph from the memory file
 */
async function loadGraph(): Promise<KnowledgeGraph> {
  try {
    const data = await fs.readFile(MEMORY_FILE_PATH, "utf-8");
    const lines = data.split("\n").filter(line => line.trim() !== "");
    
    const graph: KnowledgeGraph = { entities: [], relations: [] };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        const item = JSON.parse(line);
        
        if (item.type === "entity") {
          const entity = {
            name: item.name,
            entityType: item.entityType,
            observations: item.observations || []
          };
          graph.entities.push(entity);
        } else if (item.type === "relation") {
          const relation = {
            from: item.from,
            to: item.to,
            relationType: item.relationType
          };
          graph.relations.push(relation);
        }
      } catch (e) {
        console.error(`Error parsing line: ${(e as Error).message}`);
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

/**
 * Formats and prints the search results
 */
function printResults(graph: ScoredKnowledgeGraph, relations: Relation[]): void {
  // Format entities
  console.log("\n=== ENTITIES ===");
  if (graph.scoredEntities.length === 0) {
    console.log("No entities found matching the query.");
  } else {
    graph.scoredEntities.forEach((scoredEntity, index) => {
      const entity = scoredEntity.entity;
      console.log(`\n[${index + 1}: @${Math.round(scoredEntity.score * 10) * 0.1}] ${entity.name} (${entity.entityType})`);
      if (entity.observations.length > 0) {
        console.log("  Observations:");
        entity.observations.forEach(obs => {
          console.log(`  - ${obs}`);
        });
      }
    });
  }

  // Format relations
  console.log("\n=== RELATIONS ===");
  if (relations.length === 0) {
    console.log("No relations found between the matched entities.");
  } else {
    relations.forEach((relation, index) => {
      console.log(`[${index + 1}] ${relation.from} ${relation.relationType} ${relation.to}`);
    });
  }
  console.log("");
}

/**
 * Prints usage information
 */
function printUsage(): void {
  console.log(`
Usage: memory-query [OPTIONS] QUERY

Search the knowledge graph using the query language.

Query Language:
  - type:value            Filter entities by type
  - name:value            Filter entities by name
  - +word                 Require this term (AND logic)
  - -word                 Exclude this term (NOT logic)
  - word1|word2|word3     Match any of these terms (OR logic)
  - Any other text        Used for fuzzy matching

Examples:
  memory-query type:person +programmer -manager
  memory-query "frontend|backend developer"
  memory-query name:john
  memory-query "type:project +active -completed priority|urgent"

Options:
  -h, --help              Show this help message
  -j, --json              Output results in JSON format
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    printUsage();
    return;
  }

  // Check for JSON output flag
  const jsonOutput = args.includes('-j') || args.includes('--json');
  // Remove flags from args
  const cleanArgs = args.filter(arg => !arg.startsWith('-'));
  
  // Combine all non-flag arguments as the query
  const query = cleanArgs.join(' ');
  
  try {
    const graph = await loadGraph();
    const results = searchGraph(query, graph);
    const names: { [name: string]: boolean } = results.scoredEntities.reduce((acc: { [name: string]: boolean }, se) => {
      acc[se.entity.name] = true;
      return acc;
    }, {});
    const relations = graph.relations.filter(r => names[r.from] && names[r.to]);
    
    if (jsonOutput) {
      // Output as JSON
      console.log(JSON.stringify(results, null, 2));
    } else {
      // Output in human-readable format
      printResults(results, relations);
    }
  } catch (error) {
    console.error("Error while searching the knowledge graph:", error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
}); 