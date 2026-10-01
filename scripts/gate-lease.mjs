#!/usr/bin/env node
/**
 * Run a command under a machine-wide lease, so that concurrent `npm run
 * local:gate` runs in different worktrees queue instead of contending (#4871).
 *
 * Ported from the MCP Inspector's `scripts/gate-lease.mjs` (inspector#2339,
 * with the arrival-order queue of inspector#2473). The mechanism is unchanged;
 * only the names (`SERVERS_SKIP_GATE_LEASE`, `SERVERS_GATE_LEASE_DIR`, the
 * lease directory) and this rationale are this repo's.
 *
 * **Why this repo wants it.** Agent sessions work in separate worktrees of one
 * checkout, and each runs the gate before pushing. Overlapping gates are a
 * load problem: every stage is CPU-bound (four `tsc` builds, four Vitest
 * suites, three `uv` environments with pyright), so two gates at once both
 * slow down and any test with a wall-clock budget is measured against a
 * machine it was not tuned on. The Inspector measured the effect on its own
 * gate (one of two overlapping runs failed outright, and four sessions timed
 * out hundreds of tests); this repo has no such measurement, and the gate here
 * is cheaper, so the lease is a precaution taken from that experience rather
 * than a fix for an observed failure. Run back to back, each gate is measured
 * against a quiet machine. So a second gate waits.
 *
 * **Why a lease and not a load threshold.** Two sessions each polling "is the
 * machine quiet yet?" deadlock on each other: neither ever clears, since each
 * is the reason the other is waiting. A lease *grants*: exactly one waiter wins
 * the `mkdir`, runs, and releases; the rest keep asking. There is nothing to
 * wait *for* except a release, and a release always comes (see the crash case
 * below).
 *
 * **Why `proper-lockfile`.** A hand-rolled election loses to it: `mkdir` is
 * atomic, a live holder refreshes the lock's mtime at `stale / 2` for as long
 * as it lives, and a holder that dies without releasing (a killed terminal, an
 * OOM'd session) stops refreshing, goes stale, and is taken over by the next
 * waiter. That is the whole "how does a crashed holder release" answer, and it
 * is the library's, not ours. Its stale takeover is not single-winner; the
 * worst case is two gates running at once, which is the behaviour without a
 * lease, and `guardedFs` below keeps a superseded holder from removing the
 * winner's lock.
 *
 * **Why waiters queue in arrival order.** The lock alone grants the lease to
 * whichever waiter's poll lands first after a release, so a gate that has
 * waited longest has no advantage over one that arrived a second ago, and
 * since {@link MAX_WAIT_MS} is a total budget, an old waiter could lose race
 * after race to newer arrivals and give up while they ran. So each waiter
 * first takes a *ticket*: a file in `<lease dir>/queue/` whose name begins
 * with its arrival time, and only the waiter whose ticket sorts first among
 * the live ones asks for the lock at all. The lock stays the thing that
 * grants; the queue only decides who is allowed to ask. A ticket is dead
 * (pruned by whichever waiter behind it notices) when its process is gone
 * (same host) or it has gone {@link STALE_MS} without a refresh, so a waiter
 * that is Ctrl-C'd or killed stops blocking the line within one poll, or
 * within `STALE_MS` where its pid cannot be checked. A live waiter refreshes
 * its ticket every poll and puts it back *under the same name* if a peer
 * pruned it, so a starved event loop costs it a moment, not its place.
 *
 * **Why the lease is machine-wide.** The lock lives under `os.tmpdir()`
 * (`$XDG_RUNTIME_DIR` where a desktop session sets it), never inside a
 * worktree: a lock in the repo would be one per worktree, which is one per
 * session, which coordinates nothing.
 *
 * **Why default-on.** The sessions that need it are the ones that did not
 * think to opt in. `SERVERS_SKIP_GATE_LEASE=1` bypasses it, and the first
 * "waiting" line names the holder, its worktree, and that variable, so a wait
 * is never a mystery. It is also never a gate: a lock that cannot be *created*
 * (an unwritable tmpdir) runs the command unleased with a warning, because a
 * coordination aid must not acquire a new way to fail the gate it wraps.
 *
 * **Why the whole gate and not single stages.** A per-stage lease would let
 * two gates interleave, each stage of one running beside a stage of the other.
 * One lease around the whole run is the smallest thing that keeps a gate's
 * timings meaningful.
 *
 * Usage: `node scripts/gate-lease.mjs <command> [args...]`. The command runs
 * with inherited stdio in its own process group, so a signal to this process
 * stops the whole tree (`npm run` nests several deep and `sh` forwards
 * nothing), and the lease is released before this process exits with
 * `128 + signal`.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import nodeFs, {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname, constants as osConstants, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { winShellArgs } from "./lib/win-shell-args.mjs";

/** Set (to anything but `0` or empty) to run without taking the lease. */
export const SKIP_ENV = "SERVERS_SKIP_GATE_LEASE";

