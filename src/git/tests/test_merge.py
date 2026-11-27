"""Protocol-level tests for the git_merge tool (#659).

git_merge merges a source into the current branch and either succeeds or
leaves the repository exactly as it was: it refuses a dirty tree, a detached
HEAD and a merge already in progress, allows only a fast-forward unless told
otherwise, and aborts a merge that stops on conflicts. Each test drives the
real server through a client (`conftest.connect`) and checks both the reply
and the repository afterwards.
"""

import os
import unicodedata
from pathlib import Path
from typing import Any

import git
import pytest
from conftest import connect, text_result, tool_error, wire

from mcp_server_git.server import _merge_failure


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


def test_failed_merge_commit_is_aborted(repo: git.Repo):
    # A merge with no conflicts can still fail to commit (a ref lock held by
    # another process, say), which leaves MERGE_HEAD behind. No hook can make
    # it fail here, since the server runs none, so the merge is stopped before
    # its commit with --no-commit and the failure is handed to _merge_failure.
    diverge(repo, conflicting=False)
    head = repo.head.commit.hexsha
    repo.git.merge("--no-ff", "--no-commit", "feature")
    assert (Path(repo.git_dir) / "MERGE_HEAD").exists()
    error = git.GitCommandError(["git", "merge"], 128, "fatal: merge refused")

    message = _merge_failure(repo, error, "Merge of 'feature' into 'main'")

    assert message == (
        "Merge of 'feature' into 'main' failed. The merge was aborted and the "
        "repository is unchanged. Git reported:\nfatal: merge refused"
    )
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


def ignored_local(repo: git.Repo, ignore: str, tracked: dict[str, str]) -> str:
    """Ignore `ignore` on main, track `tracked` on a diverged `feature`.

    Leaves `main` checked out with one commit of its own, so merging
    `feature` makes a merge commit. Returns main's head sha.
    """
    commit_file(repo, ".gitignore", ignore)
    repo.git.checkout("-b", "feature")
    for name, content in tracked.items():
        path = root_of(repo) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, newline="\n")
        repo.git.add("-f", name)
    repo.index.commit("track ignored paths")
    repo.git.checkout("main")
    return commit_file(repo, "main.txt", "main\n").hexsha


async def test_merge_commit_refuses_to_overwrite_an_ignored_file(repo: git.Repo):
    # Git does not honor --no-overwrite-ignore when it makes a merge commit,
    # so the tool checks the incoming paths itself before git runs.
    head = ignored_local(repo, ".env\n", {".env": "tracked\n"})
    (root_of(repo) / ".env").write_text("SECRET=local\n")

    result = await merge(repo, "feature", fast_forward_only=False)

    assert result == tool_error(
        "git_merge",
        "Merge of 'feature' into 'main' refused: it would overwrite ignored "
        "local files: .env. Nothing was changed. Move or remove them first.",
    )
    assert repo.head.commit.hexsha == head
    assert not (Path(repo.git_dir) / "MERGE_HEAD").exists()
    assert (root_of(repo) / ".env").read_text() == "SECRET=local\n"


async def test_merge_commit_refuses_ignored_files_in_a_directory_it_replaces(
    repo: git.Repo,
):
    # The source tracks a file where an ignored directory is, and a file
    # under an ignored file: both would destroy the ignored content.
    head = ignored_local(
        repo, "cache\nlocal.cfg\n", {"cache": "file\n", "local.cfg/x": "x\n"}
    )
    (root_of(repo) / "cache").mkdir()
    (root_of(repo) / "cache" / "data").write_text("keep\n")
    (root_of(repo) / "local.cfg").write_text("keep\n")

    result = await merge(repo, "feature", fast_forward_only=False)

    assert result == tool_error(
        "git_merge",
        "Merge of 'feature' into 'main' refused: it would overwrite ignored "
        "local files: cache/data, local.cfg. Nothing was changed. Move or "
        "remove them first.",
    )
    assert repo.head.commit.hexsha == head
    assert (root_of(repo) / "cache" / "data").read_text() == "keep\n"
    assert (root_of(repo) / "local.cfg").read_text() == "keep\n"


async def test_merge_commit_into_an_ignored_directory_is_allowed(repo: git.Repo):
    # A new file inside an ignored directory replaces nothing that is there.
    ignored_local(repo, "build/\n", {"build/tracked.txt": "tracked\n"})
    (root_of(repo) / "build").mkdir()
    (root_of(repo) / "build" / "local.txt").write_text("keep\n")

    result = await merge(repo, "feature", fast_forward_only=False)

    assert result == text_result(
        f"Merged 'feature' into 'main' with merge commit {repo.head.commit.hexsha[:7]}"
    )
    assert (root_of(repo) / "build" / "local.txt").read_text() == "keep\n"
    assert (root_of(repo) / "build" / "tracked.txt").read_text() == "tracked\n"


