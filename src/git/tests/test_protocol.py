"""Characterization tests for mcp-server-git, driven through the protocol.

Each test runs the real `serve()` in-process (see `conftest.connect`) and
asserts on what a client receives: the wire JSON of the tool list and of each
tool result. They pin the server's *current* behavior on `mcp` 1.x, bugs
included, as the regression net for the SDK v2 port (#4851). A test that pins a
known bug says so and cites the issue (or says "no issue"); fixing the bug
means changing that test.
"""

import json
import re
from importlib.metadata import version
from pathlib import Path
from typing import Any
from unittest import mock

import git
import pytest
from mcp.shared.context import RequestContext
from mcp.types import ListRootsResult, Root
from pydantic import FileUrl

from conftest import connect, make_repo, text_result, wire

SNAPSHOTS = Path(__file__).parent / "snapshots"


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


async def call(
    repository: Path | None, name: str, arguments: dict[str, Any]
) -> dict[str, Any]:
    """One tool call against a fresh server, as wire JSON."""
    async with connect(repository) as session:
        return wire(await session.call_tool(name, arguments))


def rejected(message: str) -> dict[str, Any]:
    """The error a flag-injection guard returns over the wire.

    The guards raise `BadName(message)`, and BadName's `__str__` wraps its
    argument as a ref name, so the client sees the guard's message nested
    inside "Ref '...' did not resolve to an object". Characterized as is.
    """
    return text_result(f"Ref '{message}' did not resolve to an object", is_error=True)


def staged_paths(repo: git.Repo) -> set[str]:
    return set(repo.git.diff("--cached", "--name-only").splitlines())


# --------------------------------------------------------------------------
# Initialization and the tool list
# --------------------------------------------------------------------------


async def test_initialize_reports_package_version_as_server_version(repo: git.Repo):
    # #360: serverInfo.version is this package's version (from pyproject.toml
    # via the installed metadata), not the `mcp` SDK's.
    async with connect(root_of(repo), initialize=False) as session:
        init = wire(await session.initialize())
    assert init["serverInfo"] == {
        "name": "mcp-git",
        "version": version("mcp-server-git"),
    }
    assert version("mcp") != version("mcp-server-git")
    assert init["capabilities"] == {
        "experimental": {},
        "tools": {"listChanged": False},
    }


async def test_list_tools_matches_wire_snapshot():
    expected = json.loads((SNAPSHOTS / "list_tools.json").read_text())
    async with connect(None) as session:
        tools = wire(await session.list_tools())
    assert tools == expected


async def test_list_tools_names_in_order():
    async with connect(None) as session:
        tools = wire(await session.list_tools())["tools"]
    assert [t["name"] for t in tools] == [
        "git_status",
        "git_diff_unstaged",
        "git_diff_staged",
        "git_diff",
        "git_commit",
        "git_add",
        "git_reset",
        "git_log",
        "git_create_branch",
        "git_checkout",
        "git_show",
        "git_branch",
    ]


# --------------------------------------------------------------------------
# Protocol-level errors common to every tool
# --------------------------------------------------------------------------


async def test_missing_required_argument_is_input_validation_error(repo: git.Repo):
    assert await call(None, "git_status", {}) == text_result(
        "Input validation error: 'repo_path' is a required property", is_error=True
    )


async def test_unknown_tool_is_error(repo: git.Repo):
    assert await call(
        None, "git_nope", {"repo_path": str(root_of(repo))}
    ) == text_result("Unknown tool: git_nope", is_error=True)


# KNOWN BUG #4994: an unknown tool called without repo_path reports the KeyError repr "'repo_path'" instead of "Unknown tool"; the fix changes this assertion.
async def test_unknown_tool_without_repo_path_reports_the_key_error():
    # An unlisted tool skips schema validation, so call_tool's
    # `arguments["repo_path"]` raises KeyError and its repr is the message.
    assert await call(None, "git_nope", {}) == text_result("'repo_path'", is_error=True)


async def test_nonexistent_repo_path_error_is_the_bare_path(tmp_path: Path):
    # NoSuchPathError's message is just the path.
    missing = tmp_path / "missing"
    assert await call(None, "git_status", {"repo_path": str(missing)}) == (
        text_result(str(missing), is_error=True)
    )


async def test_non_repository_repo_path_error_is_the_bare_path(tmp_path: Path):
    # InvalidGitRepositoryError's message is just the path.
    plain = tmp_path / "plain"
    plain.mkdir()
    assert await call(None, "git_status", {"repo_path": str(plain)}) == (
        text_result(str(plain), is_error=True)
    )


async def test_repo_path_subdirectory_is_not_a_repository(repo: git.Repo):
    # git.Repo() is opened without search_parent_directories, so a directory
    # inside a working tree is rejected even though git itself accepts it.
    sub = root_of(repo) / "sub"
    sub.mkdir()
    assert await call(None, "git_status", {"repo_path": str(sub)}) == text_result(
        str(sub), is_error=True
    )


# --------------------------------------------------------------------------
# git_status
# --------------------------------------------------------------------------


