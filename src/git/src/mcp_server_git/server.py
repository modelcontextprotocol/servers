import logging
from pathlib import Path
from typing import Sequence, Optional, Set
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
from pydantic import BaseModel, Field
import asyncio
from collections import defaultdict
import time
import fnmatch

# Default number of context lines to show in diff output
DEFAULT_CONTEXT_LINES = 3

# Discovery configuration
class DiscoveryConfig(BaseModel):
    """Configuration for secure repository auto-discovery"""
    enabled: bool = False
    max_depth: int = 2
    exclude_patterns: list[str] = Field(default_factory=lambda: ['node_modules', '.venv', '__pycache__', '.git'])
    cache_ttl_seconds: int = 300  # 5 minute cache

class RepositoryCache:
    """Secure cache for discovered repositories with TTL and audit logging"""
    def __init__(self, ttl_seconds: int = 300):
        self.repos: Set[str] = set()
        self.last_scan: dict[str, float] = defaultdict(float)
        self.ttl = ttl_seconds
        self.logger = logging.getLogger(__name__ + '.cache')
    
    def add_repo(self, repo_path: str) -> None:
        """Add repository to cache with security logging"""
        self.repos.add(repo_path)
        self.last_scan[repo_path] = time.time()
        self.logger.info(f"Repository added to cache: {repo_path}")
    
    def is_cached(self, directory: str) -> bool:
        """Check if directory scan is still valid"""
        return (time.time() - self.last_scan[directory]) < self.ttl
    
    def get_repos(self) -> Set[str]:
        """Get valid cached repositories, cleaning expired entries"""
        current_time = time.time()
        expired = [path for path, scan_time in self.last_scan.items() 
                  if current_time - scan_time > self.ttl]
        for path in expired:
            self.repos.discard(path)
            del self.last_scan[path]
            self.logger.debug(f"Expired repository removed from cache: {path}")
        return self.repos.copy()
    
    def clear(self) -> None:
        """Clear all cached repositories"""
        self.repos.clear()
        self.last_scan.clear()
        self.logger.info("Repository cache cleared")

# Global repository cache instance
_repository_cache = RepositoryCache()

def find_git_repository_root(path: Path) -> Optional[Path]:
    """Securely walk up directory tree to find git repository root"""
    current = path if path.is_dir() else path.parent
    max_traversal = 10  # Limit directory traversal for security
    
    for _ in range(max_traversal):
        if current == current.parent:  # Reached filesystem root
            break
            
        if (current / '.git').exists():
            try:
                # Validate it's a proper git repository
                git.Repo(current)
                return current
            except git.InvalidGitRepositoryError:
                pass
        
        current = current.parent
    
    return None

def matches_exclude_pattern(path: Path, exclude_patterns: list[str]) -> bool:
    """Check if path matches any exclude pattern"""
    path_str = str(path)
    path_name = path.name
    
    for pattern in exclude_patterns:
        # Support both filename and path patterns
        if fnmatch.fnmatch(path_name, pattern) or fnmatch.fnmatch(path_str, pattern):
            return True
    return False

async def discover_repositories_secure(
    root_paths: Sequence[str], 
    config: DiscoveryConfig
) -> Set[str]:
    """Securely discover git repositories within allowed root paths"""
    logger = logging.getLogger(__name__ + '.discovery')
    discovered = set()
    
    if not config.enabled:
        return discovered
    
    logger.info(f"Starting secure repository discovery in {len(root_paths)} root paths")
    logger.debug(f"Discovery config: max_depth={config.max_depth}, exclude_patterns={config.exclude_patterns}")
    
    for root_path_str in root_paths:
        root_path = Path(root_path_str)
        
        # Check cache first
        if _repository_cache.is_cached(root_path_str):
            logger.debug(f"Using cached scan results for {root_path_str}")
            continue
        
        # Perform secure scan
        try:
            repos_in_root = await _scan_directory_secure(root_path, config)
            discovered.update(repos_in_root)
            
            # Cache the scan timestamp
            _repository_cache.last_scan[root_path_str] = time.time()
            for repo in repos_in_root:
                _repository_cache.add_repo(repo)
                
        except Exception as e:
            logger.warning(f"Error scanning {root_path_str}: {e}")
    
    # Add all cached repositories
    discovered.update(_repository_cache.get_repos())
    
    logger.info(f"Discovery completed. Found {len(discovered)} repositories")
    return discovered

