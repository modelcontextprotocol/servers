"""No tool starts git's automatic maintenance in a repository it opens.

`git merge` ends in `git maintenance run --auto`, which runs `git gc` when
the repository's own configuration says it is due (`gc.auto`,
`gc.autoPackLimit`). That gc's cruft repack runs every command the
repository's `gc.recentObjectsHook` names, so a repository could run a
program as the server's user through git_merge. `HARDENED_CONFIG` pins
`maintenance.auto` and `gc.auto` off; these tests plant a repository that
forces a gc on the next merge, with a hook that records its own run in a
canary file, and assert the canary is never written.

The hook is a POSIX shell script, so the tests that run it skip on Windows;
the check of the pinned values runs everywhere.
"""

import os
import shlex
import stat
import subprocess
import sys
from pathlib import Path

import git
import pytest
from conftest import connect, wire

from mcp_server_git.server import harden_repo

posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="the hook is a POSIX shell script"
)
# gc.recentObjectsHook arrived in git 2.42; an older git never runs it.
needs_hook = pytest.mark.skipif(
    git.Git().version_info < (2, 42), reason="gc.recentObjectsHook needs git 2.42"
)


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


def commit_file(repo: git.Repo, name: str, content: str) -> None:
    (root_of(repo) / name).write_text(content, newline="\n")
    repo.git.add(name)
    repo.git.commit("-m", f"write {name}")


def plant_due_gc(repo: git.Repo, canary: Path, *, diverge: bool) -> None:
    """Make the next merge of `feature` run a gc that asks the hook.

    Two packs make gc due under `gc.auto=1` and `gc.autoPackLimit=1`, and
    their sizes (6 or 3 objects against 4) are within a factor of two, so a
    git whose maintenance repacks geometrically finds them due too. An old
    unreachable loose object makes the cruft repack consult
    `gc.recentObjectsHook`. `diverge` adds a commit on `main`, so the merge
    is not a fast-forward.
    """
    # Each commit comes before the pack it lands in: a commit runs automatic
    # maintenance too, which could consolidate packs already made.
    repo.git.branch("feature")
    if diverge:
        commit_file(repo, "main.txt", "main\n")
    repo.git.repack("-a", "-d")
    repo.git.checkout("feature")
    (root_of(repo) / "feature-1.txt").write_text("one\n", newline="\n")
    (root_of(repo) / "feature-2.txt").write_text("two\n", newline="\n")
    repo.git.add("feature-1.txt", "feature-2.txt")
    repo.git.commit("-m", "feature")
    repo.git.checkout("main")
    repo.git.repack("-d")

    hook = canary.parent / "hook.sh"
    hook.write_text(f"#!/bin/sh\necho ran >> {shlex.quote(str(canary))}\n")
    hook.chmod(hook.stat().st_mode | stat.S_IEXEC)
    with repo.config_writer() as config:
        config.set_value("gc", "auto", "1")
        config.set_value("gc", "autoPackLimit", "1")
        config.set_value("gc", "autoDetach", "false")
        config.set_value("gc", "recentObjectsHook", shlex.quote(str(hook)))

    sha = (
        subprocess.run(
            ["git", "hash-object", "-w", "--stdin"],
            cwd=root_of(repo),
            input=b"stale\n",
            capture_output=True,
            check=True,
        )
        .stdout.decode()
        .strip()
    )
    loose = Path(repo.git_dir) / "objects" / sha[:2] / sha[2:]
    os.utime(loose, (0, 0))


@posix_only
@pytest.mark.parametrize("fast_forward_only", [True, False])
@pytest.mark.parametrize("pinned", [False, True], ids=["roots", "repository"])
async def test_merge_never_runs_the_recent_objects_hook(
    tmp_path: Path, repo: git.Repo, fast_forward_only: bool, pinned: bool
):
    canary = tmp_path / "canary"
    plant_due_gc(repo, canary, diverge=not fast_forward_only)

    async with connect(root_of(repo) if pinned else None) as session:
        result = wire(
            await session.call_tool(
                "git_merge",
                {
                    "repo_path": str(root_of(repo)),
                    "source_branch": "feature",
                    "fast_forward_only": fast_forward_only,
                },
            )
        )

    assert result["isError"] is False, result
    assert (root_of(repo) / "feature-1.txt").exists()
    assert not canary.exists()


@posix_only
@needs_hook
@pytest.mark.parametrize("diverge", [False, True], ids=["fast-forward", "merge"])
def test_the_planted_repository_runs_the_hook_without_the_overrides(
    tmp_path: Path, repo: git.Repo, diverge: bool
):
    # The control: the same merge under plain git does run the hook, so the
    # test above fails if the overrides go missing.
    canary = tmp_path / "canary"
    plant_due_gc(repo, canary, diverge=diverge)
    repo.git.merge("--ff", "--no-edit", "feature")
    assert canary.read_text() == "ran\n"


def test_harden_repo_turns_automatic_maintenance_off(repo: git.Repo):
    with repo.config_writer() as config:
        config.set_value("gc", "auto", "1")
        config.set_value("maintenance", "auto", "true")
    harden_repo(repo)
    assert repo.git.config("--show-scope", "--get", "gc.auto") == "command\t0"
    assert (
        repo.git.config("--show-scope", "--get", "maintenance.auto") == "command\tfalse"
    )
