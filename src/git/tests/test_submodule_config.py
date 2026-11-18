"""A submodule's own configuration never makes the server run a program.

Git runs some commands inside a checked-out submodule, under the submodule's
own configuration, which the opened repository's `harden_repo` does not read
by itself: a nested `git diff` when `diff.submodule` is `diff`, and a nested
`git status` when `git_add ["."]` or `git_checkout` checks whether the
submodule changed. The server pins `diff.submodule` to `short` so the nested
diff never starts, and empties the filter and merge drivers each checked-out
submodule defines, as it does for the opened repository's own.

Each test plants a program in a submodule's configuration that records its
run in a canary file, drives the real server through a client
(`conftest.connect`), and asserts the canary was never written. The payload
is a POSIX shell script, so those tests skip on Windows; the tests of the
submodule listing itself run everywhere.
"""

import os
import shlex
import stat
import sys
from pathlib import Path
from typing import Any

import git
import pytest
from conftest import connect, make_repo, wire

from mcp_server_git.server import _submodule_drivers, harden_repo

posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="the payload is a POSIX shell script"
)


class Canary:
    """A program that appends its first argument to a canary file.

    As a filter it passes its input through, and as a textconv it prints the
    file it is given, so a run that is not stopped still behaves normally.
    """

    def __init__(self, directory: Path) -> None:
        directory.mkdir()
        self.file = directory / "canary"
        self.script = directory / "payload.sh"
        self.script.write_text(
            "#!/bin/sh\n"
            f'echo "$1" >> {shlex.quote(str(self.file))}\n'
            'case "$1" in\n'
            "  filter) exec cat ;;\n"
            '  textconv) exec cat "$2" ;;\n'
            "esac\n"
            "exit 0\n"
        )
        self.script.chmod(self.script.stat().st_mode | stat.S_IEXEC)

    def command(self, tag: str) -> str:
        return f"{shlex.quote(str(self.script))} {tag}"

    def runs(self) -> list[str]:
        return self.file.read_text().split() if self.file.exists() else []


@pytest.fixture
def canary(tmp_path: Path) -> Canary:
    return Canary(tmp_path / "canary")


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


def commit_file(repo: git.Repo, name: str, content: str) -> None:
    (root_of(repo) / name).write_text(content, newline="\n")
    repo.git.add(name)
    repo.git.commit("-m", f"write {name}")


def record_gitlink(repo: git.Repo, path: str, sha: str) -> None:
    """Record `path` as a gitlink at `sha`, as a vendored tree carries one.

    No `.gitmodules` entry is needed for git to treat it as a submodule.
    """
    repo.git.update_index("--add", "--cacheinfo", f"160000,{sha},{path}")


def embed(repo: git.Repo, path: str) -> git.Repo:
    """A repository checked out at `path` inside `repo`, committed as a gitlink."""
    inner = make_repo(root_of(repo) / path)
    record_gitlink(repo, path, inner.head.commit.hexsha)
    repo.git.commit("-m", f"add {path}")
    return inner


async def call(
    name: str, arguments: dict[str, Any], repository: Path | None = None
) -> dict[str, Any]:
    async with connect(repository) as session:
        return wire(await session.call_tool(name, arguments))


# --------------------------------------------------------------------------
# A nested git diff (diff.submodule=diff)
# --------------------------------------------------------------------------


def moved_submodule(repo: git.Repo, tool: str) -> git.Repo:
    """A submodule `sm` whose commit differs where `tool` compares.

    The working tree's submodule is always at its second commit. The index
    records the first for git_diff_unstaged and git_diff (against HEAD); for
    git_diff_staged the index records the second and HEAD the first.
    """
    sm = embed(repo, "sm")  # HEAD and the index record the first commit
    commit_file(sm, "test.txt", "changed\n")
    if tool == "git_diff_staged":
        record_gitlink(repo, "sm", sm.head.commit.hexsha)
    repo.git.config("diff.submodule", "diff")
    return sm


DIFF_TOOLS = [
    ("git_diff_unstaged", {}),
    ("git_diff_staged", {}),
    ("git_diff", {"target": "HEAD"}),
]


@posix_only
@pytest.mark.parametrize("program", ["external", "textconv"])
@pytest.mark.parametrize("with_repository", [False, True])
@pytest.mark.parametrize(("tool", "arguments"), DIFF_TOOLS)
async def test_submodule_diff_programs_never_run(
    repo: git.Repo,
    canary: Canary,
    tool: str,
    arguments: dict[str, Any],
    with_repository: bool,
    program: str,
):
    sm = moved_submodule(repo, tool)
    if program == "external":
        sm.git.config("diff.external", canary.command("external"))
    else:
        (root_of(sm) / ".git" / "info" / "attributes").write_text("*.txt diff=evil\n")
        sm.git.config("diff.evil.textconv", canary.command("textconv"))
    sm.close()
    path = root_of(repo)

    result = await call(
        tool,
        {"repo_path": str(path), **arguments},
        path if with_repository else None,
    )

    assert result["isError"] is False, result
    # The submodule is still reported, as a moved commit.
    assert "Subproject commit" in result["content"][0]["text"], result
    assert canary.runs() == []


