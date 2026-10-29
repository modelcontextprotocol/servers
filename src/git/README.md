# mcp-server-git: A git MCP server

<!-- mcp-name: io.github.modelcontextprotocol/server-git -->

## Overview

A Model Context Protocol server for Git repository interaction and automation. This server provides tools to read, search, and manipulate Git repositories via Large Language Models.

Source: https://github.com/modelcontextprotocol/servers/tree/main/src/git

Requires MCP Python SDK 2.x (`mcp>=2.3,<3`). The server is built on the SDK's high-level `MCPServer`: each tool is a typed Python function, and the SDK derives its input schema from the signature.

Please note that mcp-server-git is currently in early development. The functionality and available tools are subject to change and expansion as we continue to develop and improve the server.

### Tools

1. `git_status`
   - Shows the working tree status
   - Input:
     - `repo_path` (string): Path to Git repository
   - Returns: Current status of working directory as text output

2. `git_diff_unstaged`
   - Shows changes in working directory not yet staged
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `context_lines` (number, optional): Number of context lines to show (default: 3)
   - Returns: Diff output of unstaged changes

3. `git_diff_staged`
   - Shows changes that are staged for commit
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `context_lines` (number, optional): Number of context lines to show (default: 3)
   - Returns: Diff output of staged changes

4. `git_diff`
   - Shows differences between branches or commits, or across a revision range
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `target` (string): Target branch or commit to compare with, or a revision range: `a..b` (from `a` to `b`) or `a...b` (from the merge base of `a` and `b` to `b`). An omitted endpoint means `HEAD`; each endpoint must resolve and cannot start with `-`
     - `context_lines` (number, optional): Number of context lines to show (default: 3)
   - Returns: Diff output comparing the working tree with target, or the two endpoints of a range with each other

5. `git_commit`
   - Records changes to the repository
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `message` (string): Commit message
   - Returns: Confirmation with new commit hash; an error if nothing is staged (as `git commit` without `--allow-empty`), except while a merge is in progress (`MERGE_HEAD` present), where git also allows an empty commit. While a merge is in progress the commit concludes it: its parents are `HEAD` and every `MERGE_HEAD` commit, and the merge state is cleared

6. `git_add`
   - Adds file contents to the staging area
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `files` (string[]): Non-empty array of file paths to stage; `["."]` stages everything
   - Returns: Confirmation of staged files, or a message saying nothing was staged when the call left the index unchanged

7. `git_reset`
   - Unstages all staged changes
   - Input:
     - `repo_path` (string): Path to Git repository
   - Returns: Confirmation of reset operation

8. `git_log`
   - Shows the commit logs with optional date filtering
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `max_count` (number, optional): Maximum number of commits to show (default: 10)
     - `start_timestamp` (string, optional): Start timestamp for filtering commits. Accepts ISO 8601 format (e.g., '2024-01-15T14:30:25'), relative dates (e.g., '2 weeks ago', 'yesterday'), or absolute dates (e.g., '2024-01-15', 'Jan 15 2024')
     - `end_timestamp` (string, optional): End timestamp for filtering commits. Accepts ISO 8601 format (e.g., '2024-01-15T14:30:25'), relative dates (e.g., '2 weeks ago', 'yesterday'), or absolute dates (e.g., '2024-01-15', 'Jan 15 2024')
   - Returns: Array of commit entries with hash, author, date, and message

9. `git_create_branch`
   - Creates a new branch
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `branch_name` (string): Name of the new branch
     - `base_branch` (string, optional): Branch, tag or commit SHA to create from (defaults to the current branch, or to the current commit when HEAD is detached)
   - Returns: Confirmation of branch creation, naming the base branch, or the short SHA when the base is a commit
10. `git_checkout`
   - Switches branches
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `branch_name` (string): Name of branch to checkout
   - Returns: Confirmation of branch switch, or `HEAD is now detached at <short sha>` when `branch_name` is not a branch (a sha, tag or other revision)
11. `git_merge`
   - Merges a branch into the current branch, or changes nothing
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `source_branch` (string): Branch, tag or commit to merge into the current branch (check out the branch to merge into first with `git_checkout`)
     - `fast_forward_only` (boolean, optional): Only fast-forward, failing if the branches have diverged (default `true`). `false` lets Git create a merge commit when they have
   - Returns: `Fast-forwarded`, `Merged ... with merge commit <short sha>`, or `Already up to date`
   - Refuses a detached HEAD, a working tree with uncommitted changes, a merge already in progress, and a merge that would overwrite an ignored local file. A merge that stops on conflicts is aborted (`git merge --abort`) and the error names the conflicting files, so the repository is left as it was
