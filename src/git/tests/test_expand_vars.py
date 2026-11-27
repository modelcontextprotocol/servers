"""A tool's `repo_path` is taken literally: no `$NAME` or `~` in it is expanded.

GitPython's `Repo()` expands environment variables in the path it is given
unless it is passed `expand_vars=False`, and expands a leading `~` (from
`HOME`) in any relative path. A `$NAME`, `${NAME}` or `~` in `repo_path` must
name a file whose name holds those characters, so the result of a tool call
(its errors included) never holds the value of `HOME` or of a variable the
path names. A `$NAME` in `--repository` is taken literally too. These tests
set a variable, name it in a path, and assert on what a client receives over
the wire.
"""

from pathlib import Path

import git
import pytest
from conftest import connect, make_repo, wire

VALUE = "value-of-the-variable"
NAME = "MCP_GIT_TEST_VARIABLE"


@pytest.fixture(autouse=True)
def variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(NAME, VALUE)


async def status(repository: Path | None, repo_path: str) -> dict[str, object]:
    async with connect(repository) as session:
        return wire(await session.call_tool("git_status", {"repo_path": repo_path}))


def text_of(result: dict[str, object]) -> str:
    content = result["content"]
    assert isinstance(content, list)
    return "".join(block["text"] for block in content)


@pytest.mark.parametrize("reference", [f"${NAME}", f"${{{NAME}}}"])
async def test_relative_repo_path_is_not_expanded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reference: str
):
    monkeypatch.chdir(tmp_path)
    result = await status(None, reference)
    assert result["isError"] is True
    assert VALUE not in text_of(result)
    assert reference in text_of(result)


@pytest.mark.parametrize("reference", [f"${NAME}", f"${{{NAME}}}"])
async def test_repo_path_under_repository_is_not_expanded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reference: str
):
    root = tmp_path / "repo"
    make_repo(root).close()
    # With the working directory inside the allowed repository, a relative
    # path passes the --repository check before the repository is opened.
    monkeypatch.chdir(root)
    for repo_path in (reference, str(root / reference)):
        result = await status(root, repo_path)
        assert result["isError"] is True
        assert VALUE not in text_of(result)


@pytest.mark.parametrize("reference", ["~", "~/repo"])
async def test_tilde_in_repo_path_is_not_expanded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reference: str
):
    home = tmp_path / VALUE
    make_repo(home / "repo").close()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    monkeypatch.chdir(tmp_path)
    result = await status(None, reference)
    assert result["isError"] is True
    assert VALUE not in text_of(result)
    assert str(tmp_path / reference) in text_of(result)


async def test_repository_named_with_a_dollar_sign_opens(tmp_path: Path):
    # Made under a plain name and renamed, since `make_repo` would expand it.
    root = tmp_path / f"${NAME}"
    make_repo(tmp_path / "plain").close()
    (tmp_path / "plain").rename(root)
    for repository in (None, root):
        result = await status(repository, str(root))
        assert result["isError"] is False, result
        assert "On branch main" in text_of(result)
        # Reading a commit goes through the object database's own git.
        async with connect(repository) as session:
            log = wire(await session.call_tool("git_log", {"repo_path": str(root)}))
        assert log["isError"] is False, log
        assert "initial commit" in text_of(log)


async def test_repository_with_separate_git_dir_named_with_a_dollar_sign(
    tmp_path: Path,
):
    # A git dir outside the working tree makes the --repository check compare
    # it with the allowed root's own. Its `core.worktree` names the root back,
    # as a submodule's git dir does, so the root is one the check accepts.
    root = tmp_path / f"${NAME}"
    root.mkdir()
    git_dir = tmp_path / "gitdir"
    git.Git(root).init(f"--separate-git-dir={git_dir}")
    git.Git(root).config("core.worktree", str(root))
    result = await status(root, str(root))
    assert result["isError"] is False, result
    assert "No commits yet" in text_of(result)
