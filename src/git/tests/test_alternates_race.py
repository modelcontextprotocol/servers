"""Under `--repository`, git reads only the repository's own objects.

`_check_git_dir_contents` refuses an alternate object store when a repository
is opened, but the alternates file is an ordinary file in the git directory,
so its contents can change between that check and the object reads that
follow it. Under `--repository`, `open_repo` therefore runs git, for the rest
of the tool call or prompt, on an object directory of its own
(`_own_object_store`) whose alternates list is always empty, so what the
repository's alternates file says while git reads objects no longer matters.

The tests are deterministic rather than a race: the check is wrapped so that
it plants an alternates entry right after it has passed, which is the state
git would see if a write landed in that window. Each route that reads an
object a caller names is driven that way. Writes go through the same object
directory, so the tools that write objects are shown to still land them in
the repository's store. Without `--repository`, alternates keep working,
since a `--shared` or `--reference` clone is a supported repository there.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from unittest import mock

import git
import pytest
from conftest import connect, make_repo, wire
from mcp.shared.exceptions import MCPError

from mcp_server_git import server

MARKER = "ONLY_IN_THE_OTHER_REPOSITORY\n"
MESSAGE = "only in the other repository"


def objects_of(repo: git.Repo) -> Path:
    return Path(repo.common_dir) / "objects"


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


@pytest.fixture
def other(tmp_path: Path) -> git.Repo:
    """A repository outside the allowed one, with a commit of its own."""
    repo = make_repo(tmp_path / "other")
    (root_of(repo) / "only-here.txt").write_text(MARKER)
    repo.index.add(["only-here.txt"])
    repo.index.commit(MESSAGE)
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


async def call(repository: Path | None, tool: str, arguments: dict[str, Any]) -> Any:
    async with connect(repository) as session:
        return wire(await session.call_tool(tool, arguments))


async def summarize(repository: Path, repo_path: Path, target: str) -> str:
    """The git_summarize_changes prompt's text, or the error it was refused with."""
    async with connect(repository) as session:
        try:
            result = await session.get_prompt(
                "git_summarize_changes",
                {"repo_path": str(repo_path), "target": target},
            )
        except MCPError as e:
            return f"refused: {e}"
    return str(wire(result))


# Each route that reads objects a caller names: the tool and its arguments,
# with {blob} and {commit} standing for the other repository's objects.
ROUTES = [
    ("git_show", {"revision": "{blob}"}),
    ("git_show", {"revision": "{commit}"}),
    ("git_show", {"revision": "{commit}:"}),
    ("git_diff", {"target": "{commit}"}),
    ("git_log", {}),
    ("git_checkout", {"branch_name": "{commit}"}),
    ("git_create_branch", {"branch_name": "new", "base_branch": "{commit}"}),
]


@pytest.mark.parametrize(
    ("tool", "arguments"), ROUTES, ids=[f"{t}-{a}" for t, a in ROUTES]
)
async def test_restricted_tools_ignore_alternates_written_after_the_check(
    test_repository: git.Repo, other: git.Repo, tool: str, arguments: dict[str, str]
):
    root = root_of(test_repository)
    git_dir = Path(test_repository.git_dir)
    alternates = objects_of(test_repository) / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    commit = other.head.commit.hexsha
    names = {"blob": other.git.rev_parse("HEAD:only-here.txt"), "commit": commit}
    if tool == "git_log":
        # A branch naming the other repository's commit, checked out.
        (git_dir / "refs" / "heads" / "elsewhere").write_text(f"{commit}\n")
        (git_dir / "HEAD").write_text("ref: refs/heads/elsewhere\n")

    with alternates_planted_after_check(alternates, f"{objects_of(other)}\n"):
        result = await call(
            root,
            tool,
            {"repo_path": str(root)}
            | {k: v.format(**names) for k, v in arguments.items()},
        )

    # The entry really was in place when the tool read objects.
    assert alternates.read_text() == f"{objects_of(other)}\n"
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert "ONLY_IN_THE_OTHER_REPOSITORY" not in text
    assert MESSAGE not in text
    assert "only-here.txt" not in text
    assert not (root / "only-here.txt").exists()
    assert not (git_dir / "refs" / "heads" / "new").exists()


async def test_restricted_prompt_ignores_alternates_written_after_the_check(
    test_repository: git.Repo, other: git.Repo
):
    root = root_of(test_repository)
    alternates = objects_of(test_repository) / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)

    with alternates_planted_after_check(alternates, f"{objects_of(other)}\n"):
        text = await summarize(root, root, other.head.commit.hexsha)

    assert alternates.read_text() == f"{objects_of(other)}\n"
    assert text.startswith("refused: ")
    assert "ONLY_IN_THE_OTHER_REPOSITORY" not in text


