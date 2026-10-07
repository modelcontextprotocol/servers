# The git MCP server: tools that read and change a Git repository through
# GitPython. Repository confinement (`--repository`, `validate_repo_path`) and
# the flag-injection guards live beside the handlers because every tool call
# must pass them before any git command runs.
#
# Built on the MCP Python SDK v2's low-level `Server` (#4851). That SDK no
# longer validates tool arguments or folds tool exceptions into `isError`
# results, so `call_tool` does both with SDK v1's messages, and `serve()` runs
# the legacy (2025-11-25) handshake loop only, keeping the wire as it was on v1.
# Serving 2026-07-28 is #4853.

import logging
from importlib.metadata import version
from pathlib import Path
from typing import Any, Optional
import jsonschema
from mcp.server import Server, ServerRequestContext
from mcp.server.runner import serve_loop
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequestParams,
    CallToolResult,
    ContentBlock,
    ListToolsResult,
    PaginatedRequestParams,
    TextContent,
    Tool,
    ToolAnnotations,
)
from enum import Enum
import git
from git.exc import BadName
from pydantic import BaseModel, Field

# The version this server reports in serverInfo, read from the installed
# distribution's metadata (pyproject.toml) so it cannot drift from the
# published version (#360). Without it the SDK reports its own `mcp` version.
SERVER_VERSION = version("mcp-server-git")

# Default number of context lines to show in diff output
DEFAULT_CONTEXT_LINES = 3


class FlagInjectionError(BadName):
    """A flag-injection guard's rejection of a value starting with '-'.

    Still a BadName, but BadName's __str__ wraps its argument as a ref name
    ("Ref '...' did not resolve to an object"), which garbles the guard's own
    message. The message is already complete, so report it as written.
    """

    def __str__(self) -> str:
        return str(self.args[0])


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
    files: list[str] = Field(..., min_length=1)


class GitReset(BaseModel):
    repo_path: str


class GitLog(BaseModel):
    repo_path: str
    max_count: int = 10
    start_timestamp: Optional[str] = Field(
        None,
        description="Start timestamp for filtering commits. Accepts: ISO 8601 format (e.g., '2024-01-15T14:30:25'), relative dates (e.g., '2 weeks ago', 'yesterday'), or absolute dates (e.g., '2024-01-15', 'Jan 15 2024')",
    )
    end_timestamp: Optional[str] = Field(
        None,
        description="End timestamp for filtering commits. Accepts: ISO 8601 format (e.g., '2024-01-15T14:30:25'), relative dates (e.g., '2 weeks ago', 'yesterday'), or absolute dates (e.g., '2024-01-15', 'Jan 15 2024')",
    )


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

    BRANCH = "git_branch"


def git_status(repo: git.Repo) -> str:
    return repo.git.status()


def git_diff_unstaged(
    repo: git.Repo, context_lines: int = DEFAULT_CONTEXT_LINES
) -> str:
    return repo.git.diff(f"--unified={context_lines}")


