"""A repository's own configuration never makes the server run a program.

Git runs programs that configuration names: `core.fsmonitor` on an index
refresh, `diff.external` and textconv filters on a diff, filter and merge
drivers that `.gitattributes` selects, hooks, `gpg.program`. A repository's
`.git/config` and hooks travel with it (an unpacked archive, a shared folder),
so the server overrides all of them (`harden_repo`, `HARDENED_CONFIG`) and
none may run, on a read-only tool or any other.

Each test plants a program that records its own run in a canary file, drives
the real server through a client (`conftest.connect`), and asserts the canary
was never written. The payloads are POSIX shell scripts, so those tests skip
on Windows; the tests of `harden_repo` itself run everywhere.
"""

import os
import shlex
import stat
import sys
from pathlib import Path
from typing import Any
from unittest import mock

import git
import pytest
from conftest import connect, make_repo, wire

from mcp_server_git import server
from mcp_server_git.server import HARDENED_CONFIG, harden_repo

posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="the payloads are POSIX shell scripts"
)


def root_of(repo: git.Repo) -> Path:
    assert repo.working_dir is not None
    return Path(repo.working_dir)


class Payload:
    """A program that appends its first argument to a canary file.

    As a filter it passes its input through, and as a textconv it prints the
    file it is given, so a run that is not stopped still behaves like the
    real thing.
    """

    def __init__(self, directory: Path) -> None:
        directory.mkdir()
        self.canary = directory / "canary"
        self.script = directory / "payload.sh"
        canary = shlex.quote(str(self.canary))
        self.script.write_text(
            "#!/bin/sh\n"
            f'echo "$1" >> {canary}\n'
            'case "$1" in\n'
            "  filter) exec cat ;;\n"
            '  textconv) exec cat "$2" ;;\n'
            "esac\n"
            "exit 0\n"
        )
        self.script.chmod(self.script.stat().st_mode | stat.S_IEXEC)

    def command(self, tag: str) -> str:
        """A shell command line that runs the payload with `tag`."""
        return f"{shlex.quote(str(self.script))} {tag}"

    def install_hooks(self, repo: git.Repo, *names: str) -> None:
        hooks = Path(repo.git_dir) / "hooks"
        hooks.mkdir(exist_ok=True)
        for name in names:
            hook = hooks / name
            hook.write_text(f"#!/bin/sh\n{self.command(name)}\n")
            hook.chmod(hook.stat().st_mode | stat.S_IEXEC)

    def runs(self) -> list[str]:
        if not self.canary.exists():
            return []
        return self.canary.read_text().split()


@pytest.fixture
def payload(tmp_path: Path) -> Payload:
    return Payload(tmp_path / "payload")


async def call(
    name: str, arguments: dict[str, Any], repository: Path | None = None
) -> dict[str, Any]:
    async with connect(repository) as session:
        return wire(await session.call_tool(name, arguments))


def set_config(repo: git.Repo, **values: str) -> None:
    """Set `section.key` (or `section.sub.key`, as `section__sub__key`) values."""
    with repo.config_writer() as config:
        for name, value in values.items():
            parts = name.split("__")
            section = parts[0] if len(parts) == 2 else f'{parts[0]} "{parts[1]}"'
            config.set_value(section, parts[-1], value)


def commit_file(repo: git.Repo, name: str, content: str) -> None:
    (root_of(repo) / name).write_text(content, newline="\n")
    repo.git.add(name)
    repo.git.commit("-m", f"write {name}")


# --------------------------------------------------------------------------
# core.fsmonitor
# --------------------------------------------------------------------------


@posix_only
@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("git_status", {}),
        ("git_diff_unstaged", {}),
        ("git_diff_staged", {}),
        ("git_diff", {"target": "HEAD"}),
        ("git_add", {"files": ["test.txt"]}),
        ("git_checkout", {"branch_name": "HEAD~0"}),
        ("git_commit", {"message": "change"}),
    ],
)
async def test_fsmonitor_never_runs(
    repo: git.Repo, payload: Payload, tool: str, arguments: dict[str, Any]
):
    (root_of(repo) / "test.txt").write_text("changed\n")
    repo.git.add("test.txt")
    (root_of(repo) / "test.txt").write_text("changed again\n")
    set_config(repo, core__fsmonitor=payload.command("fsmonitor"))

    result = await call(tool, {"repo_path": str(root_of(repo)), **arguments})

    assert result["isError"] is False, result
    assert payload.runs() == []


