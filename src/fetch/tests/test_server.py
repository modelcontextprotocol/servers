"""Tests for the fetch MCP server."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    DEFAULT_USER_AGENT_AUTONOMOUS,
    _compute_retry_delay_seconds,
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
        """Test that a 500 response raises McpError once retries are exhausted."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.headers = {}

        with patch("httpx.AsyncClient") as mock_client_class, patch(
            "mcp_server_fetch.server.asyncio.sleep", new=AsyncMock()
        ):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/error",
                    DEFAULT_USER_AGENT_AUTONOMOUS
                )

            # Default max_retries=3: the initial attempt plus 2 retries
            assert mock_client.get.call_count == 3

    @pytest.mark.asyncio
    async def test_fetch_404_does_not_retry(self):
        """Test that a non-retryable status like 404 fails on the first attempt."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client_class, patch(
            "mcp_server_fetch.server.asyncio.sleep", new=AsyncMock()
        ) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/notfound",
                    DEFAULT_USER_AGENT_AUTONOMOUS
                )

            assert mock_client.get.call_count == 1
            mock_sleep.assert_not_called()

    @pytest.mark.asyncio
    async def test_fetch_retries_then_succeeds(self):
        """Test that a transient 503 is retried and a subsequent success is returned."""
        error_response = MagicMock()
        error_response.status_code = 503
        error_response.headers = {}

        success_response = MagicMock()
        success_response.status_code = 200
        success_response.text = '{"data": "ok"}'
        success_response.headers = {"content-type": "application/json"}

        with patch("httpx.AsyncClient") as mock_client_class, patch(
            "mcp_server_fetch.server.asyncio.sleep", new=AsyncMock()
        ) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=[error_response, success_response])
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, _ = await fetch_url(
                "https://example.com/flaky",
                DEFAULT_USER_AGENT_AUTONOMOUS
            )

            assert content == '{"data": "ok"}'
            assert mock_client.get.call_count == 2
            mock_sleep.assert_awaited_once_with(1.0)

    @pytest.mark.asyncio
    async def test_fetch_respects_retry_after_header(self):
        """Test that a numeric Retry-After header on a 429 overrides the backoff delay."""
        rate_limited_response = MagicMock()
        rate_limited_response.status_code = 429
        rate_limited_response.headers = {"retry-after": "7"}

        success_response = MagicMock()
        success_response.status_code = 200
        success_response.text = "ok"
        success_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class, patch(
            "mcp_server_fetch.server.asyncio.sleep", new=AsyncMock()
        ) as mock_sleep:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=[rate_limited_response, success_response])
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url("https://example.com/limited", DEFAULT_USER_AGENT_AUTONOMOUS)

            mock_sleep.assert_awaited_once_with(7.0)

    @pytest.mark.asyncio
    async def test_fetch_network_error_retries(self):
        """Test that a network-level HTTPError is retried like a transient status code."""
        from httpx import HTTPError

        success_response = MagicMock()
        success_response.status_code = 200
        success_response.text = "ok"
        success_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class, patch(
            "mcp_server_fetch.server.asyncio.sleep", new=AsyncMock()
        ):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=[HTTPError("boom"), success_response])
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, _ = await fetch_url("https://example.com/flaky", DEFAULT_USER_AGENT_AUTONOMOUS)

            assert content == "ok"
            assert mock_client.get.call_count == 2

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


class TestComputeRetryDelaySeconds:
    """Tests for _compute_retry_delay_seconds function."""

    def test_exponential_backoff(self):
        """Test that the delay doubles with each attempt."""
        assert _compute_retry_delay_seconds(0, 1000) == 1.0
        assert _compute_retry_delay_seconds(1, 1000) == 2.0
        assert _compute_retry_delay_seconds(2, 1000) == 4.0

    def test_caps_at_max_delay(self):
        """Test that backoff is capped at MAX_RETRY_DELAY_MS."""
        assert _compute_retry_delay_seconds(10, 1000) == 10.0

    def test_numeric_retry_after_overrides_backoff(self):
        """Test that a numeric Retry-After header takes precedence over backoff."""
        assert _compute_retry_delay_seconds(0, 1000, retry_after_header="5") == 5.0

    def test_retry_after_capped_at_max_delay(self):
        """Test that an oversized Retry-After is still capped."""
        assert _compute_retry_delay_seconds(0, 1000, retry_after_header="9999") == 10.0

    def test_non_numeric_retry_after_falls_back_to_backoff(self):
        """Test that an HTTP-date Retry-After (unsupported) falls back to backoff."""
        assert _compute_retry_delay_seconds(
            1, 1000, retry_after_header="Wed, 21 Oct 2026 07:28:00 GMT"
        ) == 2.0
