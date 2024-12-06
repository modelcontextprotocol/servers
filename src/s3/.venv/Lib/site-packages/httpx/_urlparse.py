"""
An implementation of `urlparse` that provides URL validation and normalization
as described by RFC3986.

We rely on this implementation rather than the one in Python's stdlib, because:

* It provides more complete URL validation.
* It properly differentiates between an empty querystring and an absent querystring,
  to distinguish URLs with a trailing '?'.
* It handles scheme, hostname, port, and path normalization.
* It supports IDNA hostnames, normalizing them to their encoded form.
* The API supports passing individual components, as well as the complete URL string.

Previously we relied on the excellent `rfc3986` package to handle URL parsing and
validation, but this module provides a simpler alternative, with less indirection
required.
"""

from __future__ import annotations

import ipaddress
import re
import typing

import idna

from ._exceptions import InvalidURL

MAX_URL_LENGTH = 65536

# https://datatracker.ietf.org/doc/html/rfc3986.html#section-2.3
UNRESERVED_CHARACTERS = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
)
SUB_DELIMS = "!$&'()*+,;="

PERCENT_ENCODED_REGEX = re.compile("%[A-Fa-f0-9]{2}")

# https://url.spec.whatwg.org/#percent-encoded-bytes

# The fragment percent-encode set is the C0 control percent-encode set
# and U+0020 SPACE, U+0022 ("), U+003C (<), U+003E (>), and U+0060 (`).
FRAG_SAFE = "".join(
    [chr(i) for i in range(0x20, 0x7F) if i not in (0x20, 0x22, 0x3C, 0x3E, 0x60)]
)

# The query percent-encode set is the C0 control percent-encode set
# and U+0020 SPACE, U+0022 ("), U+0023 (#), U+003C (<), and U+003E (>).
QUERY_SAFE = "".join(
    [chr(i) for i in range(0x20, 0x7F) if i not in (0x20, 0x22, 0x23, 0x3C, 0x3E)]
)

# The path percent-encode set is the query percent-encode set
# and U+003F (?), U+0060 (`), U+007B ({), and U+007D (}).
PATH_SAFE = "".join(
    [
        chr(i)
        for i in range(0x20, 0x7F)
        if i not in (0x20, 0x22, 0x23, 0x3C, 0x3E) + (0x3F, 0x60, 0x7B, 0x7D)
    ]
)

# The userinfo percent-encode set is the path percent-encode set
# and U+002F (/), U+003A (:), U+003B (;), U+003D (=), U+0040 (@),
# U+005B ([) to U+005E (^), inclusive, and U+007C (|).
USERNAME_SAFE = "".join(
    [
        chr(i)
        for i in range(0x20, 0x7F)
        if i
        not in (0x20, 0x22, 0x23, 0x3C, 0x3E)
        + (0x3F, 0x60, 0x7B, 0x7D)
        + (0x2F, 0x3A, 0x3B, 0x3D, 0x40, 0x5B, 0x5C, 0x5D, 0x5E, 0x7C)
    ]
)
PASSWORD_SAFE = "".join(
    [
        chr(i)
        for i in range(0x20, 0x7F)
        if i
        not in (0x20, 0x22, 0x23, 0x3C, 0x3E)
        + (0x3F, 0x60, 0x7B, 0x7D)
        + (0x2F, 0x3A, 0x3B, 0x3D, 0x40, 0x5B, 0x5C, 0x5D, 0x5E, 0x7C)
    ]
)
# Note... The terminology 'userinfo' percent-encode set in the WHATWG document
# is used for the username and password quoting. For the joint userinfo component
# we remove U+003A (:) from the safe set.
USERINFO_SAFE = "".join(
    [
        chr(i)
        for i in range(0x20, 0x7F)
        if i
        not in (0x20, 0x22, 0x23, 0x3C, 0x3E)
        + (0x3F, 0x60, 0x7B, 0x7D)
        + (0x2F, 0x3B, 0x3D, 0x40, 0x5B, 0x5C, 0x5D, 0x5E, 0x7C)
    ]
)


# {scheme}:      (optional)
# //{authority}  (optional)
# {path}
# ?{query}       (optional)
# #{fragment}    (optional)
URL_REGEX = re.compile(
    (
        r"(?:(?P<scheme>{scheme}):)?"
        r"(?://(?P<authority>{authority}))?"
        r"(?P<path>{path})"
        r"(?:\?(?P<query>{query}))?"
        r"(?:#(?P<fragment>{fragment}))?"
    ).format(
        scheme="([a-zA-Z][a-zA-Z0-9+.-]*)?",
        authority="[^/?#]*",
        path="[^?#]*",
        query="[^#]*",
        fragment=".*",
    )
)

