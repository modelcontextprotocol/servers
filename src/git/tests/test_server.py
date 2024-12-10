import pytest
from pathlib import Path
import git
from mcp_server_git.server import git_checkout
import shutil

@pytest.fixture
def test_repository(tmp_path: Path):
    repo_path = tmp_path / "temp_test_repo"
    test_repo = git.Repo.init(repo_path)

    Path(repo_path / "test.txt").write_text("test")
    test_repo.index.add(["test.txt"])
    test_repo.index.commit("initial commit")

    yield test_repo

    shutil.rmtree(repo_path)

def test_git_checkout_existing_branch(test_repository):
    test_repository.git.branch("test-branch")
    result = git_checkout(test_repository, "test-branch")

    assert "Switched to branch 'test-branch'" in result
    assert test_repository.active_branch.name == "test-branch"

def test_git_checkout_nonexistent_branch(test_repository):

    with pytest.raises(git.GitCommandError):
        git_checkout(test_repository, "nonexistent-branch")