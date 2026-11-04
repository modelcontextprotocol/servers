"""Protocol-level tests for the git_merge tool (#659).

git_merge merges a source into the current branch and either succeeds or
leaves the repository exactly as it was: it refuses a dirty tree, a detached
HEAD and a merge already in progress, allows only a fast-forward unless told
otherwise, and aborts a merge that stops on conflicts. Each test drives the
real server through a client (`conftest.connect`) and checks both the reply
and the repository afterwards.
"""

import stat
import sys
from pathlib import Path
from typing import Any

import git
import pytest

from conftest import connect, text_result, tool_error, wire


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


async def merge(
    repo: git.Repo, source: str, *, repository: Path | None = None, **extra: Any
) -> dict[str, Any]:
    async with connect(repository) as session:
        return wire(
            await session.call_tool(
                "git_merge",
                {"repo_path": str(root_of(repo)), "source_branch": source, **extra},
            )
        )


def commit_file(repo: git.Repo, name: str, content: str) -> git.Commit:
    (root_of(repo) / name).write_text(content, newline="\n")
    repo.index.add([name])
    return repo.index.commit(f"write {name}")


def diverge(repo: git.Repo, *, conflicting: bool) -> None:
    """Give `feature` and `main` one commit each since they forked.

    With `conflicting`, both change test.txt; otherwise they touch different
    files. Leaves `main` checked out.
    """
    repo.git.checkout("-b", "feature")
    commit_file(repo, "test.txt" if conflicting else "feature.txt", "feature\n")
    repo.git.checkout("main")
    commit_file(repo, "test.txt" if conflicting else "main.txt", "main\n")


def assert_untouched(repo: git.Repo, head: str) -> None:
    assert repo.head.commit.hexsha == head
    assert repo.active_branch.name == "main"
    assert not (Path(repo.git_dir) / "MERGE_HEAD").exists()
    assert not repo.is_dirty(untracked_files=True)


async def test_fast_forward(repo: git.Repo):
    repo.git.checkout("-b", "feature")
    tip = commit_file(repo, "feature.txt", "feature\n")
    repo.git.checkout("main")

    result = await merge(repo, "feature")

    assert result == text_result(
        f"Fast-forwarded 'main' to 'feature' ({tip.hexsha[:7]})"
    )
    assert repo.active_branch.name == "main"
    assert repo.head.commit == tip
    assert (root_of(repo) / "feature.txt").read_text() == "feature\n"


async def test_repeating_a_merge_changes_nothing(repo: git.Repo):
    # Why the tool is annotated idempotent: once merged, the source is an
    # ancestor of HEAD, so the same call again is a no-op.
    repo.git.checkout("-b", "feature")
    commit_file(repo, "feature.txt", "feature\n")
    repo.git.checkout("main")
    await merge(repo, "feature")
    head = repo.head.commit.hexsha

    assert await merge(repo, "feature") == text_result(
        "Already up to date: 'main' already contains 'feature'"
    )
    assert_untouched(repo, head)


async def test_diverged_with_fast_forward_only_is_refused(repo: git.Repo):
    diverge(repo, conflicting=False)
    head = repo.head.commit.hexsha

    assert await merge(repo, "feature") == tool_error(
        "git_merge",
        "Cannot fast-forward 'main' to 'feature': the branches have diverged. "
        "Nothing was changed. Pass fast_forward_only=false to create a merge "
        "commit.",
    )
    assert_untouched(repo, head)


async def test_diverged_without_fast_forward_only_creates_merge_commit(
    repo: git.Repo,
):
    diverge(repo, conflicting=False)
    main_tip = repo.head.commit
    feature_tip = repo.commit("feature")

    result = await merge(repo, "feature", fast_forward_only=False)

    merged = repo.head.commit
    assert result == text_result(
        f"Merged 'feature' into 'main' with merge commit {merged.hexsha[:7]}"
    )
    assert merged.parents == (main_tip, feature_tip)
    assert repo.active_branch.name == "main"
    assert not repo.is_dirty(untracked_files=True)
    assert (root_of(repo) / "feature.txt").exists()


async def test_fast_forward_still_fast_forwards_when_merge_commits_allowed(
    repo: git.Repo,
):
    # merge.ff=false in the config would make a merge commit; the tool passes
    # --ff, so a fast-forward stays a fast-forward.
    with repo.config_writer() as config:
        config.set_value("merge", "ff", "false")
    repo.git.checkout("-b", "feature")
    tip = commit_file(repo, "feature.txt", "feature\n")
    repo.git.checkout("main")

    result = await merge(repo, "feature", fast_forward_only=False)

    assert result == text_result(
        f"Fast-forwarded 'main' to 'feature' ({tip.hexsha[:7]})"
    )
    assert repo.head.commit == tip


