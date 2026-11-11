# The fetch MCP server: one `fetch` tool and one `fetch` prompt that retrieve a
# URL and convert HTML to Markdown for a model. The network policy lives here
# beside the handlers because every request path (tool, prompt and robots.txt
# check) must go through it: the private-address guard on each request and
# redirect hop, robots.txt for autonomous fetches, the cap on how much of a
# response body is read (#5370), and proxy normalization.
#
# Built on the MCP Python SDK's high-level `MCPServer` (#5174), as the example
# to follow: the tool and the prompt are plain decorated functions, whose type
# hints and `Field` descriptions become the input schema and the prompt's
# arguments, and which the SDK validates before calling. A failure the server
# anticipated (robots.txt refusal, an unreachable or erroring URL, a private
# destination, a bad proxy setting) is raised as `ToolError`, which the SDK
# returns to the model as an `isError` result. A request naming a tool or a
# prompt the server does not have, or a prompt call without its `url`, is a
# malformed request, answered with a JSON-RPC `-32602` protocol error by
# `reject_unknown_names` before `MCPServer` sees it (see there for why).
# A prompt `url` that is not a valid URL gets the same `-32602` from the
# prompt handler (#4914).
# `serve()` serves both protocol eras (#4853): a 2025-11-25 client through the
# initialize handshake, and a 2026-07-28 client sessionlessly. No handler reads
# the session or calls back to the client (roots, sampling, elicitation,
# logging), so nothing differs between them.

import asyncio
import ipaddress
import os
import re
import socket
import zlib
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from importlib.metadata import version
from typing import Annotated, Any
from urllib.parse import urlparse, urlsplit, urlunparse, urlunsplit

import httpx
import markdownify
import readabilipy.simple_json
from bs4 import BeautifulSoup, Tag
from mcp.server import MCPServer, ServerRequestContext
from mcp.server.context import CallNext, HandlerResult, ServerMiddleware
from mcp.server.mcpserver.exceptions import ToolError
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS, ToolAnnotations
from protego import Protego
from pydantic import AnyUrl, Field, TypeAdapter, ValidationError

from .allowlist import normalize_allowed_hosts, refuse_unlisted_destination
from .readability_js import extract_article
from .timeout import (
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    timeout_ms_from_env,
)
from .title import with_page_title

# The version this server reports in serverInfo, read from the installed
# distribution's metadata (pyproject.toml) so it cannot drift from the
# published version (#360). Without it the SDK reports its own `mcp` version.
SERVER_VERSION = version("mcp-server-fetch")

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"


async def _resolve_host(host: str) -> list[str]:
    """Resolve ``host`` to every address the OS would hand the connector.

    getaddrinfo also parses IP literals, including the shorthand forms such as
    ``2130706433`` and ``127.1`` that a connector accepts as loopback.
    """
    infos = await asyncio.get_running_loop().getaddrinfo(host, None)
    return [str(info[4][0]) for info in infos]


# IANA special-purpose ranges that are not public destinations. ``is_global``
# covers most of them, but its tables were corrected only in recent releases
# (3.13, and patch releases of 3.11 and 3.12: before them 192.0.0.0/24 and
# 64:ff9b:1::/48, for example, read as global), so the ranges are listed here
# too, to give the same answer on every supported Python.
_NON_PUBLIC_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.88.99.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "240.0.0.0/4",
        # IPv4-compatible IPv6 (RFC 4291 2.5.5.1), deprecated and never routed;
        # it also holds the unspecified (::) and loopback (::1) addresses.
        "::/96",
        "64:ff9b:1::/48",
        "100::/64",
        "2001::/23",
        "2001:db8::/32",
        "2002::/16",
        # IPv6 documentation (RFC 9637), absent from older is_global tables.
        "3fff::/20",
        "fc00::/7",
        "fe80::/10",
        # Deprecated site-local (RFC 3879), which is_global reads as global.
        # Outside 2000::/3 as well, but listed so it is refused by name.
        "fec0::/10",
    )
)


# Globally reachable assignments inside the ranges above (anycast services
# and the like), matching the exceptions in current CPython's tables.
_PUBLIC_EXCEPTIONS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "192.0.0.9/32",
        "192.0.0.10/32",
        "2001:1::1/128",
        "2001:1::2/128",
        "2001:3::/32",
        "2001:4:112::/48",
        "2001:20::/28",
        "2001:30::/28",
    )
)


# The well-known NAT64 prefix (RFC 6052). A NAT64 gateway forwards an address
# in it to the IPv4 held in its low 32 bits, so that IPv4 is the destination.
_NAT64_WELL_KNOWN = ipaddress.IPv6Network("64:ff9b::/96")

# IPv4-translated addresses (RFC 2765, RFC 6145), which a stateless translator
# forwards to the IPv4 held in their low 32 bits, like NAT64.
_IPV4_TRANSLATED = ipaddress.IPv6Network("::ffff:0:0:0/96")

# IPv6 global unicast (RFC 4291 2.4, IANA's IPv6 address space registry). The
# rest of the IPv6 space is reserved by the IETF, unique or site-local,
# link-local or multicast, none of it a public destination, while is_global
# reads most of it as global. Deny-by-default there means a range missing from
# the list above cannot pass as public.
_IPV6_GLOBAL_UNICAST = ipaddress.IPv6Network("2000::/3")


