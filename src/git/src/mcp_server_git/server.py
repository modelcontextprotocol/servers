# The git MCP server: tools that read and change a Git repository through
# GitPython. Repository confinement (`--repository`, `validate_repo_path`) and
# the flag-injection guards live beside the handlers because every tool call
# must pass them before any git command runs.
#
# Built on the MCP Python SDK's high-level `MCPServer` (#5174), the API these
# reference servers are meant to teach: each tool is a typed function, and the
# SDK derives its input schema from the signature and validates arguments
# against it. A failure the model can act on (a git error, a path outside the
# repository, a guard's rejection) is raised as `ToolError`, which the SDK
# returns as an `isError` result carrying the message. An unknown tool name is
# a protocol error, JSON-RPC -32602, as both spec revisions require.
#
# `serve()` serves both protocol eras (#4853): a 2025-11-25 client through the
# initialize handshake, and a 2026-07-28 client sessionlessly. No tool reads
# the session or calls back to the client (roots, sampling, elicitation,
# logging), so nothing differs between them.

import logging
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from enum import Enum
from functools import wraps
from importlib.metadata import version
from pathlib import Path
from typing import Annotated, Any, Optional, ParamSpec

import git
from git.exc import BadName
from gitdb.exc import ODBError
from mcp.server.context import CallNext, HandlerResult, ServerRequestContext
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS, ToolAnnotations
from pydantic import Field

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
    elif repo.head.is_detached:
        # GitPython's `active_branch` raises TypeError on a detached HEAD.
        raise ValueError(
            "HEAD is detached, so there is no current branch to branch from; "
            "pass base_branch"
        )
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
        # git prints /dev/null for the missing side of an added or deleted file,
        # and prefixes an existing side with a/ or b/, which `git apply` and
        # `patch -p1` strip as the first path component.
        a_path = "/dev/null" if d.new_file or d.a_path is None else f"a/{d.a_path}"
        b_path = "/dev/null" if d.deleted_file or d.b_path is None else f"b/{d.b_path}"
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


# The failures a tool reports to the model as a `ToolError`, each with the
# message it was raised with: the guards' `ValueError`s and
# `FlagInjectionError`s, git and GitPython errors (`GitError`: a failed
# command, a missing or invalid repository), gitdb's lookup errors (`ODBError`:
# `BadName` for an unknown revision, `BadObject`), and the builtins GitPython
# raises for a failed lookup: `KeyError` for a path not in a tree, `IndexError`
# for a missing ref in `repo.references[...]`, `OSError` for an unreadable
# path. A detached HEAD is checked before `active_branch` (whose TypeError
# would otherwise be a crash), so TypeError stays a crash, as a bug should.
# Anything else escapes as a crash, which the SDK reports only as
# "Error executing tool <name>", logging the traceback.
ANTICIPATED_ERRORS = (
    ValueError,
    KeyError,
    IndexError,
    OSError,
    git.GitError,
    ODBError,
)


@contextmanager
def reported_to_model() -> Iterator[None]:
    """Turn an anticipated failure into a `ToolError` with the same message."""
    try:
        yield
    except ANTICIPATED_ERRORS as e:
        raise ToolError(str(e)) from e


_P = ParamSpec("_P")


# `MCPServer` runs a synchronous tool in a worker thread, so two calls can
# overlap. A git operation is a check followed by a change (staged changes,
# then the commit), and the index is shared, so one call at a time: the lock
# keeps the serial behavior the server had when tools ran on the event loop.
_GIT_LOCK = threading.Lock()


def reports_failures(fn: Callable[_P, str]) -> Callable[_P, str]:
    """Run a tool function alone, inside `reported_to_model()`.

    `wraps` keeps the signature, which is what `MCPServer` reads to build the
    tool's input schema.
    """

    @wraps(fn)
    def wrapper(*args: _P.args, **kwargs: _P.kwargs) -> str:
        with _GIT_LOCK, reported_to_model():
            return fn(*args, **kwargs)

    return wrapper


