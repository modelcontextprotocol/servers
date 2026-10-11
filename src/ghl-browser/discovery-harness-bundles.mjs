import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

const OUT_DIR = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "discovery-results", "bundles");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const manifest = JSON.parse(
  readFileSync(resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "discovery-results", "app-manifest-full.json"), "utf8"),
);

// Existing ghl-mcp endpoints (rough) — gathered from the 584-tool inventory.
// Paths use `{id}` placeholders to match both literal IDs and the regex below.
const KNOWN_PATTERNS = [
  "/contacts/", "/opportunities/", "/pipelines/", "/conversations/", "/calendars/",
  "/workflows/", "/campaigns/", "/emails/", "/funnels/", "/surveys/", "/forms/",
  "/invoices/", "/orders/", "/subscriptions/", "/transactions/", "/payments/",
  "/products/", "/coupons/", "/stores/", "/shipping/",
  "/medias/", "/blogs/", "/social-media-posting/",
  "/automations/", "/campaign-templates/",
  "/users/", "/users/groups/", "/teams/", "/roles/", "/permissions/",
  "/locations/", "/companies/", "/company/",
  "/snapshots/", "/snapshots/",
  "/custom-fields/", "/custom-values/", "/customValues/",
  "/tags/", "/notes/", "/tasks/",
  "/documents/", "/templates/",
  "/webhooks/", "/links/", "/tracking/",
  "/attribution/", "/reporting/", "/reports/",
  "/business-intelligence/",
  "/reputation/", "/reviews/",
  "/phone-numbers/", "/calls/", "/voicemails/", "/recordings/",
  "/messages/", "/sms/",
  "/appointments/", "/calendars/blocked-slots/",
  "/memberships/", "/offers/",
  "/courses/", "/communities/",
  "/funnels/lookup-domains/", "/funnels/redirects/",
  "/sites/", "/domains/", "/dns/",
  "/affiliate/", "/referral/",
  "/oauth/", "/oauth2/",
  "/integrations/", "/integrations/default/",
  "/saas/", "/billing/",
  "/content-review/",
];