# {userinfo}@    (optional)
# {host}
# :{port}        (optional)
AUTHORITY_REGEX = re.compile(
    (
        r"(?:(?P<userinfo>{userinfo})@)?" r"(?P<host>{host})" r":?(?P<port>{port})?"
    ).format(
        userinfo=".*",  # Any character sequence.
        host="(\\[.*\\]|[^:@]*)",  # Either any character sequence excluding ':' or '@',
        # or an IPv6 address enclosed within square brackets.
        port=".*",  # Any character sequence.
    )
)


# If we call urlparse with an individual component, then we need to regex
# validate that component individually.
# Note that we're duplicating the same strings as above. Shock! Horror!!
COMPONENT_REGEX = {
    "scheme": re.compile("([a-zA-Z][a-zA-Z0-9+.-]*)?"),
    "authority": re.compile("[^/?#]*"),
    "path": re.compile("[^?#]*"),
    "query": re.compile("[^#]*"),
    "fragment": re.compile(".*"),
    "userinfo": re.compile("[^@]*"),
    "host": re.compile("(\\[.*\\]|[^:]*)"),
    "port": re.compile(".*"),
}


# We use these simple regexs as a first pass before handing off to
# the stdlib 'ipaddress' module for IP address validation.
IPv4_STYLE_HOSTNAME = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$")
IPv6_STYLE_HOSTNAME = re.compile(r"^\[.*\]$")


class ParseResult(typing.NamedTuple):
    scheme: str
    userinfo: str
    host: str
    port: int | None
    path: str
    query: str | None
    fragment: str | None

    @property
    def authority(self) -> str:
        return "".join(
            [
                f"{self.userinfo}@" if self.userinfo else "",
                f"[{self.host}]" if ":" in self.host else self.host,
                f":{self.port}" if self.port is not None else "",
            ]
        )

    @property
    def netloc(self) -> str:
        return "".join(
            [
                f"[{self.host}]" if ":" in self.host else self.host,
                f":{self.port}" if self.port is not None else "",
            ]
        )

    def copy_with(self, **kwargs: str | None) -> ParseResult:
        if not kwargs:
            return self

        defaults = {
            "scheme": self.scheme,
            "authority": self.authority,
            "path": self.path,
            "query": self.query,
            "fragment": self.fragment,
        }
        defaults.update(kwargs)
        return urlparse("", **defaults)

    def __str__(self) -> str:
        authority = self.authority
        return "".join(
            [
                f"{self.scheme}:" if self.scheme else "",
                f"//{authority}" if authority else "",
                self.path,
                f"?{self.query}" if self.query is not None else "",
                f"#{self.fragment}" if self.fragment is not None else "",
            ]
        )


