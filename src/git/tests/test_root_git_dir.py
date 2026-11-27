"""The `--repository` root's own git directories, fixed when the server starts.

A root's git directory may lie outside it only when it is a linked worktree,
whose git directory the main repository records under `.git/worktrees/` with a
`gitdir` file naming the root back. Any other git directory outside the root,
whether the root's `.git` names it when the server starts or a `.git` or
`commondir` written into the root afterwards does, is not the root's own, so
each call that would use it is refused. Each test drives the server through an
in-process MCP client and asserts on what comes back.
"""

from pathlib import Path
from typing import Any

import git
import pytest
from conftest import connect, make_repo, rmtree, wire

from mcp_server_git import server as git_server
from mcp_server_git.server import (
    record_root_git_dirs,
    validate_opened_repo,
)

OUTSIDE_TEXT = "outside content\n"


def outside_repo(path: Path) -> git.Repo:
    repo = make_repo(path)
    (path / "outside.txt").write_text(OUTSIDE_TEXT)
    repo.index.add(["outside.txt"])
    repo.index.commit("outside")
    return repo


async def show(root: Path, repo_path: Path, revision: str) -> dict[str, Any]:
    async with connect(root) as session:
        return wire(
            await session.call_tool(
                "git_show", {"repo_path": str(repo_path), "revision": revision}
            )
        )


def refused(result: dict[str, Any], used: Path) -> bool:
    text = result["content"][0]["text"]
    return (
        result["isError"] is True
        and f"uses '{used}'" in text
        and "which is outside the allowed repository" in text
        and OUTSIDE_TEXT not in text
    )


async def test_a_root_whose_git_file_names_another_repository_is_refused(
    tmp_path: Path,
) -> None:
    other = outside_repo(tmp_path / "other")
    root = tmp_path / "root"
    root.mkdir()
    (root / ".git").write_text(f"gitdir: {other.git_dir}\n")
    try:
        result = await show(root, root, "HEAD:outside.txt")
        assert refused(result, Path(other.git_dir).resolve()), result
        # The other repository named directly is refused as before.
        direct = await show(root, tmp_path / "other", "HEAD:outside.txt")
        assert direct["isError"] is True
        assert OUTSIDE_TEXT not in direct["content"][0]["text"]
    finally:
        other.close()


async def test_a_root_whose_git_dir_is_replaced_after_startup_is_refused(
    tmp_path: Path,
) -> None:
    other = outside_repo(tmp_path / "other")
    root_repo = make_repo(tmp_path / "root")
    root = tmp_path / "root"
    root_repo.close()
    try:
        async with connect(root) as session:
            before = wire(
                await session.call_tool(
                    "git_show", {"repo_path": str(root), "revision": "HEAD:test.txt"}
                )
            )
            assert before["isError"] is False
            rmtree(root / ".git")
            (root / ".git").write_text(f"gitdir: {other.git_dir}\n")
            after = wire(
                await session.call_tool(
                    "git_show",
                    {"repo_path": str(root), "revision": "HEAD:outside.txt"},
                )
            )
        assert refused(after, Path(other.git_dir).resolve()), after
    finally:
        other.close()


@pytest.mark.parametrize("when", ["before startup", "after startup"])
async def test_a_root_whose_commondir_names_another_repository_is_refused(
    tmp_path: Path, when: str
) -> None:
    other = outside_repo(tmp_path / "other")
    root_repo = make_repo(tmp_path / "root")
    root = tmp_path / "root"
    commondir = Path(root_repo.git_dir) / "commondir"
    root_repo.close()
    if when == "before startup":
        commondir.write_text(f"{other.git_dir}\n")
    try:
        async with connect(root) as session:
            if when == "after startup":
                commondir.write_text(f"{other.git_dir}\n")
            result = wire(
                await session.call_tool(
                    "git_show",
                    {"repo_path": str(root), "revision": "HEAD:outside.txt"},
                )
            )
        assert refused(result, Path(other.git_dir).resolve()), result
    finally:
        other.close()


async def test_a_linked_worktree_root_is_served(tmp_path: Path) -> None:
    main = make_repo(tmp_path / "main")
    worktree = tmp_path / "worktree"
    main.git.worktree("add", str(worktree))
    try:
        result = await show(worktree, worktree, "HEAD:test.txt")
        assert result["isError"] is False, result
    finally:
        main.close()


async def test_a_linked_worktree_root_with_relative_paths_is_served(
    tmp_path: Path,
) -> None:
    # `worktree.useRelativePaths` writes the `gitdir` file relative to the
    # worktree's git directory; write it that way by hand, whatever git runs.
    main = make_repo(tmp_path / "main")
    worktree = tmp_path / "worktree"
    main.git.worktree("add", str(worktree))
    gitdir = Path(main.git_dir) / "worktrees" / "worktree" / "gitdir"
    gitdir.write_text("../../../../worktree/.git\n")
    try:
        result = await show(worktree, worktree, "HEAD:test.txt")
        assert result["isError"] is False, result
    finally:
        main.close()


async def test_a_root_naming_another_worktrees_git_dir_is_refused(
    tmp_path: Path,
) -> None:
    # The other repository's linked worktree record names its own worktree,
    # not this root, so the root cannot claim it.
    other = outside_repo(tmp_path / "other")
    other.git.worktree("add", str(tmp_path / "other-wt"))
    record = Path(other.git_dir) / "worktrees" / "other-wt"
    root = tmp_path / "root"
    root.mkdir()
    (root / ".git").write_text(f"gitdir: {record}\n")
    try:
        result = await show(root, root, "HEAD:outside.txt")
        assert refused(result, record.resolve()), result
    finally:
        other.close()


async def test_a_worktree_record_without_its_gitdir_file_is_refused(
    tmp_path: Path,
) -> None:
    main = make_repo(tmp_path / "main")
    worktree = tmp_path / "worktree"
    main.git.worktree("add", str(worktree))
    record = Path(main.git_dir) / "worktrees" / "worktree"
    (record / "gitdir").unlink()
    try:
        result = await show(worktree, worktree, "HEAD:test.txt")
        assert refused(result, record.resolve()), result
    finally:
        main.close()


def test_the_root_is_recorded_on_first_use_without_a_server(tmp_path: Path) -> None:
    # validate_opened_repo called directly, with no server created for the
    # root, records the root's git directories then and holds it to them.
    other = outside_repo(tmp_path / "other")
    root = tmp_path / "root"
    root.mkdir()
    (root / ".git").write_text(f"gitdir: {other.git_dir}\n")
    git_server._ROOT_GIT_DIRS.pop(root, None)
    try:
        with (
            git.Repo(root, expand_vars=False) as repo,
            pytest.raises(ValueError, match="outside the allowed repository"),
        ):
            validate_opened_repo(repo, root, root)
        assert git_server._ROOT_GIT_DIRS[root] is None
    finally:
        other.close()


def test_a_root_that_is_not_a_repository_records_nothing(tmp_path: Path) -> None:
    assert record_root_git_dirs(tmp_path) is None
