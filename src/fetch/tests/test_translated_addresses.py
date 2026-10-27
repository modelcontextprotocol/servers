"""The private-address guard on IPv6 forms that carry an IPv4 address (#5181).

Two /96 prefixes embed an IPv4 in their low 32 bits, and Python's
``is_global`` reads both as global whatever that IPv4 is:

- the well-known NAT64 prefix ``64:ff9b::/96`` (RFC 6052), which a NAT64
  gateway forwards to the embedded IPv4, so the guard judges it by that IPv4
  (fixed by #5238; pinned here so #5181 is covered end to end);
- the IPv4-compatible prefix ``::/96`` (RFC 4291 2.5.5.1), deprecated and
  never routed, so the guard refuses it outright, even around a public IPv4.

Each case is driven through the real server over the MCP protocol (see
``harness.connect``): once as an IP literal in the URL and once as a hostname
that resolves to the address, so both the literal and the DNS path are covered.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from mcp.types import CallToolResult

from .harness import FakeWeb, connect

TOOL_ERROR = "Error executing tool fetch: "

# IPv4-compatible (::/96) addresses: loopback, link-local metadata, RFC 1918,
# and a public IPv4, which is refused too because ::/96 is never routed.
IPV4_COMPATIBLE = ["::7f00:1", "::a9fe:a9fe", "::a00:1", "::808:808"]

# Well-known NAT64 (64:ff9b::/96) addresses wrapping non-public IPv4s.
NAT64_NON_PUBLIC = ["64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "64:ff9b::a00:1"]


def wire(result: CallToolResult) -> dict[str, Any]:
    return result.model_dump(
        by_alias=True, mode="json", exclude_none=True, exclude_unset=True
    )


def text_of(result: CallToolResult) -> str:
    data = wire(result)
    assert len(data["content"]) == 1
    return data["content"][0]["text"]


@pytest.mark.parametrize("address", IPV4_COMPATIBLE + NAT64_NON_PUBLIC)
async def test_ip_literal_is_refused_before_any_request(
    web: FakeWeb, address: str
) -> None:
    url = f"http://[{address}]/admin"
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": url})
    assert wire(result)["isError"] is True
    assert text_of(result) == (
        f"{TOOL_ERROR}Refused to fetch {url}: {address} resolves to {address}, "
        "which is not a public address. Start the server with "
        "--allow-private-ips to allow private, loopback and link-local addresses."
    )
    assert web.requests == []


@pytest.mark.parametrize("address", IPV4_COMPATIBLE + NAT64_NON_PUBLIC)
async def test_hostname_resolving_to_the_address_is_refused(
    web: FakeWeb, address: str
) -> None:
    web.dns["internal.example.com"] = [address]
    url = "https://internal.example.com/"
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": url})
    assert text_of(result) == (
        f"{TOOL_ERROR}Refused to fetch {url}: internal.example.com resolves to "
        f"{address}, which is not a public address. Start the server with "
        "--allow-private-ips to allow private, loopback and link-local addresses."
    )
    assert web.requests == []


async def test_nat64_address_wrapping_a_public_ipv4_is_allowed(
    web: FakeWeb,
) -> None:
    # The contrast with ::808:808 above: through NAT64, 8.8.8.8 is reachable.
    web.dns["nat64.example.com"] = ["64:ff9b::808:808"]
    url = "https://nat64.example.com/"
    web.add(
        url,
        httpx.Response(200, content=b"ok", headers={"content-type": "text/plain"}),
    )
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": url})
    assert wire(result)["isError"] is False
    assert web.urls() == [url]


@pytest.mark.parametrize("address", IPV4_COMPATIBLE)
async def test_allow_private_ips_lets_ipv4_compatible_addresses_through(
    web: FakeWeb, address: str
) -> None:
    # The opt-out still covers the newly refused range.
    url = f"http://[{address}]/"
    web.add(
        url,
        httpx.Response(200, content=b"ok", headers={"content-type": "text/plain"}),
    )
    async with connect(ignore_robots_txt=True, allow_private_ips=True) as (
        session,
        _,
    ):
        result = await session.call_tool("fetch", {"url": url})
    assert wire(result)["isError"] is False
