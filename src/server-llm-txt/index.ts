#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  GetLLMTxtOptionsSchema,
  ListLLMTxtOptionsSchema,
  type LLMTxt,
  type LLMTxtList,
  type LLMTxtListItem
} from './schemas.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Define schema for search tool
const SearchLLMTxtOptionsSchema = z.object({
  id: z.number().describe(
    "The ID of the LLM.txt file to search in. Must be obtained first using the list_llm_txt command."
  ),
  queries: z.array(z.string()).min(1).describe(
    "Array of substrings to search for. Each query is searched case-insensitively. At least one query is required."
  ),
  context_lines: z.number().optional().default(2).describe(
    "Number of lines to show before and after each match for context. Defaults to 2 lines."
  ),
});

const tools = {
  get_llm_txt: {
    description: "Fetch an LLM.txt file from a given URL. Format your response in beautiful markdown.",
    inputSchema: zodToJsonSchema(GetLLMTxtOptionsSchema)
  },
  list_llm_txt: {
    description: "List available LLM.txt files from the directory. Use this first before fetching a specific LLM.txt file. Format your response in beautiful markdown.",
    inputSchema: zodToJsonSchema(ListLLMTxtOptionsSchema)
  },
  search_llm_txt: {
    description: "Search for multiple substrings in an LLM.txt file. Requires a valid ID obtained from list_llm_txt command. Returns snippets with page numbers for each match. Format your response in beautiful markdown, using code blocks for snippets.",
    inputSchema: zodToJsonSchema(SearchLLMTxtOptionsSchema)
  }
};

const server = new Server({
  name: "server-llm-txt",
  version: "0.1.0",
  author: "Michael Latman (https://michaellatman.com)"
}, {
  capabilities: {
    tools
  }
});

const DIRECTORY_URL = "https://directory.llmstxt.cloud/";
const MAX_RESPONSE_LENGTH = 100000;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Get cache directory based on OS
function getCacheDir(): string {
  const platform = os.platform();
  let cacheDir: string;

  switch (platform) {
    case 'win32':
      cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'llm-txt-mcp');
      break;
    case 'darwin':
      cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'llm-txt-mcp');
      break;
    default: // linux and others
      cacheDir = path.join(os.homedir(), '.cache', 'llm-txt-mcp');
  }

  // Ensure cache directory exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  return cacheDir;
}

// Cache management functions
function getCachedList(): LLMTxtList | null {
  const cacheFile = path.join(getCacheDir(), 'llm-list-cache.json');
  
  try {
    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    const now = Date.now();

    if (now - cacheData.timestamp > CACHE_DURATION_MS) {
      return null; // Cache expired
    }

    return cacheData.data;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

function saveToCache(data: LLMTxtList): void {
  const cacheFile = path.join(getCacheDir(), 'llm-list-cache.json');
  const cacheData = {
    timestamp: Date.now(),
    data
  };

  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData), 'utf-8');
  } catch (error) {
    console.error('Error writing cache:', error);
  }
}

// Simple hash function to convert string to number
function hashUrl(url: string): number {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash); // Ensure positive number
}

