import pytest
from pathlib import Path
import git
from mcp_server_git.server import git_checkout, GitServer, Server
import shutil
from mcp.types import TextContent

@pytest.fixture
def test_repository(tmp_path: Path):
    repo_path = tmp_path / "temp_test_repo"
    test_repo = git.Repo.init(repo_path)

    Path(repo_path / "test.txt").write_text("test")
    test_repo.index.add(["test.txt"])
    test_repo.index.commit("initial commit")

    yield test_repo

    # Ensure the repo is closed before attempting to remove the directory
    test_repo.close()

    import os
    import time
    def on_rm_error(func, path, exc_info):
        try:
            os.chmod(path, 0o777)
            func(path)
        except Exception:
            time.sleep(0.1)
            func(path)
    shutil.rmtree(repo_path, onerror=on_rm_error)

@pytest.fixture
def git_server_with_repo(test_repository):
    return GitServer(test_repository.working_dir)

@pytest.fixture
def git_server_without_repo():
    return GitServer(None)

def test_git_checkout_existing_branch(test_repository):
    test_repository.git.branch("test-branch")
    result = git_checkout(test_repository, "test-branch")

    assert "Switched to branch 'test-branch'" in result
    assert test_repository.active_branch.name == "test-branch"

def test_git_checkout_nonexistent_branch(test_repository):
    with pytest.raises(git.GitCommandError):
        git_checkout(test_repository, "nonexistent-branch")

def test_path_validator_rejects_outside_path(git_server_with_repo):
    with pytest.raises(ValueError, match="Path .* not in allowed scope"):
        git_server_with_repo.path_validator.validate_path("/some/other/path")

def test_path_validator_accepts_inside_path(git_server_with_repo, test_repository):
    test_file = Path(test_repository.working_dir) / "test.txt"
    validated = git_server_with_repo.path_validator.validate_path(test_file)
    assert validated.exists()
    assert validated.is_file()

def test_call_tool_uses_configured_repo(test_repository):
    # Create a git_server with configured repository
    git_server = GitServer(test_repository.working_dir)
    
    # Create a change in the working directory
    test_file = Path(test_repository.working_dir) / "test.txt"
    test_file.write_text("modified content")
    
    # Test that the git_server correctly handles the configured repository
    try:
        # This should fail because the path is outside the allowed scope
        git_server.get_repo("/some/other/path")
        assert False, "Expected ValueError for out-of-scope path"
    except ValueError as e:
        assert "not in allowed scope" in str(e)
    
    # This should work because it's the configured repository
    repo = git_server.get_repo(test_repository.working_dir)
    status = git_server.git_status(repo)
    
    # Verify the configured repository was used
    assert "test.txt" in status  # Our test file from the fixture

def test_git_server_requires_base_path_for_operations(git_server_without_repo):
    with pytest.raises(ValueError, match="No base repository path configured"):
        git_server_without_repo.get_repo("/any/path")

def test_git_create_branch_with_branch_name(git_server_with_repo, test_repository):
    test_repository.create_head("existing_branch")
    result = git_server_with_repo.git_create_branch(test_repository, "new_branch", "existing_branch")
    assert "Created branch 'new_branch' from 'existing_branch'" in result
    assert test_repository.heads["new_branch"] is not None

def test_git_create_branch_with_commit_hash(git_server_with_repo, test_repository):
    initial_commit = test_repository.head.commit
    result = git_server_with_repo.git_create_branch(test_repository, "new_branch", initial_commit.hexsha)
    assert f"Created branch 'new_branch' from '{initial_commit.hexsha}'" in result
    assert test_repository.heads["new_branch"] is not None

def test_git_create_branch_with_invalid_base(git_server_with_repo, test_repository):
    with pytest.raises(ValueError, match="Invalid base branch or commit: invalid_base"):
        git_server_with_repo.git_create_branch(test_repository, "new_branch", "invalid_base")

def test_git_create_branch_from_active_branch(git_server_with_repo, test_repository):
    result = git_server_with_repo.git_create_branch(test_repository, "new_branch")  # No base_branch specified
    assert "Created branch 'new_branch' from 'master'" in result  # master is the default branch
    assert test_repository.heads["new_branch"] is not None

def test_git_branch_local(test_repository):
    test_repository.git.branch("new-branch-local")
    git_server = GitServer(test_repository.working_dir)
    result = git_server.git_branch(test_repository, "local")
    assert "new-branch-local" in result

def test_git_branch_remote(test_repository):
    # GitPython does not easily support creating remote branches without a remote.
    # This test will check the behavior when 'remote' is specified without actual remotes.
    git_server = GitServer(test_repository.working_dir)
    result = git_server.git_branch(test_repository, "remote")
    assert "" == result.strip()  # Should be empty if no remote branches

def test_git_branch_all(test_repository):
    test_repository.git.branch("new-branch-all")
    git_server = GitServer(test_repository.working_dir)
    result = git_server.git_branch(test_repository, "all")
    assert "new-branch-all" in result

def test_git_branch_contains(test_repository):
    # Create a new branch and commit to it
    test_repository.git.checkout("-b", "feature-branch")
    Path(test_repository.working_dir / Path("feature.txt")).write_text("feature content")
    test_repository.index.add(["feature.txt"])
    commit = test_repository.index.commit("feature commit")
    test_repository.git.checkout("master")

    git_server = GitServer(test_repository.working_dir)
    result = git_server.git_branch(test_repository, "local", contains=commit.hexsha)
    assert "feature-branch" in result
    assert "master" not in result

def test_git_branch_not_contains(test_repository):
    # Create a new branch and commit to it
    test_repository.git.checkout("-b", "another-feature-branch")
    Path(test_repository.working_dir / Path("another_feature.txt")).write_text("another feature content")
    test_repository.index.add(["another_feature.txt"])
    commit = test_repository.index.commit("another feature commit")
    test_repository.git.checkout("master")

    git_server = GitServer(test_repository.working_dir)
    result = git_server.git_branch(test_repository, "local", not_contains=commit.hexsha)
    assert "another-feature-branch" not in result
    assert "master" in result