// Matches GHL REST-style paths like /contacts/, /opportunities/{id}, /workflows/{id}/execute
// Captures the first two path segments for grouping.
const ENDPOINT_RE = /["'`](\/(?:api|leadconnector|v\d+|c[io]\/|contacts|opportunities|pipelines|conversations|calendars|workflows|campaigns|emails|funnels|surveys|forms|invoices|orders|subscriptions|transactions|payments|products|coupons|stores|medias|blogs|social-media-posting|automations|users|teams|roles|permissions|locations|companies|snapshots|custom-fields|custom-values|tags|notes|tasks|documents|templates|webhooks|links|tracking|attribution|reporting|business-intelligence|reputation|phone-numbers|calls|voicemails|recordings|messages|sms|appointments|memberships|offers|courses|communities|sites|domains|dns|affiliate|referral|oauth2?|integrations|saas|billing|content-review|medias|media|social-media)[^"'`\s]{0,120})/g;

// Also capture generic "/v2/…", "/leadconnector/…", "/ci/…" paths
const VERSIONED_RE = /["'`](\/(?:v[1-9]\d*|leadconnector|ci|api)\/[a-z][a-z0-9_-]{1,40}(?:\/[a-z0-9_-]{1,40})?(?:\/[a-z0-9_-]{1,40})?)/g;

function normalizePath(p) {
  // Replace UUID-like / numeric IDs / slug placeholders with {id}
  return p
    .replace(/\/[0-9a-f]{24}\b/g, "/{id}")
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "/{id}")
    .replace(/\/\$\{[^}]+\}/g, "/{id}")
    .replace(/\/:[a-zA-Z_]+/g, "/{id}")
    .replace(/\/\d{4,}/g, "/{id}")
    .replace(/\/\{[a-zA-Z]+\}/g, "/{id}")
    .replace(/\?.*$/, "");
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${url}`);
  return r.text();
}

function extractEndpoints(text) {
  const found = new Set();
  for (const re of [ENDPOINT_RE, VERSIONED_RE]) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const path = normalizePath(m[1]);
      if (path.length < 4 || path.length > 120) continue;
      if (/[A-Z]{3,}/.test(path)) continue; // likely an env var or const name
      found.add(path);
    }
  }
  return found;
}

function isKnown(path) {
  return KNOWN_PATTERNS.some((k) => path.startsWith(k.replace(/\/$/, "")));
}

async function scanBundle(name, url) {
  const cacheFile = resolve(OUT_DIR, `${name}.js`);
  let text;
  if (existsSync(cacheFile)) {
    text = readFileSync(cacheFile, "utf8");
  } else {
    text = await fetchText(url);
    writeFileSync(cacheFile, text);
  }
  const endpoints = extractEndpoints(text);

  // Parse publicPath (e.g. "https://appcdn.leadconnectorhq.com/ai/copilot/506/")
  const ppMatch = text.match(/__webpack_require__\.p\s*=\s*"([^"]+)"/);
  const publicPath = ppMatch ? ppMatch[1] : url.slice(0, url.lastIndexOf("/") + 1);

  // Parse chunk URL builder: __webpack_require__.u = e => "static/js/async/copilot." + ({123: "hash", ...})[e] + ".chunk.js"
  const builderMatch = text.match(/__webpack_require__\.u\s*=\s*\w+\s*=>\s*"([^"]*)"\s*\+\s*\(\s*\{([\s\S]{1,32000}?)\}\s*\)\s*\[e\]/);
  const chunkIds = [];
  if (builderMatch) {
    const prefix = builderMatch[1];
    const mapBody = builderMatch[2];
    const idRe = /(\d+):\s*"([0-9a-f]+)"/g;
    let m;
    while ((m = idRe.exec(mapBody)) !== null) {
      chunkIds.push({ id: m[1], hash: m[2], url: publicPath + prefix + m[2] + ".js" });
    }
  }

  // Sample a subset of chunks for scanning (cap to 15 per app to keep runtime reasonable)
  const sample = chunkIds.slice(0, Math.min(chunkIds.length, 15));
  let chunksScanned = 0;
  for (const c of sample) {
    const chunkCache = resolve(OUT_DIR, `${name}-chunk-${c.id}.js`);
    try {
      let chunkText;
      if (existsSync(chunkCache)) {
        chunkText = readFileSync(chunkCache, "utf8");
      } else {
        chunkText = await fetchText(c.url);
        writeFileSync(chunkCache, chunkText);
      }
      chunksScanned++;
      for (const ep of extractEndpoints(chunkText)) endpoints.add(ep);
    } catch { /* skip missing chunks */ }
  }

  return {
    name,
    url,
    publicPath,
    bundleSize: text.length,
    totalChunks: chunkIds.length,
    chunksScanned,
    endpoints: Array.from(endpoints),
  };
}

// Pick a representative slice of federated apps across each domain
const TARGET_APPS = [
  "voiceAiApp", "aiEmployeesApp", "superagentsApp", "agentBuilderApp", "copilotApp",
  "knowledgeBaseApp", "performanceAiApp", "agentLogsApp", "aiGrowthApp", "industryAgentsApp",
  "contactsApp", "conversationsApp", "conversationsV2App", "opportunitiesApp",
  "customObjectsApp", "documentsApp", "eventsManagementApp",
  "socialPlannerApp", "blogsApp", "ecommerceApp", "paymentsApp", "invoicesApp",
  "funnelWebsiteApp", "formSurveyApp", "reportingApp", "notificationApp",
  "reputationApp", "membershipsApp", "communitiesApp", "snapshotsApp",
  "calendarServicesApp", "calendarRentalsApp", "powerDialerApp",
];

(async () => {
  const results = [];
  const allEndpoints = new Map(); // path → Set<apps>
  for (const name of TARGET_APPS) {
    const url = manifest.federatedApps[name];
    if (!url) { console.log(`[${name}] not in manifest`); continue; }
    console.log(`\n[${name}] fetching ${url}`);
    try {
      const r = await scanBundle(name, url);
      results.push(r);
      for (const ep of r.endpoints) {
        if (!allEndpoints.has(ep)) allEndpoints.set(ep, new Set());
        allEndpoints.get(ep).add(name);
      }
      const novel = r.endpoints.filter((e) => !isKnown(e));
      console.log(`  bundle=${(r.bundleSize / 1024).toFixed(0)}KB totalChunks=${r.totalChunks} scanned=${r.chunksScanned} endpoints=${r.endpoints.length} novel=${novel.length}`);
      for (const e of novel.slice(0, 10)) console.log(`    + ${e}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      results.push({ name, url, error: e.message });
    }
  }

  // Aggregate novel endpoints across all apps
  const novelAll = [];
  for (const [path, apps] of allEndpoints) {
    if (isKnown(path)) continue;
    novelAll.push({ path, apps: Array.from(apps) });
  }
  novelAll.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    appsScanned: results.filter((r) => !r.error).length,
    appsFailed: results.filter((r) => r.error).length,
    uniqueEndpointsFound: allEndpoints.size,
    novelEndpoints: novelAll.length,
    novelEndpointList: novelAll,
    perApp: results.map((r) => ({
      name: r.name,
      bundleSize: r.bundleSize,
      totalChunks: r.totalChunks,
      chunksScanned: r.chunksScanned,
      endpoints: r.endpoints?.length ?? 0,
      novel: r.endpoints?.filter((e) => !isKnown(e)).length ?? 0,
      error: r.error,
    })),
  };

  writeFileSync(resolve(OUT_DIR, "_scan-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Apps scanned: ${summary.appsScanned} / ${TARGET_APPS.length}`);
  console.log(`Unique endpoints: ${allEndpoints.size}`);
  console.log(`Novel (not in KNOWN_PATTERNS): ${novelAll.length}`);
  console.log(`\nTop novel endpoints:`);
  for (const n of novelAll.slice(0, 40)) {
    console.log(`  ${n.path.padEnd(60)} used by: ${n.apps.slice(0, 3).join(", ")}`);
  }
})();