async def test_conflict_is_aborted_and_reported(repo: git.Repo):
    diverge(repo, conflicting=True)
    head = repo.head.commit.hexsha

    assert await merge(repo, "feature", fast_forward_only=False) == tool_error(
        "git_merge",
        "Merge of 'feature' into 'main' stopped on conflicts in: test.txt. "
        "The merge was aborted and the repository is unchanged. "
        "Resolve the conflicts by hand.",
    )
    assert_untouched(repo, head)
    assert (root_of(repo) / "test.txt").read_text() == "main\n"


async def test_conflict_in_non_ascii_file_names_it_as_written(repo: git.Repo):
    name = "日本語.txt"
    commit_file(repo, name, "base\n")
    repo.git.checkout("-b", "feature")
    commit_file(repo, name, "feature\n")
    repo.git.checkout("main")
    commit_file(repo, name, "main\n")
    head = repo.head.commit.hexsha

    assert await merge(repo, "feature", fast_forward_only=False) == tool_error(
        "git_merge",
        f"Merge of 'feature' into 'main' stopped on conflicts in: {name}. "
        "The merge was aborted and the repository is unchanged. "
        "Resolve the conflicts by hand.",
    )
    assert_untouched(repo, head)


async def test_merge_commit_message_names_the_source(repo: git.Repo):
    diverge(repo, conflicting=False)

    await merge(repo, "feature", fast_forward_only=False)

    assert repo.head.commit.message.strip() == "Merge 'feature' into 'main'"


async def test_fetch_head_merges_only_the_commit_it_resolves_to(repo: git.Repo):
    # FETCH_HEAD can list several heads, and `git merge FETCH_HEAD` would
    # merge them all as an octopus. The tool merges only the one it resolved.
    repo.git.checkout("-b", "first")
    first = commit_file(repo, "first.txt", "first\n")
    repo.git.checkout("-b", "second", "main")
    second = commit_file(repo, "second.txt", "second\n")
    repo.git.checkout("main")
    (Path(repo.git_dir) / "FETCH_HEAD").write_text(
        f"{first.hexsha}\t\tbranch 'first' of origin\n"
        f"{second.hexsha}\t\tbranch 'second' of origin\n"
    )

    result = await merge(repo, "FETCH_HEAD", fast_forward_only=False)

    assert result == text_result(
        f"Fast-forwarded 'main' to 'FETCH_HEAD' ({first.hexsha[:7]})"
    )
    assert repo.head.commit == first
    assert not (root_of(repo) / "second.txt").exists()


@pytest.mark.skipif(
    sys.platform == "win32", reason="git for Windows runs hooks through sh"
)
async def test_failed_merge_commit_is_aborted(repo: git.Repo):
    # A merge with no conflicts can still fail to commit; here a
    # pre-merge-commit hook refuses it, which leaves MERGE_HEAD behind.
    diverge(repo, conflicting=False)
    head = repo.head.commit.hexsha
    hook = Path(repo.git_dir) / "hooks" / "pre-merge-commit"
    hook.parent.mkdir(exist_ok=True)
    hook.write_text("#!/bin/sh\necho 'merge refused by hook' >&2\nexit 1\n")
    hook.chmod(hook.stat().st_mode | stat.S_IEXEC)

    result = await merge(repo, "feature", fast_forward_only=False)

    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert text.startswith(
        "Error executing tool git_merge: Merge of 'feature' into 'main' failed. "
        "The merge was aborted and the repository is unchanged. Git reported:\n"
    )
    assert "merge refused by hook" in text
    assert_untouched(repo, head)


async def test_git_refusal_before_merging_is_reported(repo: git.Repo):
    # An untracked file the merge would overwrite: git refuses before it
    # changes anything, so there is no merge state to abort.
    repo.git.checkout("-b", "feature")
    commit_file(repo, "new.txt", "feature\n")
    repo.git.checkout("main")
    head = repo.head.commit.hexsha
    (root_of(repo) / "new.txt").write_text("untracked\n")

    result = await merge(repo, "feature")

    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert text.startswith(
        "Error executing tool git_merge: Merge of 'feature' into 'main' failed. "
        "The merge was aborted and the repository is unchanged. Git reported:\n"
    )
    assert "untracked working tree files would be overwritten" in text
    assert repo.head.commit.hexsha == head
    assert (root_of(repo) / "new.txt").read_text() == "untracked\n"


