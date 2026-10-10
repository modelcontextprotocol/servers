// Shared npm-script reachability helpers.
//
// Ported from the MCP Inspector (#4863); `inspector#N` references are that
// repo's issues and PRs, a bare `#N` is this repo's. `verify-skills.mjs` uses
// the vouch helpers (`scriptChainRuns`, `rootReachesScript`) today; the coverage
// guards #4864 ports (`verify-format-coverage.mjs`,
// `verify-typecheck-coverage.mjs`) reuse the harvesting half, and are why it is
// shared: the wiring logic they all depend on — "is this gate actually run?" —
// must not drift between them.

/**
 * Split a shell-ish command string into args, honoring single and double quotes
 * (a quoted arg becomes one token with the quotes stripped). Used by both
 * coverage guards so they parse a script's args — quoting is the house style
 * here (a quoted prettier glob, `tsc -p "tsconfig.json"`) — the same way.
 */
export function tokenize(command) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

/**
 * Names of scripts transitively reachable from `entry` by following `npm run
 * <name>` references within a single manifest's `scripts`, plus npm's implicit
 * `pre<name>`/`post<name>` lifecycle hooks (npm runs those around `<name>`
 * without an explicit `npm run`, so a gate moved into e.g. `prevalidate` is
 * still reached). Every spelling npm accepts for `run` is followed —
 * `run-script` is the canonical command and `run`, `rum` and `urn` are its
 * aliases — so a chain written as `npm run-script validate:web` reaches the
 * same scripts as `npm run validate:web` (Copilot, inspector#2341). A gate harvested from a script that nothing reachable from
 * `entry` invokes gates nothing, so callers restrict to this set to assert "CI
 * actually runs this", not merely "the script exists".
 */
export function reachableScripts(scripts, entry = "validate") {
  const reached = new Set();
  const queue = [entry];
  const runRef = /npm (?:run-script|run|rum|urn) ([\w:-]+)/g;
  while (queue.length > 0) {
    const name = queue.shift();
    if (reached.has(name)) continue;
    reached.add(name);
    // npm runs pre<name>/post<name> implicitly around <name>.
    for (const hook of [`pre${name}`, `post${name}`])
      if (typeof scripts?.[hook] === "string") queue.push(hook);
    const cmd = scripts?.[name];
    if (typeof cmd !== "string") continue;
    for (const m of cmd.matchAll(runRef)) queue.push(m[1]);
  }
  return reached;
}

/**
 * The lease wrapper `local:gate` runs under: `scripts/gate-lease.mjs` (#4871,
 * from inspector#2339). The vouch helpers look through it, so a question about
 * what `local:gate` runs is answered from the stages behind the wrapper.
 */
export const GATE_LEASE_WRAPPER = "node scripts/gate-lease.mjs ";

/** `node scripts/gate-lease.mjs npm run X` → `npm run X`; anything else unchanged. */
function unwrapGateLease(segment) {
  return segment.startsWith(GATE_LEASE_WRAPPER)
    ? segment.slice(GATE_LEASE_WRAPPER.length).trim()
    : segment;
}

/** The command strings of every script reachable from the root `validate`. */
function rootReachedCommands(rootScripts) {
  return [...reachableScripts(rootScripts)]
    .map((n) => rootScripts?.[n])
    .filter((c) => typeof c === "string");
}

/**
 * Whether the root `validate` chain runs a client's `validate` — either
 * `cd <clientDir> && npm run validate` or `npm --prefix <clientDir> run
 * validate`. Without this a per-client gate would still be harvested from that
 * client's own `validate` and count as coverage even after the root chain
 * stopped running it — the "gate silently stops gating" failure, one level up.
 */
export function rootRunsClientValidate(rootScripts, clientDir) {
  // Anchored on both ends: an optional leading `./` (`cd ./clients/x` genuinely
  // runs the client) and a boundary after the dir, so a prefix-sibling
  // (`clients/x` vs `clients/x-next`) can't satisfy the check for the shorter
  // name; and a boundary after `validate` so `run validate:fast` (a *different*
  // script that may skip typecheck) doesn't count as running `validate`. A bare
  // `includes`/`\b` on either would let a sibling silently vouch for a dropped
  // client. Quotes are stripped first so `cd "clients/x"` still matches. Both
  // `cd <dir> && npm run validate` and `npm --prefix <dir> run validate` count.
  const escaped = clientDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dirRe = new RegExp(`(?:cd|--prefix) \\.?/?${escaped}(?=$|[\\s&;])`);
  return rootReachedCommands(rootScripts).some((c) => {
    const stripped = c.replace(/["']/g, ""); // both halves see quotes stripped
    return dirRe.test(stripped) && /\brun validate(?=$|[\s&;])/.test(stripped);
  });
}

/**
 * Whether `scriptName` is reachable from the root `validate`. A guard can't
 * assert it is *itself* run (an unrun guard runs no check), but the two coverage
 * guards can each assert the *other* is still wired — so dropping either from
 * `validate` is caught by its sibling. Only deleting both slips through.
 */
export function rootReachesScript(rootScripts, scriptName) {
  return scriptChainRuns(rootScripts, "validate", scriptName);
}

/**
 * Whether `npm run <entry>` reaches a real invocation of `npm run <target>`.
 *
 * `reachableScripts` matches every `npm run …` **substring**, which is right for
 * harvesting (over-inclusion is safe there) and wrong for a vouch: `echo npm run
 * verify:skills` would satisfy it while the guard never executes (Copilot).
 *
 * Splitting is on `\n`, `;` and `&&` only — deliberately NOT on `|` or a bare
 * `&`, because `||` is the failure-masking form and both of its shapes must be
 * rejected: `npm run X || true` swallows the guard's own failure, and `true ||
 * npm run X` never runs it. Leaving them inside a segment means the segment does
 * not equal the invocation, so both are refused without special-casing either.
 *
 * A segment naming some OTHER script is followed, with or without trailing
 * flags, as are npm's implicit `pre`/`post` hooks. Only the target is matched
 * exactly, which suits the argument-less scripts a vouch asks about.
 *
 * One wrapper is transparent: `node scripts/gate-lease.mjs npm run X` runs
 * `npm run X` under the local:gate lease (inspector#2339) and nothing else, so a vouch
 * about what `local:gate` runs looks through it. It is matched by its exact
 * leading tokens — a wrapper with flags, or any other wrapper, still hides the
 * invocation, because this helper cannot know what an arbitrary wrapper does.
 *
 * @param {Record<string, string>} scripts
 * @param {string} entry
 * @param {string} target
 */
export function scriptChainRuns(scripts, entry, target) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    // npm runs pre<name>/post<name> implicitly around <name>.
    for (const hook of [`pre${name}`, `post${name}`])
      if (typeof scripts?.[hook] === "string") queue.push(hook);
    const body = scripts?.[name];
    if (typeof body !== "string") continue;
    for (const segment of body
      .split(/\n|;|&&/)
      .map((part) => unwrapGateLease(part.trim()))) {
      if (segment === `npm run ${target}`) return true;
      const tokens = segment.split(/\s+/);
      // An intermediate hop must be as unmasked as the target itself: in
      // `npm run stage || true` (or `| tee`) the stage's failure is swallowed,
      // so a target reached through it gates nothing (Copilot, #4895).
      if (segment.includes("|")) continue;
      if (tokens[0] === "npm" && tokens[1] === "run" && tokens[2]) {
        queue.push(tokens[2]);
      }
    }
  }
  return false;
}