async def test_git_status_clean(repo: git.Repo):
    assert await call(None, "git_status", {"repo_path": str(root_of(repo))}) == (
        text_result(
            "Repository status:\nOn branch main\nnothing to commit, working tree clean"
        )
    )


async def test_git_status_reports_untracked_and_modified(repo: git.Repo):
    root = root_of(repo)
    (root / "test.txt").write_text("changed\n", newline="\n")
    (root / "new.txt").write_text("new\n", newline="\n")
    result = await call(None, "git_status", {"repo_path": str(root)})
    assert result == text_result(f"Repository status:\n{repo.git.status()}")
    text = result["content"][0]["text"]
    assert "modified:   test.txt" in text
    assert "new.txt" in text


# --------------------------------------------------------------------------
# git_diff_unstaged / git_diff_staged
# --------------------------------------------------------------------------


async def test_git_diff_unstaged(repo: git.Repo):
    root = root_of(repo)
    (root / "test.txt").write_text(
        "line 1\nline 2\nCHANGED\nline 4\nline 5\n", newline="\n"
    )
    result = await call(None, "git_diff_unstaged", {"repo_path": str(root)})
    assert result == text_result("Unstaged changes:\n" + repo.git.diff("--unified=3"))
    assert "-line 3\n+CHANGED" in result["content"][0]["text"]
    assert " line 1\n" in result["content"][0]["text"]


async def test_git_diff_unstaged_honors_context_lines(repo: git.Repo):
    root = root_of(repo)
    (root / "test.txt").write_text(
        "line 1\nline 2\nCHANGED\nline 4\nline 5\n", newline="\n"
    )
    result = await call(
        None, "git_diff_unstaged", {"repo_path": str(root), "context_lines": 0}
    )
    text = result["content"][0]["text"]
    assert "@@ -3 +3 @@" in text
    assert "\n line 1\n" not in text


async def test_git_diff_unstaged_empty(repo: git.Repo):
    assert await call(
        None, "git_diff_unstaged", {"repo_path": str(root_of(repo))}
    ) == text_result("Unstaged changes:\n")


async def test_git_diff_staged(repo: git.Repo):
    root = root_of(repo)
    (root / "test.txt").write_text(
        "line 1\nline 2\nCHANGED\nline 4\nline 5\n", newline="\n"
    )
    repo.index.add(["test.txt"])
    result = await call(None, "git_diff_staged", {"repo_path": str(root)})
    assert result == text_result(
        "Staged changes:\n" + repo.git.diff("--unified=3", "--cached")
    )
    assert "-line 3\n+CHANGED" in result["content"][0]["text"]


async def test_git_diff_staged_honors_context_lines(repo: git.Repo):
    root = root_of(repo)
    (root / "test.txt").write_text(
        "line 1\nline 2\nCHANGED\nline 4\nline 5\n", newline="\n"
    )
    repo.index.add(["test.txt"])
    result = await call(
        None, "git_diff_staged", {"repo_path": str(root), "context_lines": 0}
    )
    text = result["content"][0]["text"]
    assert "@@ -3 +3 @@" in text
    assert "\n line 2\n" not in text


async def test_git_diff_staged_empty(repo: git.Repo):
    assert await call(
        None, "git_diff_staged", {"repo_path": str(root_of(repo))}
    ) == text_result("Staged changes:\n")


# --------------------------------------------------------------------------
# git_diff
# --------------------------------------------------------------------------


async def test_git_diff_against_branch(repo: git.Repo):
    root = root_of(repo)
    repo.git.checkout("-b", "feature")
    (root / "test.txt").write_text(
        "line 1\nline 2\nFEATURE\nline 4\nline 5\n", newline="\n"
    )
    repo.index.add(["test.txt"])
    repo.index.commit("feature commit")
    result = await call(None, "git_diff", {"repo_path": str(root), "target": "main"})
    assert result == text_result(
        "Diff with main:\n" + repo.git.diff("--unified=3", "main")
    )
    assert "+FEATURE" in result["content"][0]["text"]


async def test_git_diff_honors_context_lines(repo: git.Repo):
    root = root_of(repo)
    (root / "test.txt").write_text(
        "line 1\nline 2\nCHANGED\nline 4\nline 5\n", newline="\n"
    )
    result = await call(
        None,
        "git_diff",
        {"repo_path": str(root), "target": "HEAD", "context_lines": 0},
    )
    assert result == text_result(
        "Diff with HEAD:\n" + repo.git.diff("--unified=0", "HEAD")
    )


async def test_git_diff_unknown_target_is_error(repo: git.Repo):
    assert await call(
        None, "git_diff", {"repo_path": str(root_of(repo)), "target": "nope"}
    ) == text_result("Ref 'nope' did not resolve to an object", is_error=True)


# KNOWN BUG #4999: the flag-injection guard's message reaches the client wrapped as "Ref '...' did not resolve to an object"; the fix changes this assertion.
async def test_git_diff_rejects_flag_injection(repo: git.Repo):
    assert await call(
        None,
        "git_diff",
        {"repo_path": str(root_of(repo)), "target": "--output=/tmp/evil"},
    ) == rejected("Invalid target: '--output=/tmp/evil' - cannot start with '-'")


