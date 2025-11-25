import pytest
from pathlib import Path
import git
from mcp_server_git.server import (
    git_checkout,
    git_branch,
    git_add,
    git_status,
    git_diff_unstaged,
    git_diff_staged,
    git_diff,
    git_commit,
    git_reset,
    git_log,
    git_create_branch,
    git_show
)
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
    result = git_branch(test_repository, "remote")
    assert "" == result.strip()  # Should be empty if no remote branches

def test_git_branch_all(test_repository):
    test_repository.git.branch("new-branch-all")
    result = git_branch(test_repository, "all")
    assert "new-branch-all" in result

def test_git_branch_contains(test_repository):
    # Get the default branch name (could be "main" or "master")
    default_branch = test_repository.active_branch.name
    # Create a new branch and commit to it
    test_repository.git.checkout("-b", "feature-branch")
    Path(test_repository.working_dir / Path("feature.txt")).write_text("feature content")
    test_repository.index.add(["feature.txt"])
    commit = test_repository.index.commit("feature commit")
    test_repository.git.checkout(default_branch)

    result = git_branch(test_repository, "local", contains=commit.hexsha)
    assert "feature-branch" in result
    assert default_branch not in result

def test_git_branch_not_contains(test_repository):
    # Get the default branch name (could be "main" or "master")
    default_branch = test_repository.active_branch.name
    # Create a new branch and commit to it
    test_repository.git.checkout("-b", "another-feature-branch")
    Path(test_repository.working_dir / Path("another_feature.txt")).write_text("another feature content")
    test_repository.index.add(["another_feature.txt"])
    commit = test_repository.index.commit("another feature commit")
    test_repository.git.checkout(default_branch)

    result = git_branch(test_repository, "local", not_contains=commit.hexsha)
    assert "another-feature-branch" not in result
    assert default_branch in result

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

def test_git_diff_unstaged(test_repository):
    file_path = Path(test_repository.working_dir) / "test.txt"
    file_path.write_text("modified content")

    result = git_diff_unstaged(test_repository)

    assert "test.txt" in result
    assert "modified content" in result

def test_git_diff_unstaged_empty(test_repository):
    result = git_diff_unstaged(test_repository)

    assert result == ""

def test_git_diff_staged(test_repository):
    file_path = Path(test_repository.working_dir) / "staged_file.txt"
    file_path.write_text("staged content")
    test_repository.index.add(["staged_file.txt"])

    result = git_diff_staged(test_repository)

    assert "staged_file.txt" in result
    assert "staged content" in result

def test_git_diff_staged_empty(test_repository):
    result = git_diff_staged(test_repository)

    assert result == ""

def test_git_diff(test_repository):
    test_repository.git.checkout("-b", "feature-diff")
    file_path = Path(test_repository.working_dir) / "test.txt"
    file_path.write_text("feature changes")
    test_repository.index.add(["test.txt"])
    test_repository.index.commit("feature commit")

    result = git_diff(test_repository, "master")

    assert "test.txt" in result
    assert "feature changes" in result

def test_git_commit(test_repository):
    file_path = Path(test_repository.working_dir) / "commit_test.txt"
    file_path.write_text("content to commit")
    test_repository.index.add(["commit_test.txt"])

    result = git_commit(test_repository, "test commit message")

    assert "Changes committed successfully with hash" in result

    latest_commit = test_repository.head.commit
    assert latest_commit.message.strip() == "test commit message"

def test_git_reset(test_repository):
    file_path = Path(test_repository.working_dir) / "reset_test.txt"
    file_path.write_text("content to reset")
    test_repository.index.add(["reset_test.txt"])

    staged_before = [item.a_path for item in test_repository.index.diff("HEAD")]
    assert "reset_test.txt" in staged_before

    result = git_reset(test_repository)

    assert result == "All staged changes reset"

    staged_after = [item.a_path for item in test_repository.index.diff("HEAD")]
    assert "reset_test.txt" not in staged_after

def test_git_log(test_repository):
    for i in range(3):
        file_path = Path(test_repository.working_dir) / f"log_test_{i}.txt"
        file_path.write_text(f"content {i}")
        test_repository.index.add([f"log_test_{i}.txt"])
        test_repository.index.commit(f"commit {i}")

    result = git_log(test_repository, max_count=2)

    assert isinstance(result, list)
    assert len(result) == 2
    assert "Commit:" in result[0]
    assert "Author:" in result[0]
    assert "Date:" in result[0]
    assert "Message:" in result[0]

def test_git_log_default(test_repository):
    result = git_log(test_repository)

    assert isinstance(result, list)
    assert len(result) >= 1
    assert "initial commit" in result[0]

def test_git_create_branch(test_repository):
    result = git_create_branch(test_repository, "new-feature-branch")

    assert "Created branch 'new-feature-branch'" in result

    branches = [ref.name for ref in test_repository.references]
    assert "new-feature-branch" in branches

def test_git_create_branch_from_base(test_repository):
    test_repository.git.checkout("-b", "base-branch")
    file_path = Path(test_repository.working_dir) / "base.txt"
    file_path.write_text("base content")
    test_repository.index.add(["base.txt"])
    test_repository.index.commit("base commit")

    result = git_create_branch(test_repository, "derived-branch", "base-branch")

    assert "Created branch 'derived-branch' from 'base-branch'" in result

def test_git_show(test_repository):
    file_path = Path(test_repository.working_dir) / "show_test.txt"
    file_path.write_text("show content")
    test_repository.index.add(["show_test.txt"])
    test_repository.index.commit("show test commit")

    commit_sha = test_repository.head.commit.hexsha

    result = git_show(test_repository, commit_sha)

    assert "Commit:" in result
    assert "Author:" in result
    assert "show test commit" in result
    assert "show_test.txt" in result

def test_git_show_initial_commit(test_repository):
    initial_commit = list(test_repository.iter_commits())[-1]

    result = git_show(test_repository, initial_commit.hexsha)

    assert "Commit:" in result
    assert "initial commit" in result
    assert "test.txt" in result