def _is_public_address(address: str) -> bool:
    """True when ``address`` is a globally routable unicast address.

    Refused: loopback, RFC 1918, link-local (169.254.0.0/16, which holds most
    cloud metadata endpoints), shared address space (100.64.0.0/10, which holds
    Alibaba Cloud's 100.100.100.200), unique local IPv6 (AWS's fd00:ec2::254),
    multicast, unspecified, documentation and other special-purpose ranges.
    An IPv4-mapped, IPv4-translated or well-known NAT64 address is judged by
    the IPv4 it wraps; a deprecated IPv4-compatible address (``::/96``) is
    refused whatever it holds. Any other IPv6 address outside global unicast
    (``2000::/3``) is refused.
    """
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    elif isinstance(ip, ipaddress.IPv6Address) and (
        ip in _NAT64_WELL_KNOWN or ip in _IPV4_TRANSLATED
    ):
        ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    if any(ip in network for network in _PUBLIC_EXCEPTIONS):
        return True
    if any(ip in network for network in _NON_PUBLIC_NETWORKS):
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip not in _IPV6_GLOBAL_UNICAST:
        return False
    return ip.is_global and not ip.is_multicast


async def _refuse_private_destination(request: httpx.Request) -> None:
    """httpx request hook: refuse a request whose host is not a public address.

    httpx runs request hooks before every request it sends, redirect hops
    included, so a public URL cannot bounce the fetch to an internal one.

    The name checked is ``raw_host``, the ASCII (IDNA 2008) form the transport
    connects to. ``host`` is the decoded Unicode form, which getaddrinfo would
    re-encode with IDNA 2003 into a different name for some labels (``ß``
    becomes ``ss``), so checking it would vet one name and connect to another.
    """
    host = request.url.raw_host.decode("ascii")
    if not host:
        return  # httpx rejects a URL with no host itself.
    try:
        addresses = await _resolve_host(host)
    except socket.gaierror:
        # Unresolvable here: a direct connection fails on its own, and a proxy
        # resolves the name on its side.
        return
    for address in addresses:
        if not _is_public_address(address):
            raise ToolError(
                f"Refused to fetch {request.url}: {host} resolves to {address}, "
                "which is not a public address. Start the server with "
                "--allow-private-ips to allow private, loopback and link-local addresses."
            )


def _readability_content(html: str) -> str:
    """readabilipy's pure-Python simplified HTML for ``html``, or "" when it has none.

    Readability.js is not run through readabilipy (see `readability_js`), so
    this only ever asks it for its pure-Python extractor, which starts no process.
    """
    try:
        ret = readabilipy.simple_json.simple_json_from_html_string(
            html, use_readability=False
        )
    except IndexError:
        # readabilipy's pure-Python extractor wraps its simplified tree with
        # `Tag.append`, which beautifulsoup4 4.13 implements as
        # `self.insert(...)[0]`. A page that simplifies to nothing (an SPA
        # shell, an empty body) inserts nothing, so that index raises (#5158).
        # Under beautifulsoup4 <= 4.12 the same page comes back as an empty
        # tree, reported by the caller as this same failure.
        return ""
    return ret["content"] or ""


def _hiding_declaration(declaration: str) -> bool:
    """Whether one inline-style declaration is one Readability.js treats as hidden."""
    prop, _, value = declaration.partition(":")
    # Lowercased first: CSS keywords, `!important` included, ignore case.
    value = value.lower().replace("!important", "").strip()
    return (prop.strip().lower(), value) in {
        ("display", "none"),
        ("visibility", "hidden"),
    }


def _is_hidden(tag: Tag) -> bool:
    """Whether Readability.js drops ``tag`` as invisible (its `_isProbablyVisible`)."""
    if tag.has_attr("hidden") or tag.get("aria-hidden") == "true":
        return True
    return any(_hiding_declaration(d) for d in str(tag.get("style", "")).split(";"))


# Hidden page furniture that is expected to stay hidden (a collapsed menu, a
# closed dialog): never a hydration container, so never unhidden.
_PAGE_CHROME_TAGS = frozenset({"nav", "header", "footer", "aside", "menu", "dialog"})
_PAGE_CHROME_ROLES = frozenset(
    {
        "navigation",
        "banner",
        "contentinfo",
        "complementary",
        "menu",
        "menubar",
        "dialog",
        "alertdialog",
    }
)


def _is_page_chrome(tag: Tag) -> bool:
    return tag.name in _PAGE_CHROME_TAGS or tag.get("role") in _PAGE_CHROME_ROLES


def _text_length(html: Tag) -> int:
    """The length of the text in ``html``, whitespace collapsed."""
    return len(" ".join(html.get_text(" ").split()))