# --------------------------------------------------------------------------
# git_commit
# --------------------------------------------------------------------------


async def test_git_commit_records_staged_changes(repo: git.Repo):
    root = root_of(repo)
    (root / "new.txt").write_text("new\n", newline="\n")
    repo.index.add(["new.txt"])
    result = await call(
        None, "git_commit", {"repo_path": str(root), "message": "add new"}
    )
    head = repo.head.commit
    assert result == text_result(
        f"Changes committed successfully with hash {head.hexsha}"
    )
    assert head.message == "add new"
    assert "new.txt" in head.stats.files


async def test_git_commit_with_nothing_staged_is_refused(repo: git.Repo):
    # #4762: with nothing staged, git_commit refuses, as `git commit` does
    # without --allow-empty, instead of writing an empty commit.
    root = root_of(repo)
    (root / "test.txt").write_text("edited but not staged\n", newline="\n")
    before = repo.head.commit
    result = await call(
        None, "git_commit", {"repo_path": str(root), "message": "claims a fix"}
    )
    assert result == text_result(
        "No changes staged for commit. Use git_add to stage changes first; "
        "git_status shows what is currently staged.",
        is_error=True,
    )
    assert repo.head.commit == before
    assert repo.is_dirty()


# --------------------------------------------------------------------------
# git_add
# --------------------------------------------------------------------------


async def test_git_add_specific_files(repo: git.Repo):
    root = root_of(repo)
    (root / "a.txt").write_text("a\n", newline="\n")
    (root / "b.txt").write_text("b\n", newline="\n")
    result = await call(None, "git_add", {"repo_path": str(root), "files": ["a.txt"]})
    assert result == text_result("Files staged successfully")
    assert staged_paths(repo) == {"a.txt"}


async def test_git_add_dot_stages_everything(repo: git.Repo):
    root = root_of(repo)
    (root / "a.txt").write_text("a\n", newline="\n")
    (root / "b.txt").write_text("b\n", newline="\n")
    result = await call(None, "git_add", {"repo_path": str(root), "files": ["."]})
    assert result == text_result("Files staged successfully")
    assert staged_paths(repo) == {"a.txt", "b.txt"}


async def test_git_add_dot_never_stages_git_dir(repo: git.Repo):
    # Regression guard for #628: `git add .` must not stage `.git` itself.
    root = root_of(repo)
    (root / "a.txt").write_text("a\n", newline="\n")
    await call(None, "git_add", {"repo_path": str(root), "files": ["."]})
    entries = [str(path) for path, _stage in repo.index.entries]
    assert not any(p == ".git" or p.startswith(".git/") for p in entries)
    assert "a.txt" in entries


async def test_git_add_absolute_path_inside_repository(repo: git.Repo):
    root = root_of(repo)
    (root / "a.txt").write_text("a\n", newline="\n")
    result = await call(
        None, "git_add", {"repo_path": str(root), "files": [str(root / "a.txt")]}
    )
    assert result == text_result("Files staged successfully")
    assert staged_paths(repo) == {"a.txt"}


async def test_git_add_file_starting_with_dash_is_a_path(repo: git.Repo):
    # `--` separates the pathspec, so a dash-named file is staged, not parsed
    # as an option.
    root = root_of(repo)
    (root / "-n").write_text("dash\n", newline="\n")
    result = await call(None, "git_add", {"repo_path": str(root), "files": ["-n"]})
    assert result == text_result("Files staged successfully")
    assert staged_paths(repo) == {"-n"}


async def test_git_add_empty_list_is_rejected(repo: git.Repo):
    # #4763: `files: []` would run `git add --`, a no-op. The schema's
    # minItems makes the SDK reject it before the tool runs.
    root = root_of(repo)
    (root / "test.txt").write_text("edited\n", newline="\n")
    result = await call(None, "git_add", {"repo_path": str(root), "files": []})
    assert result == text_result(
        "Input validation error: [] should be non-empty", is_error=True
    )
    assert staged_paths(repo) == set()


async def test_git_add_dot_on_clean_tree_reports_nothing_staged(repo: git.Repo):
    # #4763: nothing to stage, and the result says so.
    result = await call(
        None, "git_add", {"repo_path": str(root_of(repo)), "files": ["."]}
    )
    assert result == text_result(
        "No changes were staged: the given paths had nothing new to stage. "
        "git_status shows what is modified or untracked."
    )
    assert staged_paths(repo) == set()


async def test_git_add_nonexistent_file_is_git_error(repo: git.Repo):
    result = await call(
        None, "git_add", {"repo_path": str(root_of(repo)), "files": ["nope.txt"]}
    )
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert "cmdline: git add -- nope.txt" in text
    assert "pathspec 'nope.txt' did not match any files" in text


