"""Protocol-level tests for the cap on how much of a response body is read (#5370).

The server used to read a whole body into memory before converting or
truncating anything, so a URL serving a very large or endless body made it
buffer all of it. It now streams the body and stops at ``MAX_RESPONSE_BYTES``:
a page whose Content-Length is over the cap is refused before any of it is
read, a page that streams past the cap is refused once it does, and a
robots.txt is parsed from its first ``MAX_RESPONSE_BYTES``. Redirects are
followed without reading the redirect's body, which httpx would otherwise read
whole. A gzip or deflate body is decoded by the server itself with each
step's output bounded by the room left under the cap, since httpx inflates a
whole network chunk at once (a compression bomb); any other content coding is
refused. These tests drive the real server through an MCP client
(``harness.connect``) with HTTP served by ``harness.FakeWeb``, under a small
cap so a body over it stays cheap; endless bodies count the chunks they hand
out, to show the read stopped.
"""

from __future__ import annotations

import gzip
import zlib
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from mcp.types import CallToolResult

import mcp_server_fetch.server as server_module

from .harness import FakeWeb, connect

PAGE = "https://example.com/page"
ROBOTS = "https://example.com/robots.txt"
TOOL_ERROR = "Error executing tool fetch: "
# Read at import, before the fixture below lowers it for each test.
SHIPPED_CAP = server_module.MAX_RESPONSE_BYTES
CAP = 1000
CHUNK = 300  # Does not divide CAP, so the cap falls inside a chunk.


@pytest.fixture(autouse=True)
def small_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(server_module, "MAX_RESPONSE_BYTES", CAP)


class Body:
    """A streamed body of ``CHUNK``-byte chunks, ``total`` bytes or endless."""

    def __init__(self, total: int | None = None, fill: bytes = b"a") -> None:
        self.total = total
        self.fill = fill
        self.chunks_sent = 0

    async def stream(self) -> AsyncIterator[bytes]:
        left = self.total
        while left is None or left > 0:
            size = CHUNK if left is None else min(CHUNK, left)
            self.chunks_sent += 1
            yield self.fill * size
            if left is not None:
                left -= size


def streamed(body: Body, **headers: str) -> httpx.Response:
    """A response with no Content-Length (chunked), unless one is passed."""
    return httpx.Response(
        200,
        content=body.stream(),
        headers={"content-type": "text/plain", **headers},
    )


def wire(result: CallToolResult) -> dict[str, Any]:
    return result.model_dump(by_alias=True, mode="json", exclude_none=True)


def text_of(result: CallToolResult) -> str:
    return wire(result)["content"][0]["text"]


def too_large(declared: int | None = None) -> str:
    message = (
        f"{TOOL_ERROR}Failed to fetch {PAGE}: the response body is larger than "
        f"the {CAP} byte limit this server reads"
    )
    return message if declared is None else f"{message} (it declares {declared} bytes)"


async def call(**arguments: Any) -> CallToolResult:
    async with connect(ignore_robots_txt=True) as (session, _):
        return await session.call_tool(
            "fetch", {"url": PAGE, "max_length": 999999, **arguments}
        )


def test_the_cap_is_five_mebibytes() -> None:
    # The value the README documents; the fixture above lowers it per test.
    assert SHIPPED_CAP == 5 * 1024 * 1024


async def test_a_body_of_exactly_the_cap_is_returned_whole(web: FakeWeb) -> None:
    web.add(PAGE, streamed(Body(CAP, b"b")))
    result = await call()
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("b" * CAP)


async def test_a_declared_body_of_exactly_the_cap_is_returned_whole(
    web: FakeWeb,
) -> None:
    web.add(
        PAGE,
        httpx.Response(200, content=b"c" * CAP, headers={"content-type": "text/plain"}),
    )
    result = await call()
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("c" * CAP)


async def test_a_body_one_byte_over_the_cap_is_refused(web: FakeWeb) -> None:
    web.add(PAGE, streamed(Body(CAP + 1)))
    result = await call()
    assert wire(result)["isError"] is True
    assert text_of(result) == too_large()


async def test_an_endless_body_stops_being_read_at_the_cap(web: FakeWeb) -> None:
    body = Body()
    web.add(PAGE, streamed(body))
    result = await call()
    assert text_of(result) == too_large()
    # The chunk that crosses the cap is the last one taken.
    assert body.chunks_sent == CAP // CHUNK + 1


