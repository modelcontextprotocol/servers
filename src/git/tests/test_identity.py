"""Where `git_commit` takes the commit's author and committer from (#619).

The server sets no identity of its own: `git_commit` goes through GitPython's
`IndexFile.commit`, whose `Actor` reads `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`
and `GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` from the server's environment
first, then `user.name`/`user.email` from the repository's config, the user's
`~/.gitconfig` and `$XDG_CONFIG_HOME/git/config`. The README's "Commit
identity" section tells users to configure the server exactly that way (an
`env` block, `docker run -e`, or a mounted gitconfig), so these tests pin each
route through the protocol: a dependency upgrade or a refactor that stopped
honoring one would otherwise silently commit as `root@<container id>`.
"""

from pathlib import Path

import git
import pytest

from conftest import connect, disable_autocrlf, text_result, wire

IDENTITY_VARS = (
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
    "GIT_COMMITTER_NAME",
    "GIT_COMMITTER_EMAIL",
)


@pytest.fixture(autouse=True)
def clean_identity_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start every test with no identity in the environment, whatever CI sets."""
    for name in IDENTITY_VARS:
        monkeypatch.delenv(name, raising=False)


async def commit_new_file(repo: git.Repo) -> git.Commit:
    """Stage a new file, commit it through the protocol, return the commit."""
    assert repo.working_dir is not None
    root = Path(repo.working_dir)
    (root / "new.txt").write_text("new\n", newline="\n")
    repo.index.add(["new.txt"])
    async with connect(None) as session:
        result = wire(
            await session.call_tool(
                "git_commit", {"repo_path": str(root), "message": "add new"}
            )
        )
    head = repo.head.commit
    assert result == text_result(
        f"Changes committed successfully with hash {head.hexsha}"
    )
    return head


async def test_environment_variables_set_author_and_committer(
    repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # The `repo` fixture configures user.name/user.email repo-locally; the
    # environment wins over it, as it does for `git commit`.
    monkeypatch.setenv("GIT_AUTHOR_NAME", "Ada Author")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "ada@example.com")
    monkeypatch.setenv("GIT_COMMITTER_NAME", "Cy Committer")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "cy@example.com")

    head = await commit_new_file(repo)

    assert (head.author.name, head.author.email) == ("Ada Author", "ada@example.com")
    assert (head.committer.name, head.committer.email) == (
        "Cy Committer",
        "cy@example.com",
    )


async def test_author_variables_alone_leave_the_committer_to_config(
    repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # Author and committer are resolved separately, which is why the README
    # tells users to set all four variables.
    monkeypatch.setenv("GIT_AUTHOR_NAME", "Ada Author")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "ada@example.com")

    head = await commit_new_file(repo)

    assert (head.author.name, head.author.email) == ("Ada Author", "ada@example.com")
    assert (head.committer.name, head.committer.email) == (
        "Test User",
        "test@example.com",
    )


async def test_user_gitconfig_in_home_sets_the_identity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    # The mounted-gitconfig route: no environment variables and no repo-local
    # identity, only a ~/.gitconfig under the server's HOME.
    home = tmp_path / "home"
    home.mkdir()
    (home / ".gitconfig").write_text(
        "[user]\n\tname = Gita Config\n\temail = gita@example.com\n"
    )
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))  # what expanduser reads on Windows
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

    repo = git.Repo.init(tmp_path / "repo", initial_branch="main")
    try:
        disable_autocrlf(repo)
        head = await commit_new_file(repo)
        assert (head.author.name, head.author.email) == (
            "Gita Config",
            "gita@example.com",
        )
        assert (head.committer.name, head.committer.email) == (
            "Gita Config",
            "gita@example.com",
        )
    finally:
        repo.close()