async def test_git_add_rejects_relative_traversal(repo: git.Repo):
    # CVE-2026-27735: a path escaping the working tree is refused before git
    # runs.
    root = root_of(repo)
    (root.parent / "outside.txt").write_text("secret\n", newline="\n")
    result = await call(
        None, "git_add", {"repo_path": str(root), "files": ["../outside.txt"]}
    )
    assert result == text_result(
        f"Path '../outside.txt' is outside the repository '{root.resolve()}'",
        is_error=True,
    )
    assert staged_paths(repo) == set()


async def test_git_add_rejects_absolute_path_outside(repo: git.Repo):
    root = root_of(repo)
    outside = root.parent / "outside.txt"
    outside.write_text("secret\n", newline="\n")
    result = await call(
        None, "git_add", {"repo_path": str(root), "files": [str(outside)]}
    )
    assert result == text_result(
        f"Path '{outside}' is outside the repository '{root.resolve()}'",
        is_error=True,
    )


async def test_git_add_rejects_symlink_out_of_repository(repo: git.Repo):
    root = root_of(repo)
    outside = root.parent / "outside.txt"
    outside.write_text("secret\n", newline="\n")
    (root / "link.txt").symlink_to(outside)
    result = await call(
        None, "git_add", {"repo_path": str(root), "files": ["link.txt"]}
    )
    assert result == text_result(
        f"Path 'link.txt' is outside the repository '{root.resolve()}'",
        is_error=True,
    )


async def test_git_add_unresolvable_path_is_invalid_path(repo: git.Repo):
    # Path.resolve() raising (a symlink loop on some Pythons, an OS error)
    # becomes "Invalid path". Simulated so the test does not depend on which
    # Python versions raise for a loop.
    root = root_of(repo)
    real_resolve = Path.resolve

    def resolve(self: Path, strict: bool = False) -> Path:
        if self.name == "unresolvable":
            raise OSError("simulated")
        return real_resolve(self, strict)

    with mock.patch.object(Path, "resolve", resolve):
        result = await call(
            None, "git_add", {"repo_path": str(root), "files": ["unresolvable"]}
        )
    assert result == text_result("Invalid path: 'unresolvable'", is_error=True)


# --------------------------------------------------------------------------
# git_reset
# --------------------------------------------------------------------------


async def test_git_reset_unstages_everything(repo: git.Repo):
    root = root_of(repo)
    (root / "a.txt").write_text("a\n", newline="\n")
    (root / "test.txt").write_text("edited\n", newline="\n")
    repo.index.add(["a.txt", "test.txt"])
    assert staged_paths(repo) == {"a.txt", "test.txt"}
    result = await call(None, "git_reset", {"repo_path": str(root)})
    assert result == text_result("All staged changes reset")
    assert staged_paths(repo) == set()
    # The working tree is untouched.
    assert (root / "test.txt").read_text() == "edited\n"


# --------------------------------------------------------------------------
# git_log
# --------------------------------------------------------------------------


def log_entry(commit: git.Commit) -> str:
    return (
        f"Commit: {commit.hexsha}\n"
        f"Author: {commit.author}\n"
        f"Date: {commit.authored_datetime}\n"
        f"Message: {commit.message}\n"
    )


def add_commits(repo: git.Repo, n: int) -> list[git.Commit]:
    root = root_of(repo)
    commits = []
    for i in range(n):
        (root / f"f{i}.txt").write_text(f"{i}\n", newline="\n")
        repo.index.add([f"f{i}.txt"])
        commits.append(repo.index.commit(f"commit {i}\n\nbody {i}"))
    return commits


async def test_git_log_default(repo: git.Repo):
    commits = add_commits(repo, 2)
    initial = repo.head.commit.parents[0].parents[0]
    result = await call(None, "git_log", {"repo_path": str(root_of(repo))})
    assert result == text_result(
        "Commit history:\n"
        + "\n".join(log_entry(c) for c in [commits[1], commits[0], initial])
    )
    text = result["content"][0]["text"]
    assert "Author: Test User\n" in text
    assert "Message: commit 1\n\nbody 1\n" in text


async def test_git_log_max_count(repo: git.Repo):
    commits = add_commits(repo, 3)
    result = await call(
        None, "git_log", {"repo_path": str(root_of(repo)), "max_count": 1}
    )
    assert result == text_result("Commit history:\n" + log_entry(commits[2]))


async def test_git_log_timestamps_filter(repo: git.Repo):
    root = str(root_of(repo))
    future = await call(
        None, "git_log", {"repo_path": root, "start_timestamp": "2099-01-01"}
    )
    assert future == text_result("Commit history:\n")
    past = await call(
        None, "git_log", {"repo_path": root, "end_timestamp": "2000-01-01"}
    )
    assert past == text_result("Commit history:\n")
    both = await call(
        None,
        "git_log",
        {
            "repo_path": root,
            "start_timestamp": "2000-01-01",
            "end_timestamp": "2099-01-01",
        },
    )
    assert both == text_result("Commit history:\n" + log_entry(repo.head.commit))


