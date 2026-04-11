from __future__ import annotations

import importlib.util
import subprocess
import sys
import types
from pathlib import Path


sys.modules.setdefault("tomlkit", types.SimpleNamespace(parse=None, dumps=None))

spec = importlib.util.spec_from_file_location("release_script", Path("scripts/release.py"))
release = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(release)


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def test_has_changes_treats_lockfile_updates_as_relevant(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    pkg = repo / "src" / "git"
    pkg.mkdir(parents=True)

    git("init", cwd=repo)
    git("config", "user.name", "Test User", cwd=repo)
    git("config", "user.email", "test@example.com", cwd=repo)

    (pkg / "pyproject.toml").write_text(
        '[project]\nname = "mcp-server-git"\nversion = "2026.1.14"\n'
    )
    (pkg / "uv.lock").write_text("version = 1\n")

    git("add", ".", cwd=repo)
    git("commit", "-m", "initial", cwd=repo)
    base = git("rev-parse", "HEAD", cwd=repo)

    (pkg / "uv.lock").write_text("version = 2\n")

    assert release.has_changes(pkg, release.GitHash(base)) is True