12. `git_show`
   - Shows the contents of a commit, or of a file or directory at a revision
   - Inputs:
     - `repo_path` (string): Path to Git repository
     - `revision` (string): The revision (commit hash, branch name, tag) or object spec (`HEAD:path/to/file`) to show
   - Returns: Contents of the specified commit, file content, or directory listing

13. `git_branch`
   - List Git branches
   - Inputs:
     - `repo_path` (string): Path to the Git repository.
     - `branch_type` (string): Whether to list local branches ('local'), remote branches ('remote') or all branches('all').
     - `contains` (string, optional): The commit sha that branch should contain. Do not pass anything to this param if no commit sha is specified
     - `not_contains` (string, optional): The commit sha that branch should NOT contain. Do not pass anything to this param if no commit sha is specified
   - Returns: List of branches

14. `git_remote`
   - Lists the repository's remotes with their fetch and push URLs, like `git remote -v`
   - Inputs:
     - `repo_path` (string): Path to the Git repository.
   - Returns: One line per remote and direction, `<name>\t<url> (fetch)` or `(push)` (a partial clone's fetch line ends with its filter, such as ` [blob:none]`), or `No remotes configured`
   - A credential embedded in a URL is never returned: the whole userinfo of a URL such as `https://user:token@host/...` or `https://token@host/...` is shown as `<redacted>`. An SSH username (`ssh://git@host/...`) is kept, since it names an account rather than authenticating one; a password after it is redacted. A remote-helper address (`https::https://user:token@host/...`) has its inner URL redacted the same way. scp-style addresses (`git@host:path`) and local paths are shown as configured. A line that cannot be parsed is shown as `<redacted>`, and if a configured remote URL (or `insteadOf` rewrite) contains a newline, which git itself refuses, the tool returns an error instead of a listing.

### Protocol versions

The server speaks both eras of the Model Context Protocol over stdio, with nothing to configure: a **2026-07-28** client (discovered with `server/discover`, no session) and a **2025-11-25** client (the `initialize` handshake). The client's first request decides which. Tools behave the same in both.

Roots is deprecated in 2026-07-28, and this server never asks a client for Roots in either era: repository access comes from `--repository` alone, or, with no `--repository`, from each tool call's `repo_path`. Methods the 2026-07-28 specification removes, such as `ping`, are answered only on a 2025-11-25 connection.

### Errors

- **A tool that fails** returns a result with `isError: true` whose text is `Error executing tool <name>: <message>`, so the model can read it and correct the call. This covers git errors (an unknown revision, a failed command), a `repo_path` that is not a repository or is outside `--repository`, the flag-injection guards, and arguments that do not match the tool's input schema.
- **An unknown tool name** is a protocol error, JSON-RPC `-32602` (`Unknown tool: <name>`), as the specification requires in both eras. Before 2.0.0 it was an `isError` result.

### Prompts

Beside its tools, the server offers two prompts, which a client typically shows the user as slash commands. Each reads the repository when it is requested and returns one user message that embeds the changes, ready to send to the model. They open the repository the way the tools do, so `--repository` confines them too, and the same flag-injection guards apply. They behave the same in both protocol eras.

1. `git_commit_message`
   - Asks the model for a commit message for the staged changes
   - Arguments:
     - `repo_path` (string, required): Path to the Git repository
   - Returns: A message embedding the staged diff and asking for a commit message, or one saying nothing is staged

2. `git_summarize_changes`
   - Asks the model to summarize the working tree's changes, or the diff against a branch or commit
   - Arguments:
     - `repo_path` (string, required): Path to the Git repository
     - `target` (string, optional): Branch or commit to diff against. Without it, the working tree's status and its staged and unstaged diffs are summarized
   - Returns: A message embedding those changes and asking for a summary, or one saying there are none

A prompt request that fails (a `repo_path` that is not a repository or is outside `--repository`, an unknown `target`, a `target` starting with `-`) is a JSON-RPC `-32602` error carrying the message a tool would report, since `prompts/get` has no `isError` result.

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-server-git*.

### Using PIP

Alternatively you can install `mcp-server-git` via pip:

```
pip install mcp-server-git
```

After installation, you can run it as a script using:

```
python -m mcp_server_git
```

## Configuration

> [!IMPORTANT]
> **Without `--repository`, the server reads and writes any Git repository the server process can reach.** Each tool call names its own `repo_path`, and that holds for the tools that change a repository too (`git_add`, `git_commit`, `git_reset`, `git_create_branch`, `git_checkout`, `git_merge`). `--repository` is the only confinement the server offers: it never asks the client for Roots, in either protocol era. Set `--repository` whenever the server is used with prompts or content that are not fully trusted. It admits the whole enclosing repository, not only the directory you name, as the next paragraph describes.

`--repository` (`-r`) accepts any path inside a Git working tree. At startup the server walks up to the enclosing repository root, the way `git rev-parse --show-toplevel` does, so `--repository .` works when a shared config is launched from any subdirectory of the repository. A path inside the repository therefore allows tool calls anywhere in that repository, not only under the subdirectory given. A path that does not exist, or is not inside a Git repository, is logged as a one-line error at startup.

A tool call's `repo_path` must be inside that repository, and so must the directories Git then uses for it: a repository nested inside whose `.git` file, `commondir` or `core.worktree` points outside is refused. A linked worktree can still be the `--repository`, though its Git directory lives under the main repository's `.git`.

### Commit identity

`git_commit` has no identity setting of its own. It takes the author and the committer from the same places `git commit` does, in this order:

1. The server process's environment: `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` for the author, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` for the committer. The author and the committer are resolved separately, so set all four (usually to the same name and email).
2. `user.name` and `user.email` from Git config: the repository's `.git/config`, then `~/.gitconfig`, then `$XDG_CONFIG_HOME/git/config` (by default `~/.config/git/config`), then `/etc/gitconfig`.

Unlike `git commit`, the server does not refuse to commit when neither is set. It falls back to the operating-system user and host name, so a commit made in a container is recorded as something like `root <root@3f2a1b9c8d7e>`. A local install usually finds your own `~/.gitconfig`; a Docker container has none, so give it an identity explicitly.

For a local command (`uvx`, `python -m mcp_server_git`), add an `env` block to the server's entry in your client configuration:

```json
"mcpServers": {
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git", "--repository", "path/to/git/repo"],
    "env": {
      "GIT_AUTHOR_NAME": "Your Name",
      "GIT_AUTHOR_EMAIL": "you@example.com",
      "GIT_COMMITTER_NAME": "Your Name",
      "GIT_COMMITTER_EMAIL": "you@example.com"
    }
  }
}
```

For Docker, pass the variables to `docker run` with `-e`, as the Docker examples below do. Alternatively, mount your gitconfig read-only in place of the four `-e` pairs. The image runs as `root`, so it goes at `/root/.gitconfig`:

```json
"args": [
  "run", "--rm", "-i",
  "--mount", "type=bind,src=/Users/username/.gitconfig,dst=/root/.gitconfig,readonly",
  "--mount", "type=bind,src=/Users/username,dst=/Users/username",
  "mcp/git"
]
```

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git", "--repository", "path/to/git/repo"]
  }
}
```
</details>

<details>
<summary>Using docker</summary>

* Note: replace '/Users/username' with a path that you want to be accessible by this tool
* Note: the `-e` lines set the identity `git_commit` records; see [Commit identity](#commit-identity)

```json
"mcpServers": {
  "git": {
    "command": "docker",
    "args": [
      "run", "--rm", "-i",
      "-e", "GIT_AUTHOR_NAME=Your Name",
      "-e", "GIT_AUTHOR_EMAIL=you@example.com",
      "-e", "GIT_COMMITTER_NAME=Your Name",
      "-e", "GIT_COMMITTER_EMAIL=you@example.com",
      "--mount", "type=bind,src=/Users/username,dst=/Users/username",
      "mcp/git"
    ]
  }
}
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "git": {
    "command": "python",
    "args": ["-m", "mcp_server_git", "--repository", "path/to/git/repo"]
  }
}
```
</details>

### Usage with VS Code

For quick installation, use one of the one-click install buttons below...

[![Install with UV in VS Code](https://img.shields.io/badge/VS_Code-UV-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=git&config=%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22mcp-server-git%22%5D%7D) [![Install with UV in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-UV-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=git&config=%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22mcp-server-git%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=git&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22--rm%22%2C%22-i%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fworkspace%22%2C%22mcp%2Fgit%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=git&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22--rm%22%2C%22-i%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fworkspace%22%2C%22mcp%2Fgit%22%5D%7D&quality=insiders)

For manual installation, you can configure the MCP server using one of these methods:

**Method 1: User Configuration (Recommended)**
Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`. This will open your user `mcp.json` file where you can add the server configuration.