def _recover_hidden_content(html: str, content: str) -> str:
    """Re-extract a page whose content Readability.js dropped as hidden (#3878).

    Progressive server-side rendering streams a visible loading shell first,
    then the real page in a container hidden (``visibility: hidden``,
    ``display: none``, ``hidden``) until the client hydrates it. Readability.js
    discards hidden nodes, so only the shell's text survived. When a hidden
    element holds more text than the whole extraction, those elements are
    unhidden and Readability.js runs again; the second result is kept only if
    it has more text. A page whose hidden elements are smaller than its
    extracted content, or are page furniture (navigation, menus, dialogs), is
    returned exactly as before, from the one Readability.js run.
    """
    extracted = _text_length(BeautifulSoup(content, "html.parser"))
    soup = BeautifulSoup(html, "html.parser")
    larger = [
        tag
        for tag in soup.find_all(_is_hidden)
        # Outermost only: unhiding a container exposes what it holds, and
        # anything hidden inside it stays hidden.
        if not any(_is_hidden(parent) for parent in tag.parents)
        # Furniture, or anything inside it (`<nav><div hidden>`), stays hidden.
        and not _is_page_chrome(tag)
        and not any(_is_page_chrome(parent) for parent in tag.parents)
        and _text_length(tag) > extracted
    ]
    if not larger:
        return content
    for tag in larger:
        del tag["hidden"]
        del tag["aria-hidden"]
        style = [
            d
            for d in str(tag.get("style", "")).split(";")
            if not _hiding_declaration(d)
        ]
        tag["style"] = ";".join(style)
    recovered = extract_article(str(soup))
    # None: this second run failed or timed out, so keep the first result.
    if (
        recovered is not None
        and _text_length(BeautifulSoup(recovered, "html.parser")) > extracted
    ):
        return recovered
    return content


def extract_content_from_html(html: str, use_readability_js: bool = True) -> str:
    """Extract and convert HTML content to Markdown format.

    Args:
        html: Raw HTML content to process
        use_readability_js: Use Readability.js under Node.js when Node.js is
            on PATH (`readability_js`), falling back to readabilipy's
            pure-Python extractor when it is unavailable, fails or times out.
            False always uses the pure-Python extractor, so no Node.js (or
            npm) process is started (#4199).

    Synchronous and possibly slow (a Node.js subprocess, up to its timeout):
    `fetch_url` runs it in a worker thread, off the event loop (#5306).

    Returns:
        Simplified markdown version of the content
    """
    failed = "<error>Page failed to be simplified from HTML</error>"
    content_html = extract_article(html) if use_readability_js else None
    if content_html is not None:
        # Only Readability.js drops hidden elements; the pure-Python extractor
        # keeps them, so its result never needs recovering.
        content_html = _recover_hidden_content(html, content_html)
    else:
        content_html = _readability_content(html)
    if not content_html:
        return failed
    content = markdownify.markdownify(
        content_html,
        heading_style=markdownify.ATX,
    )
    # Without Node, readabilipy's pure-Python extractor never returns empty
    # content: an empty page comes back as "<div></div>", which converts to an
    # empty string. Report that as the same simplification failure the Node
    # path reports, rather than letting it reach pagination as an exhausted page.
    if not content.strip():
        return failed
    return content


def get_robots_txt_url(url: str) -> str:
    """Get the robots.txt URL for a given website URL.

    Args:
        url: Website URL to get robots.txt for

    Returns:
        URL of the robots.txt file
    """
    # Parse the URL into components
    parsed = urlparse(url)

    # Reconstruct the base URL with just scheme, netloc, and /robots.txt path
    robots_url = urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))

    return robots_url


PROXY_ENV_VARS = (
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
)


def normalize_proxy_url(proxy_url: str) -> str:
    """Rewrite the ``socks://`` alias, which httpx rejects, to ``socks5://``.

    Desktop proxy settings often export ``socks://host:port``; httpx only
    accepts ``socks5://``. Every other value is returned unchanged.
    """
    if proxy_url.lower().startswith("socks://"):
        return "socks5://" + proxy_url[len("socks://") :]
    return proxy_url


def normalize_proxy_env() -> None:
    """Apply ``normalize_proxy_url`` to the proxy variables httpx reads."""
    for name in PROXY_ENV_VARS:
        value = os.environ.get(name)
        if value:
            os.environ[name] = normalize_proxy_url(value)


def make_client(proxy_url: str | None) -> httpx.AsyncClient:
    """Build the httpx client, turning a bad proxy setting into a ``ToolError``.

    httpx validates the proxy (``--proxy-url`` or the proxy environment
    variables) when the client is constructed, before any request, so this
    failure is not an ``HTTPError``.
    """
    try:
        return httpx.AsyncClient(proxy=proxy_url)
    except (ValueError, ImportError) as e:
        raise ToolError(
            f"Failed to set up the HTTP client, check the proxy "
            f"configuration (--proxy-url or the HTTP_PROXY, HTTPS_PROXY and "
            f"ALL_PROXY environment variables): {e}"
        )


# The most body bytes the server reads from one response (#5370). A body is
# streamed and the read stops at this cap, so a very large or endless response
# cannot make the server buffer all of it. `max_length` cannot do this: it
# limits what is returned, after the whole page has been read and converted.
# The cap counts decoded bytes, so a small compressed body that expands
# enormously is stopped too, and decoding itself is bounded by it (see
# `read_capped`).
MAX_RESPONSE_BYTES = 5 * 1024 * 1024

# The content codings the server asks for, and the only ones it decodes. They
# are named explicitly because httpx would also offer br and zstd whenever
# their packages happen to be installed, and decode them with no output limit.
ACCEPT_ENCODING = "gzip, deflate"