/** Overrides where the lease lives. Mostly a test seam; also a shared-box escape. */
export const DIR_ENV = "SERVERS_GATE_LEASE_DIR";

/**
 * How long a lease may go unrefreshed before a waiter may take it over.
 *
 * `proper-lockfile` refreshes the lock's mtime at `stale / 2`, so this is not
 * "how long a gate may run" — it is how long after a holder *dies* the queue
 * stays blocked. 30s rather than the library's 10s default, on purpose: the
 * refresh is a timer in an otherwise idle process, and the cost of a timer
 * firing late (a laptop waking from sleep, an event loop starved by the very
 * load this exists to manage) is a false takeover — two gates running at once,
 * the thing being prevented — whereas the cost of the longer window is 20
 * more seconds of waiting after a crash, against a gate that takes minutes.
 */
export const STALE_MS = 30_000;

/** How often a waiter re-asks. The acquire is one `mkdir`; this is not a hot loop. */
export const POLL_MS = 2_000;

/** How often a waiter says it is still waiting, so a long queue is visibly alive. */
export const PROGRESS_MS = 60_000;

/**
 * How long a waiter waits before giving up.
 *
 * This is a *total queueing budget*: it counts from the waiter's first attempt
 * and is not reset when the holder ahead releases and another queued gate
 * takes the lease. A dead holder releases within {@link STALE_MS}, so it
 * expires against a live gate that has hung, a dead holder's lock directory
 * that could not be removed, or a queue of healthy gates deeper than the
 * budget covers. Because waiters queue in
 * arrival order, the one that gives up in that last case is the newest, never
 * one that has been passed over. The right outcome in every
 * case is a loud failure naming whichever gate holds the lease at that moment
 * rather than another process joining the pile; an unbounded wait would be a
 * task that looks like progress and can never succeed. Keep this in step with
 * the lease section of docs/quality-gate.md, which owns the prose.
 */
export const MAX_WAIT_MS = 45 * 60_000;

/** Where the lease lives. `$XDG_RUNTIME_DIR` is per-user and per-session where it exists. */
export function leaseDir(env = process.env) {
  if (env[DIR_ENV]) return path.resolve(env[DIR_ENV]);
  return path.join(env.XDG_RUNTIME_DIR || tmpdir(), "mcp-servers-gate-lease");
}

/**
 * The lease target: `proper-lockfile` locks `<target>.lock` beside it and
 * never opens the target itself, so the target doubles as the holder record
 * (pid, worktree, start time) a waiter prints. It need not exist to be locked
 * (`realpath: false` below).
 */
export function leaseTarget(dir) {
  return path.join(dir, "local-gate");
}

/** The lock directory `proper-lockfile` creates for {@link leaseTarget}. */
export function lockPathOf(dir) {
  return `${leaseTarget(dir)}.lock`;
}

/**
 * Where waiters' tickets live. A sibling of the lock, never inside it — a file
 * inside the lock directory would make its removal (and so stale takeover)
 * fail.
 */
export function queueDirOf(dir) {
  return path.join(dir, "queue");
}

/** Only names ending in this are tickets; a half-written `.tmp` is not. */
const TICKET_EXT = ".ticket";

