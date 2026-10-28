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

# Markdown heading markers, emphasis, escapes, Sphinx's "¶" permalink and any
# other punctuation are ignored when comparing a heading with the title.
_NOT_WORD = re.compile(r"[\W_]+")


def _normalized(text: str) -> str:
    return _NOT_WORD.sub("", text).casefold()


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
    line, wanted = _normalized(first), _normalized(title)
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
    return f"# {title}\n\n{content.lstrip()}"
