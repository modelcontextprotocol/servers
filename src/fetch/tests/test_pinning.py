"""The connection goes to the address the private-address guard checked (#5557).

The guard used to resolve a URL's host, check the addresses, and leave httpx
to resolve the name again when it connected, so a name that answered with a
public address first and a private one second (DNS rebinding) was fetched
from the private address. These tests pin the fix in ``pinning.py``.

Unlike the rest of the suite they use the real ``httpx.AsyncClient``, because
the connection path is what is under test, with three stand-ins:

- ``dns`` replaces the event loop's ``getaddrinfo``, the one lookup both the
  guard and a name-based connect go through, with scripted answers per name
  (an answer per lookup, the last one repeating). It is patched that low so a
  second, unchecked resolution anywhere in the stack would get the "rebound"
  answer and be caught here.
- ``Origin`` is a real HTTP (or HTTPS) server on loopback that records what it
  was asked.
- ``Nat`` stands in for the route to a public address: a connection to
  ``PUBLIC_IP`` lands on loopback, and every address a connection was opened
  to is recorded. Without it a test could only ever prove a refusal.

The HTTPS tests issue their own certificates with ``cryptography``, which the
MCP SDK already depends on; it is not a dependency of this server.
"""

from __future__ import annotations

import asyncio
import datetime
import ipaddress
import socket
import ssl
from collections.abc import AsyncIterator, Iterable, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import httpcore
import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from mcp.types import CallToolResult

import mcp_server_fetch.server as server_module
from mcp_server_fetch import pinning
from mcp_server_fetch.pinning import (
    PinnedBackend,
    PinnedTransport,
    pin_direct_connections,
)

from .harness import PUBLIC_IP, connect

TOOL_ERROR = "Error executing tool fetch: "
RAW_PREFIX = "Content type text/plain cannot be simplified to markdown"


def text_of(result: CallToolResult) -> str:
    assert len(result.content) == 1
    block = result.content[0]
    assert block.type == "text"
    return block.text


# --- stand-ins ---------------------------------------------------------------


@dataclass
class FakeDns:
    """Scripted ``getaddrinfo`` answers: one per lookup, the last repeating."""

    answers: dict[str, list[list[str]]] = field(default_factory=dict)
    lookups: list[str] = field(default_factory=list)

    def answer(self, host: str) -> list[str] | None:
        script = self.answers.get(host)
        if script is None:
            return None
        self.lookups.append(host)
        return script.pop(0) if len(script) > 1 else script[0]


@pytest.fixture
def dns(monkeypatch: pytest.MonkeyPatch) -> FakeDns:
    fake = FakeDns()
    real = asyncio.BaseEventLoop.getaddrinfo

    async def getaddrinfo(
        self: asyncio.BaseEventLoop, host: Any, port: Any, **kwargs: Any
    ) -> Any:
        # anyio hands a name over IDNA-encoded, as bytes.
        name = host.decode("ascii") if isinstance(host, bytes) else host
        addresses = fake.answer(name) if isinstance(name, str) else None
        if addresses is None:
            return await real(self, host, port, **kwargs)
        if not addresses:
            raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")
        return [
            (
                socket.AF_INET6 if ":" in address else socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                (address, port or 0),
            )
            for address in addresses
        ]

    monkeypatch.setattr(asyncio.BaseEventLoop, "getaddrinfo", getaddrinfo)
    return fake


