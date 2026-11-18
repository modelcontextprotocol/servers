"""A repository's promisor remote never makes the server fetch, or run a program.

A repository that declares a promisor remote (`remote.<name>.promisor`,
`extensions.partialClone`, a partial clone) has git fetch any object it is
missing from that remote on its own, from a read-only command. The fetch runs
the transport program the repository's configuration names
(`remote.<name>.uploadpack`, `core.sshCommand`). The server sets
GIT_NO_LAZY_FETCH for every git command (`harden_repo`), so a missing object
is an error and nothing runs; on a git too old to honor that, it refuses such
a repository instead.

Each protocol-level test plants a transport program that records its run in a
canary file, makes an object the tool needs absent, drives the real server
through a client (`conftest.connect`), and asserts the canary was never
written. The payloads are POSIX shell commands, so those tests skip on
Windows; the tests of the version rule run everywhere.
"""

import secrets
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any
from unittest import mock

import git
import pytest
from conftest import connect, make_repo, wire

from mcp_server_git.server import _honors_no_lazy_fetch, harden_repo

posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="the payloads are POSIX shell commands"
)

# The protocol tests check what GIT_NO_LAZY_FETCH stops. A git that ignores
# it (by its version; a distribution backport reads as old) refuses these
# repositories instead, which the tests of `harden_repo` below cover, so
# there the protocol tests would pass without testing the variable.
lazy_fetch_off = pytest.mark.skipif(
    not _honors_no_lazy_fetch(git.Git().version_info),
    reason="this git does not honor GIT_NO_LAZY_FETCH",
)


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


def run_git(*args: str) -> None:
    subprocess.run(["git", *args], check=True, capture_output=True)


def two_commits(path: Path) -> git.Repo:
    """A repository whose `test.txt` changed in a second commit."""
    repo = make_repo(path)
    (path / "test.txt").write_text("changed\n", newline="\n")
    repo.git.commit("-qam", "second")
    return repo


def drop(repo: git.Repo, revision: str) -> None:
    """Delete the loose object `revision` names from the object store."""
    sha = repo.git.rev_parse(revision)
    (Path(repo.git_dir) / "objects" / sha[:2] / sha[2:]).unlink()


def absent_sha() -> str:
    return secrets.token_hex(20)