class BoundedInflater:
    """Incremental gzip or deflate decoding whose output per call is bounded.

    httpx's decoders inflate each network chunk whole, so one small chunk of a
    compression bomb could allocate far past the cap before any check saw it
    (#5370). zlib's ``max_length`` stops each call at the room left instead,
    and keeps the input it did not get to in ``unconsumed_tail``.
    """

    def __init__(self, coding: str) -> None:
        self._gzip = coding in ("gzip", "x-gzip")
        self._first = True
        self._z = zlib.decompressobj(
            zlib.MAX_WBITS | 16 if self._gzip else zlib.MAX_WBITS
        )

    @property
    def unconsumed_tail(self) -> bytes:
        return self._z.unconsumed_tail

    @property
    def eof(self) -> bool:
        """Whether the compressed stream has ended."""
        return self._z.eof

    def decompress(self, data: bytes, max_length: int) -> bytes:
        try:
            out = self._z.decompress(data, max_length)
        except zlib.error as e:
            if self._first and not self._gzip:
                # Servers often send deflate raw, without zlib's wrapper; httpx
                # retries the same way.
                self._first = False
                self._z = zlib.decompressobj(-zlib.MAX_WBITS)
                return self.decompress(data, max_length)
            raise httpx.DecodingError(f"Error decoding the response body: {e}")
        self._first = False
        return out

    def flush(self) -> bytes:
        return self._z.flush()


def inflater_for(response: httpx.Response) -> BoundedInflater | None:
    """The decoder a response's Content-Encoding needs, or None for none.

    Only a single gzip or deflate coding is decoded. Any other (br, zstd, a
    chain of codings) is refused rather than handed over undecoded or decoded
    without a bound.
    """
    codings = [
        coding.strip().lower()
        for coding in response.headers.get("content-encoding", "").split(",")
    ]
    codings = [coding for coding in codings if coding not in ("", "identity")]
    if not codings:
        return None
    if len(codings) == 1 and codings[0] in ("gzip", "x-gzip", "deflate"):
        return BoundedInflater(codings[0])
    raise httpx.DecodingError(
        f"Unsupported content encoding {', '.join(codings)}: this server "
        f"decodes only {ACCEPT_ENCODING}"
    )


@asynccontextmanager
async def stream_get(
    client: httpx.AsyncClient, url: str, user_agent: str, **kwargs: Any
) -> AsyncIterator[httpx.Response]:
    """GET ``url`` with redirects followed, yielding the final response unread.

    httpx's own redirect handling reads each redirect's body whole before it
    follows it, so a redirect with an endless body would get round the cap.
    Here each hop is closed unread instead. The request hooks still run before
    every hop, since they run on each ``send``. ``kwargs`` go to
    ``build_request`` (the timeout).
    """
    request = client.build_request(
        "GET",
        url,
        headers={"User-Agent": user_agent, "Accept-Encoding": ACCEPT_ENCODING},
        **kwargs,
    )
    response = await client.send(request, stream=True, follow_redirects=False)
    try:
        hops = 0
        while response.next_request is not None:
            hops += 1
            if hops > client.max_redirects:
                raise httpx.TooManyRedirects(
                    "Exceeded maximum allowed redirects.",
                    request=response.next_request,
                )
            next_request = response.next_request
            await response.aclose()
            response = await client.send(
                next_request, stream=True, follow_redirects=False
            )
        yield response
    finally:
        await response.aclose()


async def read_capped(response: httpx.Response, limit: int) -> tuple[bytes, bool]:
    """Read a streamed response's body, stopping once it passes ``limit`` bytes.

    Returns the body, at most ``limit`` bytes of it, and whether it was cut
    short. Whatever the server has not sent yet is never read: closing the
    response (leaving `stream_get`) closes the connection. The raw bytes are
    decoded here rather than by httpx, so no single step produces more than
    one byte past the room left under ``limit`` (see `BoundedInflater`).
    """
    inflater = inflater_for(response)
    body = bytearray()
    async for raw in response.aiter_raw():
        pending = raw
        while pending:
            room = limit - len(body)
            if inflater is None:
                out, pending = pending[: room + 1], b""
            else:
                out = inflater.decompress(pending, room + 1)
                pending = inflater.unconsumed_tail
            body += out
            if len(body) > limit:
                return bytes(body[:limit]), True
            if inflater is not None and inflater.eof:
                # The compressed stream is complete. Whatever follows it is not
                # part of the body (httpx's decoders drop it too), and zlib
                # would keep all of it in `unused_data`, so reading stops here.
                return bytes(body), False
    if inflater is not None:
        # All input is consumed by now, so zlib has at most a few bytes left.
        body += inflater.flush()
    if len(body) > limit:
        return bytes(body[:limit]), True
    return bytes(body), False


def declared_length(response: httpx.Response) -> int | None:
    """The body size a response's Content-Length declares, or None without one."""
    try:
        return int(response.headers["content-length"])
    except (KeyError, ValueError):
        return None


def decode_text(response: httpx.Response, content: bytes) -> str:
    """Decode ``content`` as httpx's ``response.text`` would.

    The header's charset when Python knows it, UTF-8 otherwise, with undecodable
    bytes replaced. A streamed response has no ``.text`` until its whole body is
    read through httpx, which is the read the cap exists to avoid.
    """
    return content.decode(response.encoding or "utf-8", errors="replace")