@dataclass
class Origin:
    """A loopback HTTP server: path -> (status, headers, body)."""

    routes: dict[str, tuple[int, dict[str, str], bytes]] = field(default_factory=dict)
    # (request line, headers) of every request received.
    requests: list[tuple[str, dict[str, str]]] = field(default_factory=list)
    # The SNI name of every TLS handshake received.
    sni: list[str | None] = field(default_factory=list)
    port: int = 0

    def lines(self) -> list[str]:
        return [line for line, _ in self.requests]

    async def handle(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            head = (await reader.readuntil(b"\r\n\r\n")).decode("latin-1")
            request_line, *header_lines = head.strip().split("\r\n")
            headers = {
                name.strip().lower(): value.strip()
                for name, _, value in (line.partition(":") for line in header_lines)
            }
            self.requests.append((request_line, headers))
            target = request_line.split(" ")[1]
            status, extra, body = self.routes.get(target, (404, {}, b"not found"))
            response_headers = {
                "Content-Type": "text/plain",
                "Content-Length": str(len(body)),
                "Connection": "close",
                **extra,
            }
            writer.write(
                f"HTTP/1.1 {status} X\r\n".encode()
                + "".join(f"{k}: {v}\r\n" for k, v in response_headers.items()).encode()
                + b"\r\n"
                + body
            )
            await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError):
            # A client that gave up mid-handshake (a refused certificate).
            pass
        finally:
            writer.close()


@asynccontextmanager
async def serving(
    origin: Origin, tls: ssl.SSLContext | None = None
) -> AsyncIterator[Origin]:
    if tls is not None:
        tls.sni_callback = lambda _socket, name, _context: origin.sni.append(name)
    server = await asyncio.start_server(origin.handle, "127.0.0.1", 0, ssl=tls)
    origin.port = server.sockets[0].getsockname()[1]
    try:
        yield origin
    finally:
        server.close()
        await server.wait_closed()


def real_backend() -> httpcore.AsyncNetworkBackend:
    # The cast is the one in pinning.py: a type checker sees httpcore's
    # placeholder declaration of AnyIOBackend.
    return cast(httpcore.AsyncNetworkBackend, httpcore.AnyIOBackend())


class Nat(httpcore.AsyncNetworkBackend):
    """Opens real connections, landing ``PUBLIC_IP`` on loopback, and records them."""

    def __init__(self) -> None:
        self.real = real_backend()
        self.connects: list[str] = []

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        self.connects.append(host)
        return await self.real.connect_tcp(
            "127.0.0.1" if host == PUBLIC_IP else host,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )


@pytest.fixture
def nat(monkeypatch: pytest.MonkeyPatch) -> Nat:
    """Put a `Nat` under every `PinnedBackend` the server builds."""
    backend = Nat()
    monkeypatch.setattr(pinning.httpcore, "AnyIOBackend", lambda: backend)
    return backend


@dataclass
class Certificates:
    """A private CA and server contexts whose certificates it issued."""

    directory: Path
    key: ec.EllipticCurvePrivateKey = field(
        default_factory=lambda: ec.generate_private_key(ec.SECP256R1())
    )

    def __post_init__(self) -> None:
        self.name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test CA")])
        self.certificate = self._issue(
            self.name, self.key.public_key(), ca=True, names=[]
        )
        self.ca_file = self.directory / "ca.pem"
        self.ca_file.write_bytes(
            self.certificate.public_bytes(serialization.Encoding.PEM)
        )

    def _issue(
        self,
        subject: x509.Name,
        public_key: ec.EllipticCurvePublicKey,
        ca: bool,
        names: Sequence[x509.GeneralName],
    ) -> x509.Certificate:
        now = datetime.datetime.now(datetime.UTC)
        builder = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(self.name)
            .public_key(public_key)
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=1))
            .add_extension(x509.BasicConstraints(ca=ca, path_length=None), True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_cert_sign=ca,
                    crl_sign=ca,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                True,
            )
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(public_key), False)
            .add_extension(
                x509.AuthorityKeyIdentifier.from_issuer_public_key(
                    self.key.public_key()
                ),
                False,
            )
        )
        if not ca:
            builder = builder.add_extension(
                x509.SubjectAlternativeName(names), False
            ).add_extension(
                x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), False
            )
        return builder.sign(self.key, hashes.SHA256())

    def server_context(self, *names: x509.GeneralName) -> ssl.SSLContext:
        """A server-side TLS context whose certificate is valid for ``names``."""
        key = ec.generate_private_key(ec.SECP256R1())
        certificate = self._issue(
            x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test server")]),
            key.public_key(),
            ca=False,
            names=names,
        )
        stem = f"server-{certificate.serial_number}"
        cert_file = self.directory / f"{stem}.pem"
        key_file = self.directory / f"{stem}.key"
        cert_file.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
        key_file.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert_file, key_file)
        return context