async def test_ignored_file_the_source_tracks_is_not_overwritten(repo: git.Repo):
    # is_dirty() does not see an ignored file, and git overwrites one by
    # default; the tool passes --no-overwrite-ignore so git refuses instead.
    commit_file(repo, ".gitignore", ".env\n")
    repo.git.checkout("-b", "feature")
    (root_of(repo) / ".env").write_text("tracked\n")
    repo.git.add("-f", ".env")
    repo.index.commit("track .env")
    repo.git.checkout("main")
    head = repo.head.commit.hexsha
    (root_of(repo) / ".env").write_text("SECRET=local\n")

    result = await merge(repo, "feature")

    assert result["isError"] is True
    assert "would be overwritten by merge" in result["content"][0]["text"]
    assert repo.head.commit.hexsha == head
    assert (root_of(repo) / ".env").read_text() == "SECRET=local\n"


@pytest.mark.parametrize("options", ["--no-commit", "--squash"])
async def test_configured_merge_options_still_complete_the_merge(
    repo: git.Repo, options: str
):
    # branch.<name>.mergeOptions could make git stop short of a commit (or
    # squash); the tool overrides them, so a reported merge commit is real.
    diverge(repo, conflicting=False)
    with repo.config_writer() as config:
        config.set_value('branch "main"', "mergeOptions", options)
    main_tip = repo.head.commit
    feature_tip = repo.commit("feature")

    result = await merge(repo, "feature", fast_forward_only=False)

    merged = repo.head.commit
    assert result == text_result(
        f"Merged 'feature' into 'main' with merge commit {merged.hexsha[:7]}"
    )
    assert merged.parents == (main_tip, feature_tip)
    assert not (Path(repo.git_dir) / "MERGE_HEAD").exists()
    assert not repo.is_dirty(untracked_files=True)


async def test_dirty_working_tree_is_refused(repo: git.Repo):
    repo.git.checkout("-b", "feature")
    commit_file(repo, "feature.txt", "feature\n")
    repo.git.checkout("main")
    head = repo.head.commit.hexsha
    (root_of(repo) / "test.txt").write_text("edited\n")

    assert await merge(repo, "feature") == tool_error(
        "git_merge",
        "Cannot merge into 'main': the working tree has uncommitted changes. "
        "Commit or discard them first, so a failed merge can be undone cleanly.",
    )
    assert repo.head.commit.hexsha == head
    assert (root_of(repo) / "test.txt").read_text() == "edited\n"


async def test_merge_in_progress_is_refused(repo: git.Repo):
    diverge(repo, conflicting=False)
    repo.git.merge("--no-commit", "--no-ff", "feature")

    assert await merge(repo, "feature") == tool_error(
        "git_merge",
        "A merge is already in progress; conclude it with git_commit first",
    )
    assert (Path(repo.git_dir) / "MERGE_HEAD").exists()


async def test_detached_head_is_refused(repo: git.Repo):
    repo.git.checkout("--detach")

    assert await merge(repo, "main") == tool_error(
        "git_merge",
        "HEAD is detached; check out the branch to merge into first (git_checkout)",
    )


async def test_unborn_branch_is_refused(repo: git.Repo):
    repo.git.checkout("--orphan", "empty")
    repo.git.rm("-rf", "--cached", ".")

    assert await merge(repo, "main") == tool_error(
        "git_merge", "Branch 'empty' has no commits yet; nothing to merge into"
    )


async def test_unknown_source_is_error(repo: git.Repo):
    assert await merge(repo, "nope") == tool_error(
        "git_merge", "Ref 'nope' did not resolve to an object"
    )


async def test_source_that_is_not_a_commit_is_error(repo: git.Repo):
    result = await merge(repo, "HEAD^{tree}")
    assert result["isError"] is True
    assert repo.head.commit.hexsha == repo.commit("main").hexsha


async def test_rejects_flag_injection(repo: git.Repo):
    assert await merge(repo, "--abort") == tool_error(
        "git_merge", "Invalid source branch: '--abort' - cannot start with '-'"
    )


async def test_repo_path_outside_repository_is_refused(repo: git.Repo, tmp_path: Path):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    git.Repo.init(allowed).close()

    result = await merge(repo, "main", repository=allowed)

    assert result["isError"] is True
    assert "is outside the allowed repository" in result["content"][0]["text"]
