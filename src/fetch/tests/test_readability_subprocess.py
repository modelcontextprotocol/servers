"""Tests for the server's own Readability.js runner (``readability_js``).

It replaces readabilipy's Node.js wrapper, which had no timeout and blocked
the event loop (#5306), wrote ``npm install`` output to stdout, the stdio
JSON-RPC channel (#5310), and could not find ``npm.cmd`` on Windows (#5313).

Most tests put fake ``node`` and ``npm`` shell scripts first on ``PATH`` (the
reproduction #5306 describes), point the runner at a scratch copy of
readabilipy's ``javascript`` directory, and clear its once-per-process probe,
so no real Node.js runs and nothing reaches the network. Shell scripts need a
POSIX shell, so those tests skip on Windows; there the ``node_readability``
tests in the other files drive the real ``npm.cmd`` (the Windows CI leg no
longer installs readabilipy's JavaScript for them).
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, cast

import anyio
import httpx
import pytest

import mcp_server_fetch.server as server_module
from mcp_server_fetch import readability_js

from .harness import FakeWeb, connect

PAGE = "https://example.com/article"

ARTICLE = """<html><head><title>Article</title></head><body><article>
<h1>Heading</h1>
<p>This is a <a href="https://example.com/x">link</a> in a paragraph with
enough words to count as the main content of the page.</p>
</article></body></html>"""

posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="the fake node and npm are POSIX shell scripts"
)

# A `node` that reports a version and then does what each test's body says
# with ExtractArticle.js's arguments: "$1" is the script, "$3" the input
# page and "$5" the output JSON.
NODE_VERSION = 'if [ "$1" = "-v" ]; then echo v24.0.0; exit 0; fi\n'


def html(body: str) -> httpx.Response:
    return httpx.Response(
        200, content=body.encode(), headers={"content-type": "text/html"}
    )


@pytest.fixture
def bindir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """An empty directory that is the only place the runner looks for node and npm.

    The fake scripts' own utilities (sleep, cat, mkdir) still come from the
    system directories on PATH, but the runner's lookup sees this directory
    alone, so a real Node.js or npm installed anywhere (/usr/bin included, as
    a distribution installs it) is never found or run.
    """
    path = tmp_path / "bin"
    path.mkdir()
    monkeypatch.setenv("PATH", os.pathsep.join([str(path), "/usr/bin", "/bin"]))
    which = shutil.which  # the real one, before the module's is replaced

    def only_bindir(name: str) -> str | None:
        return which(name, path=str(path))

    monkeypatch.setattr(readability_js.shutil, "which", only_bindir)
    return path


def tool(bindir: Path, name: str, body: str) -> Path:
    script = bindir / name
    script.write_text("#!/bin/sh\n" + body)
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return script


@pytest.fixture
def jsdir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A scratch readabilipy `javascript` directory, with a fresh probe."""
    path = tmp_path / "javascript"
    path.mkdir()
    monkeypatch.setattr(readability_js, "javascript_dir", lambda: path)
    monkeypatch.setattr(readability_js, "_probed", False)
    monkeypatch.setattr(readability_js, "_node", None)
    return path


def install(jsdir: Path) -> None:
    """Lay out node_modules as a completed `npm install` would."""
    for name in readability_js.JS_DEPENDENCIES:
        package = jsdir / "node_modules" / name
        package.mkdir(parents=True)
        (package / "package.json").write_text("{}")


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def wait_dead(pid: int) -> bool:
    # A killed process is reaped by its parent; give the kernel a moment.
    deadline = time.monotonic() + 5
    while alive(pid):
        if time.monotonic() > deadline:  # pragma: no cover  # only on failure
            return False
        time.sleep(0.05)
    return True


# --- #5306: a bounded run, killed on timeout, off the event loop ------------