async def test_a_declared_length_over_the_cap_is_refused_unread(
    web: FakeWeb,
) -> None:
    body = Body()
    web.add(PAGE, streamed(body, **{"content-length": str(CAP + 1)}))
    result = await call()
    assert text_of(result) == too_large(declared=CAP + 1)
    assert body.chunks_sent == 0


async def test_an_unparsable_content_length_falls_back_to_the_streamed_cap(
    web: FakeWeb,
) -> None:
    body = Body()
    web.add(PAGE, streamed(body, **{"content-length": "lots"}))
    result = await call()
    assert text_of(result) == too_large()


async def test_the_cap_counts_decompressed_bytes(web: FakeWeb) -> None:
    # Far under the cap on the wire, ten times over it once decoded.
    compressed = gzip.compress(b"a" * (CAP * 10))
    assert len(compressed) < CAP
    web.add(
        PAGE,
        httpx.Response(
            200,
            content=compressed,
            headers={"content-type": "text/plain", "content-encoding": "gzip"},
        ),
    )
    result = await call()
    assert text_of(result) == too_large()


async def test_a_redirect_body_is_not_read(web: FakeWeb) -> None:
    # httpx reads a redirect's body whole before following it, so an endless
    # one would never return; the server closes it unread instead.
    body = Body()
    web.add(
        PAGE,
        httpx.Response(
            302,
            content=body.stream(),
            headers={"location": "https://example.com/final"},
        ),
    )
    web.add(
        "https://example.com/final",
        httpx.Response(200, content=b"done", headers={"content-type": "text/plain"}),
    )
    result = await call()
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("done")
    assert body.chunks_sent == 0
    assert web.urls() == [PAGE, "https://example.com/final"]


async def test_a_redirect_loop_is_refused(web: FakeWeb) -> None:
    web.add(PAGE, httpx.Response(302, headers={"location": PAGE}))
    result = await call()
    assert wire(result)["isError"] is True
    assert "TooManyRedirects" in text_of(result)
    # The first request and the 20 redirects httpx allows by default.
    assert len(web.requests) == 21


async def test_the_timeout_reaches_every_redirect_hop(web: FakeWeb) -> None:
    web.add(PAGE, httpx.Response(302, headers={"location": "https://example.com/b"}))
    web.add(
        "https://example.com/b",
        httpx.Response(200, content=b"ok", headers={"content-type": "text/plain"}),
    )
    result = await call(timeout_ms=1234)
    assert wire(result)["isError"] is False
    assert [r.extensions["timeout"]["read"] for r in web.requests] == [1.234, 1.234]


async def test_robots_txt_is_parsed_from_its_first_bytes_up_to_the_cap(
    web: FakeWeb,
) -> None:
    # Rules first, then endless padding: the read stops at the cap and the
    # rules it holds still apply.
    rules = b"User-agent: *\nDisallow: /page\n"
    padding = Body(fill=b"#")

    async def robots() -> AsyncIterator[bytes]:
        yield rules
        async for chunk in padding.stream():
            yield chunk

    web.add(
        ROBOTS,
        httpx.Response(200, content=robots(), headers={"content-type": "text/plain"}),
    )
    async with connect() as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert wire(result)["isError"] is True
    assert "specifies that autonomous fetching of this page is not allowed" in (
        text_of(result)
    )
    assert padding.chunks_sent <= CAP // CHUNK + 1
    assert web.urls() == [ROBOTS]


async def test_the_prompt_reports_an_oversized_page(web: FakeWeb) -> None:
    web.add(PAGE, streamed(Body()))
    async with connect() as (session, _):
        result = await session.get_prompt("fetch", {"url": PAGE})
    message = result.model_dump(mode="json")["messages"][0]["content"]["text"]
    assert message == too_large().removeprefix(TOOL_ERROR)


# --- content codings ----------------------------------------------------------


def encoded(body: bytes, coding: str) -> httpx.Response:
    # Over a stream, not `content=`, which httpx would decode while building it.
    return httpx.Response(
        200,
        stream=httpx.ByteStream(body),
        headers={"content-type": "text/plain", "content-encoding": coding},
    )


def raw_deflate(data: bytes) -> bytes:
    compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
    return compressor.compress(data) + compressor.flush()


