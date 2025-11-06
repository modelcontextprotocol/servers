import pytest
from pathlib import Path
import git
from mcp_server_git.server import git_checkout, git_branch, git_add, git_status
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

def test_git_branch_local(test_repository):
    test_repository.git.branch("new-branch-local")
    result = git_branch(test_repository, "local")
    assert "new-branch-local" in result

def test_git_branch_remote(test_repository):
    # GitPython does not easily support creating remote branches without a remote.
    # This test will check the behavior when 'remote' is specified without actual remotes.
    result = git_branch(test_repository, "remote")
    assert "" == result.strip()  # Should be empty if no remote branches

def test_git_branch_all(test_repository):
    test_repository.git.branch("new-branch-all")
    result = git_branch(test_repository, "all")
    assert "new-branch-all" in result

def test_git_branch_contains(test_repository):
    # Create a new branch and commit to it
    test_repository.git.checkout("-b", "feature-branch")
    Path(test_repository.working_dir / Path("feature.txt")).write_text("feature content")
    test_repository.index.add(["feature.txt"])
    commit = test_repository.index.commit("feature commit")
    test_repository.git.checkout("master")

    result = git_branch(test_repository, "local", contains=commit.hexsha)
    assert "feature-branch" in result
    assert "master" not in result

def test_git_branch_not_contains(test_repository):
    # Create a new branch and commit to it
    test_repository.git.checkout("-b", "another-feature-branch")
    Path(test_repository.working_dir / Path("another_feature.txt")).write_text("another feature content")
    test_repository.index.add(["another_feature.txt"])
    commit = test_repository.index.commit("another feature commit")
    test_repository.git.checkout("master")

    result = git_branch(test_repository, "local", not_contains=commit.hexsha)
    assert "another-feature-branch" not in result
    assert "master" in result

def test_git_add_all_files(test_repository):
    file_path = Path(test_repository.working_dir) / "all_file.txt"
    file_path.write_text("adding all")

    result = git_add(test_repository, ["."])

    staged_files = [item.a_path for item in test_repository.index.diff("HEAD")]
    assert "all_file.txt" in staged_files
    assert result == "Files staged successfully"

def test_git_add_specific_files(test_repository):
    file1 = Path(test_repository.working_dir) / "file1.txt"
    file2 = Path(test_repository.working_dir) / "file2.txt"
    file1.write_text("file 1 content")
    file2.write_text("file 2 content")

    result = git_add(test_repository, ["file1.txt"])

    staged_files = [item.a_path for item in test_repository.index.diff("HEAD")]
    assert "file1.txt" in staged_files
    assert "file2.txt" not in staged_files
    assert result == "Files staged successfully"

def test_git_status(test_repository):
    result = git_status(test_repository)

    assert result is not None
    assert "On branch" in result or "branch" in result.lower()