/**
 * A ticket name that sorts by arrival: zero-padded milliseconds, then pid and
 * a random suffix so two waiters arriving in the same millisecond still get
 * distinct names (and a deterministic, if arbitrary, order between them).
 */
export function ticketName(now, pid, suffix = randomBytes(4).toString("hex")) {
  return `${String(now).padStart(16, "0")}-${pid}-${suffix}${TICKET_EXT}`;
}

/** Written to a temp name and renamed, so a reader never sees a partial record. */
function writeTicket(ticket) {
  const tmp = `${ticket.path}.tmp`;
  writeFileSync(tmp, ticket.body);
  renameSync(tmp, ticket.path);
}

/**
 * Take a place in line. Returns the ticket to pass to {@link refreshTicket},
 * {@link countAhead} and {@link leaveQueue}; throws if the queue directory
 * cannot be written.
 */
export function joinQueue(dir, { now = Date.now(), pid = process.pid } = {}) {
  const qdir = queueDirOf(dir);
  mkdirSync(qdir, { recursive: true });
  const ticket = {
    path: path.join(qdir, ticketName(now, pid)),
    body: JSON.stringify({
      pid,
      host: hostname(),
      cwd: process.cwd(),
      queuedAt: now,
    }),
  };
  writeTicket(ticket);
  return ticket;
}

/**
 * Mark a ticket as still wanted, restoring it under the *same name* if a peer
 * pruned it as stale — so the waiter keeps its place. Best effort: a waiter
 * whose ticket cannot be written at all still waits, just unordered.
 */
export function refreshTicket(ticket) {
  const now = new Date();
  try {
    utimesSync(ticket.path, now, now);
  } catch {
    try {
      writeTicket(ticket);
    } catch {
      // Nothing more to do; the lock still serializes the gates.
    }
  }
}

/** Give up a place in line. Never throws. */
export function leaveQueue(ticket) {
  try {
    rmSync(ticket.path, { force: true });
  } catch {
    // A ticket left behind goes stale and is pruned by whoever is next.
  }
}

/** `EPERM` means the process exists but belongs to someone else. */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

/**
 * Whether the ticket at `file` still belongs to a waiter: refreshed within
 * `staleMs`, and — when it names a process on this host — that process still
 * exists. An unreadable record on a fresh file is treated as live; the
 * staleness check retires it soon enough.
 */
export function isTicketLive(
  file,
  { now = Date.now(), host = hostname(), staleMs = STALE_MS } = {},
) {
  let mtimeMs;
  try {
    ({ mtimeMs } = statSync(file));
  } catch {
    return false;
  }
  if (now - mtimeMs > staleMs) return false;
  try {
    const record = JSON.parse(readFileSync(file, "utf8"));
    if (
      record?.host === host &&
      Number.isInteger(record?.pid) &&
      record.pid > 0
    ) {
      return isPidAlive(record.pid);
    }
  } catch {
    // Unreadable or malformed — fall back to the staleness check alone.
  }
  return true;
}

/**
 * How many live waiters are ahead of `ticket`. Dead tickets it passes are
 * removed on the way, so a crashed waiter blocks the line for one poll.
 */
export function countAhead(dir, ticket) {
  const qdir = queueDirOf(dir);
  let names;
  try {
    names = readdirSync(qdir);
  } catch {
    return 0;
  }
  const mine = path.basename(ticket.path);
  let ahead = 0;
  for (const name of names) {
    if (!name.endsWith(TICKET_EXT) || name >= mine) continue;
    const file = path.join(qdir, name);
    if (isTicketLive(file)) ahead += 1;
    else leaveQueue({ path: file });
  }
  return ahead;
}

/** `, with 2 more gates queued ahead of this one` — or nothing at the head. */
export function describeQueue(ahead) {
  if (ahead <= 0) return "";
  return `, with ${ahead} more gate${ahead === 1 ? "" : "s"} queued ahead of this one`;
}

/**
 * What a waiter is waiting on. The lock can be free while this waiter is not
 * at the head of the line — the head is between polls — and then naming a
 * holder would send someone to stop a gate that does not exist, so that case
 * names the queue instead. `lockPath` is appended to the holder form only,
 * for the give-up line, where it is the thing to remove by hand.
 */