def git_diff_staged(repo: git.Repo, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
    return repo.git.diff(f"--unified={context_lines}", "--cached")


def git_diff(
    repo: git.Repo, target: str, context_lines: int = DEFAULT_CONTEXT_LINES
) -> str:
    # Defense in depth: reject targets starting with '-' to prevent flag injection,
    # even if a malicious ref with that name exists (e.g. via filesystem manipulation)
    if target.startswith("-"):
        raise FlagInjectionError(f"Invalid target: '{target}' - cannot start with '-'")
    repo.rev_parse(target)  # Validates target is a real git ref, throws BadName if not
    return repo.git.diff(f"--unified={context_lines}", target)


def _has_staged_changes(repo: git.Repo) -> bool:
    """Whether the index holds anything git would record as a commit.

    Mirrors `git commit`, which refuses to create an empty commit unless
    --allow-empty is given, but permits one while a merge is in progress.
    """
    if (Path(repo.git_dir) / "MERGE_HEAD").exists():
        return True
    if not repo.head.is_valid():
        # Unborn branch: the first commit, so anything in the index counts.
        return bool(repo.index.entries)
    return bool(repo.index.diff(repo.head.commit))


def git_commit(repo: git.Repo, message: str) -> str:
    # repo.index.commit() writes a tree unconditionally, so without this check
    # a caller that forgot to stage gets a hash back for an empty commit and no
    # way to tell it apart from a real one.
    if not _has_staged_changes(repo):
        raise ValueError(
            "No changes staged for commit. Use git_add to stage changes first; "
            "git_status shows what is currently staged."
        )
    git_dir = Path(repo.git_dir)
    merge_head = git_dir / "MERGE_HEAD"
    if merge_head.exists():
        # Conclude the merge as `git commit` does: HEAD plus every MERGE_HEAD
        # commit as parents, then clear the merge state. index.commit() alone
        # records only HEAD and leaves the repository mid-merge.
        parents = [repo.head.commit] + [
            repo.commit(sha) for sha in merge_head.read_text().split()
        ]
        commit = repo.index.commit(message, parent_commits=parents)
        for name in ("MERGE_HEAD", "MERGE_MSG", "MERGE_MODE", "AUTO_MERGE"):
            (git_dir / name).unlink(missing_ok=True)
        autostash_note = _apply_merge_autostash(repo)
    else:
        commit = repo.index.commit(message)
        autostash_note = ""
    return f"Changes committed successfully with hash {commit.hexsha}{autostash_note}"


def _apply_merge_autostash(repo: git.Repo) -> str:
    """Reapply a `git merge --autostash` stash, as `git commit` does.

    Mirrors git's sequencer: apply the stash, store it in the stash list if
    that conflicts, then remove MERGE_AUTOSTASH. Returns a note for the reply,
    empty when the merge had no autostash.
    """
    autostash = Path(repo.git_dir) / "MERGE_AUTOSTASH"
    if not autostash.exists():
        return ""
    stash_oid = autostash.read_text().strip()
    try:
        repo.git.stash("apply", stash_oid)
        note = "\nApplied autostash."
    except git.GitCommandError:
        repo.git.stash("store", "-m", "autostash", "-q", stash_oid)
        note = (
            "\nApplying autostash resulted in conflicts. Your changes are safe "
            'in the stash; run "git stash pop" or "git stash drop" at any time.'
        )
    autostash.unlink()
    return note


def _index_entries(repo: git.Repo, files: list[str]) -> str:
    """Mode, blob and stage of the index entries matching the pathspecs."""
    return repo.git.ls_files("--stage", "--", *files)


def git_add(repo: git.Repo, files: list[str]) -> str:
    if not files:
        # `git add --` with no pathspec is a no-op that exits 0.
        raise ValueError(
            "No files provided to stage. Pass one or more paths, "
            "or ['.'] to stage everything."
        )
    if files == ["."]:
        before = _index_entries(repo, files)
        repo.git.add(".")
    else:
        # Defense in depth: validate each path resolves within the repository
        # working tree to prevent path traversal (e.g. '../../etc/passwd' or an
        # absolute path) from staging files outside repository boundaries.
        repo_root = Path(repo.working_dir).resolve()
        for f in files:
            try:
                resolved = (repo_root / f).resolve()
            except (OSError, RuntimeError):
                raise ValueError(f"Invalid path: '{f}'")
            try:
                resolved.relative_to(repo_root)
            except ValueError:
                raise ValueError(f"Path '{f}' is outside the repository '{repo_root}'")
        before = _index_entries(repo, files)
        # Use '--' to prevent files starting with '-' from being interpreted as options
        repo.git.add("--", *files)
    # `git add` exits 0 when it stages nothing (e.g. '.' on a clean tree), so
    # read the outcome back from the index rather than the exit status.
    if _index_entries(repo, files) == before:
        return (
            "No changes were staged: the given paths had nothing new to stage. "
            "git_status shows what is modified or untracked."
        )
    return "Files staged successfully"


def git_reset(repo: git.Repo) -> str:
    repo.index.reset()
    return "All staged changes reset"


def git_log(
    repo: git.Repo,
    max_count: int = 10,
    start_timestamp: Optional[str] = None,
    end_timestamp: Optional[str] = None,
) -> list[str]:
    # Defense in depth: reject timestamps starting with '-' to prevent flag injection
    if start_timestamp and start_timestamp.startswith("-"):
        raise ValueError(
            f"Invalid start_timestamp: '{start_timestamp}' - cannot start with '-'"
        )
    if end_timestamp and end_timestamp.startswith("-"):
        raise ValueError(
            f"Invalid end_timestamp: '{end_timestamp}' - cannot start with '-'"
        )

    kwargs: dict[str, Any] = {"max_count": max_count}
    if start_timestamp:
        kwargs["since"] = start_timestamp
    if end_timestamp:
        kwargs["until"] = end_timestamp

    commits = list(repo.iter_commits(**kwargs))
    log = []
    for commit in commits:
        log.append(
            f"Commit: {commit.hexsha}\n"
            f"Author: {commit.author}\n"
            f"Date: {commit.authored_datetime}\n"
            f"Message: {commit.message}\n"
        )
    return log


def git_create_branch(
    repo: git.Repo, branch_name: str, base_branch: str | None = None
) -> str:
    # Defense in depth: reject names starting with '-' to prevent flag injection
    if branch_name.startswith("-"):
        raise FlagInjectionError(
            f"Invalid branch name: '{branch_name}' - cannot start with '-'"
        )
    if base_branch and base_branch.startswith("-"):
        raise FlagInjectionError(
            f"Invalid base branch: '{base_branch}' - cannot start with '-'"
        )
    if base_branch:
        base = repo.references[base_branch]
    else:
        base = repo.active_branch

    # GitPython's create_head accepts a name that already points at the base
    # commit, so check first rather than report a branch that was not created.
    # Compare names: `in repo.heads` also matches IterableList attributes
    # such as "append".
    if any(head.name == branch_name for head in repo.heads):
        raise ValueError(
            f"Cannot create branch '{branch_name}': refs/heads/{branch_name} already exists"
        )
    repo.create_head(branch_name, base)
    return f"Created branch '{branch_name}' from '{base.name}'"


def git_checkout(repo: git.Repo, branch_name: str) -> str:
    # Defense in depth: reject branch names starting with '-' to prevent flag injection,
    # even if a malicious ref with that name exists (e.g. via filesystem manipulation)
    if branch_name.startswith("-"):
        raise FlagInjectionError(
            f"Invalid branch name: '{branch_name}' - cannot start with '-'"
        )
    repo.rev_parse(
        branch_name
    )  # Validates branch_name is a real git ref, throws BadName if not
    repo.git.checkout(branch_name)
    # rev_parse accepts any revision, so branch_name may have been a sha, tag or
    # remote-tracking ref rather than a branch. Report what actually happened instead of
    # claiming a branch switch; a detached HEAD is easy to commit onto by mistake.
    if repo.head.is_detached:
        return f"HEAD is now detached at {repo.head.commit.hexsha[:7]}"
    return f"Switched to branch '{repo.active_branch.name}'"


def git_show(repo: git.Repo, revision: str) -> str:
    # Defense in depth: reject revisions starting with '-' to prevent flag injection,
    # even if a malicious ref with that name exists (e.g. via filesystem manipulation)
    if revision.startswith("-"):
        raise FlagInjectionError(
            f"Invalid revision: '{revision}' - cannot start with '-'"
        )
    obj = repo.rev_parse(revision)
    if isinstance(obj, git.Blob):
        return obj.data_stream.read().decode("utf-8", errors="replace")
    if isinstance(obj, git.Tree):
        return "\n".join(
            f"{item.name}/" if isinstance(item, git.Tree) else item.name for item in obj
        )
    commit = repo.commit(revision)
    message = commit.message
    if isinstance(message, bytes):  # pragma: no cover
        # GitPython already decodes the message, falling back to errors="replace".
        message = message.decode("utf-8", errors="replace")
    # The header follows `git show --date=iso`: the sha, `Name <email>`, an
    # ISO date, and the message indented by four spaces.
    output = [
        f"commit {commit.hexsha}\n"
        f"Author: {commit.author.name} <{commit.author.email}>\n"
        f"Date:   {commit.authored_datetime.strftime('%Y-%m-%d %H:%M:%S %z')}\n"
        "\n" + "".join(f"    {line}\n" for line in message.rstrip("\n").split("\n"))
    ]
    if commit.parents:
        parent = commit.parents[0]
        diff = parent.diff(commit, create_patch=True)
    else:
        diff = commit.diff(git.NULL_TREE, create_patch=True)
    for d in diff:
        # git prints /dev/null for the missing side of an added or deleted file.
        a_path = "/dev/null" if d.new_file or d.a_path is None else d.a_path
        b_path = "/dev/null" if d.deleted_file or d.b_path is None else d.b_path
        output.append(f"\n--- {a_path}\n+++ {b_path}\n")
        if d.diff is None:
            continue  # pragma: no cover  # with create_patch=True GitPython always assigns the patch as bytes
        if isinstance(d.diff, bytes):
            # A non-UTF-8 file (Latin-1, say) must not fail the whole call.
            output.append(d.diff.decode("utf-8", errors="replace"))
        else:  # pragma: no cover  # with create_patch=True GitPython always assigns the patch as bytes
            output.append(d.diff)
    return "".join(output)


def validate_repo_path(repo_path: Path, allowed_repository: Path | None) -> None:
    """Validate that repo_path is within the allowed repository path."""
    if allowed_repository is None:
        return  # No restriction configured

    # Resolve both paths to handle symlinks and relative paths
    try:
        resolved_repo = repo_path.resolve()
        resolved_allowed = allowed_repository.resolve()
    except (OSError, RuntimeError):
        raise ValueError(f"Invalid path: {repo_path}")

    # Check if repo_path is the same as or a subdirectory of allowed_repository
    try:
        resolved_repo.relative_to(resolved_allowed)
    except ValueError:
        raise ValueError(
            f"Repository path '{repo_path}' is outside the allowed repository '{allowed_repository}'"
        )


def git_branch(
    repo: git.Repo,
    branch_type: str,
    contains: str | None = None,
    not_contains: str | None = None,
) -> str:
    # Defense in depth: reject values starting with '-' to prevent flag injection
    if contains and contains.startswith("-"):
        raise FlagInjectionError(
            f"Invalid contains value: '{contains}' - cannot start with '-'"
        )
    if not_contains and not_contains.startswith("-"):
        raise FlagInjectionError(
            f"Invalid not_contains value: '{not_contains}' - cannot start with '-'"
        )

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
        case "local":
            b_type = None
        case "remote":
            b_type = "-r"
        case "all":
            b_type = "-a"
        case _:
            raise ValueError(f"Invalid branch type: {branch_type}")

    # None value will be auto deleted by GitPython
    branch_info = repo.git.branch(b_type, *contains_sha, *not_contains_sha)

    return branch_info


def tool_error(message: str) -> CallToolResult:
    """A tool call that failed, as an `isError` result the model can read."""
    return CallToolResult(
        content=[TextContent(type="text", text=message)], is_error=True
    )


async def serve(repository: Path | None) -> None:
    logger = logging.getLogger(__name__)

    if repository is not None:
        try:
            # Walk up to the enclosing working tree, like `git rev-parse
            # --show-toplevel`, so `--repository .` works from a subdirectory.
            root = Path(
                git.Repo(repository, search_parent_directories=True).working_dir
            )
        except git.NoSuchPathError:
            logger.error(f"{repository} does not exist")
            raise SystemExit(1)
        except git.InvalidGitRepositoryError:
            logger.error(f"{repository} is not a valid Git repository")
            return
        if root != repository:
            logger.info(f"Resolved --repository {repository} to repository root {root}")
        repository = root
        logger.info(f"Using repository at {repository}")

    tools = [
        Tool(
            name=GitTools.STATUS,
            description="Shows the working tree status",
            input_schema=GitStatus.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.DIFF_UNSTAGED,
            description="Shows changes in the working directory that are not yet staged",
            input_schema=GitDiffUnstaged.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.DIFF_STAGED,
            description="Shows changes that are staged for commit",
            input_schema=GitDiffStaged.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.DIFF,
            description="Shows differences between branches or commits",
            input_schema=GitDiff.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.COMMIT,
            description="Records changes to the repository",
            input_schema=GitCommit.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=False,
                destructive_hint=False,
                idempotent_hint=False,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.ADD,
            description="Adds file contents to the staging area",
            input_schema=GitAdd.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=False,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.RESET,
            description="Unstages all staged changes",
            input_schema=GitReset.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=False,
                destructive_hint=True,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.LOG,
            description="Shows the commit logs",
            input_schema=GitLog.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.CREATE_BRANCH,
            description="Creates a new branch from an optional base branch",
            input_schema=GitCreateBranch.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=False,
                destructive_hint=False,
                idempotent_hint=False,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.CHECKOUT,
            description="Switches branches",
            input_schema=GitCheckout.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=False,
                destructive_hint=False,
                idempotent_hint=False,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.SHOW,
            description="Shows the contents of a commit, or of a file or directory given as <revision>:<path>",
            input_schema=GitShow.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
        Tool(
            name=GitTools.BRANCH,
            description="List Git branches",
            input_schema=GitBranch.model_json_schema(),
            annotations=ToolAnnotations(
                read_only_hint=True,
                destructive_hint=False,
                idempotent_hint=True,
                open_world_hint=False,
            ),
        ),
    ]
    schemas = {tool.name: tool.input_schema for tool in tools}

    async def list_tools(
        ctx: ServerRequestContext, params: PaginatedRequestParams | None
    ) -> ListToolsResult:
        return ListToolsResult(tools=tools)

    async def run_tool(name: str, arguments: dict[str, Any]) -> list[ContentBlock]:
        # Reject an unknown tool before reading its arguments, so a call
        # without repo_path still reports "Unknown tool" (#4994).
        if name not in {tool.value for tool in GitTools}:
            raise ValueError(f"Unknown tool: {name}")

        repo_path = Path(arguments["repo_path"])

        # Validate repo_path is within allowed repository
        validate_repo_path(repo_path, repository)

        # For all commands, we need an existing repo
        repo = git.Repo(repo_path)

        match name:
            case GitTools.STATUS:
                status = git_status(repo)
                return [TextContent(type="text", text=f"Repository status:\n{status}")]

            case GitTools.DIFF_UNSTAGED:
                diff = git_diff_unstaged(
                    repo, arguments.get("context_lines", DEFAULT_CONTEXT_LINES)
                )
                return [TextContent(type="text", text=f"Unstaged changes:\n{diff}")]

            case GitTools.DIFF_STAGED:
                diff = git_diff_staged(
                    repo, arguments.get("context_lines", DEFAULT_CONTEXT_LINES)
                )
                return [TextContent(type="text", text=f"Staged changes:\n{diff}")]

            case GitTools.DIFF:
                diff = git_diff(
                    repo,
                    arguments["target"],
                    arguments.get("context_lines", DEFAULT_CONTEXT_LINES),
                )
                return [
                    TextContent(
                        type="text", text=f"Diff with {arguments['target']}:\n{diff}"
                    )
                ]

            case GitTools.COMMIT:
                result = git_commit(repo, arguments["message"])
                return [TextContent(type="text", text=result)]

            case GitTools.ADD:
                result = git_add(repo, arguments["files"])
                return [TextContent(type="text", text=result)]

            case GitTools.RESET:
                result = git_reset(repo)
                return [TextContent(type="text", text=result)]

            # Update the LOG case:
            case GitTools.LOG:
                log = git_log(
                    repo,
                    arguments.get("max_count", 10),
                    arguments.get("start_timestamp"),
                    arguments.get("end_timestamp"),
                )
                return [
                    TextContent(type="text", text="Commit history:\n" + "\n".join(log))
                ]

            case GitTools.CREATE_BRANCH:
                result = git_create_branch(
                    repo, arguments["branch_name"], arguments.get("base_branch")
                )
                return [TextContent(type="text", text=result)]

            case GitTools.CHECKOUT:
                result = git_checkout(repo, arguments["branch_name"])
                return [TextContent(type="text", text=result)]

            case GitTools.SHOW:
                result = git_show(repo, arguments["revision"])
                return [TextContent(type="text", text=result)]

            case GitTools.BRANCH:
                result = git_branch(
                    repo,
                    arguments.get("branch_type", "local"),
                    arguments.get("contains", None),
                    arguments.get("not_contains", None),
                )
                return [TextContent(type="text", text=result)]

            # Unreachable: unknown names are rejected before the repo is opened.
            case _:  # pragma: no cover
                raise ValueError(f"Unknown tool: {name}")

    async def call_tool(
        ctx: ServerRequestContext, params: CallToolRequestParams
    ) -> CallToolResult:
        # SDK v2's low-level server neither validates arguments nor turns a
        # handler exception into an isError result, both of which SDK v1 did.
        # Both are done here, with v1's messages, so the wire is unchanged.
        arguments = params.arguments or {}
        schema = schemas.get(params.name)
        if schema is not None:
            try:
                jsonschema.validate(instance=arguments, schema=schema)
            except jsonschema.ValidationError as e:
                return tool_error(f"Input validation error: {e.message}")
        try:
            return CallToolResult(content=await run_tool(params.name, arguments))
        except Exception as e:
            return tool_error(str(e))

    server = Server(
        "mcp-git",
        version=SERVER_VERSION,
        on_list_tools=list_tools,
        on_call_tool=call_tool,
    )
    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        # Legacy era only. Server.run() would also serve 2026-07-28 (its
        # dual-era loop answers server/discover and per-request envelopes);
        # adopting that era is #4853, so this port (#4851) serves the
        # handshake loop alone and keeps the wire unchanged.
        async with server.lifespan(server) as lifespan_state:
            await serve_loop(
                server,
                read_stream,
                write_stream,
                lifespan_state=lifespan_state,
                init_options=options,
            )
