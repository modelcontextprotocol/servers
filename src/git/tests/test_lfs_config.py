"""Git LFS never runs a program the repository's own configuration names.

The Git LFS filter comes from the user's global or system configuration, so
the server trusts it and leaves it working. Git LFS then reads its own keys
from the repository's configuration, and some of them name programs: an
extension's `clean` and `smudge` commands, and a transfer agent's `path` and
`args`. A download also runs the SSH command, credential helpers and askpass
program configured for an endpoint the repository can pick. `harden_repo`
empties the first group the way it empties filter drivers, and turns
downloads off (GIT_LFS_SKIP_SMUDGE), which covers the rest.

Git LFS is not installed in CI, so the protocol-level tests that always run
use a stand-in `git-lfs`: a filter that reads those keys with `git config`
and runs what they name, as Git LFS does, so a test sees exactly the
configuration and environment the real one would. The tests that drive the
real Git LFS skip when it is not on PATH. The payloads are POSIX shell
scripts, so the protocol-level tests skip on Windows.
"""

import shlex
import shutil
import stat
from pathlib import Path
from typing import Any

import git
import pytest
from conftest import connect, wire
from test_empty_driver_name import make_stale
from test_repository_config import Payload, commit_file, posix_only, root_of
from test_submodule_config import embed

from mcp_server_git.server import _submodule_drivers, harden_repo

# The Git LFS keys that name a program, each with a subsection name that
# exercises the match: plain, dotted and empty.
LFS_PROGRAM_KEYS = (
    "lfs.extension.poc.clean",
    "lfs.extension.poc.smudge",
    "lfs.extension.a.b.clean",
    "lfs.extension..smudge",
    "lfs.customtransfer.poc.path",
    "lfs.customtransfer.poc.args",
    "lfs.standalonetransferagent",
)

real_lfs = pytest.mark.skipif(
    shutil.which("git-lfs") is None, reason="Git LFS is not installed"
)

# What `git lfs install` writes to the user's configuration.
LFS_DRIVER = (
    '[filter "lfs"]\n'
    "\tclean = git-lfs clean -- %f\n"
    "\tsmudge = git-lfs smudge -- %f\n"
    "\tprocess = git-lfs filter-process\n"
    "\trequired = true\n"
)


@pytest.fixture
def payload(tmp_path: Path) -> Payload:
    return Payload(tmp_path / "payload")


def use_global_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, content: str
) -> None:
    """Make `content` the user's whole configuration, for git and the server."""
    config = tmp_path / "global-config"
    config.write_text(content)
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(config))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")


# --------------------------------------------------------------------------
# harden_repo itself
# --------------------------------------------------------------------------


@pytest.mark.parametrize("key", LFS_PROGRAM_KEYS)
def test_harden_repo_empties_the_repositorys_lfs_programs(repo: git.Repo, key: str):
    repo.git.config(key, "program")
    harden_repo(repo)
    assert repo.git.config("--get", key) == ""


