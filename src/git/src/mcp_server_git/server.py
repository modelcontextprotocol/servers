# server.py
import logging
from pathlib import Path
from typing import Sequence, Optional
from mcp.server import Server
from mcp.server.session import ServerSession
from mcp.server.stdio import stdio_server
from mcp.types import (
    ClientCapabilities,
    TextContent,
    Tool,
    ListRootsResult,
    RootsCapability,
)
from enum import Enum
import git
from pydantic import BaseModel, field_validator, Field
import asyncio

# Default number of context lines to show in diff output
DEFAULT_CONTEXT_LINES = 3

def git_checkout(repo: git.Repo, branch_name: str) -> str:
    """
    Checkout a branch in the repository.
    
    Args:
        repo: The Git repository
        branch_name: Name of the branch to checkout
        
    Returns:
        A confirmation message
    
    Raises:
        git.GitCommandError: If the branch doesn't exist or other Git errors occur
    """
    repo.git.checkout(branch_name)
    return f"Switched to branch '{branch_name}'"

class PathValidator:
    def __init__(self, base_path: Path | str | None = None):
        self.base_path = Path(base_path).resolve() if base_path else None
    
    def is_safe_path(self, path: Path) -> bool:
        """Check if a path is safe to access."""
        try:
            resolved = path.resolve()
            
            # Check if it's a system directory
            system_dirs = ["/etc", "/usr", "/bin", "/sbin", "/lib", "/sys", "/dev", "/proc"]
            if any(str(resolved).startswith(sys_dir) for sys_dir in system_dirs):
                return False
                
            # If no base path is configured, allow absolute paths that aren't system dirs
            if not self.base_path:
                return True
                
            # If base path is configured, ensure path is within base directory
            return resolved.is_relative_to(self.base_path)
            
        except (RuntimeError, OSError):
            # RuntimeError can occur with circular symlinks
            # OSError can occur with invalid paths
            return False
    
    def validate_path(self, path: str | Path) -> Path:
        """Validate and return a safe path."""
        if '..' in Path(path).parts:
            raise ValueError("Path traversal attempts not allowed")
            
        requested = Path(path).resolve()
        
        if not self.is_safe_path(requested):
            raise ValueError(f"Path {requested} not in allowed scope")
            
        return requested

class GitPathModel(BaseModel):
    repo_path: str
    
    @field_validator('repo_path', mode='before')
    def validate_repo_path(cls, v):
        if '..' in Path(v).parts:
            raise ValueError("Path traversal attempts not allowed")
        return v

class GitStatus(GitPathModel):
    pass

class GitDiffUnstaged(GitPathModel):
    context_lines: int = DEFAULT_CONTEXT_LINES

class GitDiffStaged(GitPathModel):
    context_lines: int = DEFAULT_CONTEXT_LINES

class GitDiff(GitPathModel):
    target: str
    context_lines: int = DEFAULT_CONTEXT_LINES

class GitCommit(GitPathModel):
    message: str

class GitAdd(GitPathModel):
    files: list[str]
    
    @field_validator('files', mode='before')
    def validate_files(cls, v):
        for file in v:
            if '..' in Path(file).parts:
                raise ValueError(f"Path traversal attempt detected in file: {file}")
        return v

class GitReset(GitPathModel):
    pass

class GitLog(GitPathModel):
    max_count: int = 10

class GitCreateBranch(GitPathModel):
    branch_name: str
    base_branch: str | None = None

class GitCheckout(GitPathModel):
    branch_name: str

class GitShow(GitPathModel):
    revision: str

class GitInit(GitPathModel):
    pass

class GitBranch(BaseModel):
    repo_path: str = Field(
        ...,
        description="The path to the Git repository.",
    )
    branch_type: str = Field(
        ...,
        description="Whether to list local branches ('local'), remote branches ('remote') or all branches('all').",
    )
    contains: Optional[str] = Field(
        None,
        description="The commit sha that branch should contain. Do not pass anything to this param if no commit sha is specified",
    )
    not_contains: Optional[str] = Field(
        None,
        description="The commit sha that branch should NOT contain. Do not pass anything to this param if no commit sha is specified",
    )