async function getLLMTxt(id: number, page: number = 1): Promise<LLMTxt> {
  // First get the list to find the URL for this ID
  const allItems = await listLLMTxt(); // Get all items
  const item = allItems.find(item => item.id === id);
  
  if (!item) {
    throw new Error(`No LLM.txt found with ID: ${id}`);
  }

  const response = await fetch(item.url, {
    headers: {
      "Accept": "text/plain",
      "User-Agent": "llm-txt-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LLM.txt: ${response.statusText}`);
  }

  const fullContent = await response.text();
  const start = (page - 1) * MAX_RESPONSE_LENGTH;
  let content = fullContent.slice(start, start + MAX_RESPONSE_LENGTH);
  const hasNextPage = start + content.length < fullContent.length;

  return {
    id: item.id,
    url: item.url,
    name: item.name,
    description: item.description,
    hasNextPage,
    currentPage: page,
    content,
  };
}

// Cache the promise of fetching the list to prevent multiple concurrent fetches
let listFetchPromise: Promise<LLMTxtList> | null = null;

async function listLLMTxt(): Promise<LLMTxtList> {
  // If we're already fetching, return that promise
  if (listFetchPromise) {
    return listFetchPromise;
  }

  // Check cache first
  const cachedList = getCachedList();
  if (cachedList) {
    return cachedList;
  }

  // Create a new fetch promise
  listFetchPromise = (async () => {
    try {
      const response = await fetch(DIRECTORY_URL, {
        headers: {
          "Accept": "text/html",
          "User-Agent": "llm-txt-mcp-server"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch LLM.txt list: ${response.statusText}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Find all llm.txt links
      const links: LLMTxtListItem[] = Array.from(document.querySelectorAll('li'))
        .map(li => {
          // Try to find llms-full.txt link first, fall back to llms.txt
          const fullLink = li.querySelector('a[href*="llms-full.txt"]');
          const link = fullLink || li.querySelector('a[href*="llms.txt"]');
          if (!link) return null;

          const url = link.getAttribute('href') || '';
          return {
            id: hashUrl(url),
            url,
            name: li.querySelector('h3')?.textContent?.trim() || 'Unknown',
            description: li.querySelector('p')?.textContent?.trim() || ''
          };
        })
        .filter((item): item is LLMTxtListItem => item !== null && item.url.endsWith('.txt'));

      // Save to cache
      saveToCache(links);
      
      return links;
    } finally {
      // Clear the promise after it's done (success or failure)
      listFetchPromise = null;
    }
  })();

  return listFetchPromise;
}

async function searchLLMTxt(id: number, queries: string[], contextLines: number = 2): Promise<any> {
  // First get the list to find the URL for this ID
  const allItems = await listLLMTxt();
  const item = allItems.find(item => item.id === id);
  
  if (!item) {
    throw new Error(`No LLM.txt found with ID: ${id}`);
  }

  const response = await fetch(item.url, {
    headers: {
      "Accept": "text/plain",
      "User-Agent": "llm-txt-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LLM.txt: ${response.statusText}`);
  }

  const content = await response.text();
  const lines = content.split('\n');
  const results = [];
  const searchRegexes = queries.map(query => new RegExp(query, 'gi'));
  
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const matches = searchRegexes.some(regex => regex.test(lines[i]));
    if (matches) {
      const startLine = Math.max(0, i - contextLines);
      const endLine = Math.min(lines.length - 1, i + contextLines);
      const snippet = lines.slice(startLine, endLine + 1).join('\n');
      const page = Math.floor(charCount / MAX_RESPONSE_LENGTH) + 1;
      
      // Find which queries matched this line
      const matchedQueries = queries.filter(query => 
        new RegExp(query, 'gi').test(lines[i])
      );
      
      results.push({
        page,
        lineNumber: i + 1,
        snippet,
        matchedLine: lines[i],
        matchedQueries
      });
    }
    charCount += lines[i].length + 1; // +1 for the newline character
  }

  return {
    id: item.id,
    url: item.url,
    name: item.name,
    matches: results
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "get_llm_txt": {
        const args = GetLLMTxtOptionsSchema.parse(request.params.arguments);
        const result = await getLLMTxt(args.id, args.page);
        
        // Always truncate to MAX_RESPONSE_LENGTH and indicate if there's more
        const content = result.content.slice(0, MAX_RESPONSE_LENGTH);
        const hasMoreContent = result.content.length > MAX_RESPONSE_LENGTH || result.hasNextPage;
        
        const response = {
  
          currentPage: result.currentPage,
          ...(hasMoreContent && {
            hasNextPage: true
          }),
          content
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(response, null, 2)
          }]
        };
      }

      case "list_llm_txt": {
        const result = await listLLMTxt();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "search_llm_txt": {
        const args = SearchLLMTxtOptionsSchema.parse(request.params.arguments);
        const result = await searchLLMTxt(args.id, args.queries, args.context_lines);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      throw new Error(`Invalid arguments: ${issues}`);
    }
    throw error;
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LLM.txt MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
}); 