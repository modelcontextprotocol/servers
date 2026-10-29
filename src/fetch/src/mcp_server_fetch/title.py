# The page title for the fetch server's simplified (Markdown) result (#2472).
#
# Readability.js removes an article heading that repeats the document title,
# and neither extractor returns the `<title>` itself in the content the server
# converts, so a page such as a Sphinx release note came back without the line
# that says what it is. This module reads the title from the raw HTML and puts
# it at the top of the Markdown as a level-one heading, unless the Markdown
# already opens with it.
#
# It works from the raw page rather than from readabilipy's result, so it is
# independent of how the extractor is invoked and is applied at the one call
# site in `fetch_url` that simplifies HTML. The raw result (`raw: true`) and
# non-HTML bodies never pass through it.

import re

from bs4 import BeautifulSoup, Tag

# The marker `extract_content_from_html` returns when a page simplifies to
# nothing. A title on top of it would make the failure read as content.
_FAILURE_PREFIX = "<error>"

# Titles are compared word by word: case, Markdown heading markers, emphasis,
# escapes, Sphinx's "¶" permalink and other punctuation are ignored, but word
# boundaries are kept, so "Rust" does not match "Trust".
_WORD = re.compile(r"[^\W_]+")
# Characters that Markdown or inline HTML would interpret in the emitted
# heading ("<T>" read as a tag, "__init__" as emphasis, "&lt;" as an entity),
# each escaped with a backslash so the heading shows the title as written.
_MARKDOWN_SPECIAL = re.compile(r"([\\`*_\[\]<>#&|~])")


def _normalized(text: str) -> str:
    """``text`` as its casefolded words, one space apart, padded with spaces.

    The padding makes ``in`` a whole-word, whole-phrase containment test.
    """
    words = _WORD.findall(text.casefold())
    return f" {' '.join(words)} " if words else ""


def _visible(line: str) -> str:
    """The text a reader sees on one Markdown line.

    A link's destination (`](...)`) and an HTML tag (an autolink's URL
    included) are dropped; a code span's contents are kept, tag-like text
    and all. One pass, so a long line with an unterminated `](`, `<` or
    backtick costs linear time: each closer is searched for forward from
    where it is needed, and once a search for one fails it is never repeated.
    """
    out: list[str] = []
    missing: set[str] = set()
    i, end = 0, len(line)
    while i < end:
        for opener, closer, keep in (
            ("`", "`", True),
            ("<", ">", False),
            ("](", ")", False),
        ):
            if closer in missing or not line.startswith(opener, i):
                continue
            j = line.find(closer, i + len(opener))
            if j == -1:
                missing.add(closer)
                continue
            out.append(line[i + len(opener) : j] if keep else " ")
            i = j + 1
            break
        else:
            out.append(line[i])
            i += 1
    return "".join(out)


def _collapsed(text: str) -> str:
    return " ".join(text.split())


def _text(candidate: str) -> str:
    # A trailing "¶" is a permalink that is not marked up as one.
    return _collapsed(candidate).rstrip("¶").strip()


def page_title(html: str) -> str | None:
    """The page's title, or None when the page names none.

    In order: `og:title`; the first `<h1>` when `<title>` holds it, since
    `<title>` then only adds the site's name ("What's new — pandas docs");
    `<title>`; the first `<h1>`.
    """
    soup = BeautifulSoup(html, "html.parser")
    og = soup.find("meta", attrs={"property": "og:title"})
    og_title = _text(str(og.get("content", ""))) if isinstance(og, Tag) else ""
    title = _text(soup.title.get_text(" ")) if soup.title else ""
    h1 = soup.find("h1")
    heading = ""
    if isinstance(h1, Tag):
        # Sphinx appends a permalink anchor ("¶", or "#" in some themes) to
        # each heading; it is not part of the heading's text.
        for link in h1.find_all("a", class_="headerlink"):
            link.decompose()
        heading = _text(h1.get_text(" "))
    heading_in_title = bool(_normalized(heading)) and _normalized(
        heading
    ) in _normalized(title)
    if og_title:
        return og_title
    if heading_in_title:
        return heading
    return title or heading or None


def _opens_with_title(content: str, title: str) -> bool:
    """Whether the Markdown's first non-empty line already carries the title.

    A first line holding the whole title counts (the pure-Python extractor
    opens with the title in a paragraph), and so does a first heading that the
    title holds: `<title>` often adds the site name ("What's new — pandas
    docs") to the page's own heading ("What's new").
    """
    first = next((line for line in content.splitlines() if line.strip()), "")
    line, wanted = _normalized(_visible(first)), _normalized(title)
    if not line or not wanted:
        return False
    if wanted in line:
        return True
    return first.lstrip().startswith("#") and line in wanted


def with_page_title(html: str, content: str) -> str:
    """``content`` with the page's title as a heading on top, if it lacks one."""
    if content.startswith(_FAILURE_PREFIX):
        return content
    title = page_title(html)
    if title is None or _opens_with_title(content, title):
        return content
    heading = _MARKDOWN_SPECIAL.sub(r"\\\1", title)
    return f"# {heading}\n\n{content.lstrip()}"
