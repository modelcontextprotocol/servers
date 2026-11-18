# What the index names, held to the --repository boundary.
#
# Git checks an index entry's path only when it writes one (`git add`); when
# it reads the index it joins each entry to the working tree as it stands. An
# index written by hand, which travels with the repository like the rest of
# `.git`, can therefore name `../outside/secret`, and git_diff_unstaged and
# git_diff would return that file's content. The index's untracked cache
# names directories the same way, for git status to list. These tests forge
# both in temporary directories and drive the server through the protocol;
# every outside file is a marker in the test's own tmp_path.

import hashlib
import os
import struct
import subprocess
import time
from pathlib import Path
from typing import Any

import git
import pytest
from conftest import connect, make_repo, wire
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS
from test_eras import MODERN
from test_eras import connect as connect_era

from mcp_server_git.server import _unsafe_index_entry

MARKER = "MARKER-OUTSIDE-THE-REPOSITORY"
REFUSED = "that git would read outside the working tree"


def forge_index(index: Path, paths: list[str]) -> None:
    """Write an index (version 2) whose entries are `paths`, as is.

    Each entry points at the empty blob, which the caller writes. `git
    update-index` refuses such paths, so the file is written byte by byte.
    """
    blob = hashlib.sha1(b"blob 0\0").digest()
    body = b""
    for path in sorted(p.encode() for p in paths):
        entry = struct.pack(">10I", 0, 0, 0, 0, 0, 0, 0o100644, 0, 0, 0) + blob
        entry += struct.pack(">H", min(len(path), 0xFFF)) + path
        body += entry + b"\0" * (8 - len(entry) % 8)
    data = b"DIRC" + struct.pack(">II", 2, len(paths)) + body
    index.write_bytes(data + hashlib.sha1(data).digest())


def forged_repo(path: Path, entries: list[str]) -> git.Repo:
    repo = make_repo(path)
    repo.git.hash_object("-w", "--stdin", istream=subprocess.DEVNULL)
    forge_index(Path(repo.git_dir) / "index", entries)
    return repo


def outside_marker(tmp_path: Path) -> None:
    (tmp_path / "outside").mkdir()
    (tmp_path / "outside" / "secret.txt").write_text(MARKER + "\n")


async def call(
    repository: Path | None, name: str, arguments: dict[str, Any]
) -> dict[str, Any]:
    async with connect(repository) as session:
        return wire(await session.call_tool(name, arguments))


TOOLS = [
    ("git_diff_unstaged", {}),
    ("git_diff", {"target": "HEAD"}),
    ("git_diff_staged", {}),
    ("git_status", {}),
]


@pytest.mark.parametrize(("tool", "extra"), TOOLS)
async def test_index_entry_outside_the_working_tree_is_refused(
    tmp_path: Path, tool: str, extra: dict[str, Any]
):
    outside_marker(tmp_path)
    root = tmp_path / "repo"
    forged_repo(root, ["../outside/secret.txt", "../outside/absent.txt"]).close()
    result = await call(root, tool, {"repo_path": str(root), **extra})
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert f"has an index entry '../outside/absent.txt' {REFUSED}" in text
    assert MARKER not in text


async def test_index_entry_in_a_nested_repository_is_refused(tmp_path: Path):
    # A repository vendored inside the allowed one, received with its .git.
    outside_marker(tmp_path)
    root = tmp_path / "repo"
    make_repo(root).close()
    nested = root / "vendor" / "lib"
    forged_repo(nested, ["../../../outside/secret.txt"]).close()
    result = await call(root, "git_diff_unstaged", {"repo_path": str(nested)})
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert f"'../../../outside/secret.txt' {REFUSED}" in text
    assert MARKER not in text


async def test_index_is_checked_whole_when_the_worktree_is_a_parent(
    tmp_path: Path,
):
    # GitPython runs git from the directory holding `.git`, ignoring
    # `core.worktree`. With the working tree a parent of it, a bare `ls-files`
    # would list only the entries under that subdirectory, and miss one that
    # git joins to the parent: the check lists the index from its top.
    outside_marker(tmp_path)
    root = tmp_path / "repo"
    make_repo(root).close()
    nested = root / "sub"
    repo = forged_repo(nested, ["../outside/secret.txt"])
    try:
        with repo.config_writer() as config:
            config.set_value("core", "worktree", "../..")
    finally:
        repo.close()
    result = await call(root, "git_diff_unstaged", {"repo_path": str(nested)})
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert f"'../outside/secret.txt' {REFUSED}" in text
    assert MARKER not in text


async def test_refusal_escapes_the_entry_name(tmp_path: Path):
    # The name is the repository's own: no line break or escape sequence of it
    # reaches the result as is.
    root = tmp_path / "repo"
    forged_repo(root, ["../x\n\x1b[31mred"]).close()
    result = await call(root, "git_status", {"repo_path": str(root)})
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert "'../x\\n\\x1b[31mred'" in text
    assert "\n" not in text and "\x1b" not in text


