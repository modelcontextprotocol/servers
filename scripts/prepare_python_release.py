#!/usr/bin/env uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "tomlkit>=0.13.2"
# ]
# ///
"""Stamp today's CalVer date onto Python packages that changed since their last version bump.

Used by the prepare-release workflow (see RELEASING.md). The TypeScript packages
are versioned by changesets and are not touched by this script.

For each src/*/pyproject.toml:
  1. Find the last commit that changed the `version` field.
  2. If any .py, .md, or pyproject.toml file in the package changed since then,
     set the version to today's date (CalVer, e.g. 2026.8.1) and refresh uv.lock.

Publishing stays safe regardless: release.yml only publishes versions that are
not already on the registry.
"""

import argparse
import datetime
import subprocess
import sys
from pathlib import Path

import tomlkit

RELEVANT_SUFFIXES = {".py", ".md"}  # .md counts: READMEs ship in the sdist


def git(args: list[str], cwd: Path) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


def last_version_bump_commit(package_dir: Path) -> str | None:
    """The most recent commit that changed the version line in pyproject.toml."""
    output = git(
        ["log", "-1", "--format=%H", "-G", r"^version\s*=", "--", "pyproject.toml"],
        cwd=package_dir,
    )
    return output or None


def has_relevant_changes(package_dir: Path, since_commit: str) -> bool:
    output = git(["diff", "--name-only", since_commit, "--", "."], cwd=package_dir)
    for line in output.splitlines():
        path = Path(line)
        if path.suffix in RELEVANT_SUFFIXES or path.name == "pyproject.toml":
            return True
    return False


def stamp_version(package_dir: Path, version: str) -> None:
    pyproject = package_dir / "pyproject.toml"
    data = tomlkit.parse(pyproject.read_text())
    data["project"]["version"] = version  # type: ignore[index]
    pyproject.write_text(tomlkit.dumps(data))
    # Refresh uv.lock to match the updated pyproject.toml
    subprocess.run(["uv", "lock"], cwd=package_dir, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("src"))
    args = parser.parse_args()

    directory = args.directory.resolve(strict=True)
    today = datetime.date.today()
    version = f"{today.year}.{today.month}.{today.day}"

    stamped = []
    for pyproject in sorted(directory.glob("*/pyproject.toml")):
        package_dir = pyproject.parent
        data = tomlkit.parse(pyproject.read_text())
        name = str(data["project"]["name"])  # type: ignore[index]
        current = str(data["project"]["version"])  # type: ignore[index]

        if current == version:
            print(f"{name}: already at {version}, skipping", file=sys.stderr)
            continue

        since = last_version_bump_commit(package_dir)
        # No version-bump commit found (shouldn't happen with full history):
        # stamp anyway — release.yml's registry guard makes over-stamping harmless.
        if since is not None and not has_relevant_changes(package_dir, since):
            print(f"{name}: no changes since {current}, skipping", file=sys.stderr)
            continue

        stamp_version(package_dir, version)
        stamped.append(f"{name}: {current} -> {version}")
        print(f"{name}: {current} -> {version}", file=sys.stderr)

    # stdout is the machine-readable summary (used as the PR body)
    for line in stamped:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