def urlparse(url: str = "", **kwargs: str | None) -> ParseResult:
    # Initial basic checks on allowable URLs.
    # ---------------------------------------

    # Hard limit the maximum allowable URL length.
    if len(url) > MAX_URL_LENGTH:
        raise InvalidURL("URL too long")

    # If a URL includes any ASCII control characters including \t, \r, \n,
    # then treat it as invalid.
    if any(char.isascii() and not char.isprintable() for char in url):
        char = next(char for char in url if char.isascii() and not char.isprintable())
        idx = url.find(char)
        error = (
            f"Invalid non-printable ASCII character in URL, {char!r} at position {idx}."
        )
        raise InvalidURL(error)

    # Some keyword arguments require special handling.
    # ------------------------------------------------

    # Coerce "port" to a string, if it is provided as an integer.
    if "port" in kwargs:
        port = kwargs["port"]
        kwargs["port"] = str(port) if isinstance(port, int) else port

    # Replace "netloc" with "host and "port".
    if "netloc" in kwargs:
        netloc = kwargs.pop("netloc") or ""
        kwargs["host"], _, kwargs["port"] = netloc.partition(":")

    # Replace "username" and/or "password" with "userinfo".
    if "username" in kwargs or "password" in kwargs:
        username = quote(kwargs.pop("username", "") or "", safe=USERNAME_SAFE)
        password = quote(kwargs.pop("password", "") or "", safe=PASSWORD_SAFE)
        kwargs["userinfo"] = f"{username}:{password}" if password else username

    # Replace "raw_path" with "path" and "query".
    if "raw_path" in kwargs:
        raw_path = kwargs.pop("raw_path") or ""
        kwargs["path"], seperator, kwargs["query"] = raw_path.partition("?")
        if not seperator:
            kwargs["query"] = None

    # Ensure that IPv6 "host" addresses are always escaped with "[...]".
    if "host" in kwargs:
        host = kwargs.get("host") or ""
        if ":" in host and not (host.startswith("[") and host.endswith("]")):
            kwargs["host"] = f"[{host}]"

    # If any keyword arguments are provided, ensure they are valid.
    # -------------------------------------------------------------

    for key, value in kwargs.items():
        if value is not None:
            if len(value) > MAX_URL_LENGTH:
                raise InvalidURL(f"URL component '{key}' too long")

            # If a component includes any ASCII control characters including \t, \r, \n,
            # then treat it as invalid.
            if any(char.isascii() and not char.isprintable() for char in value):
                char = next(
                    char for char in value if char.isascii() and not char.isprintable()
                )
                idx = value.find(char)
                error = (
                    f"Invalid non-printable ASCII character in URL {key} component, "
                    f"{char!r} at position {idx}."
                )
                raise InvalidURL(error)

            # Ensure that keyword arguments match as a valid regex.
            if not COMPONENT_REGEX[key].fullmatch(value):
                raise InvalidURL(f"Invalid URL component '{key}'")

    # The URL_REGEX will always match, but may have empty components.
    url_match = URL_REGEX.match(url)
    assert url_match is not None
    url_dict = url_match.groupdict()

    # * 'scheme', 'authority', and 'path' may be empty strings.
    # * 'query' may be 'None', indicating no trailing "?" portion.
    #   Any string including the empty string, indicates a trailing "?".
    # * 'fragment' may be 'None', indicating no trailing "#" portion.
    #   Any string including the empty string, indicates a trailing "#".
    scheme = kwargs.get("scheme", url_dict["scheme"]) or ""
    authority = kwargs.get("authority", url_dict["authority"]) or ""
    path = kwargs.get("path", url_dict["path"]) or ""
    query = kwargs.get("query", url_dict["query"])
    frag = kwargs.get("fragment", url_dict["fragment"])

    # The AUTHORITY_REGEX will always match, but may have empty components.
    authority_match = AUTHORITY_REGEX.match(authority)
    assert authority_match is not None
    authority_dict = authority_match.groupdict()

    # * 'userinfo' and 'host' may be empty strings.
    # * 'port' may be 'None'.
    userinfo = kwargs.get("userinfo", authority_dict["userinfo"]) or ""
    host = kwargs.get("host", authority_dict["host"]) or ""
    port = kwargs.get("port", authority_dict["port"])

    # Normalize and validate each component.
    # We end up with a parsed representation of the URL,
    # with components that are plain ASCII bytestrings.
    parsed_scheme: str = scheme.lower()
    parsed_userinfo: str = quote(userinfo, safe=USERINFO_SAFE)
    parsed_host: str = encode_host(host)
    parsed_port: int | None = normalize_port(port, scheme)

    has_scheme = parsed_scheme != ""
    has_authority = (
        parsed_userinfo != "" or parsed_host != "" or parsed_port is not None
    )
    validate_path(path, has_scheme=has_scheme, has_authority=has_authority)
    if has_scheme or has_authority:
        path = normalize_path(path)

    parsed_path: str = quote(path, safe=PATH_SAFE)
    parsed_query: str | None = None if query is None else quote(query, safe=QUERY_SAFE)
    parsed_frag: str | None = None if frag is None else quote(frag, safe=FRAG_SAFE)

    # The parsed ASCII bytestrings are our canonical form.
    # All properties of the URL are derived from these.
    return ParseResult(
        parsed_scheme,
        parsed_userinfo,
        parsed_host,
        parsed_port,
        parsed_path,
        parsed_query,
        parsed_frag,
    )


def encode_host(host: str) -> str:
    if not host:
        return ""

    elif IPv4_STYLE_HOSTNAME.match(host):
        # Validate IPv4 hostnames like #.#.#.#
        #
        # From https://datatracker.ietf.org/doc/html/rfc3986/#section-3.2.2
        #
        # IPv4address = dec-octet "." dec-octet "." dec-octet "." dec-octet
        try:
            ipaddress.IPv4Address(host)
        except ipaddress.AddressValueError:
            raise InvalidURL(f"Invalid IPv4 address: {host!r}")
        return host

    elif IPv6_STYLE_HOSTNAME.match(host):
        # Validate IPv6 hostnames like [...]
        #
        # From https://datatracker.ietf.org/doc/html/rfc3986/#section-3.2.2
        #
        # "A host identified by an Internet Protocol literal address, version 6
        # [RFC3513] or later, is distinguished by enclosing the IP literal
        # within square brackets ("[" and "]").  This is the only place where
        # square bracket characters are allowed in the URI syntax."
        try:
            ipaddress.IPv6Address(host[1:-1])
        except ipaddress.AddressValueError:
            raise InvalidURL(f"Invalid IPv6 address: {host!r}")
        return host[1:-1]

    elif host.isascii():
        # Regular ASCII hostnames
        #
        # From https://datatracker.ietf.org/doc/html/rfc3986/#section-3.2.2
        #
        # reg-name    = *( unreserved / pct-encoded / sub-delims )
        WHATWG_SAFE = '"`{}%|\\'
        return quote(host.lower(), safe=SUB_DELIMS + WHATWG_SAFE)

    # IDNA hostnames
    try:
        return idna.encode(host.lower()).decode("ascii")
    except idna.IDNAError:
        raise InvalidURL(f"Invalid IDNA hostname: {host!r}")


