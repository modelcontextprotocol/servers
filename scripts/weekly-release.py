"""Weekly release script for MCP packages."""

# /// script
# dependencies = [
#     "semver>=3.0.1",
#     "PyGithub>=2.1.1",
#     "rich>=13.7.0",
#     "toml>=0.10.2",
#     "click>=8.1.7"
# ]
# ///

import json
import toml
import os
from datetime import datetime, timedelta
import subprocess
from pathlib import Path
from dataclasses import dataclass
from enum import Enum, auto
import semver
from github import Github
import click
from rich.console import Console
from rich.table import Table

console = Console()

class ReleaseMode(str, Enum):
    """Mode for selecting which types of packages to release."""
    ALL = "all"
    PYTHON = "python"
    NPM = "npm"

    def __str__(self) -> str:
        return self.value

@dataclass
class PackageChange:
    """Base class for package changes."""
    name: str
    current_version: str
    has_breaking_changes: bool
    has_new_features: bool
    pkg_dir: Path

    def get_change_type(self) -> str:
        """Get a human-readable description of the change type."""
        if self.has_breaking_changes:
            return "BREAKING"
        if self.has_new_features:
            return "FEATURES"
        return "PATCH"
    
    def get_new_version(self) -> str:
        """Calculate the new version based on changes."""
        ver = semver.Version.parse(self.current_version)
        if self.has_breaking_changes:
            return str(ver.bump_major())
        if self.has_new_features:
            return str(ver.bump_minor())
        return str(ver.bump_patch())

@dataclass
class NPMPackageChange(PackageChange):
    """Represents an NPM package that needs to be released."""
    
    def update_version(self, new_version: str) -> None:
        """Update package.json with new version."""
        pkg_json = self.pkg_dir / "package.json"
        with open(pkg_json) as f:
            data = json.load(f)
        data["version"] = new_version
        with open(pkg_json, "w") as f:
            json.dump(data, f, indent=2)
            
    def publish(self) -> None:
        """Publish package to NPM."""
        console.print(f"[bold green]Publishing {self.name} to npm...[/bold green]")
        run_command(["npm", "publish", "--workspace", self.name, "--access", "public"])

@dataclass
class PythonPackageChange(PackageChange):
    """Represents a Python package that needs to be released."""
    
    def update_version(self, new_version: str) -> None:
        """Update pyproject.toml with new version."""
        pyproject_toml = self.pkg_dir / "pyproject.toml"
        with open(pyproject_toml) as f:
            data = toml.load(f)
        data["project"]["version"] = new_version
        with open(pyproject_toml, "w") as f:
            toml.dump(data, f)
            
    def publish(self) -> None:
        """Build and publish package to PyPI."""
        console.print(f"[bold green]Building {self.name}...[/bold green]")
        run_command(["python", "-m", "build"], cwd=str(self.pkg_dir))
        
        console.print(f"[bold green]Publishing {self.name} to PyPI...[/bold green]")
        run_command(["python", "-m", "twine", "upload", "dist/*"], cwd=str(self.pkg_dir))

def get_last_release_date() -> str:
    """Get the date of last Monday."""
    today = datetime.now()
    last_monday = today - timedelta(days=today.weekday() + 7)
    return last_monday.strftime("%Y-%m-%d")