class GitTools(str, Enum):
    STATUS = "git_status"
    DIFF_UNSTAGED = "git_diff_unstaged"
    DIFF_STAGED = "git_diff_staged"
    DIFF = "git_diff"
    COMMIT = "git_commit"
    ADD = "git_add"
    RESET = "git_reset"
    LOG = "git_log"
    CREATE_BRANCH = "git_create_branch"
    CHECKOUT = "git_checkout"
    SHOW = "git_show"
    INIT = "git_init"
    BRANCH = "git_branch"

TOOL_DESCRIPTIONS = {
    GitTools.STATUS: "Show the working tree status",
    GitTools.DIFF_UNSTAGED: "Show changes not yet staged for commit",
    GitTools.DIFF_STAGED: "Show changes staged for commit",
    GitTools.DIFF: "Show changes between commits, commit and working tree, etc",
    GitTools.COMMIT: "Record changes to the repository",
    GitTools.ADD: "Add file contents to the index",
    GitTools.RESET: "Reset current HEAD to the specified state",
    GitTools.LOG: "Show commit logs",
    GitTools.CREATE_BRANCH: "Create a new branch",
    GitTools.CHECKOUT: "Switch branches or restore working tree files",
    GitTools.SHOW: "Show various types of objects (commits, tags, etc)",
    GitTools.INIT: "Create an empty Git repository",
    GitTools.BRANCH: "List Git branches"
}