export function describeWait(
  dir,
  ahead,
  { withLockPath = false, now = Date.now() } = {},
) {
  if (ahead > 0 && !existsSync(lockPathOf(dir))) {
    return `the lease is free, but ${ahead} gate${ahead === 1 ? " queued ahead of this one goes" : "s queued ahead of this one go"} first`;
  }
  const where = withLockPath ? ` (${lockPathOf(dir)})` : "";
  return `${describeHolder(readHolder(dir), now)} holds the gate lease${where}${describeQueue(ahead)}`;
}

/** `SERVERS_SKIP_GATE_LEASE=0` and an empty value both mean "not skipped". */
export function isSkipped(env = process.env) {
  const value = env[SKIP_ENV];
  return value !== undefined && value !== "" && value !== "0";
}

/** `95s` → `1m35s`; sub-minute values stay in seconds. */
export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/**
 * The exit code to report for a finished child: its own, or `128 + signal`
 * (the shell convention) when a signal ended it. `code` and `signal` are
 * mutually exclusive on a real ChildProcess exit.
 */
export function exitCodeFor({ code, signal }) {
  if (typeof code === "number") return code;
  return 128 + (osConstants.signals[signal] ?? 0);
}

/** The holder record the current holder wrote, or `null` if unreadable or malformed. */
export function readHolder(dir) {
  try {
    const record = JSON.parse(readFileSync(leaseTarget(dir), "utf8"));
    if (
      typeof record?.pid === "number" &&
      typeof record?.cwd === "string" &&
      typeof record?.startedAt === "number"
    ) {
      return record;
    }
  } catch {
    // Missing, unreadable, or not JSON — all mean "nothing to report".
  }
  return null;
}

/** One line a waiter can act on: who holds it, where, and for how long. */
export function describeHolder(holder, now = Date.now()) {
  if (holder === null) return "another local:gate";
  return `pid ${holder.pid} in ${holder.cwd}, running for ${formatDuration(now - holder.startedAt)}`;
}

/**
 * A lock directory's identity: what changes when it is removed and recreated.
 * `ino` and birth time rather than mtime, which the holder's own refresh
 * rewrites legitimately; `null` when it cannot be read.
 */
function identify(lockPath) {
  try {
    const stat = statSync(lockPath);
    return { ino: stat.ino, birthtimeMs: stat.birthtimeMs };
  } catch {
    return null;
  }
}

/**
 * A `proper-lockfile` `fs` shim whose directory removal refuses to delete a
 * lock that is no longer the one this process created.
 *
 * The library's stale takeover is not single-winner: a holder whose
 * refresh timer was starved past {@link STALE_MS} can have its directory
 * replaced by a waiter, and its `release()` — and the library's `signal-exit`
 * handler — would then `rmdir` the *winner's* lock by path, letting a third
 * gate in beside the winner. Every removal the library performs goes through
 * this object, so guarding here covers both paths. Identity is captured in
 * the `mkdir` callback, the moment the directory becomes ours; `owned.id`
 * stays `null` until then so a stale directory the library removes on the
 * way to acquiring passes through untouched.
 *
 * `base` is the filesystem the shim delegates to — `node:fs` in real runs, and
 * a deliberately slow one in the test that pins inspector#2369.
 */
function guardedFs(lockPath, owned, onRefused, base = nodeFs) {
  const mine = () => {
    if (owned.id === null) return true;
    const now = identify(lockPath);
    if (now === null) return false;
    return now.ino === owned.id.ino && now.birthtimeMs === owned.id.birthtimeMs;
  };
  const removeIfMine = () => {
    if (!mine()) {
      onRefused();
      return;
    }
    rmdirSync(lockPath);
  };
  return {
    fs: {
      ...base,
      mkdir: (p, cb) =>
        base.mkdir(p, (err) => {
          if (!err) owned.id = identify(lockPath);
          cb(err);
        }),
      // Reported as success when refused, so the library forgets the lock
      // either way rather than handing its exit handler a stale record.
      rmdir: (_p, cb) => {
        try {
          removeIfMine();
          cb(null);
        } catch (err) {
          cb(err);
        }
      },
      rmdirSync: () => removeIfMine(),
    },
    mine,
  };
}

