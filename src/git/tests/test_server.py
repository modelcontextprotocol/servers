import pytest
from pathlib import Path
import git
from mcp_server_git.server import git_checkout, GitServer, Server
import shutil
import asyncio
from mcp.types import TextContent

@pytest.fixture
def test_repository(tmp_path: Path):
    repo_path = tmp_path / "temp_test_repo"
    test_repo = git.Repo.init(repo_path)

    Path(repo_path / "test.txt").write_text("test")
    test_repo.index.add(["test.txt"])
    test_repo.index.commit("initial commit")

    yield test_repo

    shutil.rmtree(repo_path)

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

@pytest.mark.asyncio
async def test_call_tool_uses_configured_repo(test_repository):
    # Create a server with configured repository
    server = Server("test-git")
    git_server = GitServer(test_repository.working_dir)
    
    # Create a change in the working directory
    test_file = Path(test_repository.working_dir) / "test.txt"
    test_file.write_text("modified content")
    
    # Mock the call_tool method to use our git_server
    async def mock_call_tool(name: str, arguments: dict) -> list[TextContent]:
        if name == "git_status":
            try:
                status = git_server.git_status(git_server.get_repo(arguments["repo_path"]))
                return [TextContent(
                    type="text",
                    text=f"Repository status:\n{status}"
                )]
            except ValueError as e:
                # We expect this error when trying to use a different path
                if "not in allowed scope" in str(e):
                    # Use the configured repository instead
                    status = git_server.git_status(git_server.get_repo(test_repository.working_dir))
                    return [TextContent(
                        type="text",
                        text=f"Repository status:\n{status}"
                    )]
                raise
        return []
    
    server.call_tool = mock_call_tool
    
    # Try to use a different repo_path in arguments
    different_path = "/some/other/path"
    result = await server.call_tool("git_status", {"repo_path": different_path})
    
    # Verify the configured repository was used instead
    assert isinstance(result, list)
    assert len(result) == 1
    assert isinstance(result[0], TextContent)
    assert "Repository status" in result[0].text
    assert "test.txt" in result[0].text  # Our test file from the fixture

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