@posix_only
async def test_git_diff_between_commits_never_runs_submodule_programs(
    repo: git.Repo, canary: Canary
):
    # The report's own case: a range over a commit that moved the submodule.
    sm = moved_submodule(repo, "git_diff")
    record_gitlink(repo, "sm", sm.head.commit.hexsha)
    repo.git.commit("-m", "bump sm")
    sm.git.config("diff.external", canary.command("external"))
    sm.close()

    result = await call(
        "git_diff", {"repo_path": str(root_of(repo)), "target": "HEAD~1"}
    )

    assert result["isError"] is False, result
    assert canary.runs() == []


# --------------------------------------------------------------------------
# A nested git status (git_add ["."], git_checkout)
# --------------------------------------------------------------------------


def filtered_submodule(repo: git.Repo, canary: Canary, path: str) -> None:
    """A checked-out submodule at `path` whose own config defines a filter.

    Its `.gitattributes` applies the filter to `test.txt`, whose mtime is then
    changed so git must read the file again, through the filter, to see
    whether the submodule is dirty.
    """
    sm = embed(repo, path)
    commit_file(sm, ".gitattributes", "*.txt filter=evil\n")
    record_gitlink(repo, path, sm.head.commit.hexsha)
    repo.git.commit("-m", f"bump {path}")
    sm.git.config("filter.evil.clean", canary.command("filter"))
    sm.git.config("filter.evil.smudge", canary.command("filter"))
    sm.close()
    os.utime(root_of(repo) / path / "test.txt", (1_000_000_000, 1_000_000_000))


@posix_only
@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("git_add", {"files": ["."]}),
        ("git_checkout", {"branch_name": "same"}),
    ],
)
async def test_submodule_filters_never_run(
    repo: git.Repo, canary: Canary, tool: str, arguments: dict[str, Any]
):
    filtered_submodule(repo, canary, "sm")
    repo.git.branch("same")
    path = root_of(repo)

    result = await call(tool, {"repo_path": str(path), **arguments}, path)

    assert result["isError"] is False, result
    assert canary.runs() == []


@posix_only
async def test_nested_submodule_filters_never_run(repo: git.Repo, canary: Canary):
    # A submodule inside a submodule: git descends, and so does the listing.
    outer = embed(repo, "outer")
    filtered_submodule(outer, canary, "inner")
    record_gitlink(repo, "outer", outer.head.commit.hexsha)
    repo.git.commit("-m", "bump outer")
    outer.close()

    result = await call("git_add", {"repo_path": str(root_of(repo)), "files": ["."]})

    assert result["isError"] is False, result
    assert canary.runs() == []


@posix_only
async def test_checkout_never_looks_inside_a_submodule_the_branch_adds(
    repo: git.Repo, canary: Canary
):
    # The current branch has no gitlink at `vendor`, so hardening does not
    # list its drivers; the target branch records one. git_checkout must not
    # look inside it once the new index is written.
    vendor = make_repo(root_of(repo) / "vendor")
    commit_file(vendor, ".gitattributes", "*.txt filter=evil\n")
    vendor.git.config("filter.evil.clean", canary.command("filter"))
    sha = vendor.head.commit.hexsha
    vendor.close()
    repo.git.checkout("-q", "-b", "with-vendor")
    record_gitlink(repo, "vendor", sha)
    repo.git.commit("-m", "add vendor")
    repo.git.checkout("-q", "main")
    os.utime(root_of(repo) / "vendor" / "test.txt", (1_000_000_000, 1_000_000_000))
    path = root_of(repo)

    result = await call(
        "git_checkout", {"repo_path": str(path), "branch_name": "with-vendor"}, path
    )

    assert result["isError"] is False, result
    assert canary.runs() == []


async def test_git_add_still_stages_a_moved_submodule(repo: git.Repo):
    sm = embed(repo, "sm")
    commit_file(sm, "test.txt", "changed\n")
    moved = sm.head.commit.hexsha
    sm.close()

    result = await call("git_add", {"repo_path": str(root_of(repo)), "files": ["."]})

    assert result["isError"] is False, result
    assert repo.git.ls_files("--stage", "sm").split()[1] == moved


# --------------------------------------------------------------------------
# _submodule_drivers
# --------------------------------------------------------------------------