/**
 * How to spawn `command args` on this platform. Shell-free everywhere but
 * Windows, where `npm` is `npm.cmd` and needs `cmd.exe` to start at all
 * (Node refuses shell-free `.cmd` spawns), so the arguments are quoted for
 * it. The process group that lets one signal reach the whole tree is a POSIX
 * notion, hence `detached` only there.
 */
export function spawnSpec(command, args, platform = process.platform) {
  const win32 = platform === "win32";
  return {
    command,
    args: winShellArgs(args, platform),
    shell: win32,
    detached: !win32,
  };
}

/**
 * Send `signal` to the child's whole process group (it was spawned as a group
 * leader); on Windows, end its process tree with `taskkill`. Falls back to the
 * child alone where neither works or the group is already gone.
 */
function signalTree(child, signal) {
  if (process.platform === "win32") {
    // No process groups, and `child.kill` ends only the `cmd.exe` the gate was
    // started through: the builds and tests under it would run on after the
    // lease is released, beside the next gate. `taskkill /T` takes the tree
    // (as `killTree` in scripts/skill-eval.mjs does); `/F` because Windows has
    // no graceful signal to offer a console tree anyway.
    try {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        { stdio: "ignore" },
      );
      killer.on("error", () => child.kill(signal));
      return;
    } catch {
      // Fall through to the child alone.
    }
  }
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // ESRCH: the group is already gone, or the child never became a leader.
  }
  try {
    child.kill(signal);
  } catch {
    // Already exited; nothing to signal.
  }
}

/**
 * Take the lease, waiting for a holder to release or go stale.
 *
 * Resolves with `{ release, waited }`, or `null` when a lock cannot be created
 * here at all — the caller then runs unleased. Throws only when the wait
 * budget is exhausted against a live holder.
 *
 * `waited` is the time spent queued behind a holder, and is `0` whenever the
 * first attempt succeeded — however long that attempt took. An uncontended
 * lock call on a loaded machine can outlast `pollMs`, and measuring the whole
 * call reported such a run as having waited (inspector#2369).
 */
