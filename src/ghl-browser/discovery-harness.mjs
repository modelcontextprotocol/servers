import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

const userEnv = resolve(homedir(), ".env");
if (existsSync(userEnv)) {
  for (const raw of readFileSync(userEnv, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq);
    const v = line.slice(eq + 1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const SERVER = resolve(homedir(), "mcp-servers/src/ghl-browser/dist/index.js");
const OUT_DIR = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "discovery-results");

const TARGETS = [
  { label: "dashboard", path: "/dashboard" },
  { label: "workflows", path: "/automation/workflows" },
  { label: "funnels", path: "/sites/funnels" },
  { label: "opportunities", path: "/opportunities/list" },
  { label: "campaigns", path: "/marketing/campaigns" },
  { label: "social-planner", path: "/social-media/planner" },
  { label: "blogs", path: "/sites/blogs" },
  { label: "media-library", path: "/media" },
  { label: "calendars", path: "/calendars" },
  { label: "contacts", path: "/contacts/list" },
  { label: "conversations", path: "/conversations" },
  { label: "settings", path: "/settings" },
];

// Hosts we consider "GHL API surface"
const API_HOSTS = [
  "services.leadconnectorhq.com",
  "backend.leadconnectorhq.com",
  "api.leadconnectorhq.com",
  "app.leadconnectorhq.com",
];

const proc = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
let msgId = 0;
const pending = new Map();

proc.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});

proc.stderr.on("data", (d) => process.stderr.write(`[stderr] ${d}`));

function send(method, params) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n");
  });
}

async function callTool(name, args) {
  const resp = await send("tools/call", { name, arguments: args ?? {} });
  if (resp.error) return { error: resp.error.message };
  const text = resp.result?.content?.[0]?.text;
  if (resp.result?.isError) return { error: text };
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function isApiUrl(url) {
  try {
    const host = new URL(url).hostname;
    return API_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch { return false; }
}

function extractPath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

function summarizeEndpoints(requests) {
  const seen = new Map();
  for (const r of requests) {
    if (!isApiUrl(r.url)) continue;
    const path = extractPath(r.url);
    const key = `${r.method} ${path}`;
    if (!seen.has(key)) seen.set(key, { method: r.method, path, status: r.status });
  }
  return Array.from(seen.values()).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function dedupeGlobal(globalEndpoints, localEndpoints) {
  const newOnes = [];
  for (const ep of localEndpoints) {
    const key = `${ep.method} ${ep.path}`;
    if (!globalEndpoints.has(key)) {
      globalEndpoints.add(key);
      newOnes.push(ep);
    }
  }
  return newOnes;
}

(async () => {
  await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "discovery", version: "1" } });

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const globalEndpoints = new Set();
  const report = [];

  for (const { label, path } of TARGETS) {
    console.log(`\n[${label}] capturing ${path}...`);
    const res = await callTool("ghl_browser_capture_network", {
      path,
      resourceTypes: ["xhr", "fetch"],
      waitMs: 4000,
    });
    if (res.error) {
      console.log(`  ERROR: ${res.error}`);
      report.push({ label, path, error: res.error });
      continue;
    }
    const endpoints = summarizeEndpoints(res.requests ?? []);
    const newEndpoints = dedupeGlobal(globalEndpoints, endpoints);
    console.log(`  total XHR/fetch: ${res.total} | GHL API calls: ${endpoints.length} | new globally: ${newEndpoints.length}`);
    for (const e of newEndpoints) console.log(`    + ${e.method} ${e.path} (${e.status ?? "pending"})`);
    report.push({ label, path, endpoints, newEndpoints, rawTotal: res.total });
    writeFileSync(resolve(OUT_DIR, `${label}.json`), JSON.stringify(res, null, 2));
  }

  const summaryPath = resolve(OUT_DIR, "_summary.json");
  writeFileSync(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    pagesVisited: TARGETS.length,
    uniqueApiEndpoints: globalEndpoints.size,
    perPage: report.map((r) => ({
      label: r.label,
      path: r.path,
      ghApiCount: r.endpoints?.length ?? 0,
      newGlobally: r.newEndpoints?.length ?? 0,
    })),
  }, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pages visited: ${TARGETS.length}`);
  console.log(`Unique GHL API endpoints seen: ${globalEndpoints.size}`);
  console.log(`Per-page raw dumps: ${OUT_DIR}/`);
  console.log(`Summary: ${summaryPath}`);

  proc.stdin.end();
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