def decode_page(response: httpx.Response, content: bytes) -> str:
    """Decode a fetched body, honoring a charset the HTML declares (#5199).

    httpx's ``response.text`` uses the Content-Type header's charset, and
    UTF-8 without one, so a page that declares a legacy encoding only in a
    ``<meta charset>`` or ``<meta http-equiv="Content-Type">`` tag came back
    garbled. Following the HTML encoding-sniffing order, kept simple: a byte
    order mark or a header charset wins (httpx already honors the header), and
    otherwise the first 1024 bytes of a ``text/html`` or
    ``application/xhtml+xml`` (or untyped) body are parsed for the first
    ``<meta>`` that declares one: a ``charset`` attribute, or a ``content``
    attribute's ``charset=`` when ``http-equiv`` is ``Content-Type``. The
    stdlib HTML parser does the tokenizing, so a commented-out tag or an
    unrelated attribute (``data-charset``) is not mistaken for a declaration.
    A declaration Python does not know, or one that names a codec that is not
    a web text encoding, is ignored, and the body is decoded as before.

    ``content`` is the body as read by `read_capped`; the response supplies
    the headers.
    """
    # Imported here so the helper stays one self-contained block of this file.
    import codecs
    import re
    from html.parser import HTMLParser

    media_type = (
        response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    )
    if (
        response.charset_encoding is not None
        or media_type not in ("", "text/html", "application/xhtml+xml")
        or content.startswith(
            (codecs.BOM_UTF8, codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)
        )
    ):
        return decode_text(response, content)

    class MetaCharset(HTMLParser):
        declared: str | None = None

        def handle_starttag(
            self, tag: str, attrs: list[tuple[str, str | None]]
        ) -> None:
            if tag != "meta" or self.declared is not None:
                return
            values = {name: (value or "").strip() for name, value in attrs}
            if values.get("charset"):
                self.declared = values["charset"]
            elif values.get("http-equiv", "").lower() == "content-type":
                found = re.search(
                    r"""charset\s*=\s*["']?\s*([^\s"';]+)""",
                    values.get("content", ""),
                    re.IGNORECASE,
                )
                if found:
                    self.declared = found.group(1)

    # Latin-1 maps every byte to one character, so an ASCII declaration reads
    # the same whatever the page's real encoding. A tag cut off at byte 1024
    # is left unparsed, since the parser is never closed.
    scan = MetaCharset()
    scan.feed(content[:1024].decode("latin-1"))
    if scan.declared is None:
        return decode_text(response, content)
    try:
        name = codecs.lookup(scan.declared).name
        # A UTF-16/32 declaration in an ASCII-compatible document cannot be
        # true, so the HTML standard reads it as UTF-8.
        if name.startswith(("utf-16", "utf-32")):
            name = "utf-8"
        # Python codecs that are not web text encodings: decoding a page with
        # them would mangle it rather than fix it.
        if name in ("idna", "punycode", "unicode-escape", "raw-unicode-escape"):
            return decode_text(response, content)
        # A declaration found in ASCII bytes is only believable for an
        # ASCII-compatible encoding. UTF-7, HZ and the EBCDIC code pages
        # (cp037, cp500, …) would rewrite the markup itself, so they fail this
        # probe (by a different result or a decode error) and are ignored.
        probe = b"\t\n\r" + bytes(range(0x20, 0x7F))
        if probe.decode(name) != probe.decode("ascii"):
            return decode_text(response, content)
        return content.decode(name, errors="replace")
    except (LookupError, ValueError):  # UnicodeError is a ValueError
        # An unknown charset, a name Python refuses outright (one holding a
        # NUL), a non-text codec (base64, rot13, …), one that refuses to
        # decode at all (``undefined``), or one the probe cannot decode.
        return decode_text(response, content)


# Escapes of the path separator and of the dot, which an origin may decode
# before it resolves the path. Other escapes (such as %20) are left alone.
_ENCODED_SLASH = re.compile("%2f", re.IGNORECASE)
_ENCODED_DOT = re.compile("%2e", re.IGNORECASE)
_REPEATED_SLASHES = re.compile("/{2,}")


def _remove_dot_segments(path: str) -> str:
    """``path`` with its ``.`` and ``..`` segments resolved (RFC 3986 5.2.4).

    The result is always absolute, as robots.txt rules are: an empty path
    becomes ``/``.
    """
    segments = path.split("/")
    resolved: list[str] = []
    for segment in segments[1:]:
        if segment == "..":
            if resolved:
                resolved.pop()
        elif segment != ".":
            resolved.append(segment)
    # A path ending in a dot segment names a directory: "/a/b/.." is "/a/".
    trailing = "/" if resolved and segments[-1] in (".", "..") else ""
    return "/" + "/".join(resolved) + trailing


def _resolved_path_url(url: str) -> str:
    """``url`` with its path spelled the way a typical origin resolves it.

    robots.txt rules match the path a crawler requests, but an origin such as
    nginx or Apache serves ``//private``, ``/x/../private`` and ``/%2Fprivate``
    as ``/private``. So the path's separator and dot escapes are decoded,
    repeated slashes merged and dot segments removed before rules are matched
    against it, as well as against the path as spelled. The query is kept as
    it is, and matching stays case-sensitive (RFC 9309 2.2.2).
    """
    parts = urlsplit(url)
    path = _ENCODED_DOT.sub(".", _ENCODED_SLASH.sub("/", parts.path))
    path = _remove_dot_segments(_REPEATED_SLASHES.sub("/", path))
    return urlunsplit(parts._replace(path=path))