class Canary:
    """Transport programs that record their run in one file."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def uploadpack(self) -> str:
        # Then hands over to the real upload-pack, so a fetch that is not
        # stopped completes and the tool would answer normally.
        return f"sh -c 'echo uploadpack >> {shlex.quote(str(self.path))}; exec git-upload-pack \"$@\"' --"

    def ssh(self) -> str:
        return f"sh -c 'echo ssh >> {shlex.quote(str(self.path))}; exit 1'"

    def ran(self) -> bool:
        return self.path.exists()


@pytest.fixture
def canary(tmp_path: Path) -> Canary:
    return Canary(tmp_path / "canary")


def promisor_uploadpack(repo: git.Repo, canary: Canary, url: str) -> None:
    with repo.config_writer() as config:
        config.set_value('remote "origin"', "url", url)
        config.set_value('remote "origin"', "promisor", "true")
        config.set_value('remote "origin"', "uploadpack", canary.uploadpack())


def promisor_ssh(repo: git.Repo, canary: Canary) -> None:
    with repo.config_writer() as config:
        config.set_value('remote "origin"', "url", "ssh://git@host.invalid/x.git")
        config.set_value('remote "origin"', "promisor", "true")
        config.set_value("core", "sshCommand", canary.ssh())


async def call(
    name: str, arguments: dict[str, Any], repository: Path | None = None
) -> dict[str, Any]:
    async with connect(repository) as session:
        return wire(await session.call_tool(name, arguments))


# --------------------------------------------------------------------------
# A missing object in a plain repository with a promisor remote
# --------------------------------------------------------------------------


@posix_only
@lazy_fetch_off
@pytest.mark.parametrize("transport", ["uploadpack", "ssh"])
async def test_show_of_a_missing_blob_runs_nothing(
    tmp_path: Path, canary: Canary, transport: str
):
    repo = two_commits(tmp_path / "repo")
    drop(repo, "HEAD~1:test.txt")
    if transport == "uploadpack":
        promisor_uploadpack(repo, canary, str(tmp_path / "nothing"))
    else:
        promisor_ssh(repo, canary)
    repo.close()

    await call("git_show", {"repo_path": str(tmp_path / "repo"), "revision": "HEAD"})

    assert not canary.ran()


@posix_only
@lazy_fetch_off
@pytest.mark.parametrize("transport", ["uploadpack", "ssh"])
@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("git_branch", lambda sha: {"branch_type": "all", "contains": sha}),
        ("git_diff", lambda sha: {"target": sha}),
        ("git_show", lambda sha: {"revision": sha}),
    ],
)
async def test_an_absent_object_id_runs_nothing(
    tmp_path: Path, canary: Canary, transport: str, tool: str, arguments: Any
):
    # A complete repository: an object id that names nothing is enough.
    repo = two_commits(tmp_path / "repo")
    if transport == "uploadpack":
        promisor_uploadpack(repo, canary, str(tmp_path / "nothing"))
    else:
        promisor_ssh(repo, canary)
    repo.close()

    await call(tool, {"repo_path": str(tmp_path / "repo"), **arguments(absent_sha())})

    assert not canary.ran()


@posix_only
@lazy_fetch_off
@pytest.mark.parametrize("transport", ["uploadpack", "ssh"])
@pytest.mark.parametrize("tool", ["git_status", "git_diff_staged", "git_diff_unstaged"])
async def test_a_missing_head_tree_runs_nothing(
    tmp_path: Path, canary: Canary, transport: str, tool: str
):
    repo = two_commits(tmp_path / "repo")
    drop(repo, "HEAD^{tree}")
    if transport == "uploadpack":
        # A bare copy inside the repository's own .git: a fetch that is not
        # stopped succeeds, and the tool would answer as if nothing happened.
        source = Path(repo.git_dir) / "source.git"
        run_git("clone", "-q", "--bare", str(tmp_path / "repo"), str(source))
        promisor_uploadpack(repo, canary, str(source))
    else:
        promisor_ssh(repo, canary)
    repo.close()

    await call(tool, {"repo_path": str(tmp_path / "repo")})

    assert not canary.ran()


# --------------------------------------------------------------------------
# A genuine partial clone, and the same under --repository
# --------------------------------------------------------------------------


@posix_only
@lazy_fetch_off
async def test_partial_clone_runs_nothing(tmp_path: Path, canary: Canary):
    upstream = two_commits(tmp_path / "upstream")
    upstream.git.config("uploadpack.allowFilter", "true")
    upstream.close()
    clone = tmp_path / "clone"
    run_git(
        "clone",
        "-q",
        "--filter=blob:none",
        f"file://{tmp_path / 'upstream'}",
        str(clone),
    )
    run_git("-C", str(clone), "config", "remote.origin.uploadpack", canary.uploadpack())

    await call("git_show", {"repo_path": str(clone), "revision": "HEAD"})

    assert not canary.ran()


@posix_only
@lazy_fetch_off
async def test_nested_repository_runs_nothing_under_repository(
    tmp_path: Path, canary: Canary
):
    workspace = make_repo(tmp_path / "workspace")
    nested = two_commits(root_of(workspace) / "vendor" / "lib")
    drop(nested, "HEAD^{tree}")
    promisor_uploadpack(nested, canary, str(tmp_path / "nothing"))
    nested.close()

    for tool, arguments in [("git_status", {}), ("git_show", {"revision": "HEAD"})]:
        await call(
            tool,
            {"repo_path": str(root_of(workspace) / "vendor" / "lib"), **arguments},
            root_of(workspace),
        )
    workspace.close()

    assert not canary.ran()


@posix_only
@lazy_fetch_off
async def test_partial_clone_extension_runs_nothing_under_repository(
    tmp_path: Path, canary: Canary
):
    # A modified file whose committed blob is gone, in a repository that
    # declares itself a partial clone, opened as the --repository itself.
    repo = make_repo(tmp_path / "repo")
    (tmp_path / "repo" / "test.txt").write_text("modified\n", newline="\n")
    drop(repo, "HEAD:test.txt")
    promisor_uploadpack(repo, canary, str(tmp_path / "nothing"))
    repo.git.config("extensions.partialClone", "origin")
    repo.close()

    await call(
        "git_diff_unstaged", {"repo_path": str(tmp_path / "repo")}, tmp_path / "repo"
    )

    assert not canary.ran()


@posix_only
@lazy_fetch_off
async def test_a_complete_repository_with_a_promisor_still_works(
    tmp_path: Path, canary: Canary
):
    # Nothing is missing, so nothing would be fetched: the tools answer.
    repo = two_commits(tmp_path / "repo")
    promisor_uploadpack(repo, canary, str(tmp_path / "nothing"))
    repo.close()

    result = await call(
        "git_show", {"repo_path": str(tmp_path / "repo"), "revision": "HEAD"}
    )

    assert result["isError"] is False, result
    assert "second" in result["content"][0]["text"]
    assert not canary.ran()


# --------------------------------------------------------------------------
# A git too old to honor GIT_NO_LAZY_FETCH
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("version", "honors"),
    [
        ((2, 31, 0), False),
        ((2, 39, 3), False),
        ((2, 39, 4), True),
        ((2, 39, 5), True),
        ((2, 40, 1), False),
        ((2, 40, 2), True),
        ((2, 41, 1), True),
        ((2, 42, 2), True),
        ((2, 43, 3), False),
        ((2, 43, 4), True),
        ((2, 44, 0), False),
        ((2, 44, 1), True),
        ((2, 45, 0), False),
        ((2, 45, 1), True),
        ((2, 46), True),
        ((2, 53, 0, 1), True),
        ((3, 0), True),
    ],
)
def test_which_git_honors_no_lazy_fetch(version: tuple[int, ...], honors: bool):
    assert _honors_no_lazy_fetch(version) is honors


def old_git() -> Any:
    return mock.patch.object(
        git.Git, "version_info", new_callable=mock.PropertyMock, return_value=(2, 44, 0)
    )


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("remote.origin.promisor", "true"),
        ("remote.promisor", "true"),
        ("remote.partialCloneFilter", "blob:none"),
        ("remote.origin.partialCloneFilter", "blob:none"),
        ("extensions.partialClone", "origin"),
    ],
)
def test_old_git_refuses_a_repository_with_a_promisor_remote(
    tmp_path: Path, key: str, value: str
):
    repo = make_repo(tmp_path / "repo")
    repo.git.config(key, value)
    with old_git(), pytest.raises(git.GitError, match="Git 2.45.1 or later"):
        harden_repo(repo)
    repo.close()


def test_old_git_opens_a_repository_without_one(repo: git.Repo):
    with old_git():
        harden_repo(repo)


def test_old_git_reports_a_failing_git(repo: git.Repo):
    # Any failure but "nothing matched" (exit 1) is git's own, reported as is.
    real = repo.git.config
    failure = git.GitCommandError(["git", "config"], 128, "fatal: bad config")

    def config(*args: str, **kwargs: Any) -> Any:
        if "--get-regexp" in args and "--show-scope" not in args:
            raise failure
        return real(*args, **kwargs)

    with (
        old_git(),
        mock.patch.object(git.Git, "config", side_effect=config, create=True),
        pytest.raises(git.GitCommandError, match="bad config"),
    ):
        harden_repo(repo)