def refused(*paths: str) -> dict[str, Any]:
    return tool_error(
        "git_merge",
        "Merge of 'feature' into 'main' refused: it would overwrite ignored "
        f"local files: {', '.join(paths)}. Nothing was changed. Move or remove "
        "them first.",
    )


@pytest.mark.parametrize("renames", [None, "true"])
async def test_merge_commit_does_not_follow_a_directory_rename_onto_an_ignored_file(
    repo: git.Repo, renames: str | None
):
    # HEAD renamed d/ to e/ since the fork, and the source adds d/new. With
    # directory-rename detection git would write e/new, a path in neither
    # tree; the tool turns it off, so the file lands at d/new.
    commit_file(repo, ".gitignore", "new\n")
    (root_of(repo) / "d").mkdir()
    commit_file(repo, "d/kept.txt", "kept\n")
    repo.git.checkout("-b", "feature")
    commit_file(repo, "d/new", "feature\n")
    repo.git.checkout("main")
    repo.git.mv("d", "e")
    repo.index.commit("rename d to e")
    if renames is not None:
        with repo.config_writer() as config:
            config.set_value("merge", "directoryRenames", renames)
    (root_of(repo) / "e" / "new").write_text("LOCAL\n")

    result = await merge(repo, "feature", fast_forward_only=False)

    assert result == text_result(
        f"Merged 'feature' into 'main' with merge commit {repo.head.commit.hexsha[:7]}"
    )
    assert (root_of(repo) / "e" / "new").read_text() == "LOCAL\n"
    assert (root_of(repo) / "d" / "new").read_text() == "feature\n"


async def test_merge_commit_refuses_an_ignored_file_at_a_file_directory_side_name(
    repo: git.Repo,
):
    # HEAD tracks a file p where the source tracks a directory p/: git moves
    # HEAD's file to p~HEAD, which would replace an ignored file of that name.
    commit_file(repo, ".gitignore", "*~*\n")
    repo.git.checkout("-b", "feature")
    (root_of(repo) / "p").mkdir()
    commit_file(repo, "p/x", "feature\n")
    repo.git.checkout("main")
    head = commit_file(repo, "p", "main\n").hexsha
    (root_of(repo) / "p~HEAD").write_text("LOCAL\n")

    assert await merge(repo, "feature", fast_forward_only=False) == refused("p~HEAD")
    assert repo.head.commit.hexsha == head
    assert (root_of(repo) / "p~HEAD").read_text() == "LOCAL\n"


async def test_merge_commit_refuses_an_ignored_file_at_the_source_side_name(
    repo: git.Repo,
):
    # The other way round: the source's file q moves to q~<source sha>.
    commit_file(repo, ".gitignore", "*~*\n")
    repo.git.checkout("-b", "feature")
    sha = commit_file(repo, "q", "feature\n").hexsha
    repo.git.checkout("main")
    (root_of(repo) / "q").mkdir()
    head = commit_file(repo, "q/y", "main\n").hexsha
    (root_of(repo) / f"q~{sha}").write_text("LOCAL\n")

    assert await merge(repo, "feature", fast_forward_only=False) == refused(f"q~{sha}")
    assert repo.head.commit.hexsha == head
    assert (root_of(repo) / f"q~{sha}").read_text() == "LOCAL\n"


def spelling_insensitive(directory: Path, stored: str, other: str) -> bool:
    """Whether the filesystem under `directory` finds `stored` as `other`."""
    probe = directory / stored
    probe.write_text("")
    try:
        return (directory / other).exists() and other not in os.listdir(directory)
    finally:
        probe.unlink()


NFC = unicodedata.normalize("NFC", "caf\u00e9.env")
NFD = unicodedata.normalize("NFD", NFC)


@pytest.mark.parametrize(
    ("local", "tracked"), [(".env", ".ENV"), (NFC, NFD)], ids=["case", "unicode"]
)
async def test_merge_commit_refuses_an_ignored_file_spelled_differently(
    repo: git.Repo, local: str, tracked: str
):
    # On a case- or normalization-insensitive filesystem the source's spelling
    # names the same file; the check matches it by identity, not by name.
    if not spelling_insensitive(root_of(repo), local, tracked):
        pytest.skip("the filesystem tells these spellings apart")
    commit_file(repo, ".gitignore", "*.env\n.env\n")
    repo.git.checkout("-b", "feature")
    (root_of(repo) / tracked).write_text("feature\n")
    repo.git.add("-f", "--", tracked)
    repo.index.commit("track")
    (root_of(repo) / tracked).unlink()
    repo.git.checkout("main")
    head = commit_file(repo, "main.txt", "main\n").hexsha
    (root_of(repo) / local).write_text("LOCAL\n")

    result = await merge(repo, "feature", fast_forward_only=False)

    assert result["isError"] is True
    assert (
        "refused: it would overwrite ignored local files"
        in (result["content"][0]["text"])
    )
    assert repo.head.commit.hexsha == head
    assert (root_of(repo) / local).read_text() == "LOCAL\n"


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