@posix_only
async def test_fsmonitor_never_runs_under_repository(repo: git.Repo, payload: Payload):
    # The same holds for a repository nested inside the allowed one.
    nested = make_repo(root_of(repo) / "vendor" / "nested")
    set_config(nested, core__fsmonitor=payload.command("fsmonitor"))
    nested.close()

    result = await call(
        "git_status",
        {"repo_path": str(root_of(repo) / "vendor" / "nested")},
        root_of(repo),
    )

    assert result["isError"] is False, result
    assert payload.runs() == []


# --------------------------------------------------------------------------
# External diff programs and textconv filters
# --------------------------------------------------------------------------


@posix_only
@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("git_diff_unstaged", {}),
        ("git_diff_staged", {}),
        ("git_diff", {"target": "HEAD"}),
    ],
)
async def test_external_diff_never_runs(
    repo: git.Repo, payload: Payload, tool: str, arguments: dict[str, Any]
):
    set_config(
        repo,
        diff__external=payload.command("external"),
        diff__evil__command=payload.command("command"),
    )
    (root_of(repo) / ".gitattributes").write_text("*.txt diff=evil\n")
    (root_of(repo) / "test.txt").write_text("changed\n")
    (root_of(repo) / "staged.txt").write_text("staged\n")
    repo.git.add("staged.txt")

    result = await call(tool, {"repo_path": str(root_of(repo)), **arguments})

    assert result["isError"] is False, result
    assert (
        "+changed" in result["content"][0]["text"]
        or "+staged" in (result["content"][0]["text"])
    )
    assert payload.runs() == []


@posix_only
async def test_textconv_never_runs(repo: git.Repo, payload: Payload):
    set_config(repo, diff__evil__textconv=payload.command("textconv"))
    commit_file(repo, ".gitattributes", "*.txt diff=evil\n")
    (root_of(repo) / "test.txt").write_text("changed\n")

    async with connect(None) as session:
        for tool in ("git_diff_unstaged", "git_diff"):
            arguments = {"repo_path": str(root_of(repo))}
            if tool == "git_diff":
                arguments["target"] = "HEAD"
            result = wire(await session.call_tool(tool, arguments))
            assert "+changed" in result["content"][0]["text"], result

    assert payload.runs() == []


# --------------------------------------------------------------------------
# Hooks
# --------------------------------------------------------------------------

ALL_HOOKS = (
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "post-checkout",
    "pre-merge-commit",
    "post-merge",
    "reference-transaction",
    "post-index-change",
)


@posix_only
async def test_no_hook_runs(repo: git.Repo, payload: Payload):
    # git_commit (GitPython runs pre-commit, commit-msg and post-commit
    # itself), git_checkout (post-checkout), git_merge (pre-merge-commit,
    # post-merge), and every ref update and index write.
    repo.git.checkout("-b", "feature")
    commit_file(repo, "feature.txt", "feature\n")
    repo.git.checkout("main")
    commit_file(repo, "main.txt", "main\n")
    payload.install_hooks(repo, *ALL_HOOKS)
    path = str(root_of(repo))

    async with connect(None) as session:
        calls: list[tuple[str, dict[str, Any]]] = [
            ("git_merge", {"source_branch": "feature", "fast_forward_only": False}),
            ("git_checkout", {"branch_name": "feature"}),
            ("git_checkout", {"branch_name": "main"}),
            ("git_add", {"files": ["new.txt"]}),
            ("git_commit", {"message": "new"}),
            ("git_reset", {}),
            ("git_create_branch", {"branch_name": "other"}),
        ]
        (root_of(repo) / "new.txt").write_text("new\n")
        for tool, arguments in calls:
            result = wire(
                await session.call_tool(tool, {"repo_path": path, **arguments})
            )
            assert result["isError"] is False, (tool, result)

    assert payload.runs() == []