async def _scan_directory_secure(
    directory: Path, 
    config: DiscoveryConfig, 
    current_depth: int = 0
) -> Set[str]:
    """Securely scan directory for git repositories with depth and pattern limits"""
    discovered = set()
    
    if current_depth > config.max_depth:
        return discovered
    
    try:
        if not directory.exists() or not directory.is_dir():
            return discovered
        
        # Check if current directory is a git repository
        if (directory / '.git').exists():
            try:
                git.Repo(directory)
                discovered.add(str(directory.resolve()))
                # Don't scan subdirectories of git repos
                return discovered
            except git.InvalidGitRepositoryError:
                pass
        
        # Scan subdirectories if not excluded
        if matches_exclude_pattern(directory, config.exclude_patterns):
            return discovered
        
        # Use asyncio to prevent blocking
        loop = asyncio.get_event_loop()
        scan_tasks = []
        
        try:
            for item in directory.iterdir():
                if item.is_dir() and not item.name.startswith('.'):
                    if not matches_exclude_pattern(item, config.exclude_patterns):
                        task = loop.run_in_executor(
                            None,
                            lambda d=item: asyncio.run(
                                _scan_directory_secure(d, config, current_depth + 1)
                            )
                        )
                        scan_tasks.append(task)
            
            # Wait for all scans to complete with timeout
            if scan_tasks:
                results = await asyncio.wait_for(
                    asyncio.gather(*scan_tasks, return_exceptions=True),
                    timeout=30.0  # 30 second timeout per directory level
                )
                
                for result in results:
                    if isinstance(result, set):
                        discovered.update(result)
                        
        except (PermissionError, OSError, asyncio.TimeoutError) as e:
            logging.getLogger(__name__ + '.discovery').debug(
                f"Skipping directory {directory}: {e}"
            )
            
    except Exception as e:
        logging.getLogger(__name__ + '.discovery').warning(
            f"Error scanning {directory}: {e}"
        )
    
    return discovered

class GitStatus(BaseModel):
    repo_path: str

class GitDiffUnstaged(BaseModel):
    repo_path: str
    context_lines: int = DEFAULT_CONTEXT_LINES

class GitDiffStaged(BaseModel):
    repo_path: str
    context_lines: int = DEFAULT_CONTEXT_LINES

class GitDiff(BaseModel):
    repo_path: str
    target: str
    context_lines: int = DEFAULT_CONTEXT_LINES

class GitCommit(BaseModel):
    repo_path: str
    message: str

class GitAdd(BaseModel):
    repo_path: str
    files: list[str]

class GitReset(BaseModel):
    repo_path: str

class GitLog(BaseModel):
    repo_path: str
    max_count: int = 10

class GitCreateBranch(BaseModel):
    repo_path: str
    branch_name: str
    base_branch: str | None = None

class GitCheckout(BaseModel):
    repo_path: str
    branch_name: str

class GitShow(BaseModel):
    repo_path: str
    revision: str

class GitInit(BaseModel):
    repo_path: str

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