@pytest.fixture
def certificates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Certificates:
    """A CA the server's HTTP client trusts (httpx reads ``SSL_CERT_FILE``)."""
    issued = Certificates(tmp_path)
    monkeypatch.setenv("SSL_CERT_FILE", str(issued.ca_file))
    return issued


@pytest.fixture(autouse=True)
def no_proxy_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep the machine's own proxy settings out of these real-client tests."""
    for name in (*server_module.PROXY_ENV_VARS, "NO_PROXY", "no_proxy"):
        monkeypatch.delenv(name, raising=False)


# --- DNS rebinding, through the server ---------------------------------------


async def test_rebinding_on_the_requested_url_is_refused(dns: FakeDns) -> None:
    """Public for the guard's lookup, loopback for the next one: never fetched."""
    async with serving(Origin({"/secret": (200, {}, b"internal secret")})) as origin:
        dns.answers["rebind.test"] = [[PUBLIC_IP], ["127.0.0.1"]]
        url = f"http://rebind.test:{origin.port}/secret"
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool("fetch", {"url": url})

    assert result.is_error is True
    assert text_of(result) == (
        f"{TOOL_ERROR}Refused to connect to rebind.test: it resolves to 127.0.0.1, "
        "which is not a public address. Start the server with "
        "--allow-private-ips to allow private, loopback and link-local addresses."
    )
    assert origin.requests == []
    # The request hook's lookup, then the one made (and checked) to connect.
    assert dns.lookups == ["rebind.test", "rebind.test"]


async def test_rebinding_on_a_redirect_hop_is_refused(dns: FakeDns, nat: Nat) -> None:
    async with serving(Origin()) as origin:
        rebound = f"http://rebind.test:{origin.port}/secret"
        origin.routes["/start"] = (302, {"Location": rebound}, b"")
        origin.routes["/secret"] = (200, {}, b"internal secret")
        dns.answers["start.test"] = [[PUBLIC_IP]]
        dns.answers["rebind.test"] = [[PUBLIC_IP], ["127.0.0.1"]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"http://start.test:{origin.port}/start"}
            )

    assert result.is_error is True
    assert "Refused to connect to rebind.test: it resolves to 127.0.0.1" in text_of(
        result
    )
    assert origin.lines() == ["GET /start HTTP/1.1"]
    # Only the first hop's checked address was ever connected to.
    assert nat.connects == [PUBLIC_IP]


async def test_rebinding_during_the_robots_txt_check_is_refused(dns: FakeDns) -> None:
    """The robots.txt request is pinned like the page's."""
    async with serving(Origin({"/robots.txt": (200, {}, b"")})) as origin:
        dns.answers["rebind.test"] = [[PUBLIC_IP], ["127.0.0.1"]]
        async with connect() as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"http://rebind.test:{origin.port}/secret"}
            )

    assert result.is_error is True
    assert "Refused to connect to rebind.test: it resolves to 127.0.0.1" in text_of(
        result
    )
    assert origin.requests == []


async def test_rebinding_is_refused_for_the_prompt_too(dns: FakeDns) -> None:
    async with serving(Origin({"/secret": (200, {}, b"internal secret")})) as origin:
        dns.answers["rebind.test"] = [[PUBLIC_IP], ["127.0.0.1"]]
        async with connect() as (session, _):
            result = await session.get_prompt(
                "fetch", {"url": f"http://rebind.test:{origin.port}/secret"}
            )

    content = result.messages[0].content
    assert content.type == "text"
    assert content.text.startswith("Refused to connect to rebind.test")
    assert origin.requests == []


async def test_a_mixed_answer_at_connect_time_is_refused(dns: FakeDns) -> None:
    """Every address of the connect-time answer is checked, not only the first."""
    async with serving(Origin({"/secret": (200, {}, b"internal secret")})) as origin:
        dns.answers["rebind.test"] = [[PUBLIC_IP], [PUBLIC_IP, "10.0.0.5"]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"http://rebind.test:{origin.port}/secret"}
            )

    assert result.is_error is True
    assert "it resolves to 10.0.0.5" in text_of(result)
    assert origin.requests == []


