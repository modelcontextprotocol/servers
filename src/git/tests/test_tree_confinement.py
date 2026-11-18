"""Under `--repository`, a tool call's own writes cannot move where git works.

`open_repo` checks the directories git uses (`validate_opened_repo`) once,
when a call opens the repository. But a repository's configuration can depend
on its working tree: a `.git/config` that is a link to a tracked file changes
whenever a merge or a checkout rewrites that file. A branch that adds
`core.worktree = <a directory outside>` to it so moves the working tree in
the middle of a call, and the git commands the call runs next (the
`git merge --abort` after a conflict, which writes files) would work in that
directory (#5599, the follow-up to GHSA-9vjp-x34c-xg6v). Every tree-writing
command goes through `_rewrite_tree`, which runs the check again before any
other git command, and stops the call when the repository no longer passes.

The tests drive the real server through a client and assert that a directory
outside the allowed repository is left exactly as it was. They link
`.git/config` to a tracked file, so they skip on Windows, where creating a
symbolic link needs a privilege; the tests of `_rewrite_tree` itself run
everywhere.
"""

import os
import sys
from pathlib import Path
from unittest import mock

import git
import pytest
from conftest import connect, make_repo, wire
from test_repository_config import root_of

from mcp_server_git import server
from mcp_server_git.server import _rewrite_tree, git_checkout

needs_symlinks = pytest.mark.skipif(
    sys.platform == "win32", reason="creating a symbolic link needs a privilege"
)

STOPPED = (
    "Error executing tool {tool}: Stopped: after git {command} changed the "
    "working tree, the repository no longer passes the --repository check. The "
    "working tree was left as git {command} wrote it (a merge may still be in "
    "progress), and no further git command was run: Repository path '{root}' "
    "uses '{outside}', which is outside the allowed repository '{root}'"
)


def outside_dir(tmp_path: Path) -> Path:
    """A directory beside the repository, holding a file named like a tracked one."""
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "m.txt").write_text("not the repository's\n")
    return outside


def contents(directory: Path) -> dict[str, str]:
    return {p.name: p.read_text() for p in directory.iterdir()}


def worktree_config(repo: git.Repo, outside: Path) -> str:
    """The repository's configuration, with `core.worktree` naming `outside`."""
    original = (Path(repo.git_dir) / "config").read_text()
    return f"{original}[core]\n\tworktree = {outside.as_posix()}\n"


def track_config(repo: git.Repo) -> None:
    """Commit `m.txt` and `repo.cfg`, a copy of the repository's configuration."""
    root = root_of(repo)
    (root / "m.txt").write_text("base\n")
    (root / "repo.cfg").write_text((Path(repo.git_dir) / "config").read_text())
    repo.index.add(["m.txt", "repo.cfg"])
    repo.index.commit("base")


def link_config(repo: git.Repo) -> None:
    """Make `.git/config` a link to the tracked `repo.cfg`.

    The link stays inside the repository, so the check at open allows it.
    """
    config = Path(repo.git_dir) / "config"
    config.unlink()
    os.symlink(root_of(repo) / "repo.cfg", config)


def feature_moves_the_worktree(repo: git.Repo, outside: Path) -> None:
    """Branch `feature` changes m.txt and adds `core.worktree` to repo.cfg."""
    root = root_of(repo)
    moved = worktree_config(repo, outside)
    repo.git.checkout("-b", "feature")
    (root / "m.txt").write_text("theirs\n")
    (root / "repo.cfg").write_text(moved)
    repo.index.add(["m.txt", "repo.cfg"])
    repo.index.commit("theirs")
    repo.git.checkout("main")


async def call(repo: git.Repo, tool: str, **arguments: object) -> dict[str, object]:
    root = root_of(repo)
    async with connect(root) as session:
        result = await session.call_tool(tool, {"repo_path": str(root), **arguments})
    return wire(result)


def stopped(
    repo: git.Repo, outside: Path, tool: str, command: str
) -> dict[str, object]:
    text = STOPPED.format(
        tool=tool, command=command, root=root_of(repo), outside=outside.resolve()
    )
    return {"content": [{"type": "text", "text": text}], "isError": True}


@needs_symlinks
@pytest.mark.anyio
async def test_a_conflicting_merge_that_moves_the_worktree_is_not_aborted_outside(
    tmp_path: Path,
) -> None:
    outside = outside_dir(tmp_path)
    before = contents(outside)
    repo = make_repo(tmp_path / "repo")
    root = root_of(repo)
    track_config(repo)
    feature_moves_the_worktree(repo, outside)
    (root / "m.txt").write_text("ours\n")
    repo.index.add(["m.txt"])
    repo.index.commit("ours")
    link_config(repo)

    result = await call(
        repo, "git_merge", source_branch="feature", fast_forward_only=False
    )

    # Without the second check, `git merge --abort` ran with the working tree
    # at `outside`: it overwrote m.txt there and wrote repo.cfg beside it.
    assert contents(outside) == before
    assert result == stopped(repo, outside, "git_merge", "merge")
    # Neither `git diff` nor `git merge --abort` ran: the merge is as git left it.
    assert (Path(repo.git_dir) / "MERGE_HEAD").exists()
    repo.close()


