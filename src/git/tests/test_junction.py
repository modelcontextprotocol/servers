"""A Windows junction in a git directory is held to `--repository` (#5520).

`_check_git_dir_contents` refuses a symbolic link in a git directory that
resolves outside the allowed repository. A Windows directory junction is not a
symbolic link to Python (`DirEntry.is_symlink()` is false for one, and
`is_dir()` true), yet git follows it like one, so the walk used to enter a
junction's target as an ordinary directory without judging where it was. The
walk now judges every directory by where it resolves.

Two sets of tests, both through the real server and a client:

- **Real junctions**, made with `mklink /J` (which needs no privilege). They
  run only on Windows, which is the `Test git (Windows)` CI leg.
- **Junction-like entries** on every platform: `os.scandir` is wrapped so a
  symbolic link reports itself the way a junction does. A POSIX host cannot
  make a junction, and the per-file coverage gate runs on Linux, so these are
  what fail there when the fix is taken out.
"""

import os
import subprocess
import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from unittest import mock

import git
import pytest
from conftest import connect, make_repo, rmtree, wire

windows_only = pytest.mark.skipif(
    sys.platform != "win32", reason="junctions exist only on Windows"
)

Link = Callable[[Path, Path], None]


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


async def status(repository: Path, repo_path: Path) -> dict[str, Any]:
    """`git_status` on `repo_path` from a server restricted to `repository`."""
    async with connect(repository) as session:
        return wire(
            await session.call_tool("git_status", {"repo_path": str(repo_path)})
        )


def uses_outside(result: dict[str, Any], used: Path, allowed: Path) -> bool:
    """The result is the error for a repository git opened outside `allowed`."""
    text = result["content"][0]["text"]
    return (
        result["isError"] is True
        and f"uses '{used}'" in text
        and f"which is outside the allowed repository '{allowed}'" in text
    )


def junction(link: Path, target: Path) -> None:
    """Make `link` a directory junction to `target` (Windows only)."""
    subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(target)],
        check=True,
        capture_output=True,
    )


def symlink(link: Path, target: Path) -> None:
    link.symlink_to(target, target_is_directory=True)


class JunctionLike:
    """A symbolic link's `DirEntry`, answering as a junction's does."""

    def __init__(self, entry: "os.DirEntry[str]") -> None:
        self._entry = entry
        self.name = entry.name
        self.path = entry.path

    def is_symlink(self) -> bool:
        return False

    def is_dir(self) -> bool:
        return True


class JunctionLikeScan:
    """`os.scandir`'s iterator, with each directory link made junction-like."""

    def __init__(self, scan: Any) -> None:
        self._scan = scan

    def __enter__(self) -> Iterator[Any]:
        return iter(self)

    def __exit__(self, *exc: object) -> None:
        self._scan.close()

    def __iter__(self) -> Iterator[Any]:
        for entry in self._scan:
            if entry.is_symlink() and entry.is_dir():
                yield JunctionLike(entry)
            else:
                yield entry


@contextmanager
def links_scan_as_junctions() -> Iterator[None]:
    real_scandir = os.scandir
    with mock.patch(
        "mcp_server_git.server.os.scandir",
        lambda path: JunctionLikeScan(real_scandir(path)),
    ):
        yield


@contextmanager
def nothing_patched() -> Iterator[None]:
    yield


# Each case: how to make the link, and what to patch while the server runs.
REAL = pytest.param(junction, nothing_patched, marks=windows_only, id="junction")
LIKE = pytest.param(symlink, links_scan_as_junctions, id="junction-like")
either = pytest.mark.parametrize(("link", "patched"), [REAL, LIKE])


@either
@pytest.mark.parametrize("entry", ["objects", "refs"])
async def test_junction_leading_outside_is_refused(
    tmp_path: Path,
    repo: git.Repo,
    link: Link,
    patched: Callable[[], Any],
    entry: str,
):
    # `.git/objects` (or `refs`) of a nested repository is a junction to
    # another repository's, outside the allowed one.
    root = root_of(repo)
    other = make_repo(tmp_path / "other")
    nested = make_repo(root / "nested")
    nested_git = Path(nested.git_dir)
    nested.close()
    target = Path(other.git_dir) / entry
    rmtree(nested_git / entry)
    link(nested_git / entry, target)
    try:
        with patched():
            result = await status(root, root / "nested")
        assert uses_outside(result, target.resolve(), root), result
    finally:
        other.close()


@either
async def test_junction_staying_inside_is_followed_and_checked(
    tmp_path: Path, repo: git.Repo, link: Link, patched: Callable[[], Any]
):
    # A junction to a directory in the allowed repository is allowed, and git
    # follows it, so what it leads to is checked: here a second junction, in
    # that directory, to outside.
    root = root_of(repo)
    other = make_repo(tmp_path / "other")
    store = root / "store"
    store.mkdir()
    link(Path(repo.git_dir) / "extra", store)
    escape = Path(other.git_dir) / "objects"
    link(store / "elsewhere", escape)
    # A cycle of allowed junctions ends rather than being walked forever.
    link(store / "loop", store)
    try:
        with patched():
            result = await status(root, root)
        assert uses_outside(result, escape.resolve(), root), result
    finally:
        other.close()


@either
async def test_junctions_that_stay_inside_are_accepted(
    tmp_path: Path, repo: git.Repo, link: Link, patched: Callable[[], Any]
):
    # Into the working tree, within the git directory, and around in a cycle:
    # none leads anywhere new. Nor does a `hooks` junction to a shared
    # directory outside, since no hook runs.
    root = root_of(repo)
    git_dir = Path(repo.git_dir)
    docs = root / "docs"
    docs.mkdir()
    link(git_dir / "extra", docs)
    link(git_dir / "refs-again", git_dir / "refs")
    link(git_dir / "loop", git_dir)
    shared_hooks = tmp_path / "shared-hooks"
    shared_hooks.mkdir()
    hooks = git_dir / "hooks"
    if hooks.exists():
        rmtree(hooks)
    link(hooks, shared_hooks)
    with patched():
        result = await status(root, root)
    assert result["isError"] is False, result


@windows_only
async def test_dangling_junction_inside_is_not_walked(repo: git.Repo):
    # A junction is still a directory to `is_dir()` once its target is gone;
    # walking it would fail the call with the scan's own error.
    root = root_of(repo)
    gone = root / "gone"
    gone.mkdir()
    junction(Path(repo.git_dir) / "extra", gone)
    gone.rmdir()
    result = await status(root, root)
    assert result["isError"] is False, result


@windows_only
async def test_dangling_junction_outside_is_refused(tmp_path: Path, repo: git.Repo):
    root = root_of(repo)
    gone = tmp_path / "gone"
    gone.mkdir()
    junction(Path(repo.git_dir) / "extra", gone.resolve())
    gone.rmdir()
    result = await status(root, root)
    # Not `uses_outside`: how a target that is gone is spelled is up to the
    # host, so only the refusal is pinned.
    assert result["isError"] is True, result
    assert (
        f"which is outside the allowed repository '{root}'"
        in result["content"][0]["text"]
    ), result