class GitServer:
    def __init__(self, base_path: Path | None = None):
        self.base_path = Path(base_path).resolve() if base_path else None
        self.path_validator = PathValidator(self.base_path)
        self.logger = logging.getLogger(__name__)

    def resolve_repo_path(self, repo_path: str | Path) -> Path:
        """Resolve repository path, handling both absolute and relative paths.
        
        In Docker environment, relative paths are resolved against base_path.
        
        Args:
            repo_path: Path to resolve (absolute or relative)
            
        Returns:
            Path: Resolved absolute path
            
        Raises:
            ValueError: If base path is not configured for relative paths
        """
        path = Path(repo_path)
        if not path.is_absolute():
            if not self.base_path:
                raise ValueError("Base path must be set to use relative paths")
            path = self.base_path / path
        return path.resolve()

    def get_repo(self, repo_path: str) -> git.Repo:
        """Get a Git repository with path and repository validation.
        
        Args:
            repo_path: Path to the repository (absolute or relative to base_path)
            
        Returns:
            git.Repo: The validated Git repository
            
        Raises:
            ValueError: If the path is invalid or not a Git repository
        """
        if not self.base_path:
            raise ValueError("No base repository path configured")
        try:
            resolved_path = self.resolve_repo_path(repo_path)
            validated_path = self.path_validator.validate_path(resolved_path)
            repo = git.Repo(validated_path)
            # Additional check to ensure the repo root is within allowed scope
            repo_root = Path(repo.git_dir).parent.resolve()
            if not self.path_validator.is_safe_path(repo_root):
                raise ValueError(f"Repository root {repo_root} not in allowed scope")
            return repo
        except git.InvalidGitRepositoryError:
            raise ValueError(f"{validated_path} is not a Git repository")
        except git.NoSuchPathError:
            raise ValueError(f"Path {validated_path} does not exist")
        except ValueError as e:
            # Re-raise ValueError with the original message
            raise ValueError(str(e))

    def git_status(self, repo: git.Repo) -> str:
        return repo.git.status()

    def git_diff_unstaged(self, repo: git.Repo, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
        return repo.git.diff(f"--unified={context_lines}")

    def git_diff_staged(self, repo: git.Repo, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
        return repo.git.diff(f"--unified={context_lines}", "--cached")

    def git_diff(self, repo: git.Repo, target: str, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
        return repo.git.diff(f"--unified={context_lines}", target)

    def git_commit(self, repo: git.Repo, message: str) -> str:
        commit = repo.index.commit(message)
        return f"Changes committed successfully with hash {commit.hexsha}"

    def git_add(self, repo: git.Repo, files: list[str]) -> str:
        # Additional path validation for each file
        for file in files:
            file_path = Path(repo.working_dir) / file
            self.path_validator.validate_path(file_path)
        repo.index.add(files)
        return "Files staged successfully"

    def git_reset(self, repo: git.Repo) -> str:
        repo.index.reset()
        return "All staged changes reset"

    def git_log(self, repo: git.Repo, max_count: int = 10) -> list[str]:
        commits = list(repo.iter_commits(max_count=max_count))
        log = []
        for commit in commits:
            log.append(
                f"Commit: {commit.hexsha!r}\n"
                f"Author: {commit.author!r}\n"
                f"Date: {commit.authored_datetime}\n"
                f"Message: {commit.message!r}\n"
            )
        return log

    def git_create_branch(self, repo: git.Repo, branch_name: str, base_branch: str | None = None) -> str:
        """Create a new branch in the repository.
        
        Args:
            repo: The Git repository
            branch_name: Name of the new branch
            base_branch: Base branch or commit to create from (optional)
            
        Returns:
            A confirmation message
            
        Raises:
            ValueError: If the base branch or commit is invalid
        """
        try:
            if base_branch:
                try:
                    # Try to get the ref (branch)
                    base = repo.refs[base_branch]
                except (IndexError, AttributeError):
                    # If it's not a ref, try to get the commit
                    try:
                        base = repo.commit(base_branch)
                    except (git.BadName, ValueError):
                        raise ValueError(f"Invalid base branch or commit: {base_branch}")
            else:
                base = repo.active_branch

            new_branch = repo.create_head(branch_name, base)
            return f"Created branch '{branch_name}' from '{base.name if hasattr(base, 'name') else base.hexsha}'"
        except git.GitCommandError as e:
            raise ValueError(f"Failed to create branch: {str(e)}")

    def git_checkout(self, repo: git.Repo, branch_name: str) -> str:
        """
        Checkout a branch in the repository.
        
        Args:
            repo: The Git repository
            branch_name: Name of the branch to checkout
            
        Returns:
            A confirmation message
        
        Raises:
            ValueError: If the branch doesn't exist or other Git errors occur
        """
        try:
            return git_checkout(repo, branch_name)
        except git.GitCommandError as e:
            raise ValueError(f"Failed to checkout branch: {str(e)}")

    def git_init(self, repo_path: str) -> str:
        try:
            validated_path = self.path_validator.validate_path(repo_path)
            repo = git.Repo.init(path=validated_path, mkdir=True)
            return f"Initialized empty Git repository in {repo.git_dir}"
        except ValueError as e:
            return f"Error: {str(e)}"
        except Exception as e:
            return f"Error initializing repository: {str(e)}"

    def git_show(self, repo: git.Repo, revision: str) -> str:
        commit = repo.commit(revision)
        output = [
            f"Commit: {commit.hexsha!r}\n"
            f"Author: {commit.author!r}\n"
            f"Date: {commit.authored_datetime!r}\n"
            f"Message: {commit.message!r}\n"
        ]
        if commit.parents:
            parent = commit.parents[0]
            diff = parent.diff(commit, create_patch=True)
        else:
            diff = commit.diff(git.NULL_TREE, create_patch=True)
        for d in diff:
            output.append(f"\n--- {d.a_path}\n+++ {d.b_path}\n")
            output.append(d.diff.decode('utf-8'))
        return "".join(output)

    def git_branch(self, repo: git.Repo, branch_type: str, contains: str | None = None, not_contains: str | None = None) -> str:
        match contains:
            case None:
                contains_sha = (None,)
            case _:
                contains_sha = ("--contains", contains)

        match not_contains:
            case None:
                not_contains_sha = (None,)
            case _:
                not_contains_sha = ("--no-contains", not_contains)

        match branch_type:
            case 'local':
                b_type = None
            case 'remote':
                b_type = "-r"
            case 'all':
                b_type = "-a"
            case _:
                return f"Invalid branch type: {branch_type}"

        # None value will be auto deleted by GitPython
        branch_info = repo.git.branch(b_type, *contains_sha, *not_contains_sha)

        return branch_info

async def serve(repository: Path | None) -> None:
    logger = logging.getLogger(__name__)

    if repository is not None:
        repository = Path(repository).resolve()
        if not repository.exists():
            logger.error(f"Path {repository} does not exist")
            return
        if not repository.is_dir():
            logger.error(f"Path {repository} is not a directory")
            return
        logger.info(f"Using base directory at {repository}")

    server = Server("mcp-git")
    git_server = GitServer(base_path=repository)

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        tools = []
        for tool in GitTools:
            # Get the schema from the appropriate model class
            if tool == GitTools.STATUS:
                schema = GitStatus.model_json_schema()
            elif tool == GitTools.DIFF_UNSTAGED:
                schema = GitDiffUnstaged.model_json_schema()
            elif tool == GitTools.DIFF_STAGED:
                schema = GitDiffStaged.model_json_schema()
            elif tool == GitTools.DIFF:
                schema = GitDiff.model_json_schema()
            elif tool == GitTools.COMMIT:
                schema = GitCommit.model_json_schema()
            elif tool == GitTools.ADD:
                schema = GitAdd.model_json_schema()
            elif tool == GitTools.RESET:
                schema = GitReset.model_json_schema()
            elif tool == GitTools.LOG:
                schema = GitLog.model_json_schema()
            elif tool == GitTools.CREATE_BRANCH:
                schema = GitCreateBranch.model_json_schema()
            elif tool == GitTools.CHECKOUT:
                schema = GitCheckout.model_json_schema()
            elif tool == GitTools.SHOW:
                schema = GitShow.model_json_schema()
            elif tool == GitTools.INIT:
                schema = GitInit.model_json_schema()
            elif tool == GitTools.BRANCH:
                schema = GitBranch.model_json_schema()
            else:
                continue
                
            if repository:
                # In single-repo mode with a parent directory,
                # we still need repo_path but restrict it to subdirectories
                if not git.repo.fun.is_git_dir(repository / ".git"):
                    schema["properties"]["repo_path"]["description"] = "Path to Git repository (must be under the configured base directory)"
                else:
                    # If repository itself is a Git repo, remove repo_path as before
                    schema["properties"].pop("repo_path", None)
                    schema["required"] = [r for r in schema.get("required", []) if r != "repo_path"]
            tools.append(Tool(
                name=tool.value,
                description=TOOL_DESCRIPTIONS[tool],
                inputSchema=schema
            ))
        return tools

    async def list_repos() -> Sequence[str]:
        async def by_roots() -> Sequence[str]:
            if not isinstance(server.request_context.session, ServerSession):
                raise TypeError("server.request_context.session must be a ServerSession")

            if not server.request_context.session.check_client_capability(
                ClientCapabilities(roots=RootsCapability())
            ):
                return []

            roots_result: ListRootsResult = await server.request_context.session.list_roots()
            logger.debug(f"Roots result: {roots_result}")
            repo_paths = []
            for root in roots_result.roots:
                path = root.uri.path
                try:
                    git.Repo(path)
                    repo_paths.append(str(path))
                except git.InvalidGitRepositoryError:
                    pass
            return repo_paths

        def by_commandline() -> Sequence[str]:
            return [str(repository)] if repository is not None else []

        cmd_repos = by_commandline()
        root_repos = await by_roots()
        return [*root_repos, *cmd_repos]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        try:
            # Auto-use configured repository only if it's actually a Git repository
            if repository and git.repo.fun.is_git_dir(repository / ".git"):
                arguments = arguments.copy()
                arguments["repo_path"] = str(repository)
            elif repository:
                # If repository is a parent dir, require and validate repo_path
                if "repo_path" not in arguments:
                    return [TextContent(
                        type="text",
                        text="Error: repository path not specified. When using --repository with a parent directory, you must specify which repository to operate on."
                    )]
                # No need to resolve here as get_repo will handle it
                repo_path = arguments["repo_path"]
                try:
                    # Just validate it can be resolved and is within bounds
                    resolved = git_server.resolve_repo_path(repo_path)
                    if not resolved.is_relative_to(repository):
                        return [TextContent(
                            type="text",
                            text=f"Error: repository path must be under the configured directory {repository}"
                        )]
                except ValueError as e:
                    return [TextContent(
                        type="text",
                        text=f"Error: {str(e)}"
                    )]

            # Handle git init separately
            if name == GitTools.INIT:
                if "repo_path" not in arguments:
                    return [TextContent(
                        type="text",
                        text="Error: repository path not specified"
                    )]
                result = git_server.git_init(arguments["repo_path"])
                return [TextContent(
                    type="text",
                    text=result
                )]

            # For all other commands, get a validated repo
            if "repo_path" not in arguments:
                return [TextContent(
                    type="text",
                    text="Error: repository path not specified"
                )]

            try:
                repo = git_server.get_repo(arguments["repo_path"])
            except ValueError as e:
                return [TextContent(
                    type="text",
                    text=f"Error: {str(e)}"
                )]

            match name:
                case GitTools.STATUS:
                    status = git_server.git_status(repo)
                    return [TextContent(
                        type="text",
                        text=f"Repository status:\n{status}"
                    )]

                case GitTools.DIFF_UNSTAGED:
                    diff = git_server.git_diff_unstaged(repo, arguments.get("context_lines", DEFAULT_CONTEXT_LINES))
                    return [TextContent(
                        type="text",
                        text=f"Unstaged changes:\n{diff}"
                    )]

                case GitTools.DIFF_STAGED:
                    diff = git_server.git_diff_staged(repo, arguments.get("context_lines", DEFAULT_CONTEXT_LINES))
                    return [TextContent(
                        type="text",
                        text=f"Staged changes:\n{diff}"
                    )]

                case GitTools.DIFF:
                    diff = git_server.git_diff(repo, arguments["target"], arguments.get("context_lines", DEFAULT_CONTEXT_LINES))
                    return [TextContent(
                        type="text",
                        text=f"Diff with {arguments['target']}:\n{diff}"
                    )]

                case GitTools.COMMIT:
                    result = git_server.git_commit(repo, arguments["message"])
                    return [TextContent(
                        type="text",
                        text=result
                    )]

                case GitTools.ADD:
                    result = git_server.git_add(repo, arguments["files"])
                    return [TextContent(
                        type="text",
                        text=result
                    )]

                case GitTools.RESET:
                    result = git_server.git_reset(repo)
                    return [TextContent(
                        type="text",
                        text=result
                    )]

                case GitTools.LOG:
                    log = git_server.git_log(repo, arguments.get("max_count", 10))
                    return [TextContent(
                        type="text",
                        text="Commit history:\n" + "\n".join(log)
                    )]

                case GitTools.CREATE_BRANCH:
                    result = git_server.git_create_branch(
                        repo,
                        arguments["branch_name"],
                        arguments.get("base_branch")
                    )
                    return [TextContent(
                        type="text",
                        text=result
                    )]

                case GitTools.CHECKOUT:
                    result = git_server.git_checkout(repo, arguments["branch_name"])
                    return [TextContent(
                        type="text",
                        text=result
                    )]

                case GitTools.SHOW:
                    result = git_server.git_show(repo, arguments["revision"])
                    return [TextContent(
                        type="text",
                        text=result
                    )]

                case GitTools.BRANCH:
                    result = git_server.git_branch(
                        repo,
                        arguments.get("branch_type", 'local'),
                        arguments.get("contains", None),
                        arguments.get("not_contains", None),
                    )
                    return [TextContent(
                        type="text",
                        text=result
                    )]

                case _:
                    raise ValueError(f"Unknown tool: {name}")

        except ValueError as e:
            return [TextContent(
                type="text",
                text=f"Error: {str(e)}",
            )]
        except Exception as e:
            logger.error(f"Error executing git command: {str(e)}")
            return [TextContent(
                type="text",
                text=f"Internal error: {str(e)}",
            )]

    options = server.create_initialization_options()
    try:
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, options, raise_exceptions=True)
    except asyncio.CancelledError:
        logger.info("Server shutting down...")
        raise  # Re-raise to allow proper cleanup
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        raise
