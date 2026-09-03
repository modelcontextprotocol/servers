"""Tests for the fetch MCP server."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    _retry_wait,
    DEFAULT_USER_AGENT_AUTONOMOUS,
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
        """Test that 404 response raises McpError immediately without retry."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.headers = {}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/notfound",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                )

            # 404 is not retryable — should only be called once
            assert mock_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_fetch_500_raises_error(self):
        """Test that 500 response raises McpError (no retries)."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.headers = {}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/error",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    max_retries=0,
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


class TestRetryWait:
    """Tests for _retry_wait helper."""

    def test_respects_retry_after_header(self):
        assert _retry_wait("5", 0) == 5.0

    def test_retry_after_zero(self):
        assert _retry_wait("0", 0) == 0.0

    def test_retry_after_negative_clamped_to_zero(self):
        assert _retry_wait("-1", 0) == 0.0

    def test_invalid_retry_after_falls_back_to_backoff(self):
        # Non-numeric Retry-After falls back to jitter backoff
        result = _retry_wait("Wed, 21 Oct 2015 07:28:00 GMT", 0)
        assert 0.0 <= result <= 1.0

    def test_no_header_uses_exponential_backoff(self):
        result = _retry_wait(None, 2)
        assert 0.0 <= result <= 4.0

    def test_backoff_capped_at_30(self):
        result = _retry_wait(None, 100)
        assert result <= 30.0


class TestRetryBehavior:
    """Tests for retry logic in fetch_url."""

    @pytest.mark.asyncio
    async def test_retries_on_503_then_succeeds(self):
        """503 response is retried; succeeds on the second attempt."""
        error_response = MagicMock()
        error_response.status_code = 503
        error_response.headers = {}

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.text = '{"ok": true}'
        ok_response.headers = {"content-type": "application/json"}

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=[error_response, ok_response])
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, _ = await fetch_url(
                "https://example.com/api",
                DEFAULT_USER_AGENT_AUTONOMOUS,
            )

        assert mock_client.get.call_count == 2
        mock_sleep.assert_called_once()
        assert content == '{"ok": true}'

    @pytest.mark.asyncio
    async def test_retries_on_429_respects_retry_after(self):
        """429 response is retried with the Retry-After delay."""
        rate_limit_response = MagicMock()
        rate_limit_response.status_code = 429
        rate_limit_response.headers = {"Retry-After": "2"}

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.text = "done"
        ok_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=[rate_limit_response, ok_response])
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url("https://example.com/api", DEFAULT_USER_AGENT_AUTONOMOUS)

        mock_sleep.assert_called_once_with(2.0)

    @pytest.mark.asyncio
    async def test_raises_after_exhausting_retries(self):
        """McpError is raised once all retries are exhausted."""
        error_response = MagicMock()
        error_response.status_code = 503
        error_response.headers = {}

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=error_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/api",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    max_retries=2,
                )

        # initial attempt + 2 retries
        assert mock_client.get.call_count == 3

    @pytest.mark.asyncio
    async def test_no_retry_on_404(self):
        """404 is not in the retryable set — should not retry."""
        error_response = MagicMock()
        error_response.status_code = 404
        error_response.headers = {}

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=error_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url("https://example.com/missing", DEFAULT_USER_AGENT_AUTONOMOUS)

        assert mock_client.get.call_count == 1
        mock_sleep.assert_not_called()

    @pytest.mark.asyncio
    async def test_retries_on_transient_network_error(self):
        """TimeoutException is retried; succeeds on the second attempt."""
        import httpx

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.text = "hello"
        ok_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(
                side_effect=[httpx.TimeoutException("timed out"), ok_response]
            )
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, _ = await fetch_url(
                "https://example.com/slow",
                DEFAULT_USER_AGENT_AUTONOMOUS,
            )

        assert mock_client.get.call_count == 2
        assert content == "hello"

    @pytest.mark.asyncio
    async def test_network_error_raises_after_exhausting_retries(self):
        """McpError is raised when network errors exhaust all retries."""
        import httpx

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(
                side_effect=httpx.ConnectError("connection refused")
            )
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/down",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    max_retries=1,
                )

        assert mock_client.get.call_count == 2