**Method 2: Workspace Configuration**
Alternatively, you can add the configuration to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

```json
{
  "servers": {
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git"]
    }
  }
}
```

For Docker installation:

```json
{
  "mcp": {
    "servers": {
      "git": {
        "command": "docker",
        "args": [
          "run",
          "--rm",
          "-i",
          "--mount", "type=bind,src=${workspaceFolder},dst=/workspace",
          "mcp/git"
        ]
      }
    }
  }
}
```

### Usage with [Zed](https://github.com/zed-industries/zed)

Add to your Zed settings.json:

<details>
<summary>Using uvx</summary>

```json
"context_servers": [
  "mcp-server-git": {
    "command": {
      "path": "uvx",
      "args": ["mcp-server-git"]
    }
  }
],
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"context_servers": {
  "mcp-server-git": {
    "command": {
      "path": "python",
      "args": ["-m", "mcp_server_git"]
    }
  }
},
```
</details>

### Usage with [Zencoder](https://zencoder.ai)

1. Go to the Zencoder menu (...)
2. From the dropdown menu, select `Agent Tools`
3. Click on the `Add Custom MCP`
4. Add the name (i.e. git) and server configuration from below, and make sure to hit the `Install` button

<details>
<summary>Using uvx</summary>

```json
{
    "command": "uvx",
    "args": ["mcp-server-git", "--repository", "path/to/git/repo"]
}
```
</details>