# --- the connection goes to the checked address, as the hostname --------------


async def test_connects_to_the_checked_address_and_keeps_the_host_header(
    dns: FakeDns, nat: Nat
) -> None:
    async with serving(
        Origin(
            {"/robots.txt": (404, {}, b""), "/page": (200, {}, b"hello from origin")}
        )
    ) as origin:
        dns.answers["pinned.test"] = [[PUBLIC_IP]]
        async with connect() as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"http://pinned.test:{origin.port}/page"}
            )

    assert result.is_error is False
    assert text_of(result).startswith(RAW_PREFIX)
    assert text_of(result).endswith("hello from origin")
    # Two connections (robots.txt, then the page), each to the address that
    # was checked, given as an IP literal: nothing below resolved the name.
    assert nat.connects == [PUBLIC_IP, PUBLIC_IP]
    assert origin.lines() == ["GET /robots.txt HTTP/1.1", "GET /page HTTP/1.1"]
    assert [headers["host"] for _, headers in origin.requests] == [
        f"pinned.test:{origin.port}"
    ] * 2


async def test_a_redirect_hop_is_resolved_checked_and_pinned_on_its_own(
    dns: FakeDns, nat: Nat
) -> None:
    async with serving(Origin()) as origin:
        origin.routes["/start"] = (
            302,
            {"Location": f"http://second.test:{origin.port}/page"},
            b"",
        )
        origin.routes["/page"] = (200, {}, b"second hop")
        dns.answers["first.test"] = [[PUBLIC_IP]]
        dns.answers["second.test"] = [[PUBLIC_IP]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"http://first.test:{origin.port}/start"}
            )

    assert text_of(result).endswith("second hop")
    assert nat.connects == [PUBLIC_IP, PUBLIC_IP]
    assert [headers["host"] for _, headers in origin.requests] == [
        f"first.test:{origin.port}",
        f"second.test:{origin.port}",
    ]
    # Each hop: the hook's lookup, then the checked lookup that connects.
    assert dns.lookups == ["first.test"] * 2 + ["second.test"] * 2


async def test_tls_sends_the_hostname_as_sni_and_verifies_the_certificate_for_it(
    dns: FakeDns, nat: Nat, certificates: Certificates
) -> None:
    """Connected by address, yet the handshake is for the name in the URL."""
    tls = certificates.server_context(x509.DNSName("pinned.test"))
    async with serving(Origin({"/page": (200, {}, b"over tls")}), tls) as origin:
        dns.answers["pinned.test"] = [[PUBLIC_IP]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"https://pinned.test:{origin.port}/page"}
            )

    assert result.is_error is False
    assert text_of(result).endswith("over tls")
    assert nat.connects == [PUBLIC_IP]
    assert origin.sni == ["pinned.test"]
    assert origin.requests[0][1]["host"] == f"pinned.test:{origin.port}"


async def test_tls_refuses_a_certificate_issued_for_another_name(
    dns: FakeDns, nat: Nat, certificates: Certificates
) -> None:
    tls = certificates.server_context(x509.DNSName("pinned.test"))
    async with serving(Origin({"/page": (200, {}, b"over tls")}), tls) as origin:
        dns.answers["other.test"] = [[PUBLIC_IP]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"https://other.test:{origin.port}/page"}
            )

    assert result.is_error is True
    assert "CERTIFICATE_VERIFY_FAILED" in text_of(result)
    assert origin.sni == ["other.test"]
    assert origin.requests == []