async def check_may_autonomously_fetch_url(
    url: str,
    user_agent: str,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
    allowed_hosts: tuple[str, ...] = (),
) -> None:
    """
    Check if the URL can be fetched by the user agent according to the robots.txt file.
    Raises a ToolError if not.
    """
    from httpx import HTTPError

    robot_txt_url = get_robots_txt_url(url)

    async with make_client(proxy_url) as client:
        hooks: list[Callable[[httpx.Request], Awaitable[None]]] = []
        if allowed_hosts:
            hooks.append(refuse_unlisted_destination(allowed_hosts))
        if not allow_private_ips:
            hooks.append(_refuse_private_destination)
        client.event_hooks = {"request": hooks}
        try:
            async with stream_get(client, robot_txt_url, user_agent) as response:
                # A 5xx robots.txt is "unreachable" (RFC 9309 section 2.3.1.4),
                # which means complete disallow: the error page is never parsed
                # as rules.
                if response.status_code in (401, 403) or response.status_code >= 500:
                    raise ToolError(
                        f"When fetching robots.txt ({robot_txt_url}), received status {response.status_code} so assuming that autonomous fetching is not allowed, the user can try manually fetching by using the fetch prompt"
                    )
                elif 400 <= response.status_code < 500:
                    return
                # Read up to the same cap as a page (#5370). RFC 9309 section
                # 2.5 lets a crawler stop parsing past a limit of at least
                # 500 KiB, so the rules in the first part are used as they are.
                content, _ = await read_capped(response, MAX_RESPONSE_BYTES)
        except HTTPError:
            raise ToolError(
                f"Failed to fetch robots.txt {robot_txt_url} due to a connection issue"
            )
        robot_txt = decode_text(response, content)
    processed_robot_txt = "\n".join(
        line for line in robot_txt.splitlines() if not line.strip().startswith("#")
    )
    robot_parser = Protego.parse(processed_robot_txt)
    # Refused when either spelling of the path is disallowed: resolving the
    # path only ever adds refusals.
    if not (
        robot_parser.can_fetch(url, user_agent)
        and robot_parser.can_fetch(_resolved_path_url(url), user_agent)
    ):
        raise ToolError(
            f"The sites robots.txt ({robot_txt_url}), specifies that autonomous fetching of this page is not allowed, "
            f"<useragent>{user_agent}</useragent>\n"
            f"<url>{url}</url>"
            f"<robots>\n{robot_txt}\n</robots>\n"
            f"The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.\n"
            f"The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI."
        )


# The Accept header of a non-raw fetch (#5198). A site that negotiates content
# can then serve native markdown, which is returned as-is, and a site that does
# not still serves HTML (preferred over everything else) to be simplified.
MARKDOWN_ACCEPT = "text/markdown, text/html;q=0.9, */*;q=0.8"


def _is_markdown(content_type: str) -> bool:
    """Whether a Content-Type header declares markdown (``text/markdown``, RFC 7763)."""
    return content_type.split(";", 1)[0].strip().lower() == "text/markdown"


def _body_looks_like_html(page_raw: str) -> bool:
    """Whether a body served with no Content-Type is an HTML document.

    A missing header says nothing about the payload, so only a body that opens
    (after any byte-order mark and whitespace) with an HTML doctype or an
    ``<html`` tag is simplified; JSON, plain text and the like come back raw
    rather than being forced through readability (#5134).
    """
    start = page_raw.lstrip("\ufeff").lstrip()[:20].lower()
    return start.startswith(("<!doctype html", "<html"))


