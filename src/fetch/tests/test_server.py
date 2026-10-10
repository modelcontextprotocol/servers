"""Unit tests for the pure helpers in server.py.

Behavior a client can observe is tested through the protocol in
test_protocol.py.
"""

import os

import httpx
import pytest

from mcp_server_fetch.server import (
    PROXY_ENV_VARS,
    extract_content_from_html,
    get_robots_txt_url,
    normalize_proxy_env,
    normalize_proxy_url,
)


class TestGetRobotsTxtUrl:
    """Tests for get_robots_txt_url function."""

    def test_simple_url(self):
        """Test with a simple URL."""
        result = get_robots_txt_url("https://example.com/page")
        assert result == "https://example.com/robots.txt"

    def test_url_with_path(self):
        """Test with URL containing path."""
        result = get_robots_txt_url("https://example.com/some/deep/path/page.html")
        assert result == "https://example.com/robots.txt"

    def test_url_with_query_params(self):
        """Test with URL containing query parameters."""
        result = get_robots_txt_url("https://example.com/page?foo=bar&baz=qux")
        assert result == "https://example.com/robots.txt"

    def test_url_with_port(self):
        """Test with URL containing port number."""
        result = get_robots_txt_url("https://example.com:8080/page")
        assert result == "https://example.com:8080/robots.txt"

    def test_url_with_fragment(self):
        """Test with URL containing fragment."""
        result = get_robots_txt_url("https://example.com/page#section")
        assert result == "https://example.com/robots.txt"

    def test_http_url(self):
        """Test with HTTP URL."""
        result = get_robots_txt_url("http://example.com/page")
        assert result == "http://example.com/robots.txt"


class TestExtractContentFromHtml:
    """Tests for extract_content_from_html function."""

    def test_simple_html(self):
        """Test with simple HTML content."""
        html = """
        <html>
        <head><title>Test Page</title></head>
        <body>
            <article>
                <h1>Hello World</h1>
                <p>This is a test paragraph.</p>
            </article>
        </body>
        </html>
        """
        result = extract_content_from_html(html)
        # readabilipy may extract different parts depending on the content
        assert "test paragraph" in result

    def test_html_with_links(self):
        """Test that links are converted to markdown."""
        html = """
        <html>
        <body>
            <article>
                <p>Visit <a href="https://example.com">Example</a> for more.</p>
            </article>
        </body>
        </html>
        """
        result = extract_content_from_html(html)
        assert "Example" in result

    @pytest.mark.usefixtures("node_readability")
    def test_empty_content_returns_error(self):
        """Test that empty/invalid HTML returns error message."""
        html = ""
        result = extract_content_from_html(html)
        assert "<error>" in result


class TestNormalizeProxyUrl:
    """Tests for normalize_proxy_url and normalize_proxy_env (#767)."""

    @pytest.mark.parametrize(
        ("given", "expected"),
        [
            ("socks://127.0.0.1:2080/", "socks5://127.0.0.1:2080/"),
            ("SOCKS://127.0.0.1:2080", "socks5://127.0.0.1:2080"),
            ("socks5://127.0.0.1:2080", "socks5://127.0.0.1:2080"),
            ("http://proxy.example.com:8080", "http://proxy.example.com:8080"),
            ("ftp://proxy.example.com", "ftp://proxy.example.com"),
        ],
    )
    def test_only_the_socks_alias_is_rewritten(self, given, expected):
        assert normalize_proxy_url(given) == expected

    def test_environment_socks_alias_is_rewritten(self, monkeypatch):
        for name in PROXY_ENV_VARS:
            monkeypatch.delenv(name, raising=False)
        monkeypatch.setenv("ALL_PROXY", "socks://127.0.0.1:2080/")
        monkeypatch.setenv("https_proxy", "http://proxy.example.com:8080")
        normalize_proxy_env()
        assert os.environ["ALL_PROXY"] == "socks5://127.0.0.1:2080/"
        assert os.environ["https_proxy"] == "http://proxy.example.com:8080"
        assert "HTTP_PROXY" not in os.environ

    def test_normalized_socks_environment_builds_a_client(self, monkeypatch):
        # #767 and #1401 together: httpx rejects socks:// outright, and a
        # socks5:// proxy needs socksio, which httpx[socks] now installs.
        for name in PROXY_ENV_VARS:
            monkeypatch.delenv(name, raising=False)
        monkeypatch.setenv("ALL_PROXY", "socks://127.0.0.1:2080/")
        with pytest.raises(ValueError, match="Unknown scheme for proxy URL"):
            httpx.AsyncClient()
        normalize_proxy_env()
        httpx.AsyncClient()
        httpx.AsyncClient(proxy="socks5://127.0.0.1:2080/")
