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

const TRIGGERS = [
  {
    label: "contacts-search",
    path: "/contacts/list",
    // Click the search input then type something to fire the search API
    triggerAction: `
      const inp = document.querySelector('input[placeholder*="Search"], input[type="search"], input[name="search"]') || document.querySelector('main input');
      if (inp) { inp.focus(); inp.value = 'test'; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',code:'Enter',bubbles:true})); }
      return { focused: !!inp };
    `,
  },
  {
    label: "workflows-open-first",
    path: "/automation/workflows",
    // Click the first workflow row to open detail / load its canvas
    triggerAction: `
      const rows = document.querySelectorAll('table tbody tr, [role="row"], a[href*="/workflow/"]');
      const first = rows[0];
      if (first) { const a = first.querySelector('a') || first; a.click(); }
      return { clicked: !!first, href: first?.href ?? null };
    `,
  },
  {
    label: "calendar-open",
    path: "/calendars",
    // Switch to a different calendar view tab
    triggerAction: `
      const tabs = document.querySelectorAll('[role="tab"], .nav-item, button');
      const target = [...tabs].find((t) => /week|month|day|list/i.test(t.textContent || ''));
      if (target) target.click();
      return { clicked: target?.textContent ?? null };
    `,
  },
  {
    label: "settings-location",
    path: "/settings/location",
    triggerAction: `
      // Just loading the settings/location page fires several APIs; wait a bit
      await new Promise(r => setTimeout(r, 1500));
      return { ok: true };
    `,
  },
  {
    label: "settings-company",
    path: "/settings/company",
    triggerAction: `
      await new Promise(r => setTimeout(r, 1500));
      return { ok: true };
    `,
  },
  {
    label: "users-list",
    path: "/settings/users",
    triggerAction: `
      await new Promise(r => setTimeout(r, 1500));
      return { ok: true };
    `,
  },
  {
    label: "reporting-attribution",
    path: "/reporting/attribution",
    triggerAction: `
      await new Promise(r => setTimeout(r, 2000));
      return { ok: true };
    `,
  },
  {
    label: "invoices-list",
    path: "/payments/invoices",
    triggerAction: `
      await new Promise(r => setTimeout(r, 1500));
      return { ok: true };
    `,
  },
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

const API_HOSTS = [
  "services.leadconnectorhq.com",
  "backend.leadconnectorhq.com",
  "api.leadconnectorhq.com",
  "app.leadconnectorhq.com",
];
function isApiUrl(url) {
  try {
    const host = new URL(url).hostname;
    return API_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch { return false; }
}

(async () => {
  await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "discovery2", version: "1" } });

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const allEndpoints = new Set();
  const report = [];

  for (const t of TRIGGERS) {
    console.log(`\n[${t.label}] auditing ${t.path} ...`);
    const res = await callTool("ghl_browser_audit_api_calls", {
      path: t.path,
      triggerAction: t.triggerAction,
    });
    if (res.error) { console.log(`  ERROR: ${res.error}`); report.push({ label: t.label, error: res.error }); continue; }
    const ghApi = (res.requests ?? []).filter((r) => isApiUrl(r.url));
    const unique = new Map();
    for (const r of ghApi) {
      try {
        const u = new URL(r.url);
        const key = `${r.method} ${u.pathname}`;
        if (!unique.has(key)) unique.set(key, { method: r.method, path: u.pathname, status: r.status, query: u.search || null });
      } catch {}
    }
    const list = Array.from(unique.values());
    const fresh = list.filter((e) => { const k = `${e.method} ${e.path}`; if (allEndpoints.has(k)) return false; allEndpoints.add(k); return true; });
    console.log(`  total XHR: ${res.total} | GHL API: ${ghApi.length} | unique: ${list.length} | new: ${fresh.length}`);
    for (const e of list) console.log(`    ${fresh.includes(e) ? "+ " : "  "}${e.method} ${e.path}${e.query || ''} → ${e.status ?? "pending"}`);
    report.push({ label: t.label, path: t.path, unique: list, fresh });
    writeFileSync(resolve(OUT_DIR, `${t.label}-audit.json`), JSON.stringify(res, null, 2));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    triggersRun: TRIGGERS.length,
    uniqueGhlApiEndpoints: allEndpoints.size,
    freshAcrossTriggers: Array.from(allEndpoints),
    perTrigger: report.map((r) => ({ label: r.label, count: r.unique?.length ?? 0, fresh: r.fresh?.length ?? 0 })),
  };
  writeFileSync(resolve(OUT_DIR, "_summary-triggers.json"), JSON.stringify(summary, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Triggers run: ${TRIGGERS.length}`);
  console.log(`Unique GHL API endpoints discovered: ${allEndpoints.size}`);
  console.log(`Per-trigger dumps: ${OUT_DIR}/*-audit.json`);
  console.log(`Summary: ${resolve(OUT_DIR, "_summary-triggers.json")}`);

  proc.stdin.end();
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
