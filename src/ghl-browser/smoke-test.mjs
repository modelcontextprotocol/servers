// smoke-test.mjs — speaks MCP over stdio using newline-delimited JSON
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "dist", "index.js");

const proc = spawn("node", [entry], { stdio: ["pipe", "pipe", "pipe"] });

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
proc.stderr.on("data", (d) => process.stderr.write(d));

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, resolve);
    const ok = proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n");
    if (!ok) reject(new Error("stdin write failed"));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 5000);
  });
}

(async () => {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "1" },
  });
  console.log("Server:", JSON.stringify(init.result?.serverInfo));
  console.log("Protocol:", init.result?.protocolVersion);

  const toolsResp = await send("tools/list", {});
  const tools = toolsResp.result?.tools ?? [];
  console.log(`\nTools registered: ${tools.length}`);
  for (const t of tools) console.log(`  - ${t.name}`);

  proc.kill();
  process.exit(0);
})().catch((e) => {
  console.error("smoke test failed:", e.message);
  proc.kill();
  process.exit(1);
});
