import * as http from 'http';
import { KnowledgeGraphManager } from './knowledge-graph-manager.js';

export function startHealthServer(port: number, knowledgeGraphManager: KnowledgeGraphManager) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      try {
        // Check if the knowledge graph manager is working
        const stats = await knowledgeGraphManager.getStats();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          storage: {
            type: process.env.STORAGE_TYPE || 'json',
            stats: stats
          }
        }));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.error(`Health check server listening on port ${port}`);
  });

  return server;
}