async def test_git_log_rejects_timestamp_flag_injection(repo: git.Repo):
    root = str(root_of(repo))
    assert await call(
        None, "git_log", {"repo_path": root, "start_timestamp": "--all"}
    ) == text_result(
        "Invalid start_timestamp: '--all' - cannot start with '-'", is_error=True
    )
    assert await call(
        None, "git_log", {"repo_path": root, "end_timestamp": "--all"}
    ) == text_result(
        "Invalid end_timestamp: '--all' - cannot start with '-'", is_error=True
    )


# --------------------------------------------------------------------------
# git_create_branch
# --------------------------------------------------------------------------


async def test_git_create_branch_from_active_branch(repo: git.Repo):
    root = root_of(repo)
    result = await call(
        None, "git_create_branch", {"repo_path": str(root), "branch_name": "feat"}
    )
    assert result == text_result("Created branch 'feat' from 'main'")
    assert repo.heads["feat"].commit == repo.heads["main"].commit
    # Creating a branch does not switch to it.
    assert repo.active_branch.name == "main"


async def test_git_create_branch_from_base_branch(repo: git.Repo):
    root = root_of(repo)
    repo.git.checkout("-b", "base")
    add_commits(repo, 1)
    repo.git.checkout("main")
    result = await call(
        None,
        "git_create_branch",
        {"repo_path": str(root), "branch_name": "derived", "base_branch": "base"},
    )
    assert result == text_result("Created branch 'derived' from 'base'")
    assert repo.heads["derived"].commit == repo.heads["base"].commit


async def test_git_create_branch_unknown_base_is_error(repo: git.Repo):
    assert await call(
        None,
        "git_create_branch",
        {"repo_path": str(root_of(repo)), "branch_name": "x", "base_branch": "nope"},
    ) == text_result("No item found with id nope", is_error=True)


# KNOWN BUG #4996: git_create_branch reports "Created branch" for an existing branch already at the base commit; the fix changes this assertion.
async def test_git_create_branch_existing_name_at_same_commit_reports_success(
    repo: git.Repo,
):
    # Characterization: GitPython's create_head accepts an existing branch that
    # already points at the base commit, so this "creates" `main` from `main`
    # and reports success although nothing was created.
    assert await call(
        None,
        "git_create_branch",
        {"repo_path": str(root_of(repo)), "branch_name": "main"},
    ) == text_result("Created branch 'main' from 'main'")


async def test_git_create_branch_existing_name_at_other_commit_is_error(
    repo: git.Repo,
):
    repo.git.branch("old")
    add_commits(repo, 1)
    result = await call(
        None,
        "git_create_branch",
        {"repo_path": str(root_of(repo)), "branch_name": "old"},
    )
    assert result["isError"] is True
    assert "refs/heads/old" in result["content"][0]["text"]
    assert "already exist" in result["content"][0]["text"]


# KNOWN BUG #4999: the flag-injection guard's message reaches the client wrapped as "Ref '...' did not resolve to an object"; the fix changes this assertion.
async def test_git_create_branch_rejects_flag_injection(repo: git.Repo):
    root = str(root_of(repo))
    assert await call(
        None, "git_create_branch", {"repo_path": root, "branch_name": "-f"}
    ) == rejected("Invalid branch name: '-f' - cannot start with '-'")
    assert await call(
        None,
        "git_create_branch",
        {"repo_path": root, "branch_name": "x", "base_branch": "--track"},
    ) == rejected("Invalid base branch: '--track' - cannot start with '-'")


# --------------------------------------------------------------------------
# git_checkout
# --------------------------------------------------------------------------


async def test_git_checkout_branch(repo: git.Repo):
    repo.git.branch("feature")
    result = await call(
        None,
        "git_checkout",
        {"repo_path": str(root_of(repo)), "branch_name": "feature"},
    )
    assert result == text_result("Switched to branch 'feature'")
    assert repo.active_branch.name == "feature"


@pytest.mark.parametrize("revision", ["sha", "tag", "HEAD~1", "refs/heads/feature"])
async def test_git_checkout_non_branch_reports_detached_head(
    repo: git.Repo, revision: str
):
    # #4804: any revision rev_parse accepts is checked out, detaching HEAD, and
    # the reply says so with the short sha instead of claiming a branch switch.
    add_commits(repo, 1)
    repo.git.branch("feature")
    repo.create_tag("v1", ref="HEAD~1")
    name = {
        "sha": repo.head.commit.hexsha[:7],
        "tag": "v1",
    }.get(revision, revision)
    target = repo.commit(name).hexsha
    result = await call(
        None, "git_checkout", {"repo_path": str(root_of(repo)), "branch_name": name}
    )
    assert repo.head.is_detached
    assert repo.head.commit.hexsha == target
    assert result == text_result(f"HEAD is now detached at {target[:7]}")


async def test_git_checkout_unknown_branch_is_error(repo: git.Repo):
    assert await call(
        None,
        "git_checkout",
        {"repo_path": str(root_of(repo)), "branch_name": "nope"},
    ) == text_result("Ref 'nope' did not resolve to an object", is_error=True)
    assert repo.active_branch.name == "main"


