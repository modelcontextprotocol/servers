#!/usr/bin/env uv run --script
# /// script
# requires-python = ">=3.11"
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
from enum import Enum
from typing import Any, NewType


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


class PackageType(Enum):
    NPM = 1
    PYPI = 2

    @classmethod
    def from_path(cls, directory: Path) -> "PackageType":
        if (directory / "package.json").exists():
            return cls.NPM
        elif (directory / "pyproject.toml").exists():
            return cls.PYPI
        else:
            raise Exception("No package.json or pyproject.toml found")


def get_changes(path: Path, git_hash: str) -> bool:
    """Check if any files changed between current state and git hash"""
    try:
        output = subprocess.run(
            ["git", "diff", "--name-only", git_hash, "--", path],
            cwd=path,
            check=True,
            capture_output=True,
            text=True,
        )

        changed_files = [Path(f) for f in output.stdout.splitlines()]
        relevant_files = [f for f in changed_files if f.suffix in ['.py', '.ts']]
        return len(relevant_files) >= 1
    except subprocess.CalledProcessError:
        return False


def get_package_name(path: Path, pkg_type: PackageType) -> str:
    """Get package name from package.json or pyproject.toml"""
    match pkg_type:
        case PackageType.NPM:
            with open(path / "package.json", "rb") as f:
                return json.load(f)["name"]
        case PackageType.PYPI:
            with open(path / "pyproject.toml") as f:
                toml_data = tomlkit.parse(f.read())
                name = toml_data.get("project", {}).get("name")
                if not name:
                    raise Exception("No name in pyproject.toml project section")
                return str(name)


def generate_version() -> Version:
    """Generate version based on current date"""
    now = datetime.datetime.now()
    return Version(f"{now.year}.{now.month}.{now.day}")


def publish_package(
    path: Path, pkg_type: PackageType, version: Version, dry_run: bool = False
):
    """Publish package based on type"""
    try:
        match pkg_type:
            case PackageType.NPM:
                # Update version in package.json
                with open(path / "package.json", "rb+") as f:
                    data = json.load(f)
                    data["version"] = version
                    f.seek(0)
                    json.dump(data, f, indent=2)
                    f.truncate()

                if not dry_run:
                    # Publish to npm
                    subprocess.run(["npm", "publish"], cwd=path, check=True)
            case PackageType.PYPI:
                # Update version in pyproject.toml
                with open(path / "pyproject.toml") as f:
                    data = tomlkit.parse(f.read())
                    data["project"]["version"] = version

                with open(path / "pyproject.toml", "w") as f:
                    f.write(tomlkit.dumps(data))

                if not dry_run:
                    # Build and publish to PyPI
                    subprocess.run(["uv", "build"], cwd=path, check=True)
                    subprocess.run(
                        ["uv", "publish", "--username", "__token__"],
                        cwd=path,
                        check=True,
                    )
    except Exception as e:
        raise Exception(f"Failed to publish: {e}") from e


@click.command()
@click.argument("directory", type=click.Path(exists=True, path_type=Path))
@click.argument("git_hash", type=GIT_HASH)
@click.option(
    "--dry-run", is_flag=True, help="Update version numbers but don't publish"
)
def main(directory: Path, git_hash: GitHash, dry_run: bool) -> int:
    """Release package if changes detected"""
    # Detect package type
    try:
        path = directory.resolve(strict=True)
        pkg_type = PackageType.from_path(path)
    except Exception as e:
        return 1

    # Check for changes
    if not get_changes(path, git_hash):
        return 0

    try:
        # Generate version and publish
        version = generate_version()
        name = get_package_name(path, pkg_type)

        publish_package(path, pkg_type, version, dry_run)
        if not dry_run:
            click.echo(f"{name}@{version}")
        else:
            click.echo(f"Dry run: Would have published {name}@{version}")
        return 0
    except Exception as e:
        return 1


if __name__ == "__main__":
    sys.exit(main())
