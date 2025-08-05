import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';

interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

describe('MCP Server Integration Tests', () => {
  let serverProcess: ChildProcess;
  let client: Client;
  let tempDir: string;

  async function startServerWithStorage(storageType: 'json' | 'sqlite') {
    // Create temporary directory for test data
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-integration-test-'));
    
    // Set up environment variables
    const env: Record<string, string> = {
      ...process.env,
      STORAGE_TYPE: storageType,
    };

    if (storageType === 'json') {
      env.JSON_PATH = path.join(tempDir, `test-memory-${Date.now()}-${Math.random()}.jsonl`);
    } else {
      env.SQLITE_PATH = path.join(tempDir, `test-memory-${Date.now()}-${Math.random()}.db`);
    }

    // Start the server process
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create client transport
    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env,
    });

    // Initialize client
    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function stopServer() {
    if (client) {
      await client.close();
    }
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  async function callTool(name: string, args: any): Promise<any> {
    const response = await client.callTool({
      name,
      arguments: args,
    });
    
    if (response.content && Array.isArray(response.content) && response.content.length > 0) {
      const textContent = response.content.find((c: any) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        // Try to parse as JSON, if it fails return the text directly
        try {
          return JSON.parse(textContent.text);
        } catch {
          return textContent.text;
        }
      }
    }
    return null;
  }

  // Test each storage backend
  ['json', 'sqlite'].forEach(storageType => {
    describe(`${storageType.toUpperCase()} Storage Backend`, () => {
      beforeEach(async () => {
        await startServerWithStorage(storageType as 'json' | 'sqlite');
      });

      afterEach(async () => {
        await stopServer();
      });

      describe('Tool Discovery', () => {
        it('should list all available tools', async () => {
          const tools = await client.listTools();
          
          expect(tools.tools).toHaveLength(10);
          
          const toolNames = tools.tools.map(t => t.name);
          expect(toolNames).toContain('create_entities');
          expect(toolNames).toContain('create_relations');
          expect(toolNames).toContain('add_observations');
          expect(toolNames).toContain('delete_entities');
          expect(toolNames).toContain('delete_observations');
          expect(toolNames).toContain('delete_relations');
          expect(toolNames).toContain('read_graph');
          expect(toolNames).toContain('search_nodes');
          expect(toolNames).toContain('open_nodes');
          expect(toolNames).toContain('get_stats');
        });

        it('should provide correct input schemas for tools', async () => {
          const tools = await client.listTools();
          
          const createEntities = tools.tools.find(t => t.name === 'create_entities');
          expect(createEntities?.inputSchema).toBeDefined();
          expect(createEntities?.inputSchema.type).toBe('object');
          expect(createEntities?.inputSchema.properties).toHaveProperty('entities');
        });
      });

      describe('Entity Operations', () => {
        it('should create entities', async () => {
          const entities = [
            {
              name: 'Test User',
              entityType: 'Person',
              observations: ['Likes testing', 'Uses MCP'],
            },
            {
              name: 'Test Project',
              entityType: 'Software',
              observations: ['Built with TypeScript'],
            },
          ];

          const result = await callTool('create_entities', { entities });
          expect(result).toHaveLength(2);
          expect(result[0].name).toBe('Test User');
          expect(result[1].name).toBe('Test Project');
        });

        it('should delete entities', async () => {
          // Create entities first
          await callTool('create_entities', {
            entities: [{
              name: 'To Delete',
              entityType: 'Test',
              observations: ['Will be deleted'],
            }],
          });

          // Delete the entity
          const deleteResult = await callTool('delete_entities', {
            entityNames: ['To Delete'],
          });

          // Delete operations return a success message
          expect(deleteResult).toBe('Entities deleted successfully');

          // Verify it's gone
          const graph = await callTool('read_graph', {});
          expect(graph.entities).toHaveLength(0);
        });
      });

      describe('Observation Operations', () => {
        beforeEach(async () => {
          // Create a test entity
          await callTool('create_entities', {
            entities: [{
              name: 'Observable Entity',
              entityType: 'Test',
              observations: ['Initial observation'],
            }],
          });
        });

        it('should add observations', async () => {
          const result = await callTool('add_observations', {
            observations: [{
              entityName: 'Observable Entity',
              contents: ['New observation 1', 'New observation 2'],
            }],
          });

          expect(result).toHaveLength(1);
          expect(result[0].addedObservations).toHaveLength(2);
        });

        it('should delete observations', async () => {
          // Add observations first
          await callTool('add_observations', {
            observations: [{
              entityName: 'Observable Entity',
              contents: ['To delete 1', 'To keep', 'To delete 2'],
            }],
          });

          // Delete specific observations
          const deleteResult = await callTool('delete_observations', {
            deletions: [{
              entityName: 'Observable Entity',
              observations: ['To delete 1', 'To delete 2'],
            }],
          });

          // Delete operations return a success message
          expect(deleteResult).toBe('Observations deleted successfully');

          // Verify correct observations remain
          const result = await callTool('open_nodes', {
            names: ['Observable Entity'],
          });
          
          const observations = result.entities[0].observations;
          expect(observations).toContain('Initial observation');
          expect(observations).toContain('To keep');
          expect(observations).not.toContain('To delete 1');
          expect(observations).not.toContain('To delete 2');
        });
      });

      describe('Relation Operations', () => {
        beforeEach(async () => {
          // Create entities for relations
          await callTool('create_entities', {
            entities: [
              {
                name: 'Entity A',
                entityType: 'Test',
                observations: ['A'],
              },
              {
                name: 'Entity B',
                entityType: 'Test',
                observations: ['B'],
              },
            ],
          });
        });

        it('should create relations', async () => {
          const result = await callTool('create_relations', {
            relations: [{
              from: 'Entity A',
              to: 'Entity B',
              relationType: 'connects to',
            }],
          });

          expect(result).toHaveLength(1);
          expect(result[0].from).toBe('Entity A');
          expect(result[0].to).toBe('Entity B');
          expect(result[0].relationType).toBe('connects to');
        });

        it('should delete relations', async () => {
          // Create relation first
          await callTool('create_relations', {
            relations: [{
              from: 'Entity A',
              to: 'Entity B',
              relationType: 'connects to',
            }],
          });

          // Delete the relation
          const deleteResult = await callTool('delete_relations', {
            relations: [{
              from: 'Entity A',
              to: 'Entity B',
              relationType: 'connects to',
            }],
          });

          // Delete operations return a success message
          expect(deleteResult).toBe('Relations deleted successfully');

          // Verify it's gone
          const graph = await callTool('read_graph', {});
          expect(graph.relations).toHaveLength(0);
        });
      });

      describe('Query Operations', () => {
        beforeEach(async () => {
          // Create test data
          await callTool('create_entities', {
            entities: [
              {
                name: 'Searchable Entity',
                entityType: 'SearchType',
                observations: ['Contains KEYWORD', 'Other data'],
              },
              {
                name: 'Another Entity',
                entityType: 'DifferentType',
                observations: ['Different content'],
              },
            ],
          });

          await callTool('create_relations', {
            relations: [{
              from: 'Searchable Entity',
              to: 'Another Entity',
              relationType: 'relates to',
            }],
          });
        });

        it('should read entire graph', async () => {
          const graph = await callTool('read_graph', {});
          
          expect(graph.entities).toHaveLength(2);
          expect(graph.relations).toHaveLength(1);
        });

        it('should search nodes by query', async () => {
          const results = await callTool('search_nodes', {
            query: 'KEYWORD',
          });

          // search_nodes returns an object with entities and relations
          expect(results.entities).toHaveLength(1);
          expect(results.entities[0].name).toBe('Searchable Entity');
        });

        it('should open specific nodes', async () => {
          const result = await callTool('open_nodes', {
            names: ['Searchable Entity', 'Another Entity'],
          });

          // open_nodes returns an object with entities and relations
          expect(result.entities).toHaveLength(2);
          expect(result.entities.map((n: any) => n.name)).toContain('Searchable Entity');
          expect(result.entities.map((n: any) => n.name)).toContain('Another Entity');
        });
      });

      describe('Statistics', () => {
        it('should return correct statistics', async () => {
          // Create test data
          await callTool('create_entities', {
            entities: [
              {
                name: 'Stats Entity 1',
                entityType: 'Test',
                observations: ['Obs 1', 'Obs 2'],
              },
              {
                name: 'Stats Entity 2',
                entityType: 'Test',
                observations: ['Obs 3'],
              },
            ],
          });

          await callTool('create_relations', {
            relations: [{
              from: 'Stats Entity 1',
              to: 'Stats Entity 2',
              relationType: 'relates to',
            }],
          });

          const stats = await callTool('get_stats', {});
          
          expect(stats.entityCount).toBe(2);
          expect(stats.relationCount).toBe(1);
          expect(stats.observationCount).toBe(3);
          
          if (stats.storageSize !== undefined) {
            expect(stats.storageSize).toBeGreaterThanOrEqual(0);
          }
        });
      });

      describe('Error Handling', () => {
        it('should handle invalid tool calls gracefully', async () => {
          await expect(
            callTool('non_existent_tool', {})
          ).rejects.toThrow();
        });

        it('should handle invalid arguments', async () => {
          // Try to create entities with invalid structure
          await expect(
            callTool('create_entities', {
              // Missing required 'entities' field
              wrongField: [],
            })
          ).rejects.toThrow();
        });
      });

      describe('Complex Scenarios', () => {
        it('should handle a complete workflow', async () => {
          // 1. Create entities
          await callTool('create_entities', {
            entities: [
              {
                name: 'Project Alpha',
                entityType: 'Project',
                observations: ['Started in 2024', 'Uses AI'],
              },
              {
                name: 'John Doe',
                entityType: 'Person',
                observations: ['Lead developer', 'AI expert'],
              },
              {
                name: 'AI Module',
                entityType: 'Component',
                observations: ['Core functionality', 'Written in Python'],
              },
            ],
          });

          // 2. Create relations
          await callTool('create_relations', {
            relations: [
              {
                from: 'John Doe',
                to: 'Project Alpha',
                relationType: 'works on',
              },
              {
                from: 'Project Alpha',
                to: 'AI Module',
                relationType: 'contains',
              },
            ],
          });

          // 3. Add more observations
          await callTool('add_observations', {
            observations: [{
              entityName: 'Project Alpha',
              contents: ['Deployed to production', 'Serves 1000 users'],
            }],
          });

          // 4. Search for AI-related nodes
          const searchResult = await callTool('search_nodes', {
            query: 'AI',
          });
          expect(searchResult.entities).toHaveLength(3); // Project Alpha, John Doe (AI expert), and AI Module

          // 5. Get statistics
          const stats = await callTool('get_stats', {});
          expect(stats.entityCount).toBe(3);
          expect(stats.relationCount).toBe(2);
          expect(stats.observationCount).toBe(8);

          // 6. Read full graph
          const graph = await callTool('read_graph', {});
          expect(graph.entities).toHaveLength(3);
          expect(graph.relations).toHaveLength(2);
        });
      });
    });
  });
});