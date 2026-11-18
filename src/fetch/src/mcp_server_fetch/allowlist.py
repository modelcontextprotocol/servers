# The fetch server's operator-configured host allowlist (#2317). With
# `--allowed-hosts`, every request the server sends (the tool's page, the
# prompt's page, each robots.txt check and every redirect hop of any of them)
# must name a listed host, or it is refused before it is sent. Without the flag
# nothing is restricted, so existing configurations keep working.
#
# The allowlist names hosts, and it is checked against the host the request
# connects to (`raw_host`, the ASCII form), never against resolved addresses:
# a name the operator chose is trusted by name. It is a separate check from
# the private-address guard in server.py, and both apply: listing `localhost`
# or an intranet name does not, by itself, let the server reach a private
# address; that still needs `--allow-private-ips`. Two entry forms only, to
# keep the semantics obvious: an exact host (a name or an IP literal), and
# `*.example.com`, which matches any subdomain at any depth of example.com but
# not example.com itself. Ports and schemes are not part of an entry.
#
# A wildcard is for domain names only (#5521). `*.` in front of an address, or
# of anything whose last label is a number, is refused when the list is read:
# `*.0.0.1` is not a domain, and matched as a suffix it would cover 10.0.0.1
# and 127.0.0.1 alike. Matching holds the same line from the other side: an
# IP-literal host is only ever compared with exact entries.

import argparse
import ipaddress
from collections.abc import Awaitable, Callable, Iterable

import httpx
from mcp.server.mcpserver.exceptions import ToolError


def normalize_allowed_host(entry: str) -> str:
    """The canonical form of one ``--allowed-hosts`` entry, or ``ValueError``.

    A name is lowercased, its trailing dot dropped, and IDNA-encoded to the
    ASCII form requests are checked in (``bücher.example`` becomes
    ``xn--bcher-kva.example``). An IP literal is written in its compressed
    form, an IPv6 one with or without brackets. A wildcard is ``*.`` followed
    by a domain name, never by an address or a numeric suffix of one.
    """
    value = entry.strip().rstrip(".").lower()
    wildcard = value.startswith("*.")
    name = value[2:] if wildcard else value
    if not wildcard:
        try:
            return ipaddress.ip_address(name.strip("[]")).compressed
        except ValueError:
            pass
    if not name or any(c in name for c in "*/\\:@[]?#% ") or ".." in name:
        raise ValueError(
            f"{entry!r} is not a host name, an IP address or *.<domain> "
            "(no scheme, port, path or other wildcard)"
        )
    try:
        ascii_name = httpx.URL(f"http://{name}/").raw_host.decode("ascii")
    except httpx.InvalidURL as e:
        raise ValueError(f"{entry!r} is not a valid host name: {e}") from None
    if wildcard and _ends_in_a_number(ascii_name):
        raise ValueError(
            f"{entry!r} puts a wildcard on an IP address: *.<domain> takes a "
            "domain name, and an address is listed exactly"
        )
    return f"*.{ascii_name}" if wildcard else ascii_name


def _ends_in_a_number(name: str) -> bool:
    """Whether a host's last label is a number, so it reads as an IPv4 address.

    The test URL parsers apply: a host whose last label is decimal digits or
    ``0x`` hex is an address (``10.0.0.1``, ``0.0.1``, ``1``, ``0x7f.1``),
    never a domain, since no top-level domain is numeric.
    """
    last = name.rsplit(".", 1)[-1]
    if last.isascii() and last.isdigit():
        return True
    return last.startswith("0x") and all(c in "0123456789abcdef" for c in last[2:])


def parse_allowed_host(entry: str) -> str:
    """``normalize_allowed_host`` as an argparse ``type``, with its message."""
    try:
        return normalize_allowed_host(entry)
    except ValueError as e:
        raise argparse.ArgumentTypeError(str(e)) from None


def normalize_allowed_hosts(entries: Iterable[str] | None) -> tuple[str, ...]:
    """Every entry normalized; an empty tuple means no allowlist."""
    return tuple(normalize_allowed_host(entry) for entry in entries or ())


def host_is_allowed(host: str, allowed_hosts: tuple[str, ...]) -> bool:
    """Whether ``host`` (a request's ``raw_host``) matches a normalized entry."""
    host = host.rstrip(".").lower()
    is_address = _ends_in_a_number(host)
    try:
        host = ipaddress.ip_address(host).compressed
        is_address = True
    except ValueError:
        pass
    for entry in allowed_hosts:
        if entry.startswith("*."):
            if not is_address and host.endswith(entry[1:]):
                return True
        elif host == entry:
            return True
    return False


def refuse_unlisted_destination(
    allowed_hosts: tuple[str, ...],
) -> Callable[[httpx.Request], Awaitable[None]]:
    """An httpx request hook refusing any request to a host not on the list.

    httpx runs request hooks before every request it sends, redirect hops
    included, so a listed host cannot redirect the fetch to an unlisted one.
    The error does not repeat the list, which is the operator's configuration.
    """

    async def hook(request: httpx.Request) -> None:
        host = request.url.raw_host.decode("ascii")
        if not host_is_allowed(host, allowed_hosts):
            raise ToolError(
                f"Refused to fetch {request.url}: {host} is not one of the "
                "hosts this server is allowed to fetch from (--allowed-hosts)."
            )

    return hook
