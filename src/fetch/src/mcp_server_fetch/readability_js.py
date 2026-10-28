# Runs Mozilla's Readability.js (readabilipy's `ExtractArticle.js`) under
# Node.js in a subprocess the server controls, instead of through readabilipy's
# own wrapper (`simple_json_from_html_string(use_readability=True)`).
#
# readabilipy's wrapper had four defects for a stdio MCP server, each fixed
# here rather than worked around at the call site:
#
# - No timeout (#5306). Its `subprocess.run` calls wait forever, so a Node.js
#   or npm that hangs stalled the tool call. Every process here runs under a
#   timeout, and on timeout its whole process tree is killed (a process group
#   on POSIX, `taskkill /T` on Windows), so nothing is left running.
# - Child output on fd 1 (#5310). Its `npm install` inherits the server's
#   stdout, which over stdio is the JSON-RPC channel, and it `print`s Node's
#   stderr to stdout on a failure. Here every child gets stdin from the null
#   device (it must never read the server's JSON-RPC input either) and pipes
#   for stdout and stderr; whatever a child prints is forwarded to stderr.
# - npm not found on Windows (#5313). It runs a bare `npm`, which Windows'
#   `CreateProcess` does not resolve to `npm.cmd`. Here `node` and `npm` are
#   resolved with `shutil.which`, which honours `PATHEXT`.
# - A failed Readability.js run raised out of the tool call. Here any failure
#   (no Node.js, an old one, no npm, a failed install, a timeout, a crash, bad
#   output) returns None, and the caller falls back to readabilipy's
#   pure-Python extractor, with the reason written to stderr.
#
# readabilipy >= 0.3.0 ships only `package.json` for its JavaScript and runs
# `npm install` on first use, which reaches the npm registry during a tool call
# (#4830). That stays the behaviour (the README states it), but the install now
# runs at most once per process, under a lock and a timeout. It installs into
# readabilipy's own `javascript` directory, so dependencies an operator
# installed there ahead of time (the README says how) are found and nothing is
# fetched.
#
# Everything here is synchronous: the caller runs extraction in a worker
# thread (`asyncio.to_thread`), so the server's event loop never waits on it.

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

import readabilipy

# How long one Readability.js run may take before it is killed.
EXTRACT_TIMEOUT_SECONDS = 30.0
# How long the one-time `npm install` of readabilipy's JavaScript may take.
INSTALL_TIMEOUT_SECONDS = 120.0
# How long `node -v` may take.
VERSION_TIMEOUT_SECONDS = 10.0
# readabilipy's `package.json` declares `"engines": {"node": ">=14.0.0"}`.
MIN_NODE_MAJOR = 14
# What `ExtractArticle.js` requires; all three present means installed.
JS_DEPENDENCIES = ("@mozilla/readability", "jsdom", "minimist")

_probe_lock = threading.Lock()
_probed = False
_node: str | None = None


def javascript_dir() -> Path:
    """readabilipy's `javascript` directory: `ExtractArticle.js` and `node_modules`."""
    return Path(readabilipy.__file__).parent / "javascript"


def _log(message: str) -> None:
    # stderr only: stdout is the JSON-RPC channel.
    print(f"mcp-server-fetch: {message}", file=sys.stderr, flush=True)


def _forward(output: str) -> None:
    """Copy a child's captured output to stderr, never to stdout."""
    if output:
        sys.stderr.write(output if output.endswith("\n") else output + "\n")
        sys.stderr.flush()


def _kill_tree(proc: subprocess.Popen[str]) -> None:
    """Kill ``proc`` and everything it started (npm runs node, `npm.cmd` runs cmd)."""
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            # start_new_session made the child a process-group leader.
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    # Whatever the tree kill did, the direct child is certainly gone after this.
    proc.kill()


def _run(
    argv: list[str], timeout: float, cwd: Path | None = None
) -> subprocess.CompletedProcess[str] | None:
    """Run ``argv`` detached from the server's stdio, or None if it could not
    start or did not finish within ``timeout`` seconds (it is killed then)."""
    try:
        proc = subprocess.Popen(
            argv,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            # POSIX only (ignored on Windows): its own process group, so a
            # timeout can kill the processes it starts as well.
            start_new_session=True,
        )
    except OSError as e:
        _log(f"could not start {argv[0]}: {e}")
        return None
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_tree(proc)
        proc.communicate()
        _log(f"{Path(argv[0]).name} did not finish within {timeout:g} s and was killed")
        return None
    return subprocess.CompletedProcess(argv, proc.returncode, stdout, stderr)


