# The git prompts (#5195), driven through a real `mcp` 2.x `Client` in both
# protocol eras, plus the prompt-text builders called directly.
#
# The prompts exist to demonstrate the Prompts feature beside the tools, so
# what matters is what a client receives from prompts/list and prompts/get:
# the names and arguments, one user message embedding the repository's
# changes, and a JSON-RPC -32602 error (prompts/get has no isError result) when
# the repository path, the target or a guard rejects the request. Each era test
# is parametrized over both eras, since nothing about prompts should differ
# between them.

from pathlib import Path
from typing import Any

import git
import pytest
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS, GetPromptResult, TextContent

from mcp_server_git.server import (
    _fenced,
    commit_message_prompt,
    summarize_changes_prompt,
)

from test_eras import ERAS, MODERN, connect

COMMIT_MESSAGE = "git_commit_message"
SUMMARIZE_CHANGES = "git_summarize_changes"


def repo_dir(repo: git.Repo) -> Path:
    return Path(repo.working_dir)


def message_text(result: GetPromptResult) -> str:
    """The text of a prompt result holding one user message of text."""
    assert len(result.messages) == 1
    message = result.messages[0]
    assert message.role == "user"
    assert isinstance(message.content, TextContent)
    return message.content.text


def prompt_wire(prompts: Any) -> list[dict[str, Any]]:
    return [
        p.model_dump(by_alias=True, mode="json", exclude_none=True) for p in prompts
    ]


EXPECTED_PROMPTS = [
    {
        "name": COMMIT_MESSAGE,
        "title": "Draft a commit message",
        "description": "Asks the model for a commit message for the staged changes",
        "arguments": [
            {
                "name": "repo_path",
                "description": "The path to the Git repository.",
                "required": True,
            }
        ],
    },
    {
        "name": SUMMARIZE_CHANGES,
        "title": "Summarize changes",
        "description": (
            "Asks the model to summarize the working tree's staged and unstaged "
            "changes, or the diff against a branch or commit"
        ),
        "arguments": [
            {
                "name": "repo_path",
                "description": "The path to the Git repository.",
                "required": True,
            },
            {
                "name": "target",
                "description": (
                    "Branch or commit to diff against. Defaults to the working "
                    "tree's staged and unstaged changes"
                ),
                "required": False,
            },
        ],
    },
]


