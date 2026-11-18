"""``--allowed-hosts`` wildcards are for domain names, never addresses (#5521).

``*.0.0.1`` used to be accepted and then matched, as a suffix, every IPv4
literal ending ``.0.0.1``: 10.0.0.1 and 127.0.0.1 alike. These tests pin both
halves of the fix: such an entry is refused when the list is read, and an
IP-literal host is never matched by a wildcard entry, even one that reached
``host_is_allowed`` without going through ``normalize_allowed_host``. The
last test builds the real server, which refuses to start on such a list.
"""

from __future__ import annotations

import argparse

import pytest

from mcp_server_fetch.allowlist import (
    host_is_allowed,
    normalize_allowed_host,
    normalize_allowed_hosts,
    parse_allowed_host,
)


@pytest.mark.parametrize(
    "entry",
    [
        "*.10.0.0.1",
        "*.0.0.1",
        "*.1",
        "*.0.0.1.",
        "*.[::1]",
        "*.::1",
        "*.0x7f.1",
        "*.0x",
        "*.example.123",
        " *.0.0.1 ",
    ],
)
def test_wildcard_address_entries_are_rejected(entry: str) -> None:
    with pytest.raises(ValueError):
        normalize_allowed_host(entry)


def test_the_rejection_says_what_a_wildcard_takes() -> None:
    with pytest.raises(argparse.ArgumentTypeError, match="wildcard on an IP address"):
        parse_allowed_host("*.0.0.1")


@pytest.mark.parametrize(
    ("entry", "normalized"),
    [
        ("*.example.com", "*.example.com"),
        ("*.1.example.com", "*.1.example.com"),
        ("*.123abc", "*.123abc"),
        ("*.0xyz", "*.0xyz"),
        ("*.xn--p1ai", "*.xn--p1ai"),
        ("10.0.0.1", "10.0.0.1"),
        ("[::1]", "::1"),
    ],
)
def test_domain_wildcards_and_exact_addresses_are_still_accepted(
    entry: str, normalized: str
) -> None:
    assert normalize_allowed_host(entry) == normalized


@pytest.mark.parametrize(
    "host", ["127.0.0.1", "10.0.0.1", "10.0.0.1.", "0x7f.0.0.1", "8.0.0.1"]
)
def test_a_wildcard_entry_never_matches_an_address(host: str) -> None:
    # Entries given already-normalized, as a caller bypassing the parser could.
    assert host_is_allowed(host, ("*.0.0.1",)) is False


def test_a_wildcard_entry_never_matches_an_ipv6_address() -> None:
    assert host_is_allowed("2001:db8::7", ("*.db8::7", "*.7")) is False


def test_an_address_still_matches_its_exact_entry() -> None:
    entries = normalize_allowed_hosts(["*.example.com", "10.0.0.1", "[2001:db8::7]"])
    assert host_is_allowed("10.0.0.1", entries) is True
    assert host_is_allowed("2001:DB8:0::7", entries) is True
    assert host_is_allowed("127.0.0.1", entries) is False
    assert host_is_allowed("a.example.com", entries) is True


def test_create_server_rejects_a_wildcard_address_entry() -> None:
    from mcp_server_fetch.server import create_server

    with pytest.raises(ValueError, match="wildcard on an IP address"):
        create_server(allowed_hosts=["*.0.0.1"])