## Debugging

You can use the MCP inspector to debug the server. For uvx installations:

```
npx @modelcontextprotocol/inspector uvx mcp-server-git
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/git
npx @modelcontextprotocol/inspector uv run mcp-server-git
```

Running `tail -n 20 -f ~/Library/Logs/Claude/mcp*.log` will show the logs from the server and may
help you debug any issues.

## Development

### Tests and coverage

The test suite drives `serve()` in-process through an MCP `ClientSession`
(see `tests/conftest.py`), and `tests/test_eras.py` runs a `Client` against it
as a 2026-07-28 and as a 2025-11-25 client. From `src/git`:

```bash
uv run --frozen pytest                 # the tests
uv run --frozen pytest --cov --cov-report=term-missing --cov-report=json
```

The second command adds branch coverage of `src/mcp_server_git`, printed per
file and written to `coverage.json` (ignored by git). Every file must stay at
or above 90% of its lines and 90% of its branches. Code that cannot be reached
is marked `# pragma: no cover  # <reason>` rather than lowering that bar.

### Trying changes in a client

There are two ways to try your changes in a client:

1. Run the MCP inspector to test your changes. See [Debugging](#debugging) for run instructions.

2. Test using the Claude desktop app. Add the following to your `claude_desktop_config.json`:

### Docker

```json
{
  "mcpServers": {
    "git": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e", "GIT_AUTHOR_NAME=Your Name",
        "-e", "GIT_AUTHOR_EMAIL=you@example.com",
        "-e", "GIT_COMMITTER_NAME=Your Name",
        "-e", "GIT_COMMITTER_EMAIL=you@example.com",
        "--mount", "type=bind,src=/Users/username/Desktop,dst=/projects/Desktop",
        "--mount", "type=bind,src=/path/to/other/allowed/dir,dst=/projects/other/allowed/dir,ro",
        "--mount", "type=bind,src=/path/to/file.txt,dst=/projects/path/to/file.txt",
        "mcp/git"
      ]
    }
  }
}
```

### UVX
```json
{
"mcpServers": {
  "git": {
    "command": "uv",
    "args": [
      "--directory",
      "/<path to mcp-servers>/mcp-servers/src/git",
      "run",
      "mcp-server-git"
    ]
    }
  }
}
```

## Build

Docker build:

```bash
cd src/git
docker build -t mcp/git .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
