// PEP 440 versions and specifiers, for the sweeps that read Python lockfiles
// (#4874).
//
// The Inspector's sweeps are npm-only and lean on `semver`. This repo also
// ships three Python servers, whose Dependabot alerts arrive as `pip` alerts
// against each `uv.lock` with PEP 440 ranges (`>= 2.0.0a1, <= 2.14.0`), and
// whose SDK is the PyPI `mcp` package. node-semver cannot read those: it has
// no `rc`/`post`/`dev` ordering and rejects four-part versions. So this is a
// small, dependency-free reading of the parts of PEP 440 those inputs use.
//
// ⚠️ Unparseable input THROWS rather than returning `false`. A range check
// that quietly answers "not in range" for something it could not read would
// let the alert sweep stand down a live alert; the callers turn a throw into
// "could not determine", which leaves the issue alone.

const VERSION_RE =
  /^v?(?:(\d+)!)?(\d+(?:\.\d+)*)(?:[-_.]?(a|alpha|b|beta|c|rc|pre|preview)[-_.]?(\d*))?(?:-(\d+)|[-_.]?(?:post|rev|r)[-_.]?(\d*))?(?:[-_.]?dev[-_.]?(\d*))?(?:\+([a-z0-9]+(?:[-_.][a-z0-9]+)*))?$/i;

const PRE_RANK = {
  a: 0,
  alpha: 0,
  b: 1,
  beta: 1,
  c: 2,
  rc: 2,
  pre: 2,
  preview: 2,
};

/**
 * @param {string} version
 * @returns {{epoch: number, release: number[], pre: [number, number] | null, post: number | null, dev: number | null, local: Array<number | string> | null}}
 * @throws on a version PEP 440 does not admit
 */
export function parseVersion(version) {
  const match = VERSION_RE.exec(String(version).trim());
  if (!match) throw new Error(`not a PEP 440 version: "${version}"`);
  const [
    ,
    epoch,
    release,
    preKind,
    preNum,
    postImplicit,
    postNum,
    devNum,
    local,
  ] = match;
  const post =
    postImplicit !== undefined
      ? Number(postImplicit)
      : postNum !== undefined
        ? Number(postNum || 0)
        : null;
  return {
    epoch: Number(epoch ?? 0),
    release: release.split(".").map(Number),
    pre: preKind
      ? [PRE_RANK[preKind.toLowerCase()], Number(preNum || 0)]
      : null,
    post,
    dev: devNum !== undefined ? Number(devNum || 0) : null,
    // Segments split on `.`, `-` or `_`: all digits compare as numbers, the
    // rest case-insensitively as text.
    local:
      local === undefined
        ? null
        : local
            .toLowerCase()
            .split(/[-_.]/)
            .map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg)),
  };
}

/**
 * PEP 440 local-label ordering: a version with a label sorts after the same
 * version without one; segment by segment a number beats text; and with a
 * matching prefix, more segments sort later.
 */
function compareLocal(a, b) {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i], b[i]];
    if (x === y) continue;
    if (typeof x !== typeof y) return typeof x === "number" ? 1 : -1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

/** The public part of a version: everything before a `+local` label. */
function publicVersion(version) {
  return String(version).trim().replace(/\+.*$/, "");
}

/** Is this a pre-release or development release? */
export function isPrerelease(version) {
  const v = parseVersion(version);
  return v.pre !== null || v.dev !== null;
}

/**
 * The PEP 440 sort key, as a flat list of numbers. A missing pre-release
 * sorts after any pre-release, except on a bare dev release, which sorts
 * before them all; a missing dev segment sorts after any dev segment.
 */