@pytest.mark.parametrize(
    "entry", ["/abs/path", "./test.txt", "a//b", ".git/config", "sub/.GIT/x"]
)
async def test_every_entry_git_add_refuses_is_refused(tmp_path: Path, entry: str):
    root = tmp_path / "repo"
    forged_repo(root, [entry, "test.txt"]).close()
    result = await call(root, "git_status", {"repo_path": str(root)})
    assert result["isError"] is True
    assert f"'{entry}' {REFUSED}" in result["content"][0]["text"]


@pytest.mark.parametrize("prompt", ["git_commit_message", "git_summarize_changes"])
async def test_prompts_refuse_a_forged_index(tmp_path: Path, prompt: str):
    # The prompts embed the repository's changes, through the same open_repo.
    outside_marker(tmp_path)
    root = tmp_path / "repo"
    forged_repo(root, ["../outside/secret.txt"]).close()
    async with connect_era(MODERN, root) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.get_prompt(prompt, {"repo_path": str(root)})
    assert excinfo.value.error.code == INVALID_PARAMS
    assert REFUSED in excinfo.value.error.message
    assert MARKER not in excinfo.value.error.message


async def test_forged_index_is_read_without_repository(tmp_path: Path):
    # Without --repository there is no boundary to hold: the check is part of
    # the confinement, as the README says, and a forged index is git's to read.
    outside_marker(tmp_path)
    root = tmp_path / "repo"
    forged_repo(root, ["../outside/secret.txt"]).close()
    result = await call(None, "git_status", {"repo_path": str(root)})
    assert result["isError"] is False


async def test_split_and_sparse_indexes_are_accepted(tmp_path: Path):
    # Both are listed through git, so their entries are checked as git reads
    # them, and a well-formed one passes.
    root = tmp_path / "repo"
    repo = make_repo(root)
    try:
        (root / "dir").mkdir()
        (root / "dir" / "inner.txt").write_text("inner\n")
        repo.git.add("dir")
        repo.git.commit("-m", "dir")
        repo.git.update_index("--split-index")
        assert list(Path(repo.git_dir).glob("sharedindex.*"))
        result = await call(root, "git_diff_unstaged", {"repo_path": str(root)})
        assert result["isError"] is False
        repo.git.update_index("--no-split-index")
        repo.git.sparse_checkout("set", "--cone", "--sparse-index", "other")
        assert "dir/" in repo.git.ls_files("--sparse").splitlines()
        assert not (root / "dir").exists()
        result = await call(root, "git_status", {"repo_path": str(root)})
        assert result["isError"] is False
    finally:
        repo.close()


async def test_untracked_cache_naming_outside_is_ignored(tmp_path: Path):
    # The untracked cache, an index extension, lists directories by name. One
    # renamed to `..` makes git status list the directory above the working
    # tree, recursively, unless the server turns the cache off.
    outside_marker(tmp_path)
    root = tmp_path / "repo"
    repo = make_repo(root)
    try:
        (root / "zz").mkdir()
        (root / "zz" / "q").write_text("q\n")
        own = ("-c", "core.fsmonitor=false", "-c", "core.untrackedCache=true")
        # A directory changed in the second git writes the cache is racy, and
        # git rescans it rather than trust the cache.
        past = time.time() - 100
        for directory in (root, root / "zz"):
            os.utime(directory, (past, past))
        repo.git.update_index("--untracked-cache")
        for _ in range(2):
            repo.git.execute(["git", *own, "status", "--porcelain"])
        index = Path(repo.git_dir) / "index"
        data = index.read_bytes()[:-20]
        at = data.index(b"zz\0", data.index(b"UNTR"))
        data = data[:at] + b"..\0" + data[at + 3 :]
        forged = data + hashlib.sha1(data).digest()
        index.write_bytes(forged)
        # Git honors the forged cache by default: the precondition. It names
        # the directory above the working tree either whole (`../`) or file
        # by file, depending on the git, so the check is on the `../` prefix.
        plain = repo.git.execute(["git", *own, "status", "--porcelain"])
        assert any(line[3:].startswith("../") for line in str(plain).splitlines())
        index.write_bytes(forged)
    finally:
        repo.close()
    result = await call(root, "git_status", {"repo_path": str(root)})
    assert result["isError"] is False
    text = result["content"][0]["text"]
    assert "zz/" in text
    assert "outside" not in text
    assert "../" not in text


@pytest.mark.parametrize(
    ("entry", "posix", "windows"),
    [
        (b"src/main.py", False, False),
        (b"a.git/b..c/.gitignore", False, False),
        (b"..", True, True),
        (b"../x", True, True),
        (b"/x", True, True),
        (b"x/", True, True),
        (b".Git/config", True, True),
        (b"..\\x", False, True),
        (b"sub\\.git\\config", False, True),
        (b"C:x", False, True),
        (b"a/.../b", False, True),
        (b"a/.. /b", False, True),
        (b"a/.git./b", False, True),
    ],
)
def test_unsafe_index_entry(entry: bytes, posix: bool, windows: bool):
    assert _unsafe_index_entry(entry, windows=False) is posix
    assert _unsafe_index_entry(entry, windows=True) is windows