async function acquireLease({ dir, fs, log, pollMs, progressMs, maxWaitMs }) {
  // Loaded here, not at the top of the file. The gate's first stage is the
  // check that says "your install is stale, run npm install", and this
  // package is part of that install: a static import would end the wrapper
  // with ERR_MODULE_NOT_FOUND before that stage could run. Without the
  // library there is no lease, so the gate runs unleased and says why.
  let properLockfile;
  try {
    // CJS-only package; the default export is the shape every loader agrees on.
    ({ default: properLockfile } = await import("proper-lockfile"));
  } catch (err) {
    log(
      `gate-lease: could not load proper-lockfile (${err?.code ?? err?.message ?? err}); running without the lease. Run \`npm install\` at the repo root.`,
    );
    return null;
  }
  const target = leaseTarget(dir);
  const startedWaiting = Date.now();
  let lastProgress = startedWaiting;
  let announced = false;
  // A queue that cannot be joined costs the ordering, not the lease: the lock
  // still keeps two gates apart, which is the part that must not degrade.
  let ticket = null;
  try {
    ticket = joinQueue(dir, { now: startedWaiting });
  } catch (err) {
    log(
      `gate-lease: could not join the queue at ${queueDirOf(dir)} (${err?.message ?? err}); waiting for the lease out of turn.`,
    );
  }
  try {
    for (;;) {
      if (ticket !== null) refreshTicket(ticket);
      const ahead = ticket === null ? 0 : countAhead(dir, ticket);
      // Only the head of the line asks for the lock; everyone behind it
      // waits for its turn rather than racing it for the release.
      if (ahead === 0) {
        try {
          const release = await properLockfile.lock(target, {
            realpath: false,
            stale: STALE_MS,
            retries: 0,
            fs,
            // The library's default throws from a timer with no caller on the
            // stack, which would take the *holder* down mid-gate. A
            // compromised lease means another gate is now running alongside
            // this one — worth saying, not worth killing a gate that is
            // otherwise fine.
            onCompromised: (err) =>
              log(
                `gate-lease: another process took the lease over while this gate was running (${err.message}); continuing without it.`,
              ),
          });
          // `announced` is set on the first failed attempt, so it is exactly
          // "this call looped".
          return {
            release,
            waited: announced ? Date.now() - startedWaiting : 0,
          };
        } catch (err) {
          // `ELOCKED` is not the only "someone holds it": a stale directory
          // the library could not remove (`ENOTEMPTY`, `EACCES`, `EROFS`)
          // surfaces as an ordinary error, and running unleased beside
          // whatever holds it is the overlap this exists to prevent. So the
          // discriminator is the directory: if it exists, wait; only a lock
          // that could not be created at all is a reason to degrade.
          if (err?.code !== "ELOCKED" && !existsSync(lockPathOf(dir))) {
            log(
              `gate-lease: could not take the lease at ${lockPathOf(dir)} (${err?.message ?? err}); running without it.`,
            );
            return null;
          }
        }
      }
      const waited = Date.now() - startedWaiting;
      if (!announced) {
        announced = true;
        log(
          `gate-lease: ${describeWait(dir, ahead)}; waiting for its turn so the gates do not contend. ${SKIP_ENV}=1 runs anyway.`,
        );
      } else if (Date.now() - lastProgress >= progressMs) {
        lastProgress = Date.now();
        log(
          `gate-lease: still waiting (${formatDuration(waited)}): ${describeWait(dir, ahead)}.`,
        );
      }
      if (waited >= maxWaitMs) {
        throw new Error(
          `gate-lease: gave up after ${formatDuration(waited)} — ${describeWait(dir, ahead, { withLockPath: true })}. If a gate is hung, stop it; ${SKIP_ENV}=1 runs without the lease.`,
        );
      }
      await delay(pollMs);
    }
  } finally {
    // Acquired, gave up, or degraded — either way this waiter is no longer
    // in line, and the next one should not wait a poll to find that out.
    if (ticket !== null) leaveQueue(ticket);
  }
}

/**
 * Run `command args` holding the lease, and resolve with the exit code to
 * report. Signals to this process stop the child's whole tree first and are
 * reported as `128 + signal` after the lease is released.
 *
 * Every knob is injectable so the tests can drive a real lock, a real child
 * and a real signal without waiting real minutes.
 *
 * @param {object} opts
 * @param {string} opts.command
 * @param {string[]} opts.args
 * @param {string} [opts.dir]          lease directory; default {@link leaseDir}
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {(line: string) => void} [opts.log]
 * @param {number} [opts.pollMs]
 * @param {number} [opts.progressMs]
 * @param {number} [opts.maxWaitMs]
 * @param {number} [opts.graceMs]      SIGTERM → SIGKILL escalation on a signal
 * @param {typeof nodeFs} [opts.fs]    filesystem the lock is taken through
 * @param {import("node:child_process").StdioOptions} [opts.stdio]
 * @returns {Promise<number>}
 */