READ_ONLY = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)


def writes(*, destructive: bool, idempotent: bool) -> ToolAnnotations:
    return ToolAnnotations(
        read_only_hint=False,
        destructive_hint=destructive,
        idempotent_hint=idempotent,
        open_world_hint=False,
    )


TIMESTAMP_FORMATS = (
    "Accepts: ISO 8601 format (e.g., '2024-01-15T14:30:25'), relative dates "
    "(e.g., '2 weeks ago', 'yesterday'), or absolute dates (e.g., '2024-01-15', "
    "'Jan 15 2024')"
)


def create_server(repository: Path | None) -> MCPServer:
    """The git server, confined to `repository` when one is given."""

    async def reject_unknown_tools(
        ctx: ServerRequestContext[Any, Any], call_next: CallNext
    ) -> HandlerResult:
        # An unknown tool is a protocol error, JSON-RPC -32602 (spec
        # server/tools, "Error Handling"). MCPServer still answers one with an
        # isError result (python-sdk#3659), so the name is checked here,
        # before MCPServer looks it up; remove this once MCPServer does it
        # itself. It also runs before argument validation, so a call without
        # repo_path still reports the unknown tool (#4994).
        if ctx.method == "tools/call" and ctx.params is not None:
            name = ctx.params.get("name")
            if isinstance(name, str) and name not in {
                tool.name for tool in await server.list_tools()
            }:
                raise MCPError(code=INVALID_PARAMS, message=f"Unknown tool: {name}")
        return await call_next(ctx)

    server = MCPServer(
        "mcp-git",
        version=SERVER_VERSION,
        middleware=[reject_unknown_tools],
        # The tool list never changes, so `subscriptions/listen` is not
        # served, and the 2026-07-28 capabilities say so (listChanged false).
        subscriptions=False,
    )

    def open_repo(repo_path: str) -> git.Repo:
        path = Path(repo_path)
        validate_repo_path(path, repository)
        return git.Repo(path)

    @server.tool(
        name=GitTools.STATUS.value,
        description="Shows the working tree status",
        annotations=READ_ONLY,
        structured_output=False,
    )
    @reports_failures
    def status(repo_path: str) -> str:
        return f"Repository status:\n{git_status(open_repo(repo_path))}"

    @server.tool(
        name=GitTools.DIFF_UNSTAGED.value,
        description="Shows changes in the working directory that are not yet staged",
        annotations=READ_ONLY,
        structured_output=False,
    )
    @reports_failures
    def diff_unstaged(
        repo_path: str, context_lines: int = DEFAULT_CONTEXT_LINES
    ) -> str:
        diff = git_diff_unstaged(open_repo(repo_path), context_lines)
        return f"Unstaged changes:\n{diff}"

    @server.tool(
        name=GitTools.DIFF_STAGED.value,
        description="Shows changes that are staged for commit",
        annotations=READ_ONLY,
        structured_output=False,
    )
    @reports_failures
    def diff_staged(repo_path: str, context_lines: int = DEFAULT_CONTEXT_LINES) -> str:
        diff = git_diff_staged(open_repo(repo_path), context_lines)
        return f"Staged changes:\n{diff}"

    @server.tool(
        name=GitTools.DIFF.value,
        description="Shows differences between branches or commits",
        annotations=READ_ONLY,
        structured_output=False,
    )
    @reports_failures
    def diff(
        repo_path: str, target: str, context_lines: int = DEFAULT_CONTEXT_LINES
    ) -> str:
        result = git_diff(open_repo(repo_path), target, context_lines)
        return f"Diff with {target}:\n{result}"

    @server.tool(
        name=GitTools.COMMIT.value,
        description="Records changes to the repository",
        annotations=writes(destructive=False, idempotent=False),
        structured_output=False,
    )
    @reports_failures
    def commit(repo_path: str, message: str) -> str:
        return git_commit(open_repo(repo_path), message)

    @server.tool(
        name=GitTools.ADD.value,
        description="Adds file contents to the staging area",
        annotations=writes(destructive=False, idempotent=True),
        structured_output=False,
    )
    @reports_failures
    def add(repo_path: str, files: Annotated[list[str], Field(min_length=1)]) -> str:
        return git_add(open_repo(repo_path), files)

    @server.tool(
        name=GitTools.RESET.value,
        description="Unstages all staged changes",
        annotations=writes(destructive=True, idempotent=True),
        structured_output=False,
    )
    @reports_failures
    def reset(repo_path: str) -> str:
        return git_reset(open_repo(repo_path))

    @server.tool(
        name=GitTools.LOG.value,
        description="Shows the commit logs",
        annotations=READ_ONLY,
        structured_output=False,
    )
    @reports_failures
    def log(
        repo_path: str,
        max_count: int = 10,
        start_timestamp: Annotated[
            Optional[str],
            Field(
                description=f"Start timestamp for filtering commits. {TIMESTAMP_FORMATS}"
            ),
        ] = None,
        end_timestamp: Annotated[
            Optional[str],
            Field(
                description=f"End timestamp for filtering commits. {TIMESTAMP_FORMATS}"
            ),
        ] = None,
    ) -> str:
        entries = git_log(
            open_repo(repo_path), max_count, start_timestamp, end_timestamp
        )
        return "Commit history:\n" + "\n".join(entries)

    @server.tool(
        name=GitTools.CREATE_BRANCH.value,
        description="Creates a new branch from an optional base branch",
        annotations=writes(destructive=False, idempotent=False),
        structured_output=False,
    )
    @reports_failures
    def create_branch(
        repo_path: str, branch_name: str, base_branch: str | None = None
    ) -> str:
        return git_create_branch(open_repo(repo_path), branch_name, base_branch)

    @server.tool(
        name=GitTools.CHECKOUT.value,
        description="Switches branches",
        annotations=writes(destructive=False, idempotent=False),
        structured_output=False,
    )
    @reports_failures
    def checkout(repo_path: str, branch_name: str) -> str:
        return git_checkout(open_repo(repo_path), branch_name)

    @server.tool(
        name=GitTools.SHOW.value,
        description="Shows the contents of a commit, or of a file or directory given as <revision>:<path>",
        annotations=READ_ONLY,
        structured_output=False,
    )
    @reports_failures
    def show(repo_path: str, revision: str) -> str:
        return git_show(open_repo(repo_path), revision)

    @server.tool(
        name=GitTools.BRANCH.value,
        description="List Git branches",
        annotations=READ_ONLY,
        structured_output=False,
    )
    @reports_failures
    def branch(
        repo_path: Annotated[str, Field(description="The path to the Git repository.")],
        branch_type: Annotated[
            str,
            Field(
                description="Whether to list local branches ('local'), remote branches ('remote') or all branches('all')."
            ),
        ],
        contains: Annotated[
            Optional[str],
            Field(
                description="The commit sha that branch should contain. Do not pass anything to this param if no commit sha is specified"
            ),
        ] = None,
        not_contains: Annotated[
            Optional[str],
            Field(
                description="The commit sha that branch should NOT contain. Do not pass anything to this param if no commit sha is specified"
            ),
        ] = None,
    ) -> str:
        return git_branch(open_repo(repo_path), branch_type, contains, not_contains)

    return server


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

    # Both eras (#4853): the SDK's dual-era loop lets the client's first
    # request decide. `initialize` gets the 2025-11-25 handshake;
    # `server/discover` or a request carrying a 2026-07-28 envelope gets the
    # modern, sessionless era, with its required result fields (resultType,
    # ttlMs, cacheScope) filled in by the SDK.
    await create_server(repository).run_stdio_async()