async def test_a_compression_bomb_never_decodes_past_the_cap(
    web: FakeWeb, monkeypatch: pytest.MonkeyPatch
) -> None:
    # One small network chunk that inflates to 10,000 times the cap. httpx
    # would inflate it whole before any size check; the server's own decoder
    # must never produce more than the room left plus one byte in a step.
    outputs: list[int] = []
    real = zlib.decompressobj

    class Spy:
        def __init__(self, *args: Any) -> None:
            self._z = real(*args)

        @property
        def unconsumed_tail(self) -> bytes:
            return self._z.unconsumed_tail

        def decompress(self, data: bytes, max_length: int = 0) -> bytes:
            out = self._z.decompress(data, max_length)
            outputs.append(len(out))
            return out

    monkeypatch.setattr(zlib, "decompressobj", Spy)
    bomb = gzip.compress(b"a" * (CAP * 10_000))
    assert len(bomb) < CAP * 50
    web.add(PAGE, encoded(bomb, "gzip"))
    result = await call()
    assert text_of(result) == too_large()
    assert outputs and max(outputs) <= CAP + 1
    assert sum(outputs) <= CAP + 1


@pytest.mark.parametrize(
    ("coding", "encode"),
    [("gzip", gzip.compress), ("deflate", zlib.compress), ("deflate", raw_deflate)],
)
async def test_data_after_the_compressed_stream_is_not_read(
    web: FakeWeb, coding: str, encode: Any
) -> None:
    # A complete compressed body, then endless trailing bytes: zlib would hold
    # every one of them in `unused_data`, which no output cap sees, so the read
    # stops where the compressed stream ends.
    trailing = Body(fill=b"\x00")

    async def stream() -> AsyncIterator[bytes]:
        yield encode(b"t" * 10)
        async for chunk in trailing.stream():
            yield chunk

    web.add(
        PAGE,
        httpx.Response(
            200,
            content=stream(),
            headers={"content-type": "text/plain", "content-encoding": coding},
        ),
    )
    result = await call()
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("t" * 10)
    assert trailing.chunks_sent <= 1


async def test_robots_txt_stops_at_the_end_of_its_compressed_stream(
    web: FakeWeb,
) -> None:
    trailing = Body(fill=b"\x00")

    async def robots() -> AsyncIterator[bytes]:
        yield gzip.compress(b"User-agent: *\nDisallow: /page\n")
        async for chunk in trailing.stream():
            yield chunk

    web.add(
        ROBOTS,
        httpx.Response(
            200,
            content=robots(),
            headers={"content-type": "text/plain", "content-encoding": "gzip"},
        ),
    )
    async with connect() as (session, _):
        result = await session.call_tool("fetch", {"url": PAGE})
    assert "specifies that autonomous fetching of this page is not allowed" in (
        text_of(result)
    )
    assert trailing.chunks_sent <= 1


@pytest.mark.parametrize(
    ("coding", "encode"),
    [
        ("gzip", gzip.compress),
        ("x-gzip", gzip.compress),
        ("GZIP", gzip.compress),
        ("identity, gzip", gzip.compress),
        ("deflate", zlib.compress),
        ("deflate", raw_deflate),  # sent without zlib's wrapper
    ],
)
async def test_a_gzip_or_deflate_body_is_decoded(
    web: FakeWeb, coding: str, encode: Any
) -> None:
    web.add(PAGE, encoded(encode(b"d" * CAP), coding))
    result = await call()
    assert wire(result)["isError"] is False
    assert text_of(result).endswith("d" * CAP)


async def test_an_identity_coding_is_read_as_is(web: FakeWeb) -> None:
    web.add(PAGE, encoded(b"plain", "identity"))
    result = await call()
    assert text_of(result).endswith("plain")


@pytest.mark.parametrize("coding", ["br", "zstd", "gzip, gzip", "compress"])
async def test_a_coding_the_server_cannot_bound_is_refused(
    web: FakeWeb, coding: str
) -> None:
    web.add(PAGE, encoded(b"\x00\x01\x02", coding))
    result = await call()
    assert wire(result)["isError"] is True
    assert "Unsupported content encoding" in text_of(result)
    assert "this server decodes only gzip, deflate" in text_of(result)


@pytest.mark.parametrize("coding", ["gzip", "deflate"])
async def test_a_corrupt_body_is_a_decoding_error(web: FakeWeb, coding: str) -> None:
    # Deflate is retried as raw deflate once, then fails like gzip.
    web.add(PAGE, encoded(b"\xff" * 64, coding))
    result = await call()
    assert wire(result)["isError"] is True
    assert "Error decoding the response body" in text_of(result)


async def test_only_the_codings_it_decodes_are_asked_for(web: FakeWeb) -> None:
    web.add(PAGE, httpx.Response(200, content=b"ok"))
    await call()
    assert web.requests[0].headers["accept-encoding"] == "gzip, deflate"