async def fetch_url(
    url: str,
    user_agent: str,
    force_raw: bool = False,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
    allowed_hosts: tuple[str, ...] = (),
    check_robots_txt: bool = False,
    use_readability_js: bool = True,
) -> tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.

    With ``check_robots_txt``, every redirect hop is checked against the
    robots.txt of its own origin before it is requested. The caller has
    already checked the requested URL itself.
    """
    from httpx import HTTPError

    seen_first_request = False

    async def _check_redirect_robots_txt(request: httpx.Request) -> None:
        # httpx runs request hooks before each request, redirect hops included.
        nonlocal seen_first_request
        if not seen_first_request:
            seen_first_request = True
            return
        await check_may_autonomously_fetch_url(
            str(request.url), user_agent, proxy_url, allow_private_ips, allowed_hosts
        )

    async with make_client(proxy_url) as client:
        hooks: list[Callable[[httpx.Request], Awaitable[None]]] = []
        if allowed_hosts:
            hooks.append(refuse_unlisted_destination(allowed_hosts))
        if not allow_private_ips:
            hooks.append(_refuse_private_destination)
        if check_robots_txt:
            hooks.append(_check_redirect_robots_txt)
        if hooks:
            client.event_hooks = {"request": hooks}
        # A raw fetch keeps httpx's default Accept: */*, so it gets the site's
        # default representation (a page's HTML), as before this negotiation.
        if not force_raw:
            client.headers["Accept"] = MARKDOWN_ACCEPT
        too_large = (
            f"Failed to fetch {url}: the response body is larger than the "
            f"{MAX_RESPONSE_BYTES} byte limit this server reads"
        )
        try:
            async with stream_get(
                client, url, user_agent, timeout=timeout_ms / 1000
            ) as response:
                if response.status_code >= 400:
                    raise ToolError(
                        f"Failed to fetch {url} - status code {response.status_code}"
                    )
                # Refused before reading anything when the size is declared;
                # otherwise the streamed read stops at the cap (#5370).
                length = declared_length(response)
                if length is not None and length > MAX_RESPONSE_BYTES:
                    raise ToolError(f"{too_large} (it declares {length} bytes)")
                content, truncated = await read_capped(response, MAX_RESPONSE_BYTES)
                if truncated:
                    raise ToolError(too_large)
        except httpx.TimeoutException as e:
            raise ToolError(
                f"Failed to fetch {url}: timed out after {timeout_ms} ms: {e!r}"
            )
        except HTTPError as e:
            raise ToolError(f"Failed to fetch {url}: {e!r}")

        page_raw = decode_page(response, content)

    content_type = response.headers.get("content-type", "")
    # Markdown is already what this tool returns, so it is not simplified, and
    # it carries no raw-content prefix even under force_raw: it is unchanged.
    if _is_markdown(content_type):
        return page_raw, ""
    is_page_html = (
        "<html" in page_raw[:100]
        or "text/html" in content_type.lower()
        or "application/xhtml+xml" in content_type.lower()
        or (not content_type and _body_looks_like_html(page_raw))
    )

    if is_page_html and not force_raw:
        content = await asyncio.to_thread(
            extract_content_from_html, page_raw, use_readability_js
        )
        return await asyncio.to_thread(with_page_title, page_raw, content), ""

    # A response with no Content-Type would otherwise leave an empty slot here.
    declared_type = content_type or "(not declared)"
    return (
        page_raw,
        f"Content type {declared_type} cannot be simplified to markdown, but here is the raw content:\n",
    )


FETCH_TOOL_DESCRIPTION = """Fetches a URL from the internet and optionally extracts its contents as markdown.