def test_lists_the_drivers_of_each_checked_out_submodule(
    tmp_path: Path, repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    global_config = tmp_path / "global-config"
    global_config.write_text('[filter "lfs"]\n\tclean = lfs-clean\n')
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(global_config))
    sm = embed(repo, "sm")
    sm.git.config("filter.evil.clean", "x")
    sm.git.config("merge.evil.driver", "x")
    sm.git.config("core.hooksPath", "hooks")
    sm.close()

    # The user's own driver and the submodule's hooksPath are not listed.
    assert _submodule_drivers(repo) == {"filter.evil.clean", "merge.evil.driver"}

    harden_repo(repo)
    sm = git.Repo(root_of(repo) / "sm")
    sm.git.update_environment(**repo.git.environment())
    assert sm.git.config("--get", "filter.evil.clean") == ""
    assert sm.git.config("--get", "merge.evil.driver") == ""
    assert sm.git.config("--get", "filter.lfs.clean") == "lfs-clean"
    sm.close()


def test_skips_gitlinks_git_does_not_look_inside(repo: git.Repo):
    sha = repo.head.commit.hexsha
    # Not checked out: an empty directory, and no directory at all.
    (root_of(repo) / "empty").mkdir()
    record_gitlink(repo, "empty", sha)
    record_gitlink(repo, "absent", sha)
    # A `.git` that names no repository: git cannot open it, nor can the
    # nested git, so nothing runs there.
    (root_of(repo) / "broken").mkdir()
    (root_of(repo) / "broken" / ".git").write_text("gitdir: /nonexistent\n")
    record_gitlink(repo, "broken", sha)

    assert _submodule_drivers(repo) == set()


def test_visits_a_submodule_once(repo: git.Repo):
    # A gitlink that resolves to a repository already visited (here, through
    # a symlink to the submodule) is not listed again, so a link back to an
    # ancestor cannot loop.
    sm = embed(repo, "sm")
    sm.git.config("filter.evil.clean", "x")
    sm.close()
    try:
        (root_of(repo) / "again").symlink_to(root_of(repo) / "sm")
    except OSError:
        pytest.skip("symlinks are not available")
    record_gitlink(repo, "again", repo.head.commit.hexsha)

    assert _submodule_drivers(repo) == {"filter.evil.clean"}


def test_bare_repository_has_no_submodules(tmp_path: Path):
    bare = git.Repo.init(tmp_path / "bare.git", bare=True)
    assert _submodule_drivers(bare) == set()
    bare.close()


def test_skips_a_submodule_whose_index_git_cannot_read(repo: git.Repo):
    # One broken submodule does not stop every tool: the nested git cannot
    # read that index either, so it runs nothing there.
    sm = embed(repo, "sm")
    sm.git.config("filter.evil.clean", "x")
    sm.close()
    (root_of(repo) / "sm" / ".git" / "index").write_bytes(b"not an index")

    assert _submodule_drivers(repo) == {"filter.evil.clean"}


async def test_tools_still_work_beside_a_broken_submodule(repo: git.Repo):
    embed(repo, "sm").close()
    (root_of(repo) / "sm" / ".git" / "index").write_bytes(b"not an index")

    result = await call("git_status", {"repo_path": str(root_of(repo))})

    assert result["isError"] is False, result


def test_opens_a_submodule_as_the_nested_git_does(
    tmp_path: Path, repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # The nested git opens a submodule with GIT_DIR=.git, which skips the
    # ownership check; so does the listing. Simulated here: every repository
    # is taken to belong to someone else, and only the opened one is trusted.
    sm = embed(repo, "sm")
    sm.git.config("filter.evil.clean", "x")
    sm.close()
    global_config = tmp_path / "global-config"
    global_config.write_text(f"[safe]\n\tdirectory = {root_of(repo).as_posix()}\n")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(global_config))
    # The system configuration can trust every directory (GitHub's runner
    # images set `safe.directory = *` there), which would hide the check.
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.setenv("GIT_TEST_ASSUME_DIFFERENT_OWNER", "1")
    with pytest.raises(git.GitCommandError, match="dubious ownership"):
        git.Git(root_of(repo) / "sm").ls_files()

    assert _submodule_drivers(repo) == {"filter.evil.clean"}


def test_refuses_git_older_than_2_33_with_a_checked_out_submodule(
    repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # Git 2.31 and 2.32 do not pass GIT_CONFIG_COUNT to the git they run
    # inside a submodule, so the overrides would not reach it.
    embed(repo, "sm").close()
    monkeypatch.setattr(git.Git, "version_info", property(lambda self: (2, 32, 0)))
    with pytest.raises(git.GitError, match="Git 2.33 or later is required"):
        harden_repo(repo)


def test_older_git_works_without_a_checked_out_submodule(
    repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # Without a checked-out submodule git never runs inside one, so 2.31 and
    # 2.32 are still served; a gitlink with nothing checked out is fine too.
    record_gitlink(repo, "absent", repo.head.commit.hexsha)
    monkeypatch.setattr(git.Git, "version_info", property(lambda self: (2, 32, 0)))
    harden_repo(repo)
    assert repo.git.config("--get", "core.hooksPath") == os.devnull
