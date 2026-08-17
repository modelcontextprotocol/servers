"""Tests for the fetch MCP server."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError
from pydantic import AnyUrl

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    DEFAULT_USER_AGENT_AUTONOMOUS,
    DEFAULT_TIMEOUT,
    get_default_timeout,
    Fetch,
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

    def test_empty_content_returns_error(self):
        """Test that empty/invalid HTML returns error message."""
        html = ""
        result = extract_content_from_html(html)
        assert "<error>" in result

    def test_ssr_streaming_progressive_fallback(self):
        """Test that SSR/streaming skeleton pages fall back to markdownifying the source HTML directly when readability produces too little content."""
        # Simulate an SSR page with hidden elements and progressive skeleton where readability strips hidden elements
        large_body_content = "\n".join(f"<div class='ssr-content' style='visibility: hidden;'><p>Progressive content chunk {i}: important data</p></div>" for i in range(100))
        html = f"""
        <html>
        <head><title>Next.js SSR Progressive App</title></head>
        <body>
            <div id="__next">
                <div class="skeleton-loader"><p>Loading...</p></div>
                {large_body_content}
            </div>
        </body>
        </html>
        """
        # Readability will return empty or only the small loading shell (< 5% of source HTML)
        result = extract_content_from_html(html)
        assert "<error>" not in result
        assert "Progressive content chunk 0: important data" in result
        assert "Progressive content chunk 99: important data" in result

    def test_readability_returns_none_content_fallback(self):
        """Test that if readabilipy returns None content, fallback to markdownify preserves content."""
        html = "<html><body><section><h1>SSR Single Section</h1><p>Direct section text without article</p></section></body></html>"
        with patch("readabilipy.simple_json.simple_json_from_html_string", return_value={"content": None, "title": "SSR Single Section"}):
            result = extract_content_from_html(html)
            assert "SSR Single Section" in result
            assert "Direct section text without article" in result

    def test_whitespace_only_returns_error(self):
        """Test that whitespace-only HTML returns an error."""
        html = "<html><body>   \n\t  </body></html>"
        result = extract_content_from_html(html)
        assert "<error>Page failed to be simplified from HTML</error>" in result


class TestCheckMayAutonomouslyFetchUrl:
    """Tests for check_may_autonomously_fetch_url function."""

    @pytest.mark.asyncio
    async def test_allows_when_robots_txt_404(self):
        """Test that fetching is allowed when robots.txt returns 404."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            # Should not raise
            await check_may_autonomously_fetch_url(
                "https://example.com/page",
                DEFAULT_USER_AGENT_AUTONOMOUS
            )

    @pytest.mark.asyncio
    async def test_blocks_when_robots_txt_401(self):
        """Test that fetching is blocked when robots.txt returns 401."""
        mock_response = MagicMock()
        mock_response.status_code = 401

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await check_may_autonomously_fetch_url(
                    "https://example.com/page",
                    DEFAULT_USER_AGENT_AUTONOMOUS
                )

    @pytest.mark.asyncio
    async def test_blocks_when_robots_txt_403(self):
        """Test that fetching is blocked when robots.txt returns 403."""
        mock_response = MagicMock()
        mock_response.status_code = 403

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await check_may_autonomously_fetch_url(
                    "https://example.com/page",
                    DEFAULT_USER_AGENT_AUTONOMOUS
                )

    @pytest.mark.asyncio
    async def test_allows_when_robots_txt_allows_all(self):
        """Test that fetching is allowed when robots.txt allows all."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "User-agent: *\nAllow: /"

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            # Should not raise
            await check_may_autonomously_fetch_url(
                "https://example.com/page",
                DEFAULT_USER_AGENT_AUTONOMOUS
            )

    @pytest.mark.asyncio
    async def test_blocks_when_robots_txt_disallows_all(self):
        """Test that fetching is blocked when robots.txt disallows all."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "User-agent: *\nDisallow: /"

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await check_may_autonomously_fetch_url(
                    "https://example.com/page",
                    DEFAULT_USER_AGENT_AUTONOMOUS
                )

    @pytest.mark.asyncio
    async def test_robots_txt_timeout(self):
        """Test that timeout parameter is passed to robots.txt request."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "User-agent: *\nAllow: /"

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await check_may_autonomously_fetch_url(
                "https://example.com/page",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                timeout=12.0,
            )

            mock_client.get.assert_called_once_with(
                "https://example.com/robots.txt",
                follow_redirects=True,
                headers={"User-Agent": DEFAULT_USER_AGENT_AUTONOMOUS},
                timeout=12.0,
            )


class TestFetchUrl:
    """Tests for fetch_url function."""

    @pytest.mark.asyncio
    async def test_fetch_html_page(self):
        """Test fetching an HTML page returns markdown content."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = """
        <html>
        <body>
            <article>
                <h1>Test Page</h1>
                <p>Hello World</p>
            </article>
        </body>
        </html>
        """
        mock_response.headers = {"content-type": "text/html"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, prefix = await fetch_url(
                "https://example.com/page",
                DEFAULT_USER_AGENT_AUTONOMOUS
            )

            # HTML is processed, so we check it returns something
            assert isinstance(content, str)
            assert prefix == ""

    @pytest.mark.asyncio
    async def test_fetch_html_page_raw(self):
        """Test fetching an HTML page with raw=True returns original HTML."""
        html_content = "<html><body><h1>Test</h1></body></html>"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = html_content
        mock_response.headers = {"content-type": "text/html"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, prefix = await fetch_url(
                "https://example.com/page",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                force_raw=True
            )

            assert content == html_content
            assert "cannot be simplified" in prefix

    @pytest.mark.asyncio
    async def test_fetch_json_returns_raw(self):
        """Test fetching JSON content returns raw content."""
        json_content = '{"key": "value"}'
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = json_content
        mock_response.headers = {"content-type": "application/json"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, prefix = await fetch_url(
                "https://api.example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS
            )

            assert content == json_content
            assert "cannot be simplified" in prefix

    @pytest.mark.asyncio
    async def test_fetch_404_raises_error(self):
        """Test that 404 response raises McpError."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/notfound",
                    DEFAULT_USER_AGENT_AUTONOMOUS
                )

    @pytest.mark.asyncio
    async def test_fetch_500_raises_error(self):
        """Test that 500 response raises McpError."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/error",
                    DEFAULT_USER_AGENT_AUTONOMOUS
                )

    @pytest.mark.asyncio
    async def test_fetch_with_proxy(self):
        """Test that proxy URL is passed to client."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = '{"data": "test"}'
        mock_response.headers = {"content-type": "application/json"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                proxy_url="http://proxy.example.com:8080"
            )

            # Verify AsyncClient was called with proxy
            mock_client_class.assert_called_once_with(proxy="http://proxy.example.com:8080")

    @pytest.mark.asyncio
    async def test_fetch_default_timeout(self):
        """Test that default timeout is passed to client.get."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "test"
        mock_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
            )

            mock_client.get.assert_called_once_with(
                "https://example.com/data",
                follow_redirects=True,
                headers={"User-Agent": DEFAULT_USER_AGENT_AUTONOMOUS},
                timeout=30.0,
            )

    @pytest.mark.asyncio
    async def test_fetch_custom_timeout_param(self):
        """Test that custom timeout parameter is passed to client.get."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "test"
        mock_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                timeout=15.5,
            )

            mock_client.get.assert_called_once_with(
                "https://example.com/data",
                follow_redirects=True,
                headers={"User-Agent": DEFAULT_USER_AGENT_AUTONOMOUS},
                timeout=15.5,
            )

    @pytest.mark.asyncio
    async def test_fetch_env_var_timeout(self, monkeypatch):
        """Test that MCP_FETCH_TIMEOUT environment variable is used."""
        monkeypatch.setenv("MCP_FETCH_TIMEOUT", "45.0")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "test"
        mock_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
            )

            mock_client.get.assert_called_once_with(
                "https://example.com/data",
                follow_redirects=True,
                headers={"User-Agent": DEFAULT_USER_AGENT_AUTONOMOUS},
                timeout=45.0,
            )

    @pytest.mark.asyncio
    async def test_fetch_param_overrides_env_timeout(self, monkeypatch):
        """Test that explicit timeout parameter overrides MCP_FETCH_TIMEOUT env var."""
        monkeypatch.setenv("MCP_FETCH_TIMEOUT", "60.0")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "test"
        mock_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                timeout=10.0,
            )

            mock_client.get.assert_called_once_with(
                "https://example.com/data",
                follow_redirects=True,
                headers={"User-Agent": DEFAULT_USER_AGENT_AUTONOMOUS},
                timeout=10.0,
            )


