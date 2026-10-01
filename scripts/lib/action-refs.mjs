// What an action reference (`uses: owner/repo@ref`) can be, for the guards
// and sweeps that read workflow files (#4873).
//
// One fact lives here: the only immutable form of a ref is a full-length
// commit SHA. `verify:action-pins` requires that form in credentialed jobs
// today. The dependency sweep planned in #4874 will read the same pins to
// report a newer release, and it must agree with the guard about what a pin
// is, so the matcher is a module of its own rather than a constant inside
// either script. (The Inspector keeps it in its `dependency-refresh.mjs`,
// which this repo does not have yet.)

/** A full-length commit SHA, the only immutable form a `uses:` ref can take. */
export const SHA_REF = /^[0-9a-f]{40}$/;

/**
 * The exact release a SHA pin was resolved from, as written in the trailing
 * comment: `# v7.0.1`. A major-only `# v7` does not say which commit was
 * meant, and a sweep could then compare it at major precision only, which is
 * the moving-tag behavior the pin exists to remove.
 */
export const EXACT_VERSION = /^v\d+\.\d+\.\d+$/;

/**
 * Split a `uses:` value into its action and ref. A local action (`./…`) or a
 * container image (`docker://…`) has no ref to pin and returns `null`; so does
 * a value with no `@` at all.
 *
 * @param {string} uses
 * @returns {{ action: string, ref: string } | null}
 */
export function parseUses(uses) {
  if (uses.startsWith("./") || uses.startsWith("docker://")) return null;
  const at = uses.lastIndexOf("@");
  if (at === -1) return null;
  return { action: uses.slice(0, at), ref: uses.slice(at + 1) };
}

/**
 * Is this `uses:` value, with the comment that trails it, an immutable pin
 * that names the release it came from?
 *
 * @param {string} uses
 * @param {string | null | undefined} comment the YAML comment after the value, without its `#`
 * @returns {boolean}
 */
export function isPinned(uses, comment) {
  const parsed = parseUses(uses);
  return (
    parsed !== null &&
    SHA_REF.test(parsed.ref) &&
    EXACT_VERSION.test((comment ?? "").trim())
  );
}