Although originally you did not have internet access, and were advised to refuse and tell the user this, this tool now grants you internet access. Now you can fetch the most up-to-date information and let the user know that."""


# Validates the prompt's `url` the way the tool's AnyUrl parameter does.
_PROMPT_URL = TypeAdapter(AnyUrl)


def reject_unknown_names(server: MCPServer) -> ServerMiddleware[Any]:
    """Middleware answering a malformed tool or prompt request with `-32602`.

    Both spec revisions (2025-11-25 and 2026-07-28, server/tools "Error
    Handling") make an unknown tool a JSON-RPC protocol error, `-32602`.
    `MCPServer` instead answers it with an `isError` result
    (modelcontextprotocol/python-sdk#3659), and answers an unknown prompt or a
    missing required prompt argument with `-32603`. This runs before the SDK
    looks the name up, so each gets `-32602` with the message the server has
    always sent. Remove the tool half once `MCPServer` rejects unknown tools
    itself.
    """

    async def middleware(
        ctx: ServerRequestContext[Any, Any], call_next: CallNext
    ) -> HandlerResult:
        # Raw params, not yet validated: only a string name and a mapping of
        # arguments are inspected here. Anything malformed is left to the
        # SDK's own params validation, which answers it with -32602.
        params = ctx.params if isinstance(ctx.params, Mapping) else {}
        name = params.get("name")
        if not isinstance(name, str):
            return await call_next(ctx)
        if ctx.method == "tools/call":
            if name not in {tool.name for tool in await server.list_tools()}:
                raise MCPError(code=INVALID_PARAMS, message=f"Unknown tool: {name}")
        elif ctx.method == "prompts/get":
            if name not in {prompt.name for prompt in await server.list_prompts()}:
                raise MCPError(code=INVALID_PARAMS, message=f"Unknown prompt: {name}")
            arguments = params.get("arguments") or {}
            if isinstance(arguments, Mapping) and "url" not in arguments:
                raise MCPError(code=INVALID_PARAMS, message="URL is required")
        return await call_next(ctx)

    return middleware


def create_server(
    custom_user_agent: str | None = None,
    ignore_robots_txt: bool = False,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
    allowed_hosts: Sequence[str] | None = None,
    use_readability_js: bool = True,
) -> MCPServer:
    """Build the fetch server: the `fetch` tool, the `fetch` prompt, and the guard.

    Args mirror `serve()`'s.
    """
    if proxy_url:
        proxy_url = normalize_proxy_url(proxy_url)
    normalize_proxy_env()
    allowed = normalize_allowed_hosts(allowed_hosts)
    user_agent_autonomous = custom_user_agent or DEFAULT_USER_AGENT_AUTONOMOUS
    user_agent_manual = custom_user_agent or DEFAULT_USER_AGENT_MANUAL
    default_timeout_ms = timeout_ms_from_env()

    # subscriptions=False: the tool and prompt lists never change and there are
    # no resources to watch, so `subscriptions/listen` is not served and the
    # 2026-07-28 capabilities say `listChanged: false`.
    server = MCPServer("mcp-fetch", version=SERVER_VERSION, subscriptions=False)
    server.middleware.append(reject_unknown_names(server))

    @server.tool(
        name="fetch",
        description=FETCH_TOOL_DESCRIPTION,
        # Reads only, changes nothing, and repeating a request has no further
        # side effect; it reaches arbitrary hosts on the internet (#3572).
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=True,
        ),
        # The result is page text for the model, so no outputSchema.
        structured_output=False,
    )
    # strict=True: pydantic would otherwise coerce "yes" to True or "10" to 10,
    # accepting arguments the advertised inputSchema rejects.
    async def fetch(
        url: Annotated[AnyUrl, Field(description="URL to fetch")],
        max_length: Annotated[
            int,
            Field(
                description="Maximum number of characters to return.",
                # ge/le rather than gt/lt: the inclusive bounds emit
                # minimum/maximum, which every client accepts, while
                # exclusiveMinimum/exclusiveMaximum are rejected by some
                # (Gemini, #1624). Same range for an int.
                ge=1,
                le=999999,
                strict=True,
            ),
        ] = 5000,
        start_index: Annotated[
            int,
            Field(
                description="On return output starting at this character index, useful if a previous fetch was truncated and more context is required.",
                ge=0,
                strict=True,
            ),
        ] = 0,
        raw: Annotated[
            bool,
            Field(
                description="Get the actual HTML content of the requested page, without simplification.",
                strict=True,
            ),
        ] = False,
        timeout_ms: Annotated[
            int,
            Field(
                description="How long to wait, in milliseconds, to connect to the server and for each read of its response before giving up. Raise it for a slow server or a large download; lower it to fail fast.",
                ge=MIN_TIMEOUT_MS,
                le=MAX_TIMEOUT_MS,
                strict=True,
            ),
        ] = default_timeout_ms,
    ) -> str:
        page_url = str(url)

        if not ignore_robots_txt:
            await check_may_autonomously_fetch_url(
                page_url, user_agent_autonomous, proxy_url, allow_private_ips, allowed
            )

        content, prefix = await fetch_url(
            page_url,
            user_agent_autonomous,
            force_raw=raw,
            timeout_ms=timeout_ms,
            proxy_url=proxy_url,
            allow_private_ips=allow_private_ips,
            allowed_hosts=allowed,
            check_robots_txt=not ignore_robots_txt,
            use_readability_js=use_readability_js,
        )
        original_length = len(content)
        if start_index >= original_length:
            content = "<error>No more content available.</error>"
        else:
            # Never empty: start_index < original_length and max_length > 0.
            truncated_content = content[start_index : start_index + max_length]
            content = truncated_content
            actual_content_length = len(truncated_content)
            remaining_content = original_length - (start_index + actual_content_length)
            # Only add the prompt to continue fetching if there is still remaining content
            if actual_content_length == max_length and remaining_content > 0:
                next_start = start_index + actual_content_length
                content += f"\n\n<error>Content truncated. Call the fetch tool with a start_index of {next_start} to get more content.</error>"
        return f"{prefix}Contents of {page_url}:\n{content}"

    @server.prompt(
        name="fetch",
        description="Fetch a URL and extract its contents as markdown",
    )
    async def fetch_prompt(
        url: Annotated[str, Field(description="URL to fetch")],
    ) -> str:
        # The URL is checked as the tool's AnyUrl parameter checks it, so a
        # malformed one is a bad argument (-32602) rather than an exception
        # out of httpx, which the SDK would answer with code 0 (#4914).
        try:
            url = str(_PROMPT_URL.validate_python(url))
        except ValidationError as e:
            raise MCPError(
                code=INVALID_PARAMS,
                message=f"Invalid URL {url!r}: {e.errors()[0]['msg']}",
            )
        # The user asked for this page, so robots.txt is not consulted, and a
        # failure is shown to them as the prompt's text rather than raised.
        try:
            content, prefix = await fetch_url(
                url,
                user_agent_manual,
                timeout_ms=default_timeout_ms,
                proxy_url=proxy_url,
                allow_private_ips=allow_private_ips,
                allowed_hosts=allowed,
                use_readability_js=use_readability_js,
            )
        except ToolError as e:
            return str(e)
        return prefix + content

    return server


async def serve(
    custom_user_agent: str | None = None,
    ignore_robots_txt: bool = False,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
    allowed_hosts: Sequence[str] | None = None,
    use_readability_js: bool = True,
) -> None:
    """Run the fetch MCP server over stdio.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
        allowed_hosts: When given, the only hosts the server may fetch from:
            exact hosts, or ``*.example.com`` for any subdomain of it, checked
            in addition to the private-address guard. Empty or None allows
            every host
        allow_private_ips: Allow fetching private, loopback and link-local
            addresses, which are refused by default
        use_readability_js: Extract HTML with Readability.js under Node.js
            when Node.js is on PATH (falling back to the pure-Python extractor
            when it cannot run); False always uses the pure-Python extractor
    """
    server = create_server(
        custom_user_agent,
        ignore_robots_txt,
        proxy_url,
        allow_private_ips,
        allowed_hosts,
        use_readability_js,
    )
    # Both eras (#4853): the SDK's dual-era loop lets the client's first
    # request decide. `initialize` gets the 2025-11-25 handshake;
    # `server/discover` or a request carrying a 2026-07-28 envelope gets the
    # modern, sessionless era, with its required result fields (resultType,
    # ttlMs, cacheScope) filled in by the SDK.
    await server.run_stdio_async()