def normalize_port(port: str | int | None, scheme: str) -> int | None:
    # From https://tools.ietf.org/html/rfc3986#section-3.2.3
    #
    # "A scheme may define a default port.  For example, the "http" scheme
    # defines a default port of "80", corresponding to its reserved TCP
    # port number.  The type of port designated by the port number (e.g.,
    # TCP, UDP, SCTP) is defined by the URI scheme.  URI producers and
    # normalizers should omit the port component and its ":" delimiter if
    # port is empty or if its value would be the same as that of the
    # scheme's default."
    if port is None or port == "":
        return None

    try:
        port_as_int = int(port)
    except ValueError:
        raise InvalidURL(f"Invalid port: {port!r}")

    # See https://url.spec.whatwg.org/#url-miscellaneous
    default_port = {"ftp": 21, "http": 80, "https": 443, "ws": 80, "wss": 443}.get(
        scheme
    )
    if port_as_int == default_port:
        return None
    return port_as_int


def validate_path(path: str, has_scheme: bool, has_authority: bool) -> None:
    """
    Path validation rules that depend on if the URL contains
    a scheme or authority component.

    See https://datatracker.ietf.org/doc/html/rfc3986.html#section-3.3
    """
    if has_authority:
        # If a URI contains an authority component, then the path component
        # must either be empty or begin with a slash ("/") character."
        if path and not path.startswith("/"):
            raise InvalidURL("For absolute URLs, path must be empty or begin with '/'")

    if not has_scheme and not has_authority:
        # If a URI does not contain an authority component, then the path cannot begin
        # with two slash characters ("//").
        if path.startswith("//"):
            raise InvalidURL("Relative URLs cannot have a path starting with '//'")

        # In addition, a URI reference (Section 4.1) may be a relative-path reference,
        # in which case the first path segment cannot contain a colon (":") character.
        if path.startswith(":"):
            raise InvalidURL("Relative URLs cannot have a path starting with ':'")


def normalize_path(path: str) -> str:
    """
    Drop "." and ".." segments from a URL path.

    For example:

        normalize_path("/path/./to/somewhere/..") == "/path/to"
    """
    # Fast return when no '.' characters in the path.
    if "." not in path:
        return path

    components = path.split("/")

    # Fast return when no '.' or '..' components in the path.
    if "." not in components and ".." not in components:
        return path

    # https://datatracker.ietf.org/doc/html/rfc3986#section-5.2.4
    output: list[str] = []
    for component in components:
        if component == ".":
            pass
        elif component == "..":
            if output and output != [""]:
                output.pop()
        else:
            output.append(component)
    return "/".join(output)


def PERCENT(string: str) -> str:
    return "".join([f"%{byte:02X}" for byte in string.encode("utf-8")])


def percent_encoded(string: str, safe: str) -> str:
    """
    Use percent-encoding to quote a string.
    """
    NON_ESCAPED_CHARS = UNRESERVED_CHARACTERS + safe

    # Fast path for strings that don't need escaping.
    if not string.rstrip(NON_ESCAPED_CHARS):
        return string

    return "".join(
        [char if char in NON_ESCAPED_CHARS else PERCENT(char) for char in string]
    )


def quote(string: str, safe: str) -> str:
    """
    Use percent-encoding to quote a string, omitting existing '%xx' escape sequences.

    See: https://www.rfc-editor.org/rfc/rfc3986#section-2.1

    * `string`: The string to be percent-escaped.
    * `safe`: A string containing characters that may be treated as safe, and do not
        need to be escaped. Unreserved characters are always treated as safe.
        See: https://www.rfc-editor.org/rfc/rfc3986#section-2.3
    """
    parts = []
    current_position = 0
    for match in re.finditer(PERCENT_ENCODED_REGEX, string):
        start_position, end_position = match.start(), match.end()
        matched_text = match.group(0)
        # Add any text up to the '%xx' escape sequence.
        if start_position != current_position:
            leading_text = string[current_position:start_position]
            parts.append(percent_encoded(leading_text, safe=safe))

        # Add the '%xx' escape sequence.
        parts.append(matched_text)
        current_position = end_position

    # Add any text after the final '%xx' escape sequence.
    if current_position != len(string):
        trailing_text = string[current_position:]
        parts.append(percent_encoded(trailing_text, safe=safe))

    return "".join(parts)
