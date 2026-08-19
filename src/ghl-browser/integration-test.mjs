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

  // AI Suite
  { name: "ghl_browser_list_superagents", args: {}, group: "AI Suite" },
  { name: "ghl_browser_list_ai_employees", args: {}, group: "AI Suite" },
  { name: "ghl_browser_list_agent_blueprints", args: {}, group: "AI Suite" },
  { name: "ghl_browser_list_agent_studio_sessions", args: {}, group: "AI Suite" },
  { name: "ghl_browser_list_industry_agents", args: {}, group: "AI Suite" },

  // Location Settings
  { name: "ghl_browser_get_location_settings", args: {}, group: "Loc Settings" },
  { name: "ghl_browser_get_location_features", args: {}, group: "Loc Settings" },
  { name: "ghl_browser_get_location_domains", args: {}, group: "Loc Settings" },

  // Ad Publishing
  { name: "ghl_browser_list_ad_campaigns", args: {}, group: "Ads" },
  { name: "ghl_browser_get_ad_metrics", args: {}, group: "Ads" },

  // Bulk Actions
  { name: "ghl_browser_list_bulk_operations", args: {}, group: "Bulk" },

  // Chat Widget
  { name: "ghl_browser_get_chat_widget_config", args: {}, group: "Chat" },
  { name: "ghl_browser_list_chat_widget_departments", args: {}, group: "Chat" },

  // Content AI
  { name: "ghl_browser_get_content_ai_settings", args: {}, group: "Content AI" },
  { name: "ghl_browser_list_content_ai_templates", args: {}, group: "Content AI" },
  { name: "ghl_browser_list_content_ai_history", args: {}, group: "Content AI" },
  { name: "ghl_browser_get_content_ai_usage", args: {}, group: "Content AI" },

  // Gift Cards
  { name: "ghl_browser_list_gift_cards", args: {}, group: "Gift Cards" },
  { name: "ghl_browser_list_gift_card_transactions", args: {}, group: "Gift Cards" },

  // Preference Management
  { name: "ghl_browser_get_preference_settings", args: {}, group: "Prefs" },
  { name: "ghl_browser_list_preference_categories", args: {}, group: "Prefs" },
  { name: "ghl_browser_get_compliance_summary", args: {}, group: "Prefs" },

  // Reseller
  { name: "ghl_browser_get_reseller_overview", args: {}, group: "Reseller" },
  { name: "ghl_browser_list_reseller_clients", args: {}, group: "Reseller" },
  { name: "ghl_browser_get_reseller_pricing", args: {}, group: "Reseller" },
  { name: "ghl_browser_list_reseller_invoices", args: {}, group: "Reseller" },

  // SaaS Mode
  { name: "ghl_browser_get_saas_overview", args: {}, group: "SaaS" },
  { name: "ghl_browser_list_saas_plans", args: {}, group: "SaaS" },
  { name: "ghl_browser_list_saas_clients", args: {}, group: "SaaS" },
  { name: "ghl_browser_get_saas_billing_summary", args: {}, group: "SaaS" },

  // Platform Billing
  { name: "ghl_browser_get_platform_billing_overview", args: {}, group: "Billing" },
  { name: "ghl_browser_list_platform_invoices", args: {}, group: "Billing" },
  { name: "ghl_browser_get_platform_payment_method", args: {}, group: "Billing" },
  { name: "ghl_browser_list_platform_usage", args: {}, group: "Billing" },
  { name: "ghl_browser_get_platform_plan_comparison", args: {}, group: "Billing" },

  // Store Catalog
  { name: "ghl_browser_list_store_products", args: {}, group: "Store" },
  { name: "ghl_browser_list_store_categories", args: {}, group: "Store" },
  { name: "ghl_browser_get_store_orders_summary", args: {}, group: "Store" },

  // WordPress
  { name: "ghl_browser_list_wordpress_sites", args: {}, group: "WordPress" },
  { name: "ghl_browser_list_wordpress_plugins", args: {}, group: "WordPress" },

  // Yext
  { name: "ghl_browser_get_yext_overview", args: {}, group: "Yext" },
  { name: "ghl_browser_list_yext_listings", args: {}, group: "Yext" },
  { name: "ghl_browser_get_yext_listing_score", args: {}, group: "Yext" },

  // Template Library
  { name: "ghl_browser_list_template_categories", args: {}, group: "Templates" },
  { name: "ghl_browser_list_templates", args: {}, group: "Templates" },
  { name: "ghl_browser_list_my_templates", args: {}, group: "Templates" },

  // QR Codes
  { name: "ghl_browser_list_qr_codes", args: {}, group: "QR Codes" },

  // Schema Markup
  { name: "ghl_browser_list_schema_markups", args: {}, group: "Schema" },

  // Store Widgets
  { name: "ghl_browser_list_store_widgets", args: {}, group: "Store Widgets" },

  // Payment Links
  { name: "ghl_browser_list_payment_links", args: {}, group: "Pay Links" },

  // Domain Connect
  { name: "ghl_browser_list_domains", args: {}, group: "Domains" },

  // Client Portal
  { name: "ghl_browser_get_client_portal_settings", args: {}, group: "Client Portal" },
  { name: "ghl_browser_list_client_portal_users", args: {}, group: "Client Portal" },
  { name: "ghl_browser_list_client_portal_pages", args: {}, group: "Client Portal" },

  // Membership Settings
  { name: "ghl_browser_get_membership_settings", args: {}, group: "Mbr Settings" },
  { name: "ghl_browser_list_membership_products", args: {}, group: "Mbr Settings" },
  { name: "ghl_browser_get_membership_analytics", args: {}, group: "Mbr Settings" },
  { name: "ghl_browser_list_membership_offers", args: {}, group: "Mbr Settings" },

  // Brand Boards
  { name: "ghl_browser_list_brand_boards", args: {}, group: "Brand" },

  // Wallet Kit
  { name: "ghl_browser_list_wallet_passes", args: {}, group: "Wallet" },

  // Domain Reselling
  { name: "ghl_browser_list_resold_domains", args: {}, group: "Dom Resell" },
  { name: "ghl_browser_get_domain_reseller_pricing", args: {}, group: "Dom Resell" },

  // Countdown Timer
  { name: "ghl_browser_list_countdown_timers", args: {}, group: "Countdown" },

  // Labs
  { name: "ghl_browser_list_lab_features", args: {}, group: "Labs" },

  // Launchpad
  { name: "ghl_browser_get_launchpad_status", args: {}, group: "Launchpad" },
  { name: "ghl_browser_list_launchpad_tasks", args: {}, group: "Launchpad" },
  { name: "ghl_browser_get_launchpad_checklist", args: {}, group: "Launchpad" },

  // Knowledge Base
  { name: "ghl_browser_list_knowledge_bases", args: {}, group: "KB" },

  // Estimates
  { name: "ghl_browser_list_estimates", args: {}, group: "Estimates" },

  // Phone Integration
  { name: "ghl_browser_list_phone_numbers", args: {}, group: "Phone" },
  { name: "ghl_browser_get_call_logs_summary", args: {}, group: "Phone" },

  // Marketplace
  { name: "ghl_browser_list_marketplace_apps", args: {}, group: "Marketplace" },
  { name: "ghl_browser_list_installed_integrations", args: {}, group: "Marketplace" },

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
