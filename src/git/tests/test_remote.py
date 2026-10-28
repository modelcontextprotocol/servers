"""Tests for git_remote (#1611): listing remotes without leaking credentials.

The tool's output goes to the model, and a remote URL can carry a credential
(`https://user:token@host/...`), so most of these pin `redact_url`'s rule: the
whole userinfo is redacted except an SSH username, which names an account and
authenticates nothing. The protocol tests drive the real server through
`conftest.connect`; the unit tests cover URL shapes git would not let a test
configure as easily.
"""

from pathlib import Path
from typing import Any
from unittest import mock

import git
import pytest

from mcp_server_git import server
from mcp_server_git.server import git_remote, redact_url

from conftest import connect, make_repo, text_result, tool_error, wire


async def call_remote(repository: Path | None, repo: git.Repo) -> dict[str, Any]:
    assert repo.working_dir is not None
    async with connect(repository) as session:
        return wire(
            await session.call_tool("git_remote", {"repo_path": repo.working_dir})
        )


async def test_no_remotes(repo: git.Repo):
    assert await call_remote(None, repo) == text_result("No remotes configured")


async def test_lists_fetch_and_push_urls(repo: git.Repo):
    repo.create_remote("origin", "https://example.com/org/repo.git")
    repo.create_remote("upstream", "git@github.com:org/repo.git")
    repo.git.remote("set-url", "--push", "upstream", "/srv/mirror.git")
    assert await call_remote(None, repo) == text_result(
        "origin\thttps://example.com/org/repo.git (fetch)\n"
        "origin\thttps://example.com/org/repo.git (push)\n"
        "upstream\tgit@github.com:org/repo.git (fetch)\n"
        "upstream\t/srv/mirror.git (push)"
    )


async def test_credentials_are_redacted_over_the_wire(repo: git.Repo):
    repo.create_remote("origin", "https://user:s3cret-token@example.com/org/repo.git")
    repo.create_remote("fork", "https://ghp_abc123@github.com/me/repo.git")
    repo.git.remote("set-url", "--push", "fork", "ssh://git:hunter2@example.com/r")
    result = await call_remote(None, repo)
    assert result == text_result(
        "fork\thttps://<redacted>@github.com/me/repo.git (fetch)\n"
        "fork\tssh://git:<redacted>@example.com/r (push)\n"
        "origin\thttps://<redacted>@example.com/org/repo.git (fetch)\n"
        "origin\thttps://<redacted>@example.com/org/repo.git (push)"
    )
    text = result["content"][0]["text"]
    for secret in ("s3cret-token", "ghp_abc123", "hunter2"):
        assert secret not in text


async def test_respects_repository_confinement(tmp_path: Path, repo: git.Repo):
    # --repository must name a real repository, or serve() exits before the
    # client connects.
    allowed_repo = make_repo(tmp_path / "allowed")
    allowed_repo.close()
    allowed = (tmp_path / "allowed").resolve()
    assert await call_remote(allowed, repo) == tool_error(
        "git_remote",
        f"Repository path '{repo.working_dir}' is outside the allowed repository "
        f"'{allowed}'",
    )


async def test_not_a_repository(tmp_path: Path):
    plain = tmp_path / "plain"
    plain.mkdir()
    async with connect(None) as session:
        result = wire(await session.call_tool("git_remote", {"repo_path": str(plain)}))
    assert result == tool_error("git_remote", str(plain))


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        # HTTP(S): a token is as often the username as the password.
        (
            "https://user:token@example.com/r.git",
            "https://<redacted>@example.com/r.git",
        ),
        ("https://token@example.com/r.git", "https://<redacted>@example.com/r.git"),
        ("http://u:p@example.com:8080/r", "http://<redacted>@example.com:8080/r"),
        ("HTTPS://u:p@example.com/r", "HTTPS://<redacted>@example.com/r"),
        # Any other scheme with userinfo is treated the same way.
        ("ftps://u:p@example.com/r", "ftps://<redacted>@example.com/r"),
        # A password holding an unescaped '@': the userinfo runs to the last
        # '@' before the first '/', so none of it survives.
        ("https://u:p@ss@example.com/r", "https://<redacted>@example.com/r"),
        # No path at all.
        ("https://u:p@example.com", "https://<redacted>@example.com"),
        # SSH: the username stays, a password does not.
        ("ssh://git@example.com/r.git", "ssh://git@example.com/r.git"),
        ("ssh://git:pw@example.com/r.git", "ssh://git:<redacted>@example.com/r.git"),
        ("git+ssh://me:pw@example.com/r", "git+ssh://me:<redacted>@example.com/r"),
        ("SSH+GIT://me@example.com/r", "SSH+GIT://me@example.com/r"),
        # No userinfo: unchanged.
        ("https://example.com/r.git", "https://example.com/r.git"),
        ("https://example.com/path@x/r.git", "https://example.com/path@x/r.git"),
        ("git@github.com:org/r.git", "git@github.com:org/r.git"),
        ("/srv/repos/r.git", "/srv/repos/r.git"),
        ("file:///srv/repos/r.git", "file:///srv/repos/r.git"),
    ],
)
def test_redact_url(url: str, expected: str):
    assert redact_url(url) == expected


def test_unrecognized_line_is_redacted_whole(repo: git.Repo):
    # `git remote -v` always prints `<name>\t<url> (<direction>)`; a line in any
    # other shape is still redacted rather than passed through.
    with mock.patch.object(
        server,
        "_git_text",
        return_value="https://u:p@example.com/r\norigin\tno-direction\n",
    ):
        assert git_remote(repo) == (
            "https://<redacted>@example.com/r\norigin\tno-direction"
        )
