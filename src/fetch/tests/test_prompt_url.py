"""The `fetch` prompt rejects a malformed `url` as a bad argument (#4914).

The tool's `url` is an AnyUrl, so pydantic rejects a malformed one before the
tool runs. The prompt's `url` is a plain string (prompt arguments always are),
and it used to go to httpx unchecked: `httpx.InvalidURL` is not an
`HTTPError`, so it escaped the prompt's error handling and the SDK answered
with JSON-RPC code 0, which a client cannot tell from a server fault. These
tests pin the fix at the protocol level: the same AnyUrl check, answered with
`-32602` and the validation message, in both protocol eras and on the raw
wire, with nothing fetched; and a valid URL still fetched, normalized the way
the tool normalizes it.
"""

import httpx
import pytest
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS, JSONRPCError, TextContent

from .harness import FakeWeb, connect, raw_request
from .test_eras import ERAS
from .test_eras import connect as connect_era

# (url, the pydantic message the error carries)
INVALID = [
    pytest.param("http://[::1", "invalid IPv6 address", id="unclosed-ipv6"),
    pytest.param("not a url", "relative URL without a base", id="no-scheme"),
    pytest.param("http://", "empty host", id="empty-host"),
    pytest.param("http://example.com:99999/", "invalid port number", id="bad-port"),
]


def expected_message(url: str, reason: str) -> str:
    return f"Invalid URL {url!r}: Input should be a valid URL, {reason}"


@pytest.mark.parametrize(("url", "reason"), INVALID)
async def test_invalid_prompt_url_is_invalid_params_on_the_wire(
    web: FakeWeb, url: str, reason: str
) -> None:
    # The issue's reproduction, as raw JSON-RPC: code -32602, never 0.
    response = await raw_request(
        "prompts/get", {"name": "fetch", "arguments": {"url": url}}
    )
    assert isinstance(response, JSONRPCError), response
    assert response.error.code == INVALID_PARAMS
    assert response.error.message == expected_message(url, reason)
    assert web.requests == []


@pytest.mark.parametrize(("url", "reason"), INVALID)
async def test_invalid_prompt_url_is_invalid_params_through_a_client(
    web: FakeWeb, url: str, reason: str
) -> None:
    async with connect() as (session, _):
        with pytest.raises(MCPError) as excinfo:
            await session.get_prompt("fetch", {"url": url})
    assert excinfo.value.error.code == INVALID_PARAMS
    assert excinfo.value.error.message == expected_message(url, reason)
    assert web.requests == []


@pytest.mark.parametrize(("mode", "negotiated"), ERAS)
async def test_invalid_prompt_url_is_invalid_params_in_both_eras(
    web: FakeWeb, mode: str, negotiated: str
) -> None:
    async with connect_era(mode) as client:
        assert client.session.protocol_version == negotiated
        with pytest.raises(MCPError) as excinfo:
            await client.get_prompt("fetch", {"url": "http://[::1"})
    assert excinfo.value.error.code == INVALID_PARAMS
    assert excinfo.value.error.message == expected_message(
        "http://[::1", "invalid IPv6 address"
    )
    assert web.requests == []


async def test_valid_prompt_url_is_fetched_as_the_tool_would_fetch_it(
    web: FakeWeb,
) -> None:
    # A bare host is normalized with its trailing slash, as the tool's AnyUrl
    # normalizes it, and the page comes back as the prompt's text.
    web.add(
        "https://example.com/",
        httpx.Response(200, content=b"hello", headers={"content-type": "text/plain"}),
    )
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": "https://example.com"})
    content = result.messages[0].content
    assert isinstance(content, TextContent)
    assert content.text.endswith("hello")
    assert web.urls() == ["https://example.com/"]