async def test_tls_refuses_a_certificate_issued_for_the_address_only(
    dns: FakeDns, nat: Nat, certificates: Certificates
) -> None:
    """The certificate is checked against the hostname, never the pinned address."""
    tls = certificates.server_context(
        x509.IPAddress(ipaddress.ip_address(PUBLIC_IP)),
        x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
    )
    async with serving(Origin({"/page": (200, {}, b"over tls")}), tls) as origin:
        dns.answers["pinned.test"] = [[PUBLIC_IP]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"https://pinned.test:{origin.port}/page"}
            )

    assert result.is_error is True
    assert "CERTIFICATE_VERIFY_FAILED" in text_of(result)
    assert origin.requests == []


# --- what stays as it was ----------------------------------------------------


async def test_allow_private_ips_still_fetches_a_private_address(dns: FakeDns) -> None:
    async with serving(
        Origin({"/robots.txt": (404, {}, b""), "/page": (200, {}, b"local page")})
    ) as origin:
        dns.answers["intranet.test"] = [["127.0.0.1"]]
        async with connect(allow_private_ips=True) as (session, _):
            by_name = await session.call_tool(
                "fetch", {"url": f"http://intranet.test:{origin.port}/page"}
            )
            by_address = await session.call_tool(
                "fetch", {"url": f"http://127.0.0.1:{origin.port}/page"}
            )

    assert text_of(by_name).endswith("local page")
    assert text_of(by_address).endswith("local page")


async def test_a_private_address_is_still_refused_before_connecting(
    dns: FakeDns, nat: Nat
) -> None:
    """The request hook's refusal, naming the URL, is unchanged."""
    dns.answers["intranet.test"] = [["10.0.0.5"]]
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": "http://intranet.test/page"})

    assert text_of(result).startswith(
        f"{TOOL_ERROR}Refused to fetch http://intranet.test/page: "
        "intranet.test resolves to 10.0.0.5"
    )
    assert nat.connects == []


async def test_an_unresolvable_host_is_a_connection_failure(dns: FakeDns) -> None:
    dns.answers["nowhere.test"] = [[]]
    async with connect(ignore_robots_txt=True) as (session, _):
        result = await session.call_tool("fetch", {"url": "http://nowhere.test/page"})

    assert result.is_error is True
    assert text_of(result).startswith(
        f"{TOOL_ERROR}Failed to fetch http://nowhere.test/page: ConnectError("
    )


async def test_a_proxied_request_is_left_to_the_proxy(dns: FakeDns, nat: Nat) -> None:
    """A loopback proxy is reachable, and resolves the destination itself."""
    proxied = "http://only-the-proxy-resolves.test/page"
    async with serving(Origin({proxied: (200, {}, b"via proxy")})) as proxy:
        # Unresolvable here, so the hook cannot check it either (the README
        # says so): the proxy is asked for the name.
        dns.answers["only-the-proxy-resolves.test"] = [[]]
        async with connect(
            ignore_robots_txt=True, proxy_url=f"http://127.0.0.1:{proxy.port}"
        ) as (session, _):
            result = await session.call_tool("fetch", {"url": proxied})

    assert result.is_error is False
    assert text_of(result).endswith("via proxy")
    assert proxy.lines() == [f"GET {proxied} HTTP/1.1"]
    # The pinned backend was never used: the proxy transport made the connection.
    assert nat.connects == []


async def test_a_proxy_from_the_environment_is_still_used(
    dns: FakeDns, nat: Nat, monkeypatch: pytest.MonkeyPatch
) -> None:
    proxied = "http://only-the-proxy-resolves.test/page"
    async with serving(Origin({proxied: (200, {}, b"via env proxy")})) as proxy:
        monkeypatch.setenv("HTTP_PROXY", f"http://127.0.0.1:{proxy.port}")
        dns.answers["only-the-proxy-resolves.test"] = [[]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool("fetch", {"url": proxied})

    assert text_of(result).endswith("via env proxy")
    assert proxy.lines() == [f"GET {proxied} HTTP/1.1"]
    assert nat.connects == []


async def test_a_proxied_request_to_a_private_name_is_still_refused(
    dns: FakeDns,
) -> None:
    """With a proxy, a name that resolves here is checked by the hook, as before."""
    async with serving(Origin()) as proxy:
        dns.answers["intranet.test"] = [["10.0.0.5"]]
        async with connect(
            ignore_robots_txt=True, proxy_url=f"http://127.0.0.1:{proxy.port}"
        ) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": "http://intranet.test/page"}
            )

    assert "intranet.test resolves to 10.0.0.5" in text_of(result)
    assert proxy.requests == []