export async function runUnderLease({
  command,
  args,
  dir = leaseDir(),
  env = process.env,
  log = (line) => console.error(line),
  pollMs = POLL_MS,
  progressMs = PROGRESS_MS,
  maxWaitMs = MAX_WAIT_MS,
  graceMs = 5_000,
  fs = nodeFs,
  stdio = "inherit",
}) {
  let release = null;
  let waited = 0;
  // Filled in by the shim the moment the lock directory is ours.
  const owned = { id: null };
  const guarded = guardedFs(
    lockPathOf(dir),
    owned,
    () =>
      log(
        "gate-lease: the lease was taken over by another gate while this one ran, so its lock was left alone rather than removed.",
      ),
    fs,
  );
  if (isSkipped(env)) {
    log(`gate-lease: ${SKIP_ENV} is set; running without the lease.`);
  } else {
    let usable = true;
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      usable = false;
      log(
        `gate-lease: could not create ${dir} (${err?.message ?? err}); running without the lease.`,
      );
    }
    if (usable) {
      const lease = await acquireLease({
        dir,
        fs: guarded.fs,
        log,
        pollMs,
        progressMs,
        maxWaitMs,
      });
      if (lease !== null) ({ release, waited } = lease);
    }
    if (release !== null) {
      if (waited > 0) {
        log(`gate-lease: acquired after ${formatDuration(waited)}.`);
      }
      try {
        writeFileSync(
          leaseTarget(dir),
          JSON.stringify({
            pid: process.pid,
            cwd: process.cwd(),
            startedAt: Date.now(),
          }),
        );
      } catch {
        // Best effort: the record only improves a waiter's message.
      }
    }
  }

  const startedRunning = Date.now();
  // Release on every way out — a spawn failure included, or the lock would
  // sit held for STALE_MS with no gate running behind it.
  const finishLease = async () => {
    if (release === null) return;
    // The record is only meaningful while the lock beside it is held; a
    // waiter reading a fresh lock must not be told about the previous
    // holder — unless the lock is no longer ours, in which case the record
    // is the winner's too.
    try {
      if (guarded.mine()) rmSync(leaseTarget(dir), { force: true });
    } catch {
      // Diagnostic only; never let it stand between a finished gate and the
      // release below.
    }
    try {
      await release();
    } catch (err) {
      // `ERELEASED` means the library's own refresh tick already found the
      // lock taken over and dropped it; the directory there now is the
      // winner's live lock, and `onCompromised` has already said so.
      if (err?.code === "ERELEASED") return;
      log(
        `gate-lease: could not release the lease (${err?.message ?? err}). A waiter takes it over once it is ${formatDuration(STALE_MS)} stale — unless whatever blocked this removal persists, in which case remove ${lockPathOf(dir)} by hand.`,
      );
      // Not "released after": the lock may still be blocking the queue.
      return;
    }
    log(
      `gate-lease: released after ${formatDuration(Date.now() - startedRunning)}${waited > 0 ? ` (waited ${formatDuration(waited)} first)` : ""}.`,
    );
  };

  // Every signal a terminal or a supervisor sends to end a run: Ctrl-C, a
  // plain kill, a closed terminal, and Ctrl-\ — the child is in its own
  // group, so any of these left unhandled would end this process and
  // orphan the gate behind a lease that then goes stale under it.
  const signals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];
  let stoppedBy = null;
  let escalation = null;
  let handlers = [];
  let outcome;
  // Everything from here to the child's exit is inside the `try`, so a
  // synchronous failure to even start it — an argument `winShellArgs`
  // refuses, a spawn option Node rejects — releases the lease the same way
  // an asynchronous spawn error does.
  try {
    const spec = spawnSpec(command, args);
    const child = spawn(spec.command, spec.args, {
      stdio,
      env,
      shell: spec.shell,
      // Its own group, so one signal reaches every descendant. See the header.
      detached: spec.detached,
    });
    const onSignal = (signal) => {
      if (stoppedBy !== null) return;
      stoppedBy = signal;
      log(`gate-lease: received ${signal}; stopping the gate.`);
      signalTree(child, signal);
      escalation = setTimeout(() => {
        log(
          `gate-lease: the gate did not exit within ${graceMs}ms of ${signal}; sending SIGKILL.`,
        );
        signalTree(child, "SIGKILL");
      }, graceMs);
    };
    handlers = signals.map((signal) => {
      const handler = () => onSignal(signal);
      process.on(signal, handler);
      return [signal, handler];
    });
    outcome = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(escalation);
    for (const [signal, handler] of handlers) process.off(signal, handler);
    await finishLease();
  }
  return stoppedBy !== null
    ? exitCodeFor({ code: null, signal: stoppedBy })
    : exitCodeFor(outcome);
}

/** `node scripts/gate-lease.mjs <command> [args...]` */
export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/gate-lease.mjs <command> [args...]");
    return 2;
  }
  try {
    return await runUnderLease({ command, args });
  } catch (err) {
    console.error(err?.message ?? err);
    return 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