# KNOWN BUG #4999: the flag-injection guard's message reaches the client wrapped as "Ref '...' did not resolve to an object"; the fix changes this assertion.
async def test_git_checkout_rejects_flag_injection(repo: git.Repo):
    assert await call(
        None,
        "git_checkout",
        {"repo_path": str(root_of(repo)), "branch_name": "--orphan=evil"},
    ) == rejected("Invalid branch name: '--orphan=evil' - cannot start with '-'")


# --------------------------------------------------------------------------
# git_show
# --------------------------------------------------------------------------


def without_addresses(text: str) -> str:
    """Mask CPython object addresses (`object at 0x...`)."""
    return re.sub(r" at 0x[0-9a-fA-F]+", " at 0x?", text)


def show_text(result: dict[str, Any]) -> str:
    assert result["isError"] is False
    return without_addresses(result["content"][0]["text"])


def show_header(commit: git.Commit) -> str:
    # git_show formats its header with !r, so the reply carries Python reprs:
    # a quoted sha, `<git.Actor ...>`, and a `datetime.datetime(...)` whose
    # tzinfo repr includes a memory address. Compared with addresses masked.
    return without_addresses(
        f"Commit: {commit.hexsha!r}\n"
        f"Author: {commit.author!r}\n"
        f"Date: {commit.authored_datetime!r}\n"
        f"Message: {commit.message!r}\n"
    )


# KNOWN BUG #4998: git_show prints Python reprs (quoted sha, <git.Actor>, datetime with a memory address) instead of git's format; the fix changes this assertion.
async def test_git_show_commit_with_parent(repo: git.Repo):
    root = root_of(repo)
    (root / "test.txt").write_text(
        "line 1\nline 2\nSHOWN\nline 4\nline 5\n", newline="\n"
    )
    repo.index.add(["test.txt"])
    commit = repo.index.commit("show me")
    result = await call(
        None, "git_show", {"repo_path": str(root), "revision": commit.hexsha}
    )
    assert show_text(result) == (
        show_header(commit)
        + "\n--- test.txt\n+++ test.txt\n"
        + "@@ -1,5 +1,5 @@\n line 1\n line 2\n-line 3\n+SHOWN\n line 4\n line 5\n"
    )
    text = show_text(result)
    assert f"Commit: '{commit.hexsha}'\n" in text
    assert 'Author: <git.Actor "Test User <test@example.com>">\n' in text
    assert "Date: datetime.datetime(" in text
    assert "Message: 'show me'\n" in text


# KNOWN BUG #4998: git_show prints Python reprs (with a memory address) and "--- None" where git prints /dev/null; the fix changes this assertion.
async def test_git_show_initial_commit_diffs_against_empty_tree(repo: git.Repo):
    # With no parent the commit is diffed against NULL_TREE. An added file has
    # no a_path, so the header prints Python's `None` where git prints
    # `/dev/null`.
    initial = repo.head.commit
    result = await call(
        None, "git_show", {"repo_path": str(root_of(repo)), "revision": "HEAD"}
    )
    assert show_text(result) == (
        show_header(initial)
        + "\n--- None\n+++ test.txt\n"
        + "@@ -0,0 +1,5 @@\n+line 1\n+line 2\n+line 3\n+line 4\n+line 5\n"
    )


# KNOWN BUG #4998: git_show prints Python reprs (quoted sha, <git.Actor>, datetime with a memory address) instead of git's format; the fix changes this assertion.
async def test_git_show_rename_only_commit_has_header_and_no_patch(repo: git.Repo):
    # A pure rename yields a diff entry whose patch is empty bytes.
    repo.index.move(["test.txt", "renamed.txt"])
    commit = repo.index.commit("rename only")
    result = await call(
        None, "git_show", {"repo_path": str(root_of(repo)), "revision": "HEAD"}
    )
    assert show_text(result) == (
        show_header(commit) + "\n--- test.txt\n+++ renamed.txt\n"
    )


# KNOWN BUG #4998: git_show prints Python reprs (quoted sha, <git.Actor>, datetime with a memory address) instead of git's format; the fix changes this assertion.
async def test_git_show_binary_commit(repo: git.Repo):
    root = root_of(repo)
    (root / "blob.bin").write_bytes(bytes(range(256)))
    repo.index.add(["blob.bin"])
    commit = repo.index.commit("binary")
    result = await call(None, "git_show", {"repo_path": str(root), "revision": "HEAD"})
    assert show_text(result) == (
        show_header(commit)
        + "\n--- blob.bin\n+++ blob.bin\n"
        + "Binary files /dev/null and b/blob.bin differ\n"
    )


# KNOWN BUG #4997: git_show decodes the patch as strict UTF-8, so a Latin-1 file fails the whole call; the fix changes this assertion.
async def test_git_show_non_utf8_patch_is_decode_error(repo: git.Repo):
    # Characterization: the patch bytes are decoded as strict UTF-8, so a
    # Latin-1 text file makes the whole call fail.
    root = root_of(repo)
    (root / "latin.txt").write_bytes("caf\xe9\n".encode("latin-1"))
    repo.index.add(["latin.txt"])
    repo.index.commit("latin-1")
    result = await call(None, "git_show", {"repo_path": str(root), "revision": "HEAD"})
    assert result["isError"] is True
    assert "codec can't decode byte 0xe9" in result["content"][0]["text"]


