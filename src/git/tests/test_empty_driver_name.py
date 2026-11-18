"""A filter or merge driver with an empty name is overridden like any other.

Git accepts `[filter ""]` and `[merge ""]` sections, whose keys read back as
`filter..clean` and `merge..driver`, and `.gitattributes` selects them with
`filter=` and `merge=`. `harden_repo` must list and blank those keys too, or
the repository's own configuration runs a command on git_status, git_add,
git_checkout or git_merge. The payload and helpers are those of
`test_repository_config.py`, which covers drivers with ordinary names.
"""

import os
from pathlib import Path
from typing import Any

import git
import pytest
from conftest import connect, wire
from test_repository_config import Payload, commit_file, posix_only, root_of

from mcp_server_git.server import harden_repo


@pytest.fixture
def payload(tmp_path: Path) -> Payload:
    return Payload(tmp_path / "payload")


def set_empty_driver(repo: git.Repo, key: str, value: str) -> None:
    """Set `<section>..<key>`, a key in a subsection with an empty name."""
    repo.git.config(key, value)


def make_stale(path: Path) -> None:
    """Move a tracked file's mtime so git re-hashes it, as after an unpack."""
    stat = path.stat()
    os.utime(path, (stat.st_atime, stat.st_mtime + 10))


def test_harden_repo_blanks_an_empty_named_driver(repo: git.Repo):
    set_empty_driver(repo, "filter..clean", "false")
    set_empty_driver(repo, "filter..smudge", "false")
    set_empty_driver(repo, "filter..process", "false")
    set_empty_driver(repo, "merge..driver", "false")

    harden_repo(repo)

    for key in ("filter..clean", "filter..smudge", "filter..process", "merge..driver"):
        assert repo.git.config("--get", key) == "", key


@posix_only
@pytest.mark.parametrize("kind", ["clean", "smudge", "process"])
async def test_empty_named_filter_driver_never_runs(
    repo: git.Repo, payload: Payload, kind: str
):
    commit_file(repo, ".gitattributes", "*.txt filter=\n")
    repo.git.checkout("-b", "other")
    commit_file(repo, "other.txt", "other\n")
    repo.git.checkout("main")
    set_empty_driver(repo, f"filter..{kind}", payload.command("filter"))
    make_stale(root_of(repo) / "test.txt")
    (root_of(repo) / "new.txt").write_text("new\n")
    path = str(root_of(repo))

    for repository in (None, root_of(repo)):
        async with connect(repository) as session:
            for tool, arguments in (
                ("git_status", {}),
                ("git_diff_unstaged", {}),
                ("git_add", {"files": ["new.txt"]}),
                ("git_checkout", {"branch_name": "other"}),
                ("git_checkout", {"branch_name": "main"}),
            ):
                result: dict[str, Any] = wire(
                    await session.call_tool(tool, {"repo_path": path, **arguments})
                )
                assert result["isError"] is False, (tool, result)

    assert payload.runs() == []
    assert (root_of(repo) / "test.txt").exists()


@posix_only
async def test_empty_named_merge_driver_never_runs(repo: git.Repo, payload: Payload):
    # With the driver disabled, the conflicting change is a plain conflict,
    # which git_merge aborts.
    commit_file(repo, ".gitattributes", "*.txt merge=\n")
    repo.git.checkout("-b", "feature")
    commit_file(repo, "test.txt", "feature\n")
    repo.git.checkout("main")
    commit_file(repo, "test.txt", "main\n")
    set_empty_driver(repo, "merge..driver", payload.command("merge"))

    async with connect(None) as session:
        result = wire(
            await session.call_tool(
                "git_merge",
                {
                    "repo_path": str(root_of(repo)),
                    "source_branch": "feature",
                    "fast_forward_only": False,
                },
            )
        )

    assert result["isError"] is True
    assert "stopped on conflicts in: test.txt" in result["content"][0]["text"]
    assert payload.runs() == []
