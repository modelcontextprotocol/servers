// Quoting for the few spawns that still need a Windows shell (inspector#1939).
//
// Ported from the MCP Inspector (#4863); `inspector#N` references are that
// repo's issues and PRs, a bare `#N` is this repo's.
//
// The callers here are CLIs that npm installs as `.cmd` shims on Windows —
// `npx` (the pinned validator in `verify-skills-cli.mjs`), `claude` and
// `copilot` (`claude-cli.mjs`) — and Node has refused shell-free `.cmd`/`.bat`
// spawns since the CVE-2024-27980 hardening, so on Windows `shell: true` is the
// ONLY way to start them at all.
//
// With a shell, Node hands `cmd.exe` one space-joined string rather than an argv
// array, so any argument holding a space or a `cmd.exe` metacharacter is
// re-parsed as syntax. In the Inspector, where this was written, that bit real
// callers passing paths under `tmpdir()`, which on Windows sits beneath the user
// profile — `C:\Users\First Last\AppData\Local\Temp` splits in two, and a
// profile name like `C:\Temp(1)` is read as grouping syntax.

/**
 * `cmd.exe` characters that make an argument parse as syntax rather than text.
 * Deliberately broad — parentheses group, `^` escapes, `!` expands under
 * delayed expansion, and a bare space splits. Anything not plainly inert is
 * quoted; over-quoting is free, since `cmd.exe` and the CRT argument parser
 * behind it both strip the quotes back off before the child sees them.
 */
const NEEDS_QUOTING = /[\s&|<>^()!"'`,;=[\]]/;

/**
 * A single argument, safe to pass through `cmd.exe`.
 *
 * Throws on `%`, which quoting genuinely cannot handle: `cmd.exe` expands
 * `%NAME%` *before* it processes quotes, so `"%TEMP%"` is rewritten inside the
 * quotes and the child receives a different path than we passed. There is no
 * escape for it outside a batch file. A `%` in one of these generated temp
 * paths is far-fetched, but silently running against the wrong directory is the
 * exact class of failure this work exists to remove — so say so instead.
 */
export function quoteWinArg(arg) {
  if (arg.includes("%")) {
    throw new Error(
      `cannot safely pass an argument containing "%" through cmd.exe (it is ` +
        `expanded before quotes are processed): ${arg}`,
    );
  }
  if (!NEEDS_QUOTING.test(arg)) return arg;
  // A literal `"` inside a quoted string is doubled, per the CRT parser.
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * `args`, quoted for `cmd.exe` when spawning with `shell: true` on Windows and
 * returned untouched everywhere else — POSIX shells are not in play here, since
 * these call sites only set `shell` on win32.
 */
export function winShellArgs(args, platform = process.platform) {
  if (platform !== "win32") return args;
  return args.map(quoteWinArg);
}