@posix_only
async def test_hanging_node_is_killed_and_the_call_falls_back(
    web: FakeWeb, bindir: Path, jsdir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The reproduction from #5306: a node that never exits. It also starts a
    # child of its own, which the timeout must kill as well.
    install(jsdir)
    pids = bindir / "pids"
    tool(
        bindir,
        "node",
        NODE_VERSION + f'sleep 3600 &\necho "$$ $!" > {pids}\nwait\n',
    )
    monkeypatch.setattr(readability_js, "EXTRACT_TIMEOUT_SECONDS", 1.0)
    web.add(PAGE, html(ARTICLE))
    started = time.monotonic()
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert time.monotonic() - started < 10
    assert result.is_error is False
    [content] = result.content
    assert content.type == "text"
    # The pure-Python extractor's Markdown: it drops link targets.
    assert "This is a link in a paragraph" in content.text
    assert "https://example.com/x" not in content.text
    for pid in map(int, pids.read_text().split()):
        assert wait_dead(pid), f"process {pid} outlived the timeout"


@posix_only
async def test_extraction_does_not_block_other_requests(
    web: FakeWeb, bindir: Path, jsdir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    install(jsdir)
    started = bindir / "started"
    tool(bindir, "node", NODE_VERSION + f"touch {started}\nexec sleep 3600\n")
    monkeypatch.setattr(readability_js, "EXTRACT_TIMEOUT_SECONDS", 5.0)
    web.add(PAGE, html(ARTICLE))
    async with connect(ignore_robots_txt=True) as (session, _):
        fetched: list[float] = []
        listed = float("inf")

        async def call() -> None:
            await session.call_tool("fetch", {"url": PAGE})
            fetched.append(time.monotonic())

        async with anyio.create_task_group() as tg:
            tg.start_soon(call)
            while not started.exists():
                await anyio.sleep(0.05)
            # Node.js is running (and hung); the loop still answers.
            tools = await session.list_tools()
            listed = time.monotonic()
            assert [t.name for t in tools.tools] == ["fetch"]
        # The fetch finished (by falling back) only after the timeout, well
        # after the listing was answered.
        assert listed < fetched[0] - 1


# --- #5310: nothing a child prints reaches stdout ---------------------------


@posix_only
def test_npm_install_output_goes_to_stderr_not_stdout(
    bindir: Path, jsdir: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    node = tool(bindir, "node", NODE_VERSION)
    # npm prints to both streams, as the real one does, and installs.
    deps = " ".join(f"{jsdir}/node_modules/{n}" for n in readability_js.JS_DEPENDENCIES)
    tool(
        bindir,
        "npm",
        "echo 'added 38 packages, and audited 39 packages in 470ms'\n"
        "echo 'npm warn deprecated' >&2\n"
        f"for d in {deps}; do mkdir -p $d && echo '{{}}' > $d/package.json; done\n",
    )
    assert readability_js.node_path() == str(node)
    out, err = capfd.readouterr()
    assert out == ""
    assert "added 38 packages" in err
    assert "npm warn deprecated" in err
    assert "contacts the npm registry" in err


@posix_only
def test_failed_extraction_stderr_goes_to_stderr_not_stdout(
    bindir: Path, jsdir: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    install(jsdir)
    tool(
        bindir,
        "node",
        NODE_VERSION + "echo 'on stdout'\necho 'TypeError: x' >&2\nexit 1\n",
    )
    assert readability_js.extract_article(ARTICLE) is None
    out, err = capfd.readouterr()
    assert out == ""
    assert "TypeError: x" in err
    assert "Readability.js failed (exit 1)" in err


@posix_only
def test_children_do_not_read_the_servers_stdin(
    bindir: Path, jsdir: Path, tmp_path: Path
) -> None:
    # A child given the server's stdin could consume JSON-RPC input.
    seen = tmp_path / "stdin"
    script = tool(bindir, "reader", f"cat > {seen}\n")
    r, w = os.pipe()
    saved = os.dup(0)
    try:
        os.dup2(r, 0)
        os.write(w, b"not for the child\n")
        os.close(w)
        done = readability_js._run([str(script)], timeout=5)
    finally:
        os.dup2(saved, 0)
        os.close(saved)
        os.close(r)
    assert done is not None and done.returncode == 0
    assert seen.read_text() == ""


# --- #5313: node and npm are resolved through PATH (and PATHEXT) ------------


def test_npm_is_run_by_the_path_shutil_which_resolves(
    jsdir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # On Windows `shutil.which("npm")` finds `npm.cmd`, which a bare "npm"
    # passed to CreateProcess does not; whatever it finds is what runs.
    found = {"node": r"C:\nodejs\node.exe", "npm": r"C:\nodejs\npm.CMD"}
    monkeypatch.setattr(readability_js.shutil, "which", found.get)
    runs: list[list[str]] = []

    def run(argv: list[str], timeout: float, cwd: Path | None = None) -> Any:
        runs.append(argv)
        if argv[1] == "install":
            install(jsdir)
        return subprocess.CompletedProcess(argv, 0, "v24.0.0\n", "")

    monkeypatch.setattr(readability_js, "_run", run)
    assert readability_js.node_path() == found["node"]
    assert runs == [
        [found["node"], "-v"],
        [found["npm"], "install", "--no-audit", "--no-fund"],
    ]


# --- Each way Readability.js can be unavailable falls back -------------------


@posix_only
def test_no_node_on_path(
    bindir: Path, jsdir: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    assert readability_js.extract_article(ARTICLE) is None
    assert "Node.js was not found on PATH" in capfd.readouterr().err


@posix_only
@pytest.mark.parametrize(
    "body", ["echo v12.22.0\n", "echo garbage\n", "exit 3\n", "exec sleep 3600\n"]
)
def test_old_or_broken_node(
    bindir: Path,
    jsdir: Path,
    body: str,
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(readability_js, "VERSION_TIMEOUT_SECONDS", 0.5)
    tool(bindir, "node", body)
    assert readability_js.node_path() is None
    assert "Node.js >= 14 is needed" in capfd.readouterr().err


@posix_only
def test_no_npm_for_missing_dependencies(
    bindir: Path, jsdir: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    tool(bindir, "node", NODE_VERSION)
    assert readability_js.node_path() is None
    assert "npm was not found on PATH" in capfd.readouterr().err


@posix_only
def test_failed_npm_install(
    bindir: Path, jsdir: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    tool(bindir, "node", NODE_VERSION)
    tool(bindir, "npm", "echo 'npm error network ENOTFOUND' >&2\nexit 1\n")
    assert readability_js.node_path() is None
    err = capfd.readouterr().err
    assert "npm error network ENOTFOUND" in err
    assert "npm install failed (exit 1)" in err


@posix_only
def test_hanging_npm_install_is_killed(
    bindir: Path,
    jsdir: Path,
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(readability_js, "INSTALL_TIMEOUT_SECONDS", 0.5)
    tool(bindir, "node", NODE_VERSION)
    tool(bindir, "npm", "exec sleep 3600\n")
    assert readability_js.node_path() is None
    assert "npm did not finish within 0.5 s and was killed" in capfd.readouterr().err


@posix_only
def test_probe_runs_once_per_process(bindir: Path, jsdir: Path) -> None:
    calls = bindir / "calls"
    node = tool(bindir, "node", f"echo x >> {calls}\n" + NODE_VERSION)
    install(jsdir)
    assert readability_js.node_path() == str(node)
    assert readability_js.node_path() == str(node)
    assert calls.read_text() == "x\n"


@posix_only
def test_unstartable_node(
    bindir: Path, jsdir: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    # Found on PATH but not executable as a program (no interpreter line).
    script = bindir / "node"
    script.write_bytes(b"\x00\x01")
    script.chmod(0o755)
    assert readability_js.node_path() is None
    assert "could not start" in capfd.readouterr().err


@posix_only
@pytest.mark.parametrize(
    ("body", "expected"),
    [
        # Readability.parse() found no article.
        ('echo null > "$5"\n', ""),
        ('echo \'{"content": null}\' > "$5"\n', ""),
        (
            'echo \'{"content": "<div><p>hi</p></div>"}\' > "$5"\n',
            "<div><p>hi</p></div>",
        ),
        # Exit 0 but no output file: a failure, so fall back.
        ("exit 0\n", None),
        # Output that is not JSON.
        ('echo "{" > "$5"\n', None),
    ],
)
def test_extraction_outcomes(
    bindir: Path, jsdir: Path, body: str, expected: str | None
) -> None:
    install(jsdir)
    tool(bindir, "node", NODE_VERSION + body)
    assert readability_js.extract_article(ARTICLE) == expected


@posix_only
def test_extraction_gets_the_page_and_runs_extractarticle(
    bindir: Path, jsdir: Path, tmp_path: Path
) -> None:
    install(jsdir)
    copy = tmp_path / "seen.html"
    args = tmp_path / "args"
    tool(
        bindir,
        "node",
        NODE_VERSION
        + f'echo "$1" > {args}\ncp "$3" {copy}\n'
        + 'echo \'{"content": "<p>ok</p>"}\' > "$5"\n',
    )
    assert readability_js.extract_article("<p>é</p>") == "<p>ok</p>"
    assert copy.read_text(encoding="utf-8") == "<p>é</p>"
    assert args.read_text().strip() == str(jsdir / "ExtractArticle.js")


# --- Killing the process tree ------------------------------------------------


def test_kill_tree_uses_taskkill_on_windows(monkeypatch: pytest.MonkeyPatch) -> None:
    runs: list[list[str]] = []
    killed: list[bool] = []

    class Proc:
        pid = 4242

        def kill(self) -> None:
            killed.append(True)

    monkeypatch.setattr(readability_js.sys, "platform", "win32")
    monkeypatch.setattr(
        readability_js.subprocess, "run", lambda argv, **_: runs.append(argv)
    )
    readability_js._kill_tree(cast("subprocess.Popen[str]", Proc()))
    assert runs == [["taskkill", "/F", "/T", "/PID", "4242"]]
    assert killed == [True]


@posix_only
def test_kill_tree_tolerates_a_group_already_gone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proc = subprocess.Popen(["true"], start_new_session=True)
    proc.wait()

    def gone(pid: int, sig: int) -> None:
        raise ProcessLookupError

    monkeypatch.setattr(readability_js.os, "killpg", gone)
    readability_js._kill_tree(cast("subprocess.Popen[str]", proc))


# --- The server's use of the runner -----------------------------------------


def test_a_failed_second_run_keeps_the_first_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #3878's recovery re-runs Readability.js; if that run fails (None), the
    # first run's content is returned rather than nothing.
    page = (
        "<html><body><p>short shell</p><div hidden><p>"
        + "long hidden content " * 20
        + "</p></div></body></html>"
    )
    results = iter(["<p>short shell</p>", None])
    monkeypatch.setattr(server_module, "extract_article", lambda _: next(results))
    assert server_module.extract_content_from_html(page).strip() == "short shell"


def test_unavailable_readability_js_falls_back_to_python(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(server_module, "extract_article", lambda _: None)
    text = server_module.extract_content_from_html(ARTICLE)
    assert "This is a link in a paragraph" in text
    assert "https://example.com/x" not in text