class TestGetDefaultTimeout:
    """Tests for get_default_timeout helper function."""

    def test_default_without_env(self, monkeypatch):
        monkeypatch.delenv("MCP_FETCH_TIMEOUT", raising=False)
        assert DEFAULT_TIMEOUT == 30.0
        assert get_default_timeout() == DEFAULT_TIMEOUT

    def test_valid_float_env(self, monkeypatch):
        monkeypatch.setenv("MCP_FETCH_TIMEOUT", "15.5")
        assert get_default_timeout() == 15.5

    def test_invalid_env_falls_back(self, monkeypatch):
        monkeypatch.setenv("MCP_FETCH_TIMEOUT", "invalid-timeout")
        assert get_default_timeout() == 30.0

    def test_negative_env_falls_back(self, monkeypatch):
        monkeypatch.setenv("MCP_FETCH_TIMEOUT", "-5.0")
        assert get_default_timeout() == 30.0

    def test_zero_env_falls_back(self, monkeypatch):
        monkeypatch.setenv("MCP_FETCH_TIMEOUT", "0")
        assert get_default_timeout() == 30.0


class TestFetchModel:
    """Tests for Fetch pydantic model."""

    def test_fetch_model_defaults(self):
        fetch = Fetch(url=AnyUrl("https://example.com"))
        assert str(fetch.url) == "https://example.com/"
        assert fetch.max_length == 5000
        assert fetch.start_index == 0
        assert fetch.raw is False
        assert fetch.timeout is None

    def test_fetch_model_custom_timeout(self):
        fetch = Fetch(url=AnyUrl("https://example.com"), timeout=12.5)
        assert fetch.timeout == 12.5

    def test_fetch_model_invalid_timeout(self):
        with pytest.raises(Exception):
            Fetch(url=AnyUrl("https://example.com"), timeout=-1.0)