function sortKey(v) {
  const release = [...v.release];
  while (release.length > 1 && release[release.length - 1] === 0) release.pop();
  const pre =
    v.pre !== null
      ? v.pre
      : v.post === null && v.dev !== null
        ? [-Infinity, 0]
        : [Infinity, 0];
  return {
    epoch: v.epoch,
    local: v.local,
    release,
    rest: [...pre, v.post ?? -Infinity, v.dev ?? Infinity],
  };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero or positive
 */
export function compareVersions(a, b) {
  const x = sortKey(parseVersion(a));
  const y = sortKey(parseVersion(b));
  if (x.epoch !== y.epoch) return x.epoch - y.epoch;
  for (let i = 0; i < Math.max(x.release.length, y.release.length); i++) {
    const d = (x.release[i] ?? 0) - (y.release[i] ?? 0);
    if (d !== 0) return d;
  }
  for (let i = 0; i < x.rest.length; i++) {
    if (x.rest[i] !== y.rest[i]) return x.rest[i] < y.rest[i] ? -1 : 1;
  }
  return compareLocal(x.local, y.local);
}

const CLAUSE_RE = /^(~=|===|==|!=|<=|>=|<|>|=)\s*(\S+)$/;

/** `==1.2.*` style prefix match: the release starts with the prefix. */
function prefixMatches(version, prefix) {
  const v = parseVersion(version);
  const p = parseVersion(prefix);
  return (
    v.epoch === p.epoch &&
    p.release.every((part, i) => (v.release[i] ?? 0) === part)
  );
}

/**
 * One clause of a specifier.
 *
 * @param {string} version
 * @param {string} clause e.g. `>= 2.0.0a1`
 * @returns {boolean}
 */
function clauseMatches(version, clause) {
  const match = CLAUSE_RE.exec(clause.trim());
  if (!match) throw new Error(`not a PEP 440 specifier clause: "${clause}"`);
  const [, op, operand] = match;
  if (op === "===") return String(version).trim() === operand;
  // Specifiers match on the public version: a candidate's local label is
  // ignored unless an equality operand names one itself (PEP 440, and what
  // `packaging` does), so `<=1.0` admits `1.0+vendor.1`.
  const keepLocal =
    (op === "==" || op === "=" || op === "!=") &&
    !operand.endsWith(".*") &&
    parseVersion(operand).local !== null;
  version = keepLocal ? String(version).trim() : publicVersion(version);
  if (op === "==" || op === "=" || op === "!=") {
    const equal = operand.endsWith(".*")
      ? prefixMatches(version, operand.slice(0, -2))
      : compareVersions(version, operand) === 0;
    return op === "!=" ? !equal : equal;
  }
  if (op === "~=") {
    const { epoch, release } = parseVersion(operand);
    if (release.length < 2) {
      throw new Error(`~= needs at least two release segments: "${clause}"`);
    }
    return (
      compareVersions(version, operand) >= 0 &&
      prefixMatches(version, `${epoch}!${release.slice(0, -1).join(".")}`)
    );
  }
  const d = compareVersions(version, operand);
  if (op === "<") return d < 0 && !isPreOf(version, operand);
  if (op === ">") return d > 0 && !isPostOf(version, operand);
  return op === "<=" ? d <= 0 : d >= 0;
}

/** Same epoch and release, compared with trailing zeros ignored. */
function sameRelease(a, b) {
  return compareVersions(releaseOnly(a), releaseOnly(b)) === 0;
}

function releaseOnly(v) {
  const { epoch, release } = parseVersion(v);
  return `${epoch}!${release.join(".")}`;
}

/**
 * PEP 440's exclusive `<V` "MUST NOT allow a pre-release of the specified
 * version unless the specified version is itself a pre-release": `<2.0`
 * excludes `2.0rc1`, which sorts below it.
 */
function isPreOf(version, operand) {
  const v = parseVersion(version);
  const o = parseVersion(operand);
  return (
    (v.pre !== null || v.dev !== null) &&
    o.pre === null &&
    o.dev === null &&
    sameRelease(version, operand)
  );
}

/**
 * PEP 440's exclusive `>V` "MUST NOT allow a post-release of the given
 * version unless V itself is a post release": `>1.0` excludes `1.0.post1`,
 * which sorts above it.
 */
function isPostOf(version, operand) {
  const v = parseVersion(version);
  const o = parseVersion(operand);
  return (
    v.post !== null &&
    o.post === null &&
    sameRelease(version, operand) &&
    JSON.stringify(v.pre) === JSON.stringify(o.pre)
  );
}

/**
 * Does `version` satisfy every comma-separated clause of `specifier`? An
 * empty specifier admits everything.
 *
 * Pre-release exclusion (PEP 440's "pre-releases are not admitted unless
 * named") is deliberately not applied: these specifiers are checked against a
 * version that is already installed or already published, never used to pick
 * one.
 *
 * @param {string} version
 * @param {string} specifier e.g. `>= 1.0, < 2.3.1`
 * @returns {boolean}
 * @throws on an unparseable version or clause
 */
export function satisfies(version, specifier) {
  return String(specifier)
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .every((clause) => clauseMatches(version, clause));
}

/**
 * The PEP 503 normalized form of a project name: `PyJWT`, `py_jwt` and
 * `py.jwt` are all `pyjwt`/`py-jwt`. Dependabot reports the same package
 * under more than one spelling, so grouping on the raw name splits one bump
 * into several issues.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[-_.]+/g, "-");
}