class GitDiscoverRepositories(BaseModel):
    scan_path: Optional[str] = Field(
        None,
        description="Specific path to scan for repositories (optional, uses MCP roots if not provided)"
    )
    force_refresh: bool = Field(
        False,
        description="Force refresh of cached discovery results"
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
    DISCOVER_REPOSITORIES = "git_discover_repositories"

def git_status(repo: git.Repo) -> str:
    return repo.git.status()

def git_diff_unstaged(repo: git.Repo, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
    return repo.git.diff(f"--unified={context_lines}")

def git_diff_staged(repo: git.Repo, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
    return repo.git.diff(f"--unified={context_lines}", "--cached")

def git_diff(repo: git.Repo, target: str, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
    return repo.git.diff(f"--unified={context_lines}", target)

def git_commit(repo: git.Repo, message: str) -> str:
    commit = repo.index.commit(message)
    return f"Changes committed successfully with hash {commit.hexsha}"

def git_add(repo: git.Repo, files: list[str]) -> str:
    repo.index.add(files)
    return "Files staged successfully"

def git_reset(repo: git.Repo) -> str:
    repo.index.reset()
    return "All staged changes reset"

def git_log(repo: git.Repo, max_count: int = 10) -> list[str]:
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

def git_create_branch(repo: git.Repo, branch_name: str, base_branch: str | None = None) -> str:
    if base_branch:
        base = repo.references[base_branch]
    else:
        base = repo.active_branch

    repo.create_head(branch_name, base)
    return f"Created branch '{branch_name}' from '{base.name}'"

def git_checkout(repo: git.Repo, branch_name: str) -> str:
    repo.git.checkout(branch_name)
    return f"Switched to branch '{branch_name}'"

def git_init(repo_path: str) -> str:
    try:
        repo = git.Repo.init(path=repo_path, mkdir=True)
        return f"Initialized empty Git repository in {repo.git_dir}"
    except Exception as e:
        return f"Error initializing repository: {str(e)}"

def git_show(repo: git.Repo, revision: str) -> str:
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

def git_branch(repo: git.Repo, branch_type: str, contains: str | None = None, not_contains: str | None = None) -> str:
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

async def serve(repositories: list[Path], discovery_config: Optional[DiscoveryConfig] = None) -> None:
    logger = logging.getLogger(__name__)

    # Validate explicitly provided repositories
    validated_repos = []
    for repo in repositories:
        try:
            git.Repo(repo)
            validated_repos.append(repo)
            logger.info(f"Using repository at {repo}")
        except git.InvalidGitRepositoryError:
            logger.error(f"{repo} is not a valid Git repository")
    
    # Log discovery configuration
    if discovery_config and discovery_config.enabled:
        logger.info(f"Repository auto-discovery enabled with max_depth={discovery_config.max_depth}")
        logger.debug(f"Discovery exclude patterns: {discovery_config.exclude_patterns}")
    else:
        logger.info("Repository auto-discovery disabled")

    server = Server("mcp-git")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name=GitTools.STATUS,
                description="Shows the working tree status",
                inputSchema=GitStatus.model_json_schema(),
            ),
            Tool(
                name=GitTools.DIFF_UNSTAGED,
                description="Shows changes in the working directory that are not yet staged",
                inputSchema=GitDiffUnstaged.model_json_schema(),
            ),
            Tool(
                name=GitTools.DIFF_STAGED,
                description="Shows changes that are staged for commit",
                inputSchema=GitDiffStaged.model_json_schema(),
            ),
            Tool(
                name=GitTools.DIFF,
                description="Shows differences between branches or commits",
                inputSchema=GitDiff.model_json_schema(),
            ),
            Tool(
                name=GitTools.COMMIT,
                description="Records changes to the repository",
                inputSchema=GitCommit.model_json_schema(),
            ),
            Tool(
                name=GitTools.ADD,
                description="Adds file contents to the staging area",
                inputSchema=GitAdd.model_json_schema(),
            ),
            Tool(
                name=GitTools.RESET,
                description="Unstages all staged changes",
                inputSchema=GitReset.model_json_schema(),
            ),
            Tool(
                name=GitTools.LOG,
                description="Shows the commit logs",
                inputSchema=GitLog.model_json_schema(),
            ),
            Tool(
                name=GitTools.CREATE_BRANCH,
                description="Creates a new branch from an optional base branch",
                inputSchema=GitCreateBranch.model_json_schema(),
            ),
            Tool(
                name=GitTools.CHECKOUT,
                description="Switches branches",
                inputSchema=GitCheckout.model_json_schema(),
            ),
            Tool(
                name=GitTools.SHOW,
                description="Shows the contents of a commit",
                inputSchema=GitShow.model_json_schema(),
            ),
            Tool(
                name=GitTools.INIT,
                description="Initialize a new Git repository",
                inputSchema=GitInit.model_json_schema(),
            ),
            Tool(
                name=GitTools.BRANCH,
                description="List Git branches",
                inputSchema=GitBranch.model_json_schema(),
            ),
            Tool(
                name=GitTools.DISCOVER_REPOSITORIES,
                description="Discover git repositories within allowed paths (requires --enable-discovery)",
                inputSchema=GitDiscoverRepositories.model_json_schema(),
            )
        ]

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
            
            # Get root paths for discovery, filtering out None values
            root_paths = [root.uri.path for root in roots_result.roots if root.uri.path is not None]
            
            # Traditional single-repo validation (for backward compatibility)
            repo_paths = []
            for root in roots_result.roots:
                path = root.uri.path
                try:
                    git.Repo(path)
                    repo_paths.append(str(path))
                except git.InvalidGitRepositoryError:
                    pass
            
            # Enhanced discovery if enabled
            discovered_repos = set()
            if discovery_config and discovery_config.enabled:
                try:
                    discovered_repos = await discover_repositories_secure(root_paths, discovery_config)
                    logger.info(f"Auto-discovery found {len(discovered_repos)} additional repositories")
                except Exception as e:
                    logger.warning(f"Repository auto-discovery failed: {e}")
            
            # Combine traditional and discovered repositories
            all_repos = set(repo_paths) | discovered_repos
            return list(all_repos)

        def by_commandline() -> Sequence[str]:
            return [str(repo) for repo in validated_repos]

        cmd_repos = by_commandline()
        root_repos = await by_roots()
        
        # Combine and deduplicate
        all_repos = list(set([*root_repos, *cmd_repos]))
        logger.info(f"Total available repositories: {len(all_repos)}")
        return all_repos

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        
        # Handle repository discovery tool
        if name == GitTools.DISCOVER_REPOSITORIES:
            if not discovery_config or not discovery_config.enabled:
                return [TextContent(
                    type="text",
                    text="Repository discovery is not enabled. Use --enable-discovery flag when starting the server."
                )]
            
            scan_path = arguments.get("scan_path")
            force_refresh = arguments.get("force_refresh", False)
            
            if force_refresh:
                _repository_cache.clear()
                logger.info("Repository cache cleared due to force_refresh")
            
            try:
                if scan_path:
                    # Scan specific path
                    discovered = await _scan_directory_secure(Path(scan_path), discovery_config)
                    result_text = f"Discovered repositories in {scan_path}:\n" + "\n".join(sorted(discovered))
                else:
                    # Use MCP session roots
                    if isinstance(server.request_context.session, ServerSession):
                        roots_result = await server.request_context.session.list_roots()
                        root_paths = [root.uri.path for root in roots_result.roots if root.uri.path is not None]
                        discovered = await discover_repositories_secure(root_paths, discovery_config)
                        result_text = f"Discovered repositories in MCP roots:\n" + "\n".join(sorted(discovered))
                    else:
                        discovered = set()  # Initialize discovered for type safety
                        result_text = "No MCP session available for root discovery"
                
                return [TextContent(
                    type="text",
                    text=result_text if discovered else "No git repositories found"
                )]
                
            except Exception as e:
                logger.error(f"Repository discovery failed: {e}")
                return [TextContent(
                    type="text",
                    text=f"Repository discovery failed: {str(e)}"
                )]
        
        # All other tools require repo_path
        if "repo_path" not in arguments:
            return [TextContent(
                type="text",
                text="Error: repo_path argument is required"
            )]
            
        repo_path = Path(arguments["repo_path"])
        
        # Handle git init separately since it doesn't require an existing repo
        if name == GitTools.INIT:
            result = git_init(str(repo_path))
            return [TextContent(
                type="text",
                text=result
            )]
            
        # For all other commands, we need an existing repo
        # Try intelligent repository resolution if path is not a git repo
        if not (repo_path / '.git').exists():
            git_root = find_git_repository_root(repo_path)
            if git_root:
                repo_path = git_root
                logger.debug(f"Resolved {arguments['repo_path']} to git repository at {repo_path}")
            else:
                return [TextContent(
                    type="text",
                    text=f"No git repository found at or above {repo_path}. Use git_discover_repositories to find available repositories."
                )]
        
        try:
            repo = git.Repo(repo_path)
        except git.InvalidGitRepositoryError:
            return [TextContent(
                type="text",
                text=f"Invalid git repository at {repo_path}"
            )]

        match name:
            case GitTools.STATUS:
                status = git_status(repo)
                return [TextContent(
                    type="text",
                    text=f"Repository status:\n{status}"
                )]

            case GitTools.DIFF_UNSTAGED:
                diff = git_diff_unstaged(repo, arguments.get("context_lines", DEFAULT_CONTEXT_LINES))
                return [TextContent(
                    type="text",
                    text=f"Unstaged changes:\n{diff}"
                )]

            case GitTools.DIFF_STAGED:
                diff = git_diff_staged(repo, arguments.get("context_lines", DEFAULT_CONTEXT_LINES))
                return [TextContent(
                    type="text",
                    text=f"Staged changes:\n{diff}"
                )]

            case GitTools.DIFF:
                diff = git_diff(repo, arguments["target"], arguments.get("context_lines", DEFAULT_CONTEXT_LINES))
                return [TextContent(
                    type="text",
                    text=f"Diff with {arguments['target']}:\n{diff}"
                )]

            case GitTools.COMMIT:
                result = git_commit(repo, arguments["message"])
                return [TextContent(
                    type="text",
                    text=result
                )]

            case GitTools.ADD:
                result = git_add(repo, arguments["files"])
                return [TextContent(
                    type="text",
                    text=result
                )]

            case GitTools.RESET:
                result = git_reset(repo)
                return [TextContent(
                    type="text",
                    text=result
                )]

            case GitTools.LOG:
                log = git_log(repo, arguments.get("max_count", 10))
                return [TextContent(
                    type="text",
                    text="Commit history:\n" + "\n".join(log)
                )]

            case GitTools.CREATE_BRANCH:
                result = git_create_branch(
                    repo,
                    arguments["branch_name"],
                    arguments.get("base_branch")
                )
                return [TextContent(
                    type="text",
                    text=result
                )]

            case GitTools.CHECKOUT:
                result = git_checkout(repo, arguments["branch_name"])
                return [TextContent(
                    type="text",
                    text=result
                )]

            case GitTools.SHOW:
                result = git_show(repo, arguments["revision"])
                return [TextContent(
                    type="text",
                    text=result
                )]

            case GitTools.BRANCH:
                result = git_branch(
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

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)