# KNOWN BUG #1682: pins current (wrong) behavior; the fix changes this assertion.
async def test_git_show_revision_path_syntax_is_error(repo: git.Repo):
    # Pins #1682's current error: `<rev>:<path>` names a blob, not a commit,
    # and repo.commit() appends `^0`, so the call fails with this message
    # rather than crashing the server.
    result = await call(
        None,
        "git_show",
        {"repo_path": str(root_of(repo)), "revision": "HEAD:test.txt"},
    )
    assert result == text_result(
        "\"Blob or Tree named 'test.txt^0' not found\"", is_error=True
    )


async def test_git_show_unknown_revision_is_error(repo: git.Repo):
    assert await call(
        None, "git_show", {"repo_path": str(root_of(repo)), "revision": "nope"}
    ) == text_result("Ref 'nope' did not resolve to an object", is_error=True)


# KNOWN BUG #4999: the flag-injection guard's message reaches the client wrapped as "Ref '...' did not resolve to an object"; the fix changes this assertion.
async def test_git_show_rejects_flag_injection(repo: git.Repo):
    assert await call(
        None, "git_show", {"repo_path": str(root_of(repo)), "revision": "--format=x"}
    ) == rejected("Invalid revision: '--format=x' - cannot start with '-'")


# --------------------------------------------------------------------------
# git_branch
# --------------------------------------------------------------------------


async def test_git_branch_local(repo: git.Repo):
    repo.git.branch("feature")
    assert await call(
        None, "git_branch", {"repo_path": str(root_of(repo)), "branch_type": "local"}
    ) == text_result("  feature\n* main")


async def test_git_branch_remote_and_all(tmp_path: Path, repo: git.Repo):
    clone = repo.clone(str(tmp_path / "clone"))
    try:
        clone.git.branch("local-only")
        clone_root = root_of(clone)
        remote = await call(
            None, "git_branch", {"repo_path": str(clone_root), "branch_type": "remote"}
        )
        assert remote == text_result(clone.git.branch("-r"))
        assert "origin/main" in remote["content"][0]["text"]
        assert "local-only" not in remote["content"][0]["text"]
        everything = await call(
            None, "git_branch", {"repo_path": str(clone_root), "branch_type": "all"}
        )
        text = everything["content"][0]["text"]
        assert "local-only" in text
        assert "remotes/origin/main" in text
    finally:
        clone.close()


async def test_git_branch_contains_and_not_contains(repo: git.Repo):
    root = str(root_of(repo))
    repo.git.checkout("-b", "feature")
    commit = add_commits(repo, 1)[0]
    repo.git.checkout("main")
    contains = await call(
        None,
        "git_branch",
        {"repo_path": root, "branch_type": "local", "contains": commit.hexsha},
    )
    assert contains == text_result("  feature")
    not_contains = await call(
        None,
        "git_branch",
        {"repo_path": root, "branch_type": "local", "not_contains": commit.hexsha},
    )
    assert not_contains == text_result("* main")


# KNOWN BUG #4995: git_branch returns an unknown branch_type as a successful result, not an error; the fix changes this assertion.
async def test_git_branch_unknown_type_is_not_an_error(repo: git.Repo):
    # Characterization: an unknown branch_type is reported in the text of a
    # *successful* result (isError false), so a client cannot tell it apart
    # from a branch listing.
    assert await call(
        None, "git_branch", {"repo_path": str(root_of(repo)), "branch_type": "bogus"}
    ) == text_result("Invalid branch type: bogus")


# KNOWN BUG #4999: the flag-injection guard's message reaches the client wrapped as "Ref '...' did not resolve to an object"; the fix changes this assertion.
async def test_git_branch_rejects_flag_injection(repo: git.Repo):
    root = str(root_of(repo))
    assert await call(
        None,
        "git_branch",
        {"repo_path": root, "branch_type": "local", "contains": "--x"},
    ) == rejected("Invalid contains value: '--x' - cannot start with '-'")
    assert await call(
        None,
        "git_branch",
        {"repo_path": root, "branch_type": "local", "not_contains": "--x"},
    ) == rejected("Invalid not_contains value: '--x' - cannot start with '-'")


# --------------------------------------------------------------------------
# Repository restriction (--repository) and the #4550 concerns
# --------------------------------------------------------------------------


def outside_error(repo_path: Path | str, allowed: Path) -> dict[str, Any]:
    return text_result(
        f"Repository path '{repo_path}' is outside the allowed repository "
        f"'{allowed}'",
        is_error=True,
    )


async def test_without_repository_any_repository_is_reachable(tmp_path: Path):
    # Pins #4550: with no --repository, validate_repo_path is a no-op and every
    # tool reaches any repository on the filesystem. Restricting this changes
    # this test.
    first = make_repo(tmp_path / "first")
    second = make_repo(tmp_path / "second")
    try:
        async with connect(None) as session:
            for r in (first, second):
                result = wire(
                    await session.call_tool(
                        "git_status", {"repo_path": str(root_of(r))}
                    )
                )
                assert result["isError"] is False
    finally:
        first.close()
        second.close()