async def test_a_host_the_environment_exempts_from_the_proxy_is_pinned(
    dns: FakeDns, monkeypatch: pytest.MonkeyPatch
) -> None:
    """NO_PROXY sends the request direct, so rebinding is refused there too."""
    async with serving(Origin({"/secret": (200, {}, b"internal secret")})) as origin:
        monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
        monkeypatch.setenv("NO_PROXY", "rebind.test")
        dns.answers["rebind.test"] = [[PUBLIC_IP], ["127.0.0.1"]]
        async with connect(ignore_robots_txt=True) as (session, _):
            result = await session.call_tool(
                "fetch", {"url": f"http://rebind.test:{origin.port}/secret"}
            )

    assert "Refused to connect to rebind.test: it resolves to 127.0.0.1" in text_of(
        result
    )
    assert origin.requests == []


# --- PinnedBackend on its own ------------------------------------------------


class FakeStream(httpcore.AsyncNetworkStream):
    def __init__(self, address: str) -> None:
        self.address = address
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True


class FakeInner(httpcore.AsyncNetworkBackend):
    """Connects by script: an address fails, hangs, or yields a `FakeStream`."""

    def __init__(self, fail: Sequence[str] = (), hang: Sequence[str] = ()) -> None:
        self.fail = fail
        self.hang = hang
        self.calls: list[tuple[str, int, float | None]] = []
        self.streams: dict[str, FakeStream] = {}
        self.cancelled: list[str] = []
        self.slept: list[float] = []
        self.unix: list[str] = []

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        self.calls.append((host, port, timeout))
        if host in self.fail:
            raise httpcore.ConnectError(f"cannot reach {host}")
        if host in self.hang:
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled.append(host)
                raise
        self.streams[host] = FakeStream(host)
        return self.streams[host]

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        self.unix.append(path)
        return FakeStream(path)

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)


def backend_for(
    addresses: Sequence[str], inner: httpcore.AsyncNetworkBackend
) -> tuple[PinnedBackend, list[tuple[str, list[str]]]]:
    vetted: list[tuple[str, list[str]]] = []

    async def resolve(host: str) -> Sequence[str]:
        return addresses

    def vet(host: str, found: Sequence[str]) -> None:
        vetted.append((host, list(found)))

    return PinnedBackend(resolve, vet, inner), vetted


def address_of(stream: httpcore.AsyncNetworkStream) -> str:
    assert isinstance(stream, FakeStream)
    return stream.address


async def test_backend_vets_every_address_once_and_connects_by_address() -> None:
    inner = FakeInner()
    # getaddrinfo lists an address once per socket type.
    backend, vetted = backend_for(["192.0.2.1", "192.0.2.1", "192.0.2.2"], inner)

    stream = await backend.connect_tcp("name.test", 443)

    assert vetted == [("name.test", ["192.0.2.1", "192.0.2.2"])]
    assert address_of(stream) == "192.0.2.1"
    assert inner.calls == [("192.0.2.1", 443, None)]


async def test_backend_does_not_connect_when_the_vetter_refuses() -> None:
    inner = FakeInner()

    async def resolve(host: str) -> Sequence[str]:
        return ["192.0.2.1"]

    def vet(host: str, found: Sequence[str]) -> None:
        raise PermissionError(f"{host} refused")

    with pytest.raises(PermissionError, match="name.test refused"):
        await PinnedBackend(resolve, vet, inner).connect_tcp("name.test", 80)
    assert inner.calls == []


async def test_backend_reports_an_unresolvable_host_as_a_connect_error() -> None:
    async def resolve(host: str) -> Sequence[str]:
        raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")

    backend = PinnedBackend(resolve, lambda host, found: None, FakeInner())
    with pytest.raises(httpcore.ConnectError, match="Name or service not known"):
        await backend.connect_tcp("name.test", 80)