def test_harden_repo_keeps_the_users_own_lfs_programs(
    tmp_path: Path, repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    use_global_config(
        tmp_path,
        monkeypatch,
        '[lfs "extension.mine"]\n\tclean = my-clean\n'
        '[lfs "customtransfer.mine"]\n\tpath = my-agent\n'
        "[lfs]\n\tstandalonetransferagent = mine\n",
    )
    harden_repo(repo)
    assert repo.git.config("--get", "lfs.extension.mine.clean") == "my-clean"
    assert repo.git.config("--get", "lfs.customtransfer.mine.path") == "my-agent"
    assert repo.git.config("--get", "lfs.standalonetransferagent") == "mine"


def test_harden_repo_turns_lfs_downloads_off(repo: git.Repo):
    harden_repo(repo)
    assert repo.git.environment()["GIT_LFS_SKIP_SMUDGE"] == "1"


def test_a_submodules_lfs_programs_are_listed(repo: git.Repo):
    # The Git LFS run inside a checked-out submodule reads the submodule's
    # configuration, so its keys are emptied like the opened repository's.
    inner = embed(repo, "sm")
    inner.git.config("lfs.extension.poc.clean", "program")
    assert "lfs.extension.poc.clean" in _submodule_drivers(repo)


# --------------------------------------------------------------------------
# Through the server, with a stand-in for Git LFS
# --------------------------------------------------------------------------


def install_stand_in(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A user filter `lfs` that runs what the LFS keys name, as Git LFS does.

    Its clean step runs the `poc` extension's `clean`; its smudge step runs
    the extension's `smudge` and, unless GIT_LFS_SKIP_SMUDGE is set, the
    transfer agent `lfs.standalonetransferagent` picks. It then passes the
    file through unchanged.
    """
    script = tmp_path / "git-lfs-stand-in.sh"
    script.write_text(
        "#!/bin/sh\n"
        'run() { if [ -n "$1" ]; then sh -c "$1" </dev/null; fi; }\n'
        'case "$1" in\n'
        '  clean) run "$(git config --get lfs.extension.poc.clean)" ;;\n'
        "  smudge)\n"
        '    run "$(git config --get lfs.extension.poc.smudge)"\n'
        '    if [ "$GIT_LFS_SKIP_SMUDGE" != 1 ]; then\n'
        "      agent=$(git config --get lfs.standalonetransferagent)\n"
        '      run "$(git config --get "lfs.customtransfer.$agent.path")"\n'
        "    fi ;;\n"
        "esac\n"
        "exec cat\n"
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    command = shlex.quote(str(script))
    use_global_config(
        tmp_path,
        monkeypatch,
        f'[filter "lfs"]\n\tclean = {command} clean\n'
        f"\tsmudge = {command} smudge\n\trequired = true\n",
    )


@posix_only
async def test_lfs_programs_never_run(
    tmp_path: Path, repo: git.Repo, payload: Payload, monkeypatch: pytest.MonkeyPatch
):
    install_stand_in(tmp_path, monkeypatch)
    commit_file(repo, ".gitattributes", "*.bin filter=lfs -text\n")
    commit_file(repo, "a.bin", "a\n")
    repo.git.checkout("-b", "other")
    commit_file(repo, "b.bin", "b\n")
    repo.git.checkout("main")
    repo.git.config("lfs.extension.poc.clean", payload.command("clean"))
    repo.git.config("lfs.extension.poc.smudge", payload.command("smudge"))
    repo.git.config("lfs.standalonetransferagent", "poc")
    repo.git.config("lfs.customtransfer.poc.path", payload.command("agent"))
    make_stale(root_of(repo) / "a.bin")
    (root_of(repo) / "new.bin").write_text("new\n")
    path = str(root_of(repo))

    for repository in (None, root_of(repo)):
        async with connect(repository) as session:
            for tool, arguments in (
                ("git_status", {}),
                ("git_diff_unstaged", {}),
                ("git_diff", {"target": "HEAD"}),
                ("git_add", {"files": ["new.bin"]}),
                ("git_checkout", {"branch_name": "other"}),
                ("git_checkout", {"branch_name": "main"}),
            ):
                result: dict[str, Any] = wire(
                    await session.call_tool(tool, {"repo_path": path, **arguments})
                )
                assert result["isError"] is False, (tool, result)

    assert payload.runs() == []


# --------------------------------------------------------------------------
# Through the server, with the real Git LFS
# --------------------------------------------------------------------------


def lfs_repo(
    tmp_path: Path, repo: git.Repo, monkeypatch: pytest.MonkeyPatch
) -> git.Repo:
    """`repo` with Git LFS installed for the user and one LFS file committed."""
    use_global_config(tmp_path, monkeypatch, LFS_DRIVER)
    commit_file(repo, ".gitattributes", "*.bin filter=lfs diff=lfs merge=lfs -text\n")
    commit_file(repo, "a.bin", "a\n")
    return repo


async def call(name: str, repo: git.Repo, **arguments: str) -> dict[str, Any]:
    async with connect(root_of(repo)) as session:
        return wire(
            await session.call_tool(
                name, {"repo_path": str(root_of(repo)), **arguments}
            )
        )


@real_lfs
@posix_only
async def test_git_lfs_keeps_working(
    tmp_path: Path, repo: git.Repo, monkeypatch: pytest.MonkeyPatch
):
    lfs_repo(tmp_path, repo, monkeypatch)
    make_stale(root_of(repo) / "a.bin")
    result = await call("git_status", repo)
    assert result["isError"] is False
    assert "nothing to commit" in result["content"][0]["text"]


@real_lfs
@posix_only
async def test_git_lfs_extension_never_runs(
    tmp_path: Path, repo: git.Repo, payload: Payload, monkeypatch: pytest.MonkeyPatch
):
    # Git LFS fails the command when an extension's program is empty.
    lfs_repo(tmp_path, repo, monkeypatch)
    repo.git.config("lfs.extension.poc.clean", payload.command("clean"))
    repo.git.config("lfs.extension.poc.priority", "0")
    make_stale(root_of(repo) / "a.bin")

    result = await call("git_status", repo)

    assert payload.runs() == []
    assert result["isError"] is True


@real_lfs
@posix_only
async def test_git_lfs_transfer_agent_never_runs(
    tmp_path: Path, repo: git.Repo, payload: Payload, monkeypatch: pytest.MonkeyPatch
):
    # The object is not in the local store, so a checkout would download it.
    # It writes the pointer file instead.
    lfs_repo(tmp_path, repo, monkeypatch)
    repo.git.checkout("-b", "other")
    commit_file(repo, "b.bin", "b\n")
    repo.git.checkout("main")
    shutil.rmtree(Path(repo.git_dir) / "lfs" / "objects")
    repo.git.config("lfs.url", "http://127.0.0.1:9/")
    repo.git.config("lfs.standalonetransferagent", "poc")
    # Git LFS runs the path as one program, with the arguments split from `args`.
    repo.git.config("lfs.customtransfer.poc.path", str(payload.script))
    repo.git.config("lfs.customtransfer.poc.args", "agent")

    result = await call("git_checkout", repo, branch_name="other")

    assert payload.runs() == []
    assert result["isError"] is False, result
    pointer = (root_of(repo) / "b.bin").read_text()
    assert pointer.startswith("version https://git-lfs.github.com/spec/v1\n")
