import pytest
from pathlib import Path
import git
from mcp_server_git.server import git_checkout

def test_git_checkout_existing_branch(tmp_path: Path):
    # Setup test repo
    repo = git.Repo.init(tmp_path)
    Path(tmp_path / "test.txt").write_text("test")
    repo.index.add(["test.txt"])
    repo.index.commit("initial commit")

    # Create and test branch
    repo.git.branch("test-branch")
    result = git_checkout(repo, "test-branch")

    assert "Switched to branch 'test-branch'" in result
    assert repo.active_branch.name == "test-branch"

def test_git_checkout_nonexistent_branch(tmp_path: Path):
    repo = git.Repo.init(tmp_path)

    with pytest.raises(git.GitCommandError):
        git_checkout(repo, "nonexistent-branch")