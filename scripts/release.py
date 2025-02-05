#!/usr/bin/env uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "click>=8.1.8",
#     "tomlkit>=0.13.2"
# ]
# ///
import datetime
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, NewType, Protocol

import click
import tomlkit

Version = NewType("Version", str)
GitHash = NewType("GitHash", str)


class GitHashParamType(click.ParamType):
    name = "git_hash"

    def convert(
        self, value: Any, param: click.Parameter | None, ctx: click.Context | None
    ) -> GitHash | None:
        if value is None:
            return None

        if not (8 <= len(value) <= 40):
            self.fail(f"Git hash must be between 8 and 40 characters, got {len(value)}")

        if not re.match(r"^[0-9a-fA-F]+$", value):
            self.fail("Git hash must contain only hex digits (0-9, a-f)")

        try:
            # Verify hash exists in repo
            subprocess.run(
                ["git", "rev-parse", "--verify", value], check=True, capture_output=True
            )
        except subprocess.CalledProcessError:
            self.fail(f"Git hash {value} not found in repository")

        return GitHash(value.lower())


GIT_HASH = GitHashParamType()


class Package(Protocol):
    path: Path

    def package_name(self) -> str: ...

    def update_version(self, version: Version) -> None: ...


@dataclass
class NpmPackage:
    path: Path

    def package_name(self) -> str:
        with open(self.path / "package.json", "r") as f:
            return json.load(f)["name"]

    def update_version(self, version: Version):
        with open(self.path / "package.json", "r+") as f:
            data = json.load(f)
            data["version"] = version
            f.seek(0)
            json.dump(data, f, indent=2)
            f.truncate()


@dataclass
class PyPiPackage:
    path: Path

    def package_name(self) -> str:
        with open(self.path / "pyproject.toml") as f:
            toml_data = tomlkit.parse(f.read())
            name = toml_data.get("project", {}).get("name")
            if not name:
                raise Exception("No name in pyproject.toml project section")
            return str(name)

    def update_version(self, version: Version):
        # Update version in pyproject.toml
        with open(self.path / "pyproject.toml") as f:
            data = tomlkit.parse(f.read())
            data["project"]["version"] = version

        with open(self.path / "pyproject.toml", "w") as f:
            f.write(tomlkit.dumps(data))


def has_changes(path: Path, git_hash: GitHash) -> bool:
    """Check if any files changed between current state and git hash"""
    try:
        output = subprocess.run(
            ["git", "diff", "--name-only", git_hash, "--", "."],
            cwd=path,
            check=True,
            capture_output=True,
            text=True,
        )

        changed_files = [Path(f) for f in output.stdout.splitlines()]
        relevant_files = [f for f in changed_files if f.suffix in [".py", ".ts"]]
        return len(relevant_files) >= 1
    except subprocess.CalledProcessError:
        return False


def gen_version() -> Version:
    """Generate version based on current date"""
    now = datetime.datetime.now()
    return Version(f"{now.year}.{now.month}.{now.day}")


def find_changed_packages(directory: Path, git_hash: GitHash) -> Iterator[Package]:
    for path in directory.glob("*/package.json"):
        if has_changes(path.parent, git_hash):
            yield NpmPackage(path.parent)
    for path in directory.glob("*/pyproject.toml"):
        if has_changes(path.parent, git_hash):
            yield PyPiPackage(path.parent)


@click.group()
def cli():
    pass


@cli.command("update-packages")
@click.option(
    "--directory", type=click.Path(exists=True, path_type=Path), default=Path.cwd()
)
@click.argument("git_hash", type=GIT_HASH)
def update_packages(directory: Path, git_hash: GitHash) -> int:
    # Detect package type
    path = directory.resolve(strict=True)
    version = gen_version()

    for package in find_changed_packages(path, git_hash):
        name = package.package_name()
        package.update_version(version)

        click.echo(f"{name}@{version}")

    return 0


@cli.command("generate-notes")
@click.option(
    "--directory", type=click.Path(exists=True, path_type=Path), default=Path.cwd()
)
@click.argument("git_hash", type=GIT_HASH)
def generate_notes(directory: Path, git_hash: GitHash) -> int:
    # Detect package type
    path = directory.resolve(strict=True)
    version = gen_version()

    click.echo(f"# Release : v{version}")
    click.echo("")
    click.echo("## Updated packages")
    for package in find_changed_packages(path, git_hash):
        name = package.package_name()
        click.echo(f"- {name}@{version}")

    return 0


@cli.command("generate-version")
def generate_version() -> int:
    # Detect package type
    click.echo(gen_version())
    return 0


@cli.command("generate-matrix")
@click.option(
    "--directory", type=click.Path(exists=True, path_type=Path), default=Path.cwd()
)
@click.option("--npm", is_flag=True, default=False)
@click.option("--pypi", is_flag=True, default=False)
@click.argument("git_hash", type=GIT_HASH)
def generate_matrix(directory: Path, git_hash: GitHash, pypi: bool, npm: bool) -> int:
    # Detect package type
    path = directory.resolve(strict=True)
    version = gen_version()

    changes = []
    for package in find_changed_packages(path, git_hash):
        pkg = package.path.relative_to(path)
        if npm and isinstance(package, NpmPackage):
            changes.append(str(pkg))
        if pypi and isinstance(package, PyPiPackage):
            changes.append(str(pkg))

    click.echo(json.dumps(changes))
    return 0


if __name__ == "__main__":
    sys.exit(cli())