def _node_major(version: str) -> int | None:
    """The major version in `node -v` output (``v24.1.0``), or None."""
    head = version.strip().lstrip("v").split(".", 1)[0]
    return int(head) if head.isdigit() else None


def _dependencies_installed(jsdir: Path) -> bool:
    modules = jsdir / "node_modules"
    return all((modules / name / "package.json").is_file() for name in JS_DEPENDENCIES)


def _install_dependencies(jsdir: Path) -> bool:
    """`npm install` readabilipy's JavaScript dependencies; whether it worked."""
    npm = shutil.which("npm")
    if npm is None:
        _log(
            "npm was not found on PATH, so Readability.js's dependencies cannot be "
            f"installed in {jsdir}; using the pure-Python extractor"
        )
        return False
    _log(
        f"installing Readability.js's dependencies with npm in {jsdir} (first use; "
        "this contacts the npm registry)"
    )
    done = _run(
        [npm, "install", "--no-audit", "--no-fund"],
        timeout=INSTALL_TIMEOUT_SECONDS,
        cwd=jsdir,
    )
    if done is None:
        return False
    _forward(done.stdout)
    _forward(done.stderr)
    if done.returncode != 0 or not _dependencies_installed(jsdir):
        _log(
            f"npm install failed (exit {done.returncode}); using the pure-Python extractor"
        )
        return False
    return True


def _find_node() -> str | None:
    """A Node.js ready to run `ExtractArticle.js`, installing its dependencies
    if they are missing, or None (the reason is logged)."""
    node = shutil.which("node")
    if node is None:
        _log("Node.js was not found on PATH; using the pure-Python extractor")
        return None
    done = _run([node, "-v"], timeout=VERSION_TIMEOUT_SECONDS)
    major = _node_major(done.stdout) if done and done.returncode == 0 else None
    if major is None or major < MIN_NODE_MAJOR:
        _log(
            f"Node.js >= {MIN_NODE_MAJOR} is needed for Readability.js "
            f"({node} did not report one); using the pure-Python extractor"
        )
        return None
    jsdir = javascript_dir()
    if not _dependencies_installed(jsdir) and not _install_dependencies(jsdir):
        return None
    return node


def node_path() -> str | None:
    """The Node.js to run Readability.js with, or None to use pure Python.

    Probed once per process, under a lock, so concurrent first calls run one
    `npm install` between them. A failed probe is not retried until the server
    restarts, so a missing or broken Node.js costs one probe, not one per call.
    """
    global _probed, _node
    with _probe_lock:
        if not _probed:
            _node = _find_node()
            _probed = True
        return _node


def extract_article(html: str) -> str | None:
    """Readability.js's article HTML for ``html`` ("" when it finds none), or
    None when Readability.js is unavailable or failed, to fall back on."""
    node = node_path()
    if node is None:
        return None
    jsdir = javascript_dir()
    with tempfile.TemporaryDirectory(
        prefix="mcp-server-fetch-", ignore_cleanup_errors=True
    ) as tmp:
        page = Path(tmp, "page.html")
        result = Path(tmp, "article.json")
        page.write_text(html, encoding="utf-8")
        done = _run(
            [
                node,
                str(jsdir / "ExtractArticle.js"),
                "-i",
                str(page),
                "-o",
                str(result),
            ],
            timeout=EXTRACT_TIMEOUT_SECONDS,
            cwd=jsdir,
        )
        if done is None:
            _log(
                "Readability.js was stopped; using the pure-Python extractor for this "
                "page. Start the server with --no-readability-js to never use it."
            )
            return None
        if done.returncode != 0 or not result.is_file():
            _forward(done.stderr)
            _log(
                f"Readability.js failed (exit {done.returncode}); using the "
                "pure-Python extractor for this page"
            )
            return None
        try:
            article = json.loads(result.read_text(encoding="utf-8"))
        except ValueError:
            _log(
                "Readability.js wrote unreadable output; using the pure-Python extractor"
            )
            return None
    # `Readability.parse()` returns null for a page with no article.
    content = article.get("content") if isinstance(article, dict) else None
    return content if isinstance(content, str) else ""