async def test_backend_bounds_the_lookup_by_the_connect_timeout() -> None:
    async def resolve(host: str) -> Sequence[str]:
        await asyncio.Event().wait()
        return []

    backend = PinnedBackend(resolve, lambda host, found: None, FakeInner())
    with pytest.raises(httpcore.ConnectTimeout, match="Timed out resolving name.test"):
        await backend.connect_tcp("name.test", 80, timeout=0.05)


async def test_backend_takes_the_lookup_out_of_the_time_left_to_connect() -> None:
    inner = FakeInner()

    async def resolve(host: str) -> Sequence[str]:
        await asyncio.sleep(0.1)
        return ["192.0.2.1"]

    backend = PinnedBackend(resolve, lambda host, found: None, inner)
    await backend.connect_tcp("name.test", 80, timeout=30)

    ((_, _, left),) = inner.calls
    assert left is not None and 0 < left < 30


async def test_backend_reports_a_host_with_no_addresses_as_a_connect_error() -> None:
    backend, _ = backend_for([], FakeInner())
    with pytest.raises(httpcore.ConnectError, match="name.test has no addresses"):
        await backend.connect_tcp("name.test", 80)


async def test_backend_falls_back_to_the_next_address_when_one_fails() -> None:
    inner = FakeInner(fail=["192.0.2.1"])
    backend, _ = backend_for(["192.0.2.1", "192.0.2.2"], inner)

    stream = await backend.connect_tcp("name.test", 80)

    assert address_of(stream) == "192.0.2.2"
    assert [host for host, _, _ in inner.calls] == ["192.0.2.1", "192.0.2.2"]


async def test_backend_raises_the_first_failure_when_every_address_fails() -> None:
    inner = FakeInner(fail=["192.0.2.1", "192.0.2.2"])
    backend, _ = backend_for(["192.0.2.1", "192.0.2.2"], inner)

    with pytest.raises(httpcore.ConnectError, match="cannot reach 192.0.2.1"):
        await backend.connect_tcp("name.test", 80)
    assert len(inner.calls) == 2


async def test_backend_tries_the_next_address_beside_one_that_does_not_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Several ticks of Windows' ~16 ms clock, so the second attempt is
    # measurably later than the first.
    monkeypatch.setattr(pinning, "CONNECTION_ATTEMPT_DELAY", 0.1)
    inner = FakeInner(hang=["192.0.2.1"])
    backend, _ = backend_for(["192.0.2.1", "192.0.2.2"], inner)

    stream = await backend.connect_tcp("name.test", 80, timeout=30)

    assert address_of(stream) == "192.0.2.2"
    # The attempt that lost the race is cancelled, not left running.
    assert inner.cancelled == ["192.0.2.1"]
    # Both attempts share the one connect timeout: the later one gets less.
    (_, _, first), (_, _, second) = inner.calls
    assert first is not None and second is not None
    assert 0 < second < first <= 30


async def test_backend_cancels_its_attempts_when_the_caller_gives_up() -> None:
    inner = FakeInner(hang=["192.0.2.1"])
    backend, _ = backend_for(["192.0.2.1"], inner)

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(backend.connect_tcp("name.test", 80), 0.05)
    assert inner.cancelled == ["192.0.2.1"]


class SimultaneousInner(FakeInner):
    """The first address finishes only once the second has, in the same tick."""

    def __init__(self) -> None:
        super().__init__()
        self.second_started = asyncio.Event()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        if host == "192.0.2.1":
            await self.second_started.wait()
        else:
            self.second_started.set()
        return await super().connect_tcp(host, port, timeout)


