#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server({
  name: 'academiadepolitie-com',
  version: '0.1.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Tool definitions for Romanian police academy preparation
const tools = [
  {
    name: 'get_student_data',
    description: 'Obține datele studentului pentru pregătirea examenelor MAI',
    inputSchema: {
      type: 'object' as const,
      properties: {
        user_profile: { type: 'boolean' as const, description: 'Include profilul utilizatorului' },
        progres_teorie: { type: 'boolean' as const, description: 'Include progresul la teorie' }
      },
      required: []
    }
  },
  {
    name: 'search_articles', 
    description: 'Caută articole educaționale cu fuzzy matching',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const, description: 'Termenul de căutare' },
        limit: { type: 'integer' as const, minimum: 1, maximum: 20, default: 10 }
      },
      required: ['query']
    }
  },
  {
    name: 'get_article_content',
    description: 'Obține conținutul unei lecții cu paginare',
    inputSchema: {
      type: 'object' as const,
      properties: {
        article_id: { type: 'integer' as const, description: 'ID-ul articolului' },
        page: { type: 'integer' as const, minimum: 1, default: 1 }
      },
      required: ['article_id']
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'get_student_data':
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ 
            message: 'Student data for Romanian police academy preparation',
            platform: 'Academiadepolitie.com',
            students: '50000+',
            success_rate: '87%'
          }, null, 2)
        }]
      };
      
    case 'search_articles':
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ 
            query: args?.query || '',
            articles: [
              { id: 1, title: 'Drept Penal - Noțiuni de bază', relevance: 0.95 },
              { id: 2, title: 'Drept Constituțional', relevance: 0.87 }
            ]
          }, null, 2)
        }]
      };
      
    case 'get_article_content':
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            article_id: args?.article_id || 1,
            page: args?.page || 1,
            content: 'Conținut educațional pentru pregătirea examenelor MAI...'
          }, null, 2)
        }]
      };
      
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Academiadepolitie.com MCP server running on stdio');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}