# --------------------------------------------------------------------------
# Filter and merge drivers
# --------------------------------------------------------------------------


@posix_only
@pytest.mark.parametrize("kind", ["clean", "smudge", "process"])
async def test_filter_driver_never_runs(repo: git.Repo, payload: Payload, kind: str):
    commit_file(repo, ".gitattributes", "*.txt filter=evil\n")
    repo.git.checkout("-b", "other")
    commit_file(repo, "other.txt", "other\n")
    repo.git.checkout("main")
    set_config(repo, **{f"filter__evil__{kind}": payload.command("filter")})
    (root_of(repo) / "new.txt").write_text("new\n")
    path = str(root_of(repo))

    async with connect(None) as session:
        for tool, arguments in (
            ("git_status", {}),
            ("git_diff_unstaged", {}),
            ("git_add", {"files": ["new.txt"]}),
            ("git_checkout", {"branch_name": "other"}),
        ):
            result = wire(
                await session.call_tool(tool, {"repo_path": path, **arguments})
            )
            assert result["isError"] is False, (tool, result)

    assert payload.runs() == []
    assert (root_of(repo) / "other.txt").read_text() == "other\n"


@posix_only
async def test_merge_driver_never_runs(repo: git.Repo, payload: Payload):
    # With the driver disabled, the conflicting change is a plain conflict,
    # which git_merge aborts.
    commit_file(repo, ".gitattributes", "*.txt merge=evil\n")
    repo.git.checkout("-b", "feature")
    commit_file(repo, "test.txt", "feature\n")
    repo.git.checkout("main")
    commit_file(repo, "test.txt", "main\n")
    set_config(repo, merge__evil__driver=payload.command("merge"))

    result = await call(
        "git_merge",
        {
            "repo_path": str(root_of(repo)),
            "source_branch": "feature",
            "fast_forward_only": False,
        },
    )

    assert result["isError"] is True
    assert "stopped on conflicts in: test.txt" in result["content"][0]["text"]
    assert payload.runs() == []


@posix_only
async def test_signing_program_never_runs(repo: git.Repo, payload: Payload):
    gpg = payload.script.parent / "gpg.sh"
    gpg.write_text(f"#!/bin/sh\n{payload.command('gpg')}\nexit 1\n")
    gpg.chmod(gpg.stat().st_mode | stat.S_IEXEC)
    repo.git.checkout("-b", "feature")
    commit_file(repo, "feature.txt", "feature\n")
    repo.git.checkout("main")
    commit_file(repo, "main.txt", "main\n")
    set_config(
        repo,
        commit__gpgSign="true",
        merge__verifySignatures="true",
        user__signingKey="ABCDEF",
        gpg__program=str(gpg),
    )

    result = await call(
        "git_merge",
        {
            "repo_path": str(root_of(repo)),
            "source_branch": "feature",
            "fast_forward_only": False,
        },
    )

    assert result["isError"] is False, result
    assert payload.runs() == []


@posix_only
async def test_merge_options_never_run_the_signing_program(
    repo: git.Repo, payload: Payload
):
    # `branch.<name>.mergeOptions` reaches git merge as command-line options,
    # which outrank `commit.gpgSign=false`: `--gpg-sign` there would sign the
    # merge commit with the repository's `gpg.program`.
    gpg = payload.script.parent / "gpg.sh"
    gpg.write_text(f"#!/bin/sh\n{payload.command('gpg')}\nexit 1\n")
    gpg.chmod(gpg.stat().st_mode | stat.S_IEXEC)
    repo.git.checkout("-b", "feature")
    commit_file(repo, "feature.txt", "feature\n")
    repo.git.checkout("main")
    commit_file(repo, "main.txt", "main\n")
    set_config(
        repo,
        branch__main__mergeOptions="--gpg-sign --verify-signatures",
        user__signingKey="ABCDEF",
        gpg__program=str(gpg),
    )

    result = await call(
        "git_merge",
        {
            "repo_path": str(root_of(repo)),
            "source_branch": "feature",
            "fast_forward_only": False,
        },
    )

    assert result["isError"] is False, result
    assert payload.runs() == []


@posix_only
async def test_submodule_configuration_is_not_reached(
    tmp_path: Path, repo: git.Repo, payload: Payload
):
    # Status and diff look inside a submodule by running git there, under the
    # submodule's own configuration, which the server's overrides of driver
    # names cannot see; they no longer look inside.
    source = make_repo(tmp_path / "source")
    commit_file(source, ".gitattributes", "*.txt filter=evil\n")
    source.close()
    repo.git(c="protocol.file.allow=always").submodule(
        "add", str(tmp_path / "source"), "sm"
    )
    repo.git.commit("-m", "add submodule")
    submodule = git.Repo(root_of(repo) / "sm")
    set_config(submodule, filter__evil__clean=payload.command("filter"))
    submodule.close()
    # Same content, new mtime: git must read the file again, through the filter.
    os.utime(root_of(repo) / "sm" / "test.txt", (1_000_000_000, 1_000_000_000))
    path = str(root_of(repo))

    async with connect(None) as session:
        for tool in ("git_status", "git_diff_unstaged"):
            result = wire(await session.call_tool(tool, {"repo_path": path}))
            assert result["isError"] is False, (tool, result)

    assert payload.runs() == []


# --------------------------------------------------------------------------
# harden_repo
# --------------------------------------------------------------------------


def config_value(repo: git.Repo, key: str) -> str:
    return repo.git.config("--get", key)


def test_harden_repo_overrides_the_repository_configuration(repo: git.Repo):
    set_config(repo, core__fsmonitor="true", core__hooksPath="hooks")
    harden_repo(repo)
    for key, value in HARDENED_CONFIG:
        assert config_value(repo, key) == value


def test_harden_repo_keeps_the_users_own_drivers(
    tmp_path: Path, repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # A driver from the user's global configuration (git-lfs, say) keeps
    # working; the repository's own drivers are emptied, and a repository
    # that redefines the user's driver gets that one emptied too.
    global_config = tmp_path / "global-config"
    global_config.write_text(
        '[filter "lfs"]\n\tclean = lfs-clean\n[filter "mine"]\n\tsmudge = my-smudge\n'
    )
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(global_config))
    set_config(
        repo,
        filter__lfs__clean="evil",
        filter__Evil__process="evil",
        merge__evil__driver="evil",
        branch__main__mergeOptions="--gpg-sign",
    )

    harden_repo(repo)

    assert config_value(repo, "filter.mine.smudge") == "my-smudge"
    assert config_value(repo, "filter.lfs.clean") == ""
    assert config_value(repo, "filter.Evil.process") == ""
    assert config_value(repo, "merge.evil.driver") == ""
    assert config_value(repo, "branch.main.mergeOptions") == ""


def test_harden_repo_keeps_the_users_command_line_configuration(
    repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # Configuration the user passes the server through GIT_CONFIG_COUNT stays
    # in force; the overrides are numbered after it.
    monkeypatch.setenv("GIT_CONFIG_COUNT", "1")
    monkeypatch.setenv("GIT_CONFIG_KEY_0", "user.name")
    monkeypatch.setenv("GIT_CONFIG_VALUE_0", "From Environment")
    harden_repo(repo)
    assert config_value(repo, "user.name") == "From Environment"
    assert config_value(repo, "core.fsmonitor") == "false"


def test_harden_repo_refuses_a_git_that_ignores_the_overrides(
    tmp_path: Path, repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    # Git before 2.31 ignores GIT_CONFIG_COUNT; simulated by setting nothing.
    # With no configuration but the repository's, nothing matches (exit 1).
    (tmp_path / "empty-config").write_text("")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(tmp_path / "empty-config"))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    with (
        mock.patch.object(server, "_config_env", return_value={}),
        pytest.raises(git.GitError, match="Git 2.31 or later is required"),
    ):
        harden_repo(repo)


def test_harden_repo_reports_a_failing_git(repo: git.Repo):
    # Any failure but "nothing matched" (exit 1) is git's own, reported as is.
    failure = git.GitCommandError(["git", "config"], 128, "fatal: bad config")
    with (
        mock.patch.object(git.Git, "config", side_effect=failure, create=True),
        pytest.raises(git.GitCommandError, match="bad config"),
    ):
        harden_repo(repo)