async def test_restricted_tools_still_read_the_repositorys_own_objects(
    test_repository: git.Repo,
):
    root = root_of(test_repository)
    (root / "packed.txt").write_text("PACKED\n")
    test_repository.index.add(["packed.txt"])
    test_repository.index.commit("packed")
    test_repository.git.gc("--quiet")  # moves every object into a pack
    (root / "loose.txt").write_text("LOOSE\n")
    test_repository.index.add(["loose.txt"])
    test_repository.index.commit("loose")

    for tool, arguments, expected in [
        ("git_show", {"revision": "HEAD:packed.txt"}, "PACKED"),
        ("git_show", {"revision": "HEAD:loose.txt"}, "LOOSE"),
        ("git_show", {"revision": "HEAD"}, "+LOOSE"),
        ("git_show", {"revision": "HEAD~1"}, "+PACKED"),
        ("git_diff", {"target": "HEAD~2"}, "+PACKED"),
        ("git_log", {}, "packed"),
    ]:
        result = await call(root, tool, {"repo_path": str(root)} | arguments)
        assert result["isError"] is False, result
        assert expected in result["content"][0]["text"]
    assert "+LOOSE" in await summarize(root, root, "HEAD~1")


async def test_restricted_writes_land_in_the_repositorys_own_store(tmp_path: Path):
    # A repository with no loose-object directories yet, so every object the
    # tools write is the first in its directory.
    repo = git.Repo.init(tmp_path / "fresh")
    root = root_of(repo)
    for config in [("user.name", "t"), ("user.email", "t@example.com")]:
        repo.git.config(*config)
    (root / "a.txt").write_text("A\n")
    (root / "b.txt").write_text("B\n")

    for tool, arguments in [
        ("git_add", {"files": ["a.txt"]}),
        ("git_commit", {"message": "first"}),
        ("git_create_branch", {"branch_name": "side"}),
        ("git_checkout", {"branch_name": "side"}),
        ("git_add", {"files": ["b.txt"]}),
        ("git_commit", {"message": "on side"}),
        ("git_checkout", {"branch_name": "main"}),
    ]:
        result = await call(root, tool, {"repo_path": str(root)} | arguments)
        assert result["isError"] is False, (tool, result)
    (root / "c.txt").write_text("C\n")
    repo.index.add(["c.txt"])
    repo.index.commit("on main")
    # git itself writes the merge commit, through the private directory.
    result = await call(
        root,
        "git_merge",
        {"repo_path": str(root), "source_branch": "side", "fast_forward_only": False},
    )
    assert result["isError"] is False, result

    head = repo.git.rev_parse("HEAD")
    assert "with merge commit" in result["content"][0]["text"]
    # Every object is in the repository's own store, read by a git that runs
    # outside the server: fsck fails on any object HEAD reaches but lacks.
    assert len(repo.git.rev_list("--objects", "HEAD").splitlines()) >= 9
    repo.git.fsck("--no-dangling")
    assert repo.commit(head).parents[1].message.rstrip() == "on side"


async def test_restricted_calls_leave_no_object_directory_behind(
    test_repository: git.Repo, tmp_path: Path
):
    root = root_of(test_repository)
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    with mock.patch("tempfile.tempdir", str(scratch)):
        ok = await call(root, "git_show", {"repo_path": str(root), "revision": "HEAD"})
        failed = await call(
            root, "git_show", {"repo_path": str(root), "revision": "0" * 40}
        )
        await summarize(root, root, "HEAD")
    assert ok["isError"] is False
    assert failed["isError"] is True
    assert list(scratch.iterdir()) == []


def test_a_restricted_repository_is_opened_only_inside_a_call(
    test_repository: git.Repo,
):
    # Outside `_one_call()` there is nothing to end the private store with.
    with pytest.raises(RuntimeError, match="needs _one_call"):
        server._read_own_objects_for_call(test_repository)


async def test_unrestricted_git_show_follows_alternates(
    test_repository: git.Repo, other: git.Repo
):
    # Without --repository, a clone made with --shared or --reference reads
    # its objects from the store it names, as git does.
    root = root_of(test_repository)
    alternates = objects_of(test_repository) / "info" / "alternates"
    alternates.parent.mkdir(parents=True, exist_ok=True)
    alternates.write_text(f"{objects_of(other)}\n")

    result = await call(
        None,
        "git_show",
        {"repo_path": str(root), "revision": other.git.rev_parse("HEAD:only-here.txt")},
    )

    assert result["isError"] is False
    assert result["content"][0]["text"] == MARKER