async def test_backend_closes_a_connection_that_also_won(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(pinning, "CONNECTION_ATTEMPT_DELAY", 0.01)
    inner = SimultaneousInner()
    backend, _ = backend_for(["192.0.2.1", "192.0.2.2"], inner)

    stream = await backend.connect_tcp("name.test", 80)

    assert set(inner.streams) == {"192.0.2.1", "192.0.2.2"}
    spare = [s for s in inner.streams.values() if s is not stream]
    assert [s.closed for s in spare] == [True]
    assert isinstance(stream, FakeStream) and not stream.closed


class StubbornInner(FakeInner):
    """The first address answers a cancellation by connecting anyway."""

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        if host == "192.0.2.1":
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                pass
        return await super().connect_tcp(host, port, timeout)


async def test_backend_closes_a_connection_that_completes_after_losing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(pinning, "CONNECTION_ATTEMPT_DELAY", 0.01)
    inner = StubbornInner()
    backend, _ = backend_for(["192.0.2.1", "192.0.2.2"], inner)

    stream = await backend.connect_tcp("name.test", 80)

    assert address_of(stream) == "192.0.2.2"
    assert inner.streams["192.0.2.1"].closed is True


class SlowLoserInner(FakeInner):
    """The first address takes a while to wind down once it is cancelled."""

    def __init__(self) -> None:
        super().__init__()
        self.winding_down = asyncio.Event()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        if host == "192.0.2.1":
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.winding_down.set()
                await asyncio.sleep(30)
        return await super().connect_tcp(host, port, timeout)


async def test_backend_closes_the_winner_when_cancelled_while_cleaning_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A connection that was won but never handed over is not leaked."""
    monkeypatch.setattr(pinning, "CONNECTION_ATTEMPT_DELAY", 0.01)
    inner = SlowLoserInner()
    backend, _ = backend_for(["192.0.2.1", "192.0.2.2"], inner)

    connecting = asyncio.ensure_future(backend.connect_tcp("name.test", 80))
    # The second address has won; the first is still being torn down.
    await inner.winding_down.wait()
    assert not inner.streams["192.0.2.2"].closed
    connecting.cancel()

    with pytest.raises(asyncio.CancelledError):
        await connecting
    assert inner.streams["192.0.2.2"].closed is True
    assert "192.0.2.1" not in inner.streams


async def test_backend_passes_unix_sockets_and_sleep_through() -> None:
    inner = FakeInner()
    backend, vetted = backend_for(["192.0.2.1"], inner)

    stream = await backend.connect_unix_socket("/tmp/socket")
    await backend.sleep(0.5)

    assert address_of(stream) == "/tmp/socket"
    assert inner.unix == ["/tmp/socket"]
    assert inner.slept == [0.5]
    assert vetted == []


async def test_backend_defaults_to_the_real_network_backend(dns: FakeDns) -> None:
    """With no inner backend given, a real socket is opened to the vetted address."""
    async with serving(Origin()) as origin:

        async def resolve(host: str) -> Sequence[str]:
            return ["127.0.0.1"]

        stream = await PinnedBackend(resolve, lambda host, found: None).connect_tcp(
            "name.test", origin.port, timeout=5
        )
        await stream.aclose()


# --- pin_direct_connections --------------------------------------------------


async def no_addresses(host: str) -> Sequence[str]:
    return []


def accept(host: str, found: Sequence[str]) -> None:
    return None


async def test_pinning_replaces_only_the_direct_transport() -> None:
    async with httpx.AsyncClient(proxy="http://127.0.0.1:9") as client:
        mounts_before = dict(client._mounts)
        pin_direct_connections(client, no_addresses, accept)
        assert isinstance(client._transport, PinnedTransport)
        assert client._mounts == mounts_before
        assert not any(isinstance(t, PinnedTransport) for t in client._mounts.values())


async def test_pinning_refuses_a_client_it_does_not_recognize() -> None:
    """Fail loudly, rather than leave a client unpinned, if httpx changes shape."""
    transport = httpx.MockTransport(lambda request: httpx.Response(200))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(TypeError, match="Cannot pin connections"):
            pin_direct_connections(client, no_addresses, accept)


async def test_make_client_pins_unless_private_addresses_are_allowed() -> None:
    async with server_module.make_client(None) as pinned:
        assert isinstance(pinned._transport, PinnedTransport)
    async with server_module.make_client(None, allow_private_ips=True) as unpinned:
        assert not isinstance(unpinned._transport, PinnedTransport)
