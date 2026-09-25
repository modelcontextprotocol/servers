#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.CO_LEAGUE_API_BASE || "https://api.co-lleague.ai";
const API_KEY = process.env.CO_LEAGUE_API_KEY || "";
const REQUEST_TIMEOUT_MS = 30_000;

async function apiPost(path: string, body: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, error: `API ${res.status}: ${text}` };
    }
    return { ok: true as const, data: await res.json() };
  } catch (err) {
    return {
      ok: false as const,
      error: `Backend unreachable: ${(err as Error).message}`,
    };
  }
}

async function apiGet(path: string) {
  const headers: Record<string, string> = {};
  if (API_KEY) headers["x-api-key"] = API_KEY;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, error: `API ${res.status}: ${text}` };
    }
    return { ok: true as const, data: await res.json() };
  } catch (err) {
    return {
      ok: false as const,
      error: `Backend unreachable: ${(err as Error).message}`,
    };
  }
}

const server = new McpServer({
  name: "co-lleague",
  version: "0.1.0",
});

server.tool(
  "co-lleague_screen_query",
  "Query what's on the user's screen. Returns screen content with AI analysis.",
  {
    query: z.string().describe("Natural language question about the screen content"),
    context: z.string().optional().describe("Additional context for the query"),
  },
  async ({ query, context }) => {
    const backend = await apiPost("/api/v1/screen/query", {
      query,
      context: context || "",
    });

    if (backend.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(backend.data, null, 2) }] };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            query,
            analysis: "Screen analysis unavailable — backend not reachable",
            status: "offline",
          }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "co-lleague_tabular_predict",
  "Run a tabular prediction on input features.",
  {
    features: z
      .union([z.array(z.number()), z.string()])
      .describe("Input features as an array of numbers or a JSON string"),
    target_column: z
      .string()
      .optional()
      .describe("Target column name (for named feature sets)"),
  },
  async ({ features, target_column }) => {
    const parsed = typeof features === "string" ? JSON.parse(features) : features;
    const backend = await apiPost("/api/v1/predict", {
      features: parsed,
      target_column: target_column || undefined,
    });

    if (backend.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(backend.data, null, 2) }] };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            result: { value: 0.5, confidence: 0.8 },
            note: "Fallback: backend unreachable, used default prediction",
          }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "co-lleague_intent_execute",
  "Execute a natural-language intent. Returns execution result.",
  {
    intent: z.string().describe("Natural language description of what to do"),
    context: z.string().optional().describe("JSON string with additional context"),
  },
  async ({ intent, context }) => {
    const parsedCtx = context ? JSON.parse(context) : {};
    const backend = await apiPost("/api/v1/intent/execute", {
      intent,
      context: parsedCtx,
    });

    if (backend.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(backend.data, null, 2) }] };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            intent,
            result: "Execution unavailable — backend not reachable",
            status: "offline",
          }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "co-lleague_agent_status",
  "Get the current agent status — online/offline, active tasks, recent activity.",
  {
    agent_id: z.string().default("default").describe("Agent identifier"),
  },
  async ({ agent_id }) => {
    const backend = await apiGet(`/api/v1/agents/${agent_id}/status`);

    if (backend.ok) {
      return { content: [{ type: "text" as const, text: JSON.stringify(backend.data, null, 2) }] };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            agent_id,
            status: "offline",
            active_tasks: 0,
            uptime_hours: 0,
          }, null, 2),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
