"""Tests for the fetch MCP server."""

import contextlib

import pytest
from anyio import create_task_group
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError
from mcp.shared.memory import create_client_server_memory_streams
from mcp.client.session import ClientSession
from mcp.types import INVALID_PARAMS, TextContent

import mcp_server_fetch.server as server_module
from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    DEFAULT_USER_AGENT_AUTONOMOUS,
)


@contextlib.asynccontextmanager
async def serve_in_memory():
    """Run the fetch server over in-memory streams and yield a connected ClientSession.

    serve() opens stdio_server() internally, so patch it to hand out the
    server side of an in-memory transport instead.
    """
    async with create_client_server_memory_streams() as (client_streams, server_streams):
        client_read, client_write = client_streams

        @contextlib.asynccontextmanager
        async def fake_stdio_server():
            yield server_streams

        with patch.object(server_module, "stdio_server", fake_stdio_server):
            async with create_task_group() as tg:
                tg.start_soon(server_module.serve)
                try:
                    async with ClientSession(client_read, client_write) as session:
                        await session.initialize()
                        yield session
                finally:
                    tg.cancel_scope.cancel()


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


class TestGetPrompt:
    """Tests for the get_prompt handler reached through a real client session."""

    @pytest.mark.asyncio
    async def test_invalid_url_raises_invalid_params(self):
        """An invalid prompt URL must raise McpError with INVALID_PARAMS, not a generic JSON-RPC error."""
        async with serve_in_memory() as session:
            with pytest.raises(McpError) as exc_info:
                await session.get_prompt("fetch", {"url": "http://[::1"})
            assert exc_info.value.error.code == INVALID_PARAMS

    @pytest.mark.asyncio
    async def test_valid_url_returns_fetched_content(self):
        """A valid prompt URL still fetches and returns the page content."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = """
        <html>
        <body>
            <article>
                <h1>Test Page</h1>
                <p>Hello from the prompt</p>
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

            async with serve_in_memory() as session:
                result = await session.get_prompt(
                    "fetch", {"url": "https://example.com/page"}
                )

            assert len(result.messages) == 1
            content = result.messages[0].content
            assert isinstance(content, TextContent)
            assert "Hello from the prompt" in content.text
