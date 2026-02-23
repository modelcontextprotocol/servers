#!/usr/bin/env node

const PENDING = new Set(["pending", "queued", "in_progress", "requested", "waiting"]);
const FAILED = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);
const POLICY_MARKERS = [
  "resource not accessible by integration",
  "insufficient permission",
  "insufficient permissions",
  "not authorized",
  "forbidden",
  "cla",
];

export function classify(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return "no checks";

  let pending = false;
  let failed = false;
  let policyBlocked = false;

  for (const check of checks) {
    const status = String(check?.status ?? "").toLowerCase();
    const conclusion = String(check?.conclusion ?? "").toLowerCase();
    const summary = [check?.name, check?.context, check?.details, check?.title, check?.summary, check?.text]
      .map((v) => String(v ?? ""))
      .join(" ")
      .toLowerCase();

    if (POLICY_MARKERS.some((marker) => summary.includes(marker))) policyBlocked = true;
    if (PENDING.has(status)) pending = true;
    if (FAILED.has(conclusion)) failed = true;
  }

  if (policyBlocked) return "policy-blocked";
  if (failed) return "failed";
  if (pending) return "pending";
  return "passed";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = await new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(buf || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    process.stdin.on("error", reject);
  });

  const checks = Array.isArray(input) ? input : input.checks ?? [];
  process.stdout.write(`${JSON.stringify({ state: classify(checks) })}\n`);
}
