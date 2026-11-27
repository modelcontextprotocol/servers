"""git_show reads only the repository's own objects under `--repository`.

`_check_git_dir_contents` refuses an alternate object store when a repository
is opened, but the alternates file is an ordinary file in the git directory,
so its contents can change between that check and the object reads that
follow it. Under `--repository`, `git_show` therefore runs git on an object
directory of its own (`_own_object_store`) whose alternates list is always
empty, so what the repository's alternates file says while git reads objects
no longer matters.

The tests are deterministic rather than a race: the check is wrapped so that
it plants an alternates entry right after it has passed, which is the state
git would see if a write landed in that window. Without `--repository`,
alternates keep working, since a `--shared` or `--reference` clone is a
supported repository there.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from unittest import mock

import git
import pytest
from conftest import connect, make_repo, wire

from mcp_server_git import server

MARKER = "ONLY_IN_THE_OTHER_REPOSITORY\n"


def objects_of(repo: git.Repo) -> Path:
    return Path(repo.common_dir) / "objects"


@pytest.fixture
def other(tmp_path: Path) -> git.Repo:
    """A repository outside the allowed one, with a commit of its own."""
    repo = make_repo(tmp_path / "other")
    assert repo.working_dir is not None
    (Path(repo.working_dir) / "only-here.txt").write_text(MARKER)
    repo.index.add(["only-here.txt"])
    repo.index.commit("only in the other repository")
    return repo


@contextmanager
def alternates_planted_after_check(alternates: Path, entry: str) -> Iterator[None]:
    """Write `entry` to `alternates` each time the git-directory check passes."""
    check: Callable[..., None] = server._check_git_dir_contents

    def check_then_plant(*args: Any, **kwargs: Any) -> None:
        check(*args, **kwargs)
        alternates.write_text(entry)

    with mock.patch.object(server, "_check_git_dir_contents", check_then_plant):
        yield


async def show(repository: Path | None, repo_path: Path, revision: str) -> Any:
    async with connect(repository) as session:
        return wire(
            await session.call_tool(
                "git_show", {"repo_path": str(repo_path), "revision": revision}
            )
        )


@pytest.mark.parametrize("revision", ["{blob}", "{commit}", "{commit}:"])
async def test_restricted_git_show_ignores_alternates_written_after_the_check(
    test_repository: git.Repo, other: git.Repo, revision: str
):
    root = Path(test_repository.working_dir or "")
    alternates = objects_of(test_repository) / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    rev = revision.format(
        blob=other.git.rev_parse("HEAD:only-here.txt"),
        commit=other.head.commit.hexsha,
    )

    with alternates_planted_after_check(alternates, f"{objects_of(other)}\n"):
        result = await show(root, root, rev)

    # The entry really was in place when git_show read objects.
    assert alternates.read_text() == f"{objects_of(other)}\n"
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert "ONLY_IN_THE_OTHER_REPOSITORY" not in text
    assert "only-here.txt" not in text


async def test_restricted_git_show_still_reads_the_repositorys_own_objects(
    test_repository: git.Repo,
):
    root = Path(test_repository.working_dir or "")
    (root / "packed.txt").write_text("PACKED\n")
    test_repository.index.add(["packed.txt"])
    test_repository.index.commit("packed")
    test_repository.git.gc("--quiet")  # moves every object into a pack
    (root / "loose.txt").write_text("LOOSE\n")
    test_repository.index.add(["loose.txt"])
    test_repository.index.commit("loose")

    for revision, expected in [
        ("HEAD:packed.txt", "PACKED"),
        ("HEAD:loose.txt", "LOOSE"),
        ("HEAD", "+LOOSE"),
        ("HEAD~1", "+PACKED"),
    ]:
        result = await show(root, root, revision)
        assert result["isError"] is False, result
        assert expected in result["content"][0]["text"]


async def test_restricted_git_show_leaves_no_object_directory_behind(
    test_repository: git.Repo, tmp_path: Path
):
    root = Path(test_repository.working_dir or "")
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    with mock.patch("tempfile.tempdir", str(scratch)):
        ok = await show(root, root, "HEAD")
        failed = await show(root, root, "0" * 40)
    assert ok["isError"] is False
    assert failed["isError"] is True
    assert list(scratch.iterdir()) == []


async def test_unrestricted_git_show_follows_alternates(
    test_repository: git.Repo, other: git.Repo
):
    # Without --repository, a clone made with --shared or --reference reads
    # its objects from the store it names, as git does.
    root = Path(test_repository.working_dir or "")
    alternates = objects_of(test_repository) / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    alternates.write_text(f"{objects_of(other)}\n")

    result = await show(None, root, other.git.rev_parse("HEAD:only-here.txt"))

    assert result["isError"] is False
    assert result["content"][0]["text"] == MARKER