@needs_symlinks
@pytest.mark.anyio
async def test_a_fast_forward_that_moves_the_worktree_is_reported(
    tmp_path: Path,
) -> None:
    outside = outside_dir(tmp_path)
    before = contents(outside)
    repo = make_repo(tmp_path / "repo")
    track_config(repo)
    feature_moves_the_worktree(repo, outside)
    link_config(repo)

    result = await call(repo, "git_merge", source_branch="feature")

    assert contents(outside) == before
    assert result == stopped(repo, outside, "git_merge", "merge")
    repo.close()


@needs_symlinks
@pytest.mark.anyio
async def test_a_checkout_that_moves_the_worktree_is_reported(tmp_path: Path) -> None:
    outside = outside_dir(tmp_path)
    before = contents(outside)
    repo = make_repo(tmp_path / "repo")
    track_config(repo)
    feature_moves_the_worktree(repo, outside)
    link_config(repo)

    result = await call(repo, "git_checkout", branch_name="feature")

    assert contents(outside) == before
    assert result == stopped(repo, outside, "git_checkout", "checkout")
    repo.close()


@needs_symlinks
@pytest.mark.anyio
async def test_an_autostash_that_moves_the_worktree_is_reported(tmp_path: Path) -> None:
    outside = outside_dir(tmp_path)
    before = contents(outside)
    repo = make_repo(tmp_path / "repo")
    root = root_of(repo)
    track_config(repo)
    repo.git.checkout("-b", "feature")
    (root / "m.txt").write_text("theirs\n")
    repo.index.add(["m.txt"])
    repo.index.commit("theirs")
    repo.git.checkout("main")
    # A merge left for git_commit to conclude, whose autostash holds the
    # change to repo.cfg. The configuration is not linked to it yet, so the
    # setup's own git commands stay in the repository.
    (root / "repo.cfg").write_text(worktree_config(repo, outside))
    repo.git.merge("--autostash", "--no-ff", "--no-commit", "feature")
    autostash = Path(repo.git_dir) / "MERGE_AUTOSTASH"
    assert autostash.exists()
    link_config(repo)

    result = await call(repo, "git_commit", message="merge feature")

    assert contents(outside) == before
    assert result == stopped(repo, outside, "git_commit", "stash")
    # Nothing ran after `git stash apply`: the autostash was not cleared.
    assert autostash.exists()
    repo.close()


@pytest.mark.anyio
async def test_an_ordinary_repository_merges_and_checks_out_as_before(
    tmp_path: Path,
) -> None:
    repo = make_repo(tmp_path / "repo")
    root = root_of(repo)
    repo.git.checkout("-b", "feature")
    (root / "new.txt").write_text("new\n")
    repo.index.add(["new.txt"])
    commit = repo.index.commit("new")
    repo.git.checkout("main")

    merged = await call(repo, "git_merge", source_branch="feature")
    switched = await call(repo, "git_checkout", branch_name="feature")

    text = f"Fast-forwarded 'main' to 'feature' ({commit.hexsha[:7]})"
    assert merged["content"] == [{"type": "text", "text": text}]
    assert switched["content"] == [
        {"type": "text", "text": "Switched to branch 'feature'"}
    ]
    repo.close()


def test_without_an_allowed_repository_nothing_is_checked(repo: git.Repo) -> None:
    repo.git.branch("feature")
    with mock.patch.object(server, "validate_opened_repo") as validate:
        assert git_checkout(repo, "feature") == "Switched to branch 'feature'"
    validate.assert_not_called()


@pytest.mark.parametrize(
    "failure",
    [
        # A git command of the check itself failing: reported as a GitError
        # that is not a GitCommandError, which git_merge's cleanup would catch.
        git.GitCommandError(["git", "rev-parse"], 128),
        ValueError("uses '/elsewhere', which is outside the allowed repository"),
        OSError("a git directory that cannot be listed"),
    ],
)
def test_a_failed_check_stops_the_call(repo: git.Repo, failure: Exception) -> None:
    with (
        mock.patch.object(server, "validate_opened_repo", side_effect=failure),
        pytest.raises(git.GitError) as raised,
    ):
        _rewrite_tree(repo, "status", allowed_repository=root_of(repo))
    assert not isinstance(raised.value, git.GitCommandError)
    assert raised.value.__cause__ is failure
    assert "no longer passes the --repository check" in str(raised.value)
    assert "after git status changed the working tree" in str(raised.value)
