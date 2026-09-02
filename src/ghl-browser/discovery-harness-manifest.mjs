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
  await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "manifest-dump", version: "1" } });
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  console.log("extracting __APP_MANIFEST__ with maxBytes=500000 ...");
  const res = await callTool("ghl_browser_extract_state", { path: "/dashboard", maxBytes: 500000 });
  if (res.error) { console.log("ERROR:", res.error); proc.stdin.end(); return; }

  const manifest = res.globals.find((g) => g.name === "__APP_MANIFEST__");
  if (!manifest) { console.log("no manifest found"); proc.stdin.end(); return; }

  writeFileSync(resolve(OUT_DIR, "app-manifest-full.json"), manifest.preview);
  const parsed = JSON.parse(manifest.preview);

  console.log(`manifestVersion: ${parsed.manifestVersion}`);
  console.log(`mainAppVersion:  ${parsed.mainAppVersion}`);
  console.log(`federatedApps:   ${Object.keys(parsed.federatedApps ?? {}).length}`);
  console.log("\n=== federated apps ===");
  for (const [name, app] of Object.entries(parsed.federatedApps ?? {})) {
    const urls = typeof app === "string" ? [app] : (app?.urls || app?.remotes || []);
    if (typeof app === "string") {
      console.log(`  ${name.padEnd(28)} ${app}`);
    } else {
      const keys = Object.keys(app ?? {}).join(",");
      console.log(`  ${name.padEnd(28)} keys=[${keys}]`);
      for (const [k, v] of Object.entries(app ?? {})) {
        if (typeof v === "string") console.log(`    ${k.padEnd(18)} ${v}`);
      }
    }
  }

  proc.stdin.end();
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
