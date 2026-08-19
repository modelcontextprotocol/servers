// integration-test.mjs — exercises every read-only ghl-browser tool against live GHL
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout on ${method}`));
      }
    }, 90_000);
  });
}

async function callTool(name, args) {
  const start = Date.now();
  const resp = await send("tools/call", { name, arguments: args ?? {} });
  const ms = Date.now() - start;
  const text = resp.result?.content?.[0]?.text ?? "";
  const isError = Boolean(resp.result?.isError);
  return { isError, ms, text };
}

// ── Read-only tools grouped by module ──────────────────────────────────
const READ_ONLY_TOOLS = [
  // Utils
  { name: "ghl_browser_session_check", args: {}, group: "Utils" },

  // Workflows
  { name: "ghl_browser_list_workflows", args: {}, group: "Workflows" },

  // Funnels
  { name: "ghl_browser_list_funnel_pages", args: {}, group: "Funnels" },

  // Pipelines
  { name: "ghl_browser_list_pipeline_opportunities", args: { pipelineName: "" }, group: "Pipelines" },
  { name: "ghl_browser_snapshot_pipeline", args: { pipelineName: "" }, group: "Pipelines" },

  // Campaigns
  { name: "ghl_browser_list_campaigns", args: {}, group: "Campaigns" },

  // Social Media
  { name: "ghl_browser_social_list_posts", args: {}, group: "Social" },

  // Blogs
  { name: "ghl_browser_list_blogs", args: {}, group: "Blogs" },

  // Forms
  { name: "ghl_browser_list_forms", args: {}, group: "Forms" },

  // Email Builder
  { name: "ghl_browser_list_email_templates", args: {}, group: "Email" },

  // Page Builder
  { name: "ghl_browser_list_sites", args: {}, group: "Pages" },

  // Proposals
  { name: "ghl_browser_list_proposals", args: {}, group: "Proposals" },

  // Calendars
  { name: "ghl_browser_list_calendars", args: {}, group: "Calendars" },

  // Reporting
  { name: "ghl_browser_list_reports", args: {}, group: "Reporting" },
  { name: "ghl_browser_get_dashboard_metrics", args: {}, group: "Reporting" },

  // Memberships
  { name: "ghl_browser_list_memberships", args: {}, group: "Memberships" },

  // Invoices
  { name: "ghl_browser_list_invoices", args: {}, group: "Invoices" },

  // Reputation
  { name: "ghl_browser_list_reviews", args: {}, group: "Reputation" },
  { name: "ghl_browser_get_reputation_score", args: {}, group: "Reputation" },
  { name: "ghl_browser_list_review_sites", args: {}, group: "Reputation" },

  // Affiliates
  { name: "ghl_browser_list_affiliates", args: {}, group: "Affiliates" },

  // Settings
  { name: "ghl_browser_get_business_profile", args: {}, group: "Settings" },
  { name: "ghl_browser_list_users", args: {}, group: "Settings" },
  { name: "ghl_browser_get_integrations", args: {}, group: "Settings" },

  // Trigger Links
  { name: "ghl_browser_list_trigger_links", args: {}, group: "Triggers" },

  // Snapshots
  { name: "ghl_browser_list_snapshots", args: {}, group: "Snapshots" },

  // Conversation AI
  { name: "ghl_browser_get_conversation_ai_config", args: {}, group: "Convo AI" },
  { name: "ghl_browser_list_ai_training_data", args: {}, group: "Convo AI" },
  { name: "ghl_browser_get_ai_conversation_logs", args: {}, group: "Convo AI" },

  // Media Library
  { name: "ghl_browser_list_media", args: {}, group: "Media" },

  // Tags & Custom Fields
  { name: "ghl_browser_list_tags", args: {}, group: "Tags" },
  { name: "ghl_browser_list_custom_fields", args: {}, group: "Tags" },

  // Automation Templates
  { name: "ghl_browser_list_automation_templates", args: {}, group: "Templates" },
  { name: "ghl_browser_list_automation_recipes", args: {}, group: "Templates" },

  // Conversations
  { name: "ghl_browser_list_conversations", args: {}, group: "Conversations" },

  // Contacts
  { name: "ghl_browser_list_contacts", args: {}, group: "Contacts" },
  { name: "ghl_browser_list_smart_lists", args: {}, group: "Contacts" },

  // Documents
  { name: "ghl_browser_list_documents", args: {}, group: "Documents" },

  // Payments
  { name: "ghl_browser_list_transactions", args: {}, group: "Payments" },
  { name: "ghl_browser_list_subscriptions", args: {}, group: "Payments" },

  // Ecommerce
  { name: "ghl_browser_list_products", args: {}, group: "Ecommerce" },
  { name: "ghl_browser_list_orders", args: {}, group: "Ecommerce" },

  // Events
  { name: "ghl_browser_list_events", args: {}, group: "Events" },

  // Communities
  { name: "ghl_browser_list_communities", args: {}, group: "Communities" },

  // Copilot
  { name: "ghl_browser_get_copilot_status", args: {}, group: "Copilot" },
  { name: "ghl_browser_list_copilot_automations", args: {}, group: "Copilot" },

  // Custom Objects
  { name: "ghl_browser_list_custom_objects", args: {}, group: "Custom Obj" },

  // Notifications
  { name: "ghl_browser_list_notifications", args: {}, group: "Notifications" },
  { name: "ghl_browser_get_notification_settings", args: {}, group: "Notifications" },

  // Voice AI
  { name: "ghl_browser_list_voice_ai_calls", args: {}, group: "Voice AI" },
  { name: "ghl_browser_get_voice_ai_settings", args: {}, group: "Voice AI" },

  // Power Dialer
  { name: "ghl_browser_list_power_dialer_campaigns", args: {}, group: "Dialer" },

  // Performance AI
  { name: "ghl_browser_get_performance_overview", args: {}, group: "Perf AI" },
  { name: "ghl_browser_list_performance_suggestions", args: {}, group: "Perf AI" },

  // Agency
  { name: "ghl_browser_list_sub_accounts", args: {}, group: "Agency" },
  { name: "ghl_browser_list_agency_users", args: {}, group: "Agency" },

  // Dashboard Widgets
  { name: "ghl_browser_get_dashboard_overview", args: {}, group: "Dashboard" },
  { name: "ghl_browser_list_dashboard_widgets", args: {}, group: "Dashboard" },
  { name: "ghl_browser_get_pipeline_summary", args: {}, group: "Dashboard" },
  { name: "ghl_browser_get_appointment_summary", args: {}, group: "Dashboard" },

  // Calendar Bookings
  { name: "ghl_browser_list_bookings", args: {}, group: "Bookings" },

  // SEO
  { name: "ghl_browser_get_seo_overview", args: {}, group: "SEO" },
  { name: "ghl_browser_list_seo_pages", args: {}, group: "SEO" },
  { name: "ghl_browser_list_seo_keywords", args: {}, group: "SEO" },

  // Snippets
  { name: "ghl_browser_list_snippets", args: {}, group: "Snippets" },

  // Contact Scoring
  { name: "ghl_browser_list_scoring_models", args: {}, group: "Scoring" },

  // Screenshot (read-only — captures a page)
  { name: "ghl_browser_screenshot", args: { path: "/dashboard", label: "integration-test" }, group: "Utils" },

  // Discovery (read-only network capture)
  { name: "ghl_browser_extract_state", args: { path: "/dashboard" }, group: "Discovery" },
];

(async () => {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "integration", version: "2" },
  });
  console.log(`Server: ${JSON.stringify(init.result?.serverInfo)}`);
  console.log(`Protocol: ${init.result?.protocolVersion}`);

  // List all registered tools
  const toolsList = await send("tools/list", {});
  const totalTools = toolsList.result?.tools?.length ?? 0;
  console.log(`Registered tools: ${totalTools}`);
  console.log(`Testing read-only: ${READ_ONLY_TOOLS.length}\n`);

  let pass = 0;
  let fail = 0;
  let lastGroup = "";
  const results = [];

  for (const t of READ_ONLY_TOOLS) {
    if (t.group !== lastGroup) {
      lastGroup = t.group;
      console.log(`\n── ${t.group} ${"─".repeat(Math.max(0, 50 - t.group.length))}`);
    }
    try {
      const r = await callTool(t.name, t.args);
      const status = r.isError ? "FAIL" : "PASS";
      if (r.isError) fail++;
      else pass++;
      results.push({ name: t.name, status, ms: r.ms, isError: r.isError, text: r.text });
      console.log(`  [${status}] ${t.name} (${r.ms}ms)`);
      if (r.isError || process.env.VERBOSE === "1") {
        console.log(`    -> ${r.text.slice(0, 300)}`);
      }
    } catch (err) {
      fail++;
      results.push({ name: t.name, status: "TIMEOUT", ms: -1 });
      console.log(`  [TIMEOUT] ${t.name}: ${err.message}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Results: ${pass} passed, ${fail} failed out of ${READ_ONLY_TOOLS.length} read-only tools`);
  console.log(`Total registered tools in server: ${totalTools}`);
  console.log(`${"═".repeat(60)}`);

  if (fail > 0) {
    console.log("\nFailed tools:");
    for (const r of results.filter((r) => r.status !== "PASS")) {
      console.log(`  ${r.status}: ${r.name} (${r.ms}ms)`);
      if (r.text) console.log(`    ${r.text.slice(0, 200)}`);
    }
  }

  proc.kill();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("integration test crashed:", e);
  proc.kill();
  process.exit(2);
});