def run_command(cmd: list[str], cwd: str | None = None) -> str:
    """Run a shell command and return its output."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        console.print(f"[red]Error running command {' '.join(cmd)}:[/red]")
        console.print(e.stderr)
        raise

def analyze_commits(pkg_dir: Path, since: str) -> tuple[bool, bool]:
    """Analyze commit messages to determine change types."""
    commits = run_command([
        "git", "log",
        f"--since={since}",
        "--pretty=format:%s",
        "--",
        str(pkg_dir)
    ]).split("\n")

    if not any(commits):
        return False, False

    has_breaking = any(
        "BREAKING CHANGE:" in commit or "!:" in commit
        for commit in commits
    )
    has_features = any(
        commit.startswith("feat:")
        for commit in commits
    )

    return has_breaking, has_features

def get_changed_packages(mode: ReleaseMode = ReleaseMode.ALL) -> list[PackageChange]:
    """Get list of packages that have changed since last release."""
    last_release_date = get_last_release_date()
    packages_dir = Path("src")
    changed_packages = []

    for pkg_dir in packages_dir.iterdir():
        if not pkg_dir.is_dir():
            continue

        has_breaking, has_features = analyze_commits(pkg_dir, last_release_date)
        if not (has_breaking or has_features):
            continue

        # Check for Python package
        if mode in (ReleaseMode.ALL, ReleaseMode.PYTHON):
            pyproject_toml = pkg_dir / "pyproject.toml"
            if pyproject_toml.exists():
                with open(pyproject_toml) as f:
                    pkg_data = toml.load(f)
                try:
                    name = pkg_data["project"]["name"]
                    version = pkg_data["project"]["version"]
                    changed_packages.append(PythonPackageChange(
                        name=name,
                        current_version=version,
                        has_breaking_changes=has_breaking,
                        has_new_features=has_features,
                        pkg_dir=pkg_dir
                    ))
                except KeyError:
                    continue

        # Check for NPM package
        if mode in (ReleaseMode.ALL, ReleaseMode.NPM):
            package_json = pkg_dir / "package.json"
            if package_json.exists():
                with open(package_json) as f:
                    pkg_data = json.load(f)
                name = pkg_data["name"]
                version = pkg_data["version"]
                changed_packages.append(NPMPackageChange(
                    name=name,
                    current_version=version,
                    has_breaking_changes=has_breaking,
                    has_new_features=has_features,
                    pkg_dir=pkg_dir
                ))

    return changed_packages

def update_package_versions(packages: list[PackageChange], dry_run: bool = False) -> None:
    """Update versions for a list of packages."""
    for pkg in packages:
        new_version = pkg.get_new_version()
        if not dry_run:
            pkg.update_version(new_version)
        console.print(f"[green]{pkg.name}[/green]: {pkg.current_version} -> {new_version}")

def generate_changelog(pkg_dir: str, since: str) -> str:
    """Generate changelog for a package."""
    commits = run_command([
        "git", "log",
        f"--since={since}",
        "--pretty=format:* %s (%h)",
        "--",
        pkg_dir
    ])

    return f"## Changes\n\n{commits}\n"

def create_github_release(release_notes: str, date: str, is_python: bool = False):
    """Create a GitHub release."""
    gh_token = os.environ.get("GITHUB_TOKEN")
    if not gh_token:
        raise ValueError("GITHUB_TOKEN environment variable is required")

    g = Github(gh_token)
    repo = g.get_repo(os.environ["GITHUB_REPOSITORY"])

    prefix = "weekly-python-release" if is_python else "weekly-release"
    repo.create_git_release(
        tag=f"{prefix}-{date}",
        name=f"Weekly {'Python ' if is_python else ''}Release {date}",
        message=release_notes,
        draft=False,
        prerelease=False
    )

@click.command()
@click.option("--dry-run", is_flag=True, help="Run in dry-run mode (no changes will be made)")
@click.option(
    "--mode",
    type=click.Choice([str(m) for m in ReleaseMode], case_sensitive=False),
    default=str(ReleaseMode.ALL),
    help="Which types of packages to release"
)
def main(dry_run: bool = False, mode: str = str(ReleaseMode.ALL)) -> None:
    """Weekly release process for MCP packages.
    
    This script detects changes in packages since last Monday, bumps versions based on
    conventional commits, generates changelogs, creates GitHub releases, and publishes
    packages to NPM and PyPI.
    """
    console.print(
        "[bold blue]Starting weekly package release process{} ({} packages) ...[/bold blue]"
        .format(" (DRY RUN)" if dry_run else "", mode)
    )

    changed_packages = get_changed_packages(ReleaseMode(mode))
    if not changed_packages:
        console.print("[yellow]No packages have changed since last release[/yellow]")
        return

    # Group packages by type
    npm_packages = [p for p in changed_packages if isinstance(p, NPMPackageChange)]
    python_packages = [p for p in changed_packages if isinstance(p, PythonPackageChange)]

    def show_package_table(packages: list[PackageChange], title: str) -> None:
        """Display a table of packages to be released."""
        if not packages:
            return
            
        table = Table(title=title)
        table.add_column("Package")
        table.add_column("Current Version")
        table.add_column("Changes")

        for pkg in packages:
            table.add_row(
                pkg.name,
                pkg.current_version,
                pkg.get_change_type()
            )

        console.print(table)

    # Show summary tables
    show_package_table(npm_packages, "NPM Packages to Release")
    show_package_table(python_packages, "Python Packages to Release")

    # Update versions
    if npm_packages:
        console.print("\n[bold]NPM Packages[/bold]")
        update_package_versions(npm_packages, dry_run)

    if python_packages:
        console.print("\n[bold]Python Packages[/bold]")
        update_package_versions(python_packages, dry_run)

    if dry_run:
        console.print("\n[yellow]DRY RUN - No further changes will be made[/yellow]")
        return

    # Generate changelogs and create tags
    last_release_date = get_last_release_date()
    npm_release_notes = []
    python_release_notes = []

    for pkg in changed_packages:
        changelog = generate_changelog(str(pkg.pkg_dir), last_release_date)
        new_version = pkg.get_new_version()
        
        # Create git tag
        tag_name = f"{pkg.name}@{new_version}"
        run_command([
            "git", "tag", "-a", tag_name,
            "-m", f"Release {tag_name}\n\n{changelog}"
        ])

        # Add to release notes
        notes = f"# {pkg.name}@{new_version}\n\n{changelog}"
        if isinstance(pkg, NPMPackageChange):
            npm_release_notes.append(notes)
        else:
            python_release_notes.append(notes)

    # Create commit and push changes
    run_command(["git", "add", "."])
    run_command([
        "git", "commit",
        "-m", "chore: weekly package release [skip ci]"
    ])
    run_command(["git", "push", "origin", "HEAD", "--tags"])

    # Create GitHub releases
    date = datetime.now().strftime("%Y-%m-%d")

    if npm_release_notes:
        npm_release_body = "\n\n---\n\n".join(npm_release_notes)
        create_github_release(npm_release_body, date)

    if python_release_notes:
        python_release_body = "\n\n---\n\n".join(python_release_notes)
        create_github_release(python_release_body, date, is_python=True)

    # Publish packages
    for pkg in changed_packages:
        pkg.publish()

    console.print("[bold green]Weekly package release completed successfully![/bold green]")

if __name__ == "__main__":
    main()
