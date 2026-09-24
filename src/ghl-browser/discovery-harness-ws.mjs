import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

const PAGES = [
  { label: "dashboard-ws", path: "/dashboard" },
  { label: "conversations-ws", path: "/conversations" },
  { label: "contacts-ws", path: "/contacts/list" },
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
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
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

(async () => {
  await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ws-discovery", version: "1" } });

  for (const { label, path } of PAGES) {
    console.log(`\n[${label}] capturing ${path} with 8s wait...`);
    const res = await callTool("ghl_browser_capture_network", {
      path,
      resourceTypes: ["xhr", "fetch"],
      waitMs: 8000,
    });
    if (res.error) { console.log(`  ERROR: ${res.error}`); continue; }
    console.log(`  XHR/fetch: ${res.total} | WS frames: ${res.wsSummary?.total} (in=${res.wsSummary?.in} out=${res.wsSummary?.out})`);
    for (const u of (res.wsSummary?.urls ?? [])) console.log(`    ws: ${u}`);
    // Sample first few frames
    const samples = (res.wsFrames ?? []).slice(0, 6);
    for (const f of samples) {
      console.log(`    ${f.direction} ${f.size}b | ${f.preview.slice(0, 120).replace(/\n/g, "\\n")}`);
    }
    writeFileSync(resolve(OUT_DIR, `${label}.json`), JSON.stringify(res, null, 2));
  }
  proc.stdin.end();
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
