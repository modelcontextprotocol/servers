"""Configuration a tool call's own writes create is overridden like the rest.

`harden_repo` reads the repository's filter and merge drivers when a call
opens the repository, but the configuration can depend on the working tree:
an `[include]` path into it that git skips while the file is missing, a
`.git/config` that is a link to a tracked file, or an `includeIf
"onbranch:..."` that a checkout satisfies. A tool that writes the tree (a
merge, a checkout) can so define a driver mid-call, and the git commands it
runs next (a conflicting merge's `git diff` and `git merge --abort`) would run
it. Every tree-writing command goes through `_rewrite_tree`, which reads the
drivers again before anything else runs.

Each attack test plants a filter that records its run in a canary file
(`Payload`, shared with test_repository_config.py), drives the real server
through a client, and asserts the canary stays empty. The payloads are POSIX
shell scripts, so those tests skip on Windows.
"""

import os
import sys
from pathlib import Path
from unittest import mock

import git
import pytest
from conftest import connect, make_repo, wire
from test_repository_config import Payload, root_of

from mcp_server_git import server
from mcp_server_git.server import _rewrite_tree, git_checkout, git_merge, harden_repo

posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="the payloads are POSIX shell scripts"
)

CONFLICT = (
    "Error executing tool git_merge: Merge of 'feature' into 'main' stopped on "
    "conflicts in: m.txt. The merge was aborted and the repository is "
    "unchanged. Resolve the conflicts by hand."
)


def filter_config(payload: Payload) -> str:
    command = payload.command("filter")
    return f'[filter "x"]\n\tsmudge = {command}\n\tclean = {command}\n'


def diverged(
    repo: git.Repo,
    feature_files: dict[str, str],
    base_files: dict[str, str] | None = None,
) -> None:
    """`feature` writes `feature_files` and conflicts with `main` in m.txt.

    Both branches start from a commit of `base_files`. Every file is under
    `* filter=x`, which is harmless while `x` is undefined.
    """
    root = root_of(repo)
    base_files = base_files or {}
    (root / ".gitattributes").write_text("* filter=x\n")
    (root / "m.txt").write_text("base\n")
    for name, text in base_files.items():
        (root / name).write_text(text)
    repo.index.add([".gitattributes", "m.txt", *base_files])
    repo.index.commit("base")
    repo.git.checkout("-b", "feature")
    (root / "m.txt").write_text("theirs\n")
    for name, text in feature_files.items():
        (root / name).write_text(text)
    repo.index.add(["m.txt", *feature_files])
    repo.index.commit("theirs")
    repo.git.checkout("main")
    (root / "m.txt").write_text("ours\n")
    repo.index.add(["m.txt"])
    repo.index.commit("ours")


def include_evil_cfg(repo: git.Repo) -> None:
    """Add `[include] path = ../evil.cfg` to the repository's own config."""
    with open(Path(repo.git_dir) / "config", "a") as config:
        config.write("[include]\n\tpath = ../evil.cfg\n")


async def merge(repo: git.Repo, repository: Path | None) -> dict[str, object]:
    async with connect(repository) as session:
        result = await session.call_tool(
            "git_merge",
            {
                "repo_path": str(root_of(repo)),
                "source_branch": "feature",
                "fast_forward_only": False,
            },
        )
    return wire(result)


@posix_only
@pytest.mark.parametrize("confined", [False, True])
@pytest.mark.anyio
async def test_include_created_by_a_conflicting_merge_runs_nothing(
    tmp_path: Path, confined: bool
) -> None:
    payload = Payload(tmp_path / "payload")
    repo = make_repo(tmp_path / "repo")
    diverged(repo, {"evil.cfg": filter_config(payload)})
    # The include names a file that only the merged branch adds.
    include_evil_cfg(repo)

    result = await merge(repo, root_of(repo) if confined else None)

    assert payload.runs() == []
    assert result["isError"] is True
    assert result["content"] == [{"type": "text", "text": CONFLICT}]
    assert not (root_of(repo) / "evil.cfg").exists()
    repo.close()


@posix_only
@pytest.mark.anyio
async def test_config_linked_into_the_tree_and_rewritten_by_a_merge_runs_nothing(
    tmp_path: Path,
) -> None:
    payload = Payload(tmp_path / "payload")
    repo = make_repo(tmp_path / "repo")
    root = root_of(repo)
    config = Path(repo.git_dir) / "config"
    # The repository's configuration is a tracked file; the merged branch
    # adds a filter to it.
    original = config.read_text()
    diverged(
        repo,
        {"repo.cfg": original + filter_config(payload)},
        {"repo.cfg": original},
    )
    config.unlink()
    os.symlink(root / "repo.cfg", config)

    result = await merge(repo, None)

    assert payload.runs() == []
    assert result["content"] == [{"type": "text", "text": CONFLICT}]
    repo.close()


@posix_only
def test_drivers_a_checkout_defines_are_overridden_for_the_rest_of_the_call(
    tmp_path: Path,
) -> None:
    payload = Payload(tmp_path / "payload")
    repo = make_repo(tmp_path / "repo")
    root = root_of(repo)
    (root / ".gitattributes").write_text("* filter=x\n")
    repo.index.add([".gitattributes"])
    repo.index.commit("attributes")
    repo.git.checkout("-b", "feature")
    (root / "evil.cfg").write_text(filter_config(payload))
    repo.index.add(["evil.cfg"])
    repo.index.commit("config")
    repo.git.checkout("main")
    include_evil_cfg(repo)
    harden_repo(repo)

    assert git_checkout(repo, "feature") == "Switched to branch 'feature'"
    # A later command in the same call, on a file the filter applies to.
    (root / "test.txt").write_text("changed\n")
    repo.git.add("test.txt")

    assert payload.runs() == []
    repo.close()


def test_a_failed_re_read_stops_the_call(repo: git.Repo) -> None:
    failure = git.GitCommandError(["git", "config"], 128)
    with (
        mock.patch.object(server, "harden_repo", side_effect=failure),
        pytest.raises(git.GitError) as raised,
    ):
        _rewrite_tree(repo, "status")
    # Not a GitCommandError, which git_merge's cleanup would catch and then
    # run more git commands under incomplete overrides.
    assert not isinstance(raised.value, git.GitCommandError)
    assert "could not be read again after git status" in str(raised.value)


def test_a_failed_re_read_after_a_conflicting_merge_runs_no_cleanup(
    tmp_path: Path,
) -> None:
    repo = make_repo(tmp_path / "repo")
    diverged(repo, {})
    failure = git.GitCommandError(["git", "config"], 128)
    with (
        mock.patch.object(server, "harden_repo", side_effect=failure),
        pytest.raises(git.GitError) as raised,
    ):
        git_merge(repo, "feature", fast_forward_only=False)
    # Not git_merge's cleanup (`_merge_failure`, a ValueError), which would
    # run more git commands under incomplete overrides.
    assert not isinstance(raised.value, (git.GitCommandError, ValueError))
    # The failed re-read, raised while the merge's own failure propagated.
    assert raised.value.__cause__ is failure
    merge_failure = failure.__context__
    assert isinstance(merge_failure, git.GitCommandError)
    assert "merge" in merge_failure.command
    assert "a merge may still be in progress" in str(raised.value)
    # `git merge --abort` never ran.
    assert (Path(repo.git_dir) / "MERGE_HEAD").exists()
    repo.close()