async def test_restricted_server_serves_its_repository(repo: git.Repo):
    root = root_of(repo)
    assert (await call(root, "git_status", {"repo_path": str(root)}))[
        "isError"
    ] is False


async def test_restricted_server_rejects_other_repository(
    tmp_path: Path, repo: git.Repo
):
    root = root_of(repo)
    other = make_repo(tmp_path / "other")
    try:
        assert await call(
            root, "git_status", {"repo_path": str(root_of(other))}
        ) == outside_error(root_of(other), root)
    finally:
        other.close()


async def test_restricted_server_rejects_sibling_with_shared_prefix(
    tmp_path: Path, repo: git.Repo
):
    # `/x/repo-evil` starts with the string `/x/repo` but is not inside it; the
    # check compares path components, not string prefixes.
    root = root_of(repo)
    evil = make_repo(tmp_path / "repo-evil")
    try:
        assert await call(
            root, "git_status", {"repo_path": str(root_of(evil))}
        ) == outside_error(root_of(evil), root)
    finally:
        evil.close()


async def test_restricted_server_rejects_dotdot_traversal(
    tmp_path: Path, repo: git.Repo
):
    root = root_of(repo)
    other = make_repo(tmp_path / "other")
    try:
        sneaky = f"{root}/../other"
        # The server echoes the path as `Path(repo_path)` renders it: unchanged
        # on POSIX, with backslash separators on Windows.
        assert await call(root, "git_status", {"repo_path": sneaky}) == outside_error(
            Path(sneaky), root
        )
    finally:
        other.close()


async def test_restricted_server_rejects_symlink_escape(tmp_path: Path, repo: git.Repo):
    root = root_of(repo)
    other = make_repo(tmp_path / "other")
    link = root / "escape"
    link.symlink_to(root_of(other))
    try:
        assert await call(
            root, "git_status", {"repo_path": str(link)}
        ) == outside_error(link, root)
    finally:
        other.close()


async def test_restricted_server_accepts_nested_repository(repo: git.Repo):
    # Characterization: the restriction is a path containment check, so a
    # separate repository nested inside the allowed one is served.
    root = root_of(repo)
    nested = make_repo(root / "vendor" / "nested")
    try:
        result = await call(root, "git_status", {"repo_path": str(root_of(nested))})
        assert result["isError"] is False
    finally:
        nested.close()


async def test_restricted_server_subdirectory_passes_check_but_is_not_a_repo(
    repo: git.Repo,
):
    root = root_of(repo)
    sub = root / "sub"
    sub.mkdir()
    assert await call(root, "git_status", {"repo_path": str(sub)}) == text_result(
        str(sub), is_error=True
    )


async def test_restricted_server_resolves_relative_repo_path_against_cwd(
    repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    root = root_of(repo)
    monkeypatch.chdir(root)
    assert (await call(root, "git_status", {"repo_path": "."}))["isError"] is False
    monkeypatch.chdir(root.parent)
    assert await call(root, "git_status", {"repo_path": "."}) == outside_error(
        ".", root
    )


async def test_restricted_server_unresolvable_repo_path_is_invalid_path(
    repo: git.Repo,
):
    root = root_of(repo)
    real_resolve = Path.resolve

    def resolve(self: Path, strict: bool = False) -> Path:
        if self.name == "unresolvable":
            raise RuntimeError("simulated symlink loop")
        return real_resolve(self, strict)

    target = root / "unresolvable"
    with mock.patch.object(Path, "resolve", resolve):
        result = await call(root, "git_status", {"repo_path": str(target)})
    assert result == text_result(f"Invalid path: {target}", is_error=True)


# --------------------------------------------------------------------------
# Roots
# --------------------------------------------------------------------------


async def test_server_never_requests_roots(tmp_path: Path, repo: git.Repo):
    # The server ignores Roots entirely: it never sends roots/list, not even
    # after notifications/roots/list_changed, and a repository outside every
    # root the client offers is still served. (The unreachable `list_repos`
    # helper that read roots was removed as dead code in #4855.)
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    calls: list[object] = []

    async def list_roots(context: RequestContext[Any, Any]) -> ListRootsResult:
        calls.append(context)
        return ListRootsResult(roots=[Root(uri=FileUrl(elsewhere.as_uri()))])

    async with connect(None, list_roots_callback=list_roots) as session:
        await session.send_roots_list_changed()
        result = wire(
            await session.call_tool("git_status", {"repo_path": str(root_of(repo))})
        )
        assert result["isError"] is False
        # A request after the notification proves it was processed.
        await session.send_ping()
    assert calls == []


async def test_server_without_client_roots_behaves_the_same(repo: git.Repo):
    async with connect(None) as session:
        result = wire(
            await session.call_tool("git_status", {"repo_path": str(root_of(repo))})
        )
    assert result["isError"] is False