# --- Over the protocol, in both eras ----------------------------------------


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_prompts_are_listed_in_each_era(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    async with connect(mode, repo_dir(repo)) as client:
        assert client.session.protocol_version == negotiated
        prompts = prompt_wire((await client.list_prompts()).prompts)
    assert prompts == EXPECTED_PROMPTS


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_commit_message_embeds_the_staged_diff(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    (repo_dir(repo) / "feature.txt").write_text("hello prompt world\n")
    repo.index.add(["feature.txt"])
    (repo_dir(repo) / "test.txt").write_text("unstaged edit\n")
    async with connect(mode, repo_dir(repo)) as client:
        result = await client.get_prompt(
            COMMIT_MESSAGE, {"repo_path": str(repo_dir(repo))}
        )
    assert result.description == (
        "Asks the model for a commit message for the staged changes"
    )
    text = message_text(result)
    assert text.startswith("Write a commit message for the staged changes below.")
    assert "Staged changes:\n```diff\ndiff --git a/feature.txt b/feature.txt" in text
    assert "+hello prompt world" in text
    # Only what is staged: the unstaged edit to test.txt is not in it.
    assert "unstaged edit" not in text


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_summarize_changes_embeds_the_working_tree(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    (repo_dir(repo) / "feature.txt").write_text("staged line\n")
    repo.index.add(["feature.txt"])
    (repo_dir(repo) / "test.txt").write_text("unstaged edit\n")
    (repo_dir(repo) / "untracked.txt").write_text("new\n")
    async with connect(mode, repo_dir(repo)) as client:
        result = await client.get_prompt(
            SUMMARIZE_CHANGES, {"repo_path": str(repo_dir(repo))}
        )
    text = message_text(result)
    assert text.startswith("Summarize the changes in the working tree below")
    assert "Status:\n```text\n" in text
    assert "untracked.txt" in text
    assert "Staged changes:\n```diff\n" in text
    assert "+staged line" in text
    assert "Unstaged changes:\n```diff\n" in text
    assert "+unstaged edit" in text


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_summarize_changes_against_a_target(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    (repo_dir(repo) / "test.txt").write_text("committed edit\n")
    repo.index.add(["test.txt"])
    repo.index.commit("second commit")
    async with connect(mode, repo_dir(repo)) as client:
        result = await client.get_prompt(
            SUMMARIZE_CHANGES,
            {"repo_path": str(repo_dir(repo)), "target": "HEAD~1"},
        )
    text = message_text(result)
    assert text.startswith("Summarize the changes compared with `HEAD~1` below")
    assert "Diff against HEAD~1:\n```diff\n" in text
    assert "+committed edit" in text


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_target_flag_injection_is_invalid_params(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    # git_diff's guard applies unchanged, and its message reaches the client.
    async with connect(mode, repo_dir(repo)) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.get_prompt(
                SUMMARIZE_CHANGES,
                {"repo_path": str(repo_dir(repo)), "target": "--output=/tmp/x"},
            )
    assert excinfo.value.error.code == INVALID_PARAMS
    assert excinfo.value.error.message == (
        "Invalid target: '--output=/tmp/x' - cannot start with '-'"
    )


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_unknown_target_is_invalid_params(
    repo: git.Repo, mode: str, negotiated: str
) -> None:
    async with connect(mode, repo_dir(repo)) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.get_prompt(
                SUMMARIZE_CHANGES,
                {"repo_path": str(repo_dir(repo)), "target": "no-such-ref"},
            )
    assert excinfo.value.error.code == INVALID_PARAMS
    assert "no-such-ref" in excinfo.value.error.message


@pytest.mark.parametrize("prompt", [COMMIT_MESSAGE, SUMMARIZE_CHANGES])
@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_repository_confinement_applies_to_prompts(
    tmp_path: Path, mode: str, negotiated: str, prompt: str
) -> None:
    # Both prompts open the repository through open_repo, so --repository
    # confines them exactly as it confines the tools.
    allowed = git.Repo.init(tmp_path / "allowed")
    other = git.Repo.init(tmp_path / "other")
    try:
        async with connect(mode, repo_dir(allowed)) as client:
            with pytest.raises(MCPError) as excinfo:
                await client.get_prompt(prompt, {"repo_path": str(repo_dir(other))})
    finally:
        allowed.close()
        other.close()
    assert excinfo.value.error.code == INVALID_PARAMS
    assert "is outside the allowed repository" in excinfo.value.error.message


async def test_a_path_that_is_not_a_repository_is_invalid_params(
    tmp_path: Path,
) -> None:
    async with connect(MODERN, None) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.get_prompt(COMMIT_MESSAGE, {"repo_path": str(tmp_path)})
    assert excinfo.value.error.code == INVALID_PARAMS


async def test_unknown_prompt_and_missing_argument_are_protocol_errors(
    repo: git.Repo,
) -> None:
    # Both are rejected by MCPServer before a prompt function runs. The code
    # is the SDK's to choose (python-sdk#3669 moves both to -32602), so only
    # that each is a JSON-RPC error, not a result, is pinned here.
    async with connect(MODERN, repo_dir(repo)) as client:
        with pytest.raises(MCPError):
            await client.get_prompt("git_no_such_prompt", {})
        with pytest.raises(MCPError):
            await client.get_prompt(COMMIT_MESSAGE, {})


# --- The prompt text, called directly ----------------------------------------


def test_commit_message_with_nothing_staged(repo: git.Repo) -> None:
    (repo_dir(repo) / "test.txt").write_text("unstaged edit\n")
    text = commit_message_prompt(repo)
    assert text.startswith("There are no staged changes in this repository")


def test_summarize_a_clean_working_tree(repo: git.Repo) -> None:
    assert summarize_changes_prompt(repo) == (
        "There are no changes in the working tree to summarize. Tell the user so."
    )


def test_summarize_only_unstaged_changes(repo: git.Repo) -> None:
    (repo_dir(repo) / "test.txt").write_text("unstaged edit\n")
    text = summarize_changes_prompt(repo)
    assert "Unstaged changes:" in text
    assert "Staged changes:" not in text


def test_summarize_only_staged_changes(repo: git.Repo) -> None:
    (repo_dir(repo) / "test.txt").write_text("staged edit\n")
    repo.index.add(["test.txt"])
    text = summarize_changes_prompt(repo)
    assert "Staged changes:" in text
    assert "Unstaged changes:" not in text


def test_summarize_against_a_target_with_no_difference(repo: git.Repo) -> None:
    assert summarize_changes_prompt(repo, "HEAD") == (
        "There are no changes compared with `HEAD` to summarize. Tell the user so."
    )


def test_fence_outgrows_backticks_in_the_content() -> None:
    # A diff of a Markdown file can hold its own ``` fence; the embedding
    # fence must be longer so it is not closed early.
    assert _fenced("plain\n") == "```diff\nplain\n```"
    assert _fenced("+```python\n+x\n+```\n") == ("````diff\n+```python\n+x\n+```\n````")
    assert _fenced("a ```` b", "text") == "`````text\na ```` b\n`````"
