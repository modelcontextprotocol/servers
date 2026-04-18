"""Tests for release.py has_changes function."""

import subprocess
import tempfile
from pathlib import Path

from release import has_changes, GitHash


def _run(cmd: str, cwd: Path) -> None:
    subprocess.run(cmd.split(), cwd=cwd, check=True, capture_output=True)


def _init_repo(tmp: Path) -> GitHash:
    """Create a git repo with an initial commit and return its hash."""
    _run("git init", tmp)
    _run("git config user.email test@test.com", tmp)
    _run("git config user.name Test", tmp)
    (tmp / "README.md").write_text("init")
    _run("git add -A", tmp)
    _run("git commit -m init", tmp)
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=tmp, check=True, capture_output=True, text=True,
    )
    return GitHash(result.stdout.strip())


def test_no_changes():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        git_hash = _init_repo(tmp)
        assert has_changes(tmp, git_hash) is False


def test_py_file_change():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        git_hash = _init_repo(tmp)
        (tmp / "server.py").write_text("print('hi')")
        _run("git add -A", tmp)
        _run("git commit -m add-py", tmp)
        assert has_changes(tmp, git_hash) is True


def test_lockfile_change():
    """Lockfile-only changes must be detected -- this was the bug."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        git_hash = _init_repo(tmp)
        (tmp / "uv.lock").write_text("lockfile content")
        _run("git add -A", tmp)
        _run("git commit -m add-lock", tmp)
        assert has_changes(tmp, git_hash) is True


def test_toml_change():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        git_hash = _init_repo(tmp)
        (tmp / "pyproject.toml").write_text("[project]\nname='x'")
        _run("git add -A", tmp)
        _run("git commit -m add-toml", tmp)
        assert has_changes(tmp, git_hash) is True


if __name__ == "__main__":
    test_no_changes()
    test_py_file_change()
    test_lockfile_change()
    test_toml_change()
    print("All tests passed.")
