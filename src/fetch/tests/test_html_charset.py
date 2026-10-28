"""Protocol-level tests for decoding a page by the charset its HTML declares (#5199).

httpx decodes a body by the Content-Type header's charset and falls back to
UTF-8 without one, so a legacy-encoded page that names its charset only in a
``<meta charset>`` or ``<meta http-equiv="Content-Type">`` tag came back
garbled. ``decode_page`` now scans the head of an HTML (or untyped) body for
that declaration when the header names none. These tests drive the real
server through an MCP client with HTTP served by ``harness.FakeWeb``, and pin
both the fix and its edges: the header and a byte order mark still win, a
declaration on a non-HTML body or past the first 1024 bytes is ignored, and an
unknown or unusable declared charset falls back to the old decoding.

Most cases fetch with ``raw: true`` so the decoded text reaches the client
untouched by HTML extraction; one case goes through extraction to show the
Markdown is right too.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from mcp import ClientSession
from mcp.types import CallToolResult

from .harness import FakeWeb, connect

PAGE = "https://example.com/page"
ROBOTS = "https://example.com/robots.txt"

JAPANESE = "日本語のページです"
RUSSIAN = "Привет, мир"
KOREAN = "안녕하세요 세계"
CHINESE = "你好，世界"


def text_of(result: CallToolResult) -> str:
    assert not result.is_error, result
    data = result.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert len(data["content"]) == 1
    return data["content"][0]["text"]


def page(body: bytes, content_type: str | None = "text/html") -> httpx.Response:
    headers = {} if content_type is None else {"content-type": content_type}
    return httpx.Response(200, content=body, headers=headers)


async def fetch(web: FakeWeb, response: httpx.Response, **arguments: Any) -> str:
    web.add(ROBOTS, httpx.Response(404))
    web.add(PAGE, response)
    async with connect() as (session, _):
        assert isinstance(session, ClientSession)
        result = await session.call_tool("fetch", {"url": PAGE, **arguments})
    return text_of(result)


def document(meta: str, text: str) -> str:
    return f"<html><head>{meta}<title>t</title></head><body><p>{text}</p></body></html>"


@pytest.mark.parametrize(
    ("meta", "encoding", "text"),
    [
        ('<meta charset="Shift_JIS">', "shift_jis", JAPANESE),
        ("<meta charset=windows-1251>", "cp1251", RUSSIAN),
        ("<META CHARSET='euc-kr'>", "euc_kr", KOREAN),
        ('<meta charset="GBK" />', "gbk", CHINESE),
        (
            '<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">',
            "shift_jis",
            JAPANESE,
        ),
        (
            "<meta http-equiv='content-type' content='text/html;charset=windows-1251'>",
            "cp1251",
            RUSSIAN,
        ),
    ],
)
async def test_a_charset_declared_only_in_the_html_is_honored(
    web: FakeWeb, meta: str, encoding: str, text: str
) -> None:
    body = document(meta, text).encode(encoding)
    assert text in await fetch(web, page(body), raw=True)


async def test_a_declared_charset_is_honored_without_a_content_type_header(
    web: FakeWeb,
) -> None:
    body = document('<meta charset="Shift_JIS">', JAPANESE).encode("shift_jis")
    assert JAPANESE in await fetch(web, page(body, content_type=None), raw=True)


async def test_xhtml_content_type_is_scanned(web: FakeWeb) -> None:
    body = document('<meta charset="windows-1251">', RUSSIAN).encode("cp1251")
    response = page(body, content_type="application/xhtml+xml")
    assert RUSSIAN in await fetch(web, response, raw=True)


@pytest.mark.usefixtures("node_readability")
async def test_the_extracted_markdown_is_decoded_too(web: FakeWeb) -> None:
    body = document('<meta charset="Shift_JIS">', JAPANESE).encode("shift_jis")
    assert JAPANESE in await fetch(web, page(body))


async def test_a_header_charset_wins_over_the_html_declaration(web: FakeWeb) -> None:
    # The page lies in its meta tag; the header is right, and wins.
    body = document('<meta charset="Shift_JIS">', RUSSIAN).encode("cp1251")
    response = page(body, content_type="text/html; charset=windows-1251")
    assert RUSSIAN in await fetch(web, response, raw=True)


async def test_a_byte_order_mark_wins_over_the_html_declaration(
    web: FakeWeb,
) -> None:
    body = b"\xef\xbb\xbf" + document('<meta charset="Shift_JIS">', JAPANESE).encode(
        "utf-8"
    )
    assert JAPANESE in await fetch(web, page(body), raw=True)


async def test_a_declaration_on_a_non_html_body_is_ignored(web: FakeWeb) -> None:
    # A text/plain body is UTF-8 by default; a meta-like string in it is text.
    body = document('<meta charset="windows-1251">', JAPANESE).encode("utf-8")
    assert JAPANESE in await fetch(web, page(body, content_type="text/plain"))


async def test_a_text_plain_type_with_an_html_parameter_is_not_scanned(
    web: FakeWeb,
) -> None:
    # #5302 review: only the media type counts, not "html" in a parameter.
    body = document('<meta charset="windows-1251">', JAPANESE).encode("utf-8")
    response = page(body, content_type='text/plain; name="page.html"')
    assert JAPANESE in await fetch(web, response, raw=True)


@pytest.mark.parametrize(
    "head",
    [
        # #5302 review: a commented-out tag declares nothing.
        '<!-- <meta charset="windows-1251"> --><meta charset="utf-8">',
        "<!-- <meta charset=windows-1251> -->",
        # Nor does an attribute that only contains the word.
        '<meta data-charset="windows-1251" charset="utf-8">',
        '<meta data-charset="windows-1251">',
        # A content attribute counts only under http-equiv="Content-Type".
        '<meta name="description" content="text/html; charset=windows-1251">',
        '<meta http-equiv="refresh" content="5; charset=windows-1251">',
        # An empty declaration, and one with no charset in it.
        '<meta charset="">',
        '<meta http-equiv="Content-Type" content="text/html">',
        # A declaration Python refuses outright.
        '<meta charset="utf\x008">',
        # The first declaration wins.
        '<meta charset="utf-8"><meta charset="windows-1251">',
    ],
)
async def test_text_that_is_not_a_declaration_leaves_utf8_alone(
    web: FakeWeb, head: str
) -> None:
    body = document(head, JAPANESE).encode("utf-8")
    assert JAPANESE in await fetch(web, page(body), raw=True)


async def test_a_declaration_after_other_tags_and_comments_is_found(
    web: FakeWeb,
) -> None:
    head = (
        '<!-- <meta charset="utf-8"> --><link rel="icon" href="/i.png">'
        '<meta name="viewport" content="width=device-width"><meta charset=Shift_JIS>'
    )
    body = document(head, JAPANESE).encode("shift_jis")
    assert JAPANESE in await fetch(web, page(body), raw=True)


async def test_a_declaration_past_the_first_1024_bytes_is_ignored(
    web: FakeWeb,
) -> None:
    padding = "<!-- " + "x" * 1100 + " -->"
    body = (
        f"<html><head>{padding}<meta charset=windows-1251></head>"
        f"<body><p>{JAPANESE}</p></body></html>"
    ).encode("utf-8")
    assert JAPANESE in await fetch(web, page(body), raw=True)


async def test_a_page_with_no_declaration_is_decoded_as_utf8(web: FakeWeb) -> None:
    body = document("", JAPANESE).encode("utf-8")
    assert JAPANESE in await fetch(web, page(body), raw=True)


@pytest.mark.parametrize(
    "declared",
    [
        # Unknown to Python.
        "no-such-charset",
        "x-user-defined",
        # Known codecs that are not text encodings, or refuse to decode.
        "base64",
        "rot13",
        "undefined",
        # Text codecs that are not web encodings.
        "unicode_escape",
        "raw_unicode_escape",
        "idna",
        "punycode",
        # #5302 review: encodings that are not ASCII-compatible, so could not
        # have been declared in ASCII. UTF-7 would turn "+AEI-" into "B";
        # the EBCDIC pages would rewrite the markup.
        "utf-7",
        "cp037",
        "cp1140",
        "hz",
    ],
)
async def test_an_unusable_declared_charset_falls_back_to_the_old_decoding(
    web: FakeWeb, declared: str
) -> None:
    marker = JAPANESE + " \\u0041 +AEI-"
    body = document(f'<meta charset="{declared}">', marker).encode("utf-8")
    text = await fetch(web, page(body), raw=True)
    assert f"<p>{marker}</p>" in text


@pytest.mark.parametrize("declared", ["utf-16", "UTF-16LE", "utf-32"])
async def test_a_utf16_or_utf32_declaration_is_read_as_utf8(
    web: FakeWeb, declared: str
) -> None:
    body = document(f'<meta charset="{declared}">', JAPANESE).encode("utf-8")
    assert JAPANESE in await fetch(web, page(body), raw=True)
