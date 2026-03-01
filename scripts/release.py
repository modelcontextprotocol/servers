#!/usr/bin/env uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "click>=8.1.8",
#     "tomlkit>=0.13.2"
# ]
# ///
import sys
import re
import click
from pathlib import Path
import json
import tomlkit
import datetime
import subprocess
from dataclasses import dataclass
from typing import Any, Iterator, NewType, Protocol
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache


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
    _name_cache: str | None = None

    def package_name(self) -> str:
        if self._name_cache is None:
            with open(self.path / "package.json", "r", encoding="utf-8") as f:
                self._name_cache = json.load(f)["name"]
        return self._name_cache

    def update_version(self, version: Version):
        package_json_path = self.path / "package.json"
        with open(package_json_path, "r+", encoding="utf-8") as f:
            data = json.load(f)
            data["version"] = version
            f.seek(0)
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.truncate()


@dataclass
class PyPiPackage:
    path: Path
    _name_cache: str | None = None

    def package_name(self) -> str:
        if self._name_cache is None:
            pyproject_path = self.path / "pyproject.toml"
            with open(pyproject_path, "r", encoding="utf-8") as f:
                toml_data = tomlkit.parse(f.read())
                name = toml_data.get("project", {}).get("name")
                if not name:
                    raise ValueError(f"No name in pyproject.toml project section for {self.path}")
                self._name_cache = str(name)
        return self._name_cache

    def update_version(self, version: Version):
        pyproject_path = self.path / "pyproject.toml"
        
        # Update version in pyproject.toml
        with open(pyproject_path, "r", encoding="utf-8") as f:
            data = tomlkit.parse(f.read())
            data["project"]["version"] = version

        with open(pyproject_path, "w", encoding="utf-8") as f:
            f.write(tomlkit.dumps(data))

        # Regenerate uv.lock to match the updated pyproject.toml
        subprocess.run(["uv", "lock"], cwd=self.path, check=True, capture_output=True)


@lru_cache(maxsize=128)
def has_changes(path_str: str, git_hash_str: str) -> bool:
    """Check if any files changed between current state and git hash"""
    path = Path(path_str)
    git_hash = GitHash(git_hash_str)
    
    try:
        output = subprocess.run(
            ["git", "diff", "--name-only", git_hash, "--", "."],
            cwd=path,
            check=True,
            capture_output=True,
            text=True,
        )

        changed_files = output.stdout.splitlines()
        # Use any() for early exit
        return any(f.endswith(('.py', '.ts')) for f in changed_files)
    except subprocess.CalledProcessError:
        return False


def gen_version() -> Version:
    """Generate version based on current date"""
    now = datetime.datetime.now()
    return Version(f"{now.year}.{now.month}.{now.day}")


def find_changed_packages(directory: Path, git_hash: GitHash) -> Iterator[Package]:
    git_hash_str = str(git_hash)
    
    # Collect all potential packages first
    potential_packages = []
    
    for path in directory.glob("*/package.json"):
        # if has_changes(path.parent, git_hash):
        #     yield NpmPackage(path.parent)
        potential_packages.append((path.parent, NpmPackage))


    for path in directory.glob("*/pyproject.toml"):
#       if has_changes(path.parent, git_hash):
#             yield PyPiPackage(path.parent)
        potential_packages.append((path.parent, PyPiPackage))
    
    # Check changes in parallel for better performance
    with ThreadPoolExecutor(max_workers=min(4, len(potential_packages))) as executor:
        def check_and_create(pkg_path, pkg_class):
            if has_changes(str(pkg_path), git_hash_str):
                return pkg_class(pkg_path)
            return None
        
        results = executor.map(lambda args: check_and_create(*args), potential_packages)
        
        for result in results:
            if result is not None:
                yield result


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
    # version = gen_version()

    # Early exit if neither flag is set
    if not npm and not pypi:
        click.echo(json.dumps([]))
        return 0
    
    changes = []
    for package in find_changed_packages(path, git_hash):
        pkg = package.path.relative_to(path)
        if npm and isinstance(package, NpmPackage):
            changes.append(str(pkg))
        # if pypi and isinstance(package, PyPiPackage):
        elif pypi and isinstance(package, PyPiPackage):  # Use elif for efficiency
            changes.append(str(pkg))

    click.echo(json.dumps(changes))
    return 0


if __name__ == "__main__":
    sys.exit(cli())
