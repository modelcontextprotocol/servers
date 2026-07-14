"""Tests for the fetch MCP server."""

import asyncio

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    _validate_url_is_safe,
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

    @pytest.fixture(autouse=True)
    def _skip_ssrf_guard(self):
        """These tests exercise robots.txt handling, not the SSRF guard, and
        mock the HTTP client, so stub host validation to avoid real DNS."""
        with patch("mcp_server_fetch.server._validate_url_is_safe", new=AsyncMock()):
            yield

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

    @pytest.fixture(autouse=True)
    def _skip_ssrf_guard(self):
        """These tests exercise fetch/content handling, not the SSRF guard, and
        mock the HTTP client, so stub host validation to avoid real DNS."""
        with patch("mcp_server_fetch.server._validate_url_is_safe", new=AsyncMock()):
            yield

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


class TestValidateUrlIsSafe:
    """Tests for the SSRF guard (_validate_url_is_safe).

    These use IP literals so no DNS resolution (and no network) is required.
    """

    @pytest.mark.asyncio
    async def test_blocks_loopback_ipv4(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("http://127.0.0.1/")

    @pytest.mark.asyncio
    async def test_blocks_cloud_metadata_address(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("http://169.254.169.254/latest/meta-data/")

    @pytest.mark.asyncio
    async def test_blocks_private_ranges(self):
        for host in ("10.0.0.1", "192.168.1.1", "172.16.0.1"):
            with pytest.raises(McpError):
                await _validate_url_is_safe(f"http://{host}/")

    @pytest.mark.asyncio
    async def test_blocks_unspecified_address(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("http://0.0.0.0/")

    @pytest.mark.asyncio
    async def test_blocks_carrier_grade_nat(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("http://100.64.0.1/")

    @pytest.mark.asyncio
    async def test_blocks_ipv4_compatible_ipv6_loopback(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("http://[::127.0.0.1]/")

    @pytest.mark.asyncio
    async def test_blocks_ipv6_loopback(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("http://[::1]/")

    @pytest.mark.asyncio
    async def test_blocks_ipv4_mapped_ipv6_loopback(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("http://[::ffff:127.0.0.1]/")

    @pytest.mark.asyncio
    async def test_blocks_non_http_scheme(self):
        with pytest.raises(McpError):
            await _validate_url_is_safe("file:///etc/passwd")

    @pytest.mark.asyncio
    async def test_allows_public_ip_literal(self):
        # Public IP literal: should not raise (no DNS needed).
        await _validate_url_is_safe("https://1.1.1.1/")

    @pytest.mark.asyncio
    async def test_blocked_url_rejected_by_fetch_url(self):
        """The guard is enforced end-to-end through fetch_url by default."""
        with pytest.raises(McpError):
            await fetch_url(
                "http://169.254.169.254/latest/meta-data/",
                DEFAULT_USER_AGENT_AUTONOMOUS,
            )

    @pytest.mark.asyncio
    async def test_allow_internal_ips_bypasses_guard(self):
        """With allow_internal_ips=True the guard is skipped (no McpError from
        validation); the request proceeds to the mocked client."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "internal"
        mock_response.headers = {"content-type": "text/plain"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, _ = await fetch_url(
                "http://127.0.0.1/secret",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                allow_internal_ips=True,
            )
            assert content == "internal"

    @pytest.mark.asyncio
    async def test_blocks_redirect_from_public_to_internal_ip(self):
        """A public URL that redirects to an internal/metadata IP is rejected
        at the redirect hop, before the internal host is ever fetched."""
        redirect_response = MagicMock()
        redirect_response.status_code = 302
        redirect_response.headers = {
            "location": "http://169.254.169.254/latest/meta-data/"
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=redirect_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "http://1.1.1.1/redirect",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                )

            # Only the initial public URL should have been requested; the
            # internal redirect target must be blocked before any fetch.
            assert mock_client.get.await_count == 1
            assert mock_client.get.await_args_list[0].args[0] == "http://1.1.1.1/redirect"

    @pytest.mark.asyncio
    async def test_strips_ipv6_zone_id_and_blocks_link_local(self):
        """A resolved IPv6 address carrying a zone id (fe80::1%eth0) must have
        the zone stripped and still be classified as link-local (blocked),
        not silently skipped."""
        loop = asyncio.get_running_loop()
        fake = [(0, 0, 0, "", ("fe80::1%eth0", 80, 0, 3))]
        with patch.object(loop, "getaddrinfo", new=AsyncMock(return_value=fake)):
            with pytest.raises(McpError):
                await _validate_url_is_safe("http://router.local/")

    @pytest.mark.asyncio
    async def test_fails_closed_when_no_resolved_ip_parses(self):
        """If resolution yields no address we can parse, fail closed rather than
        fall through to an empty (allow-all) IP check."""
        loop = asyncio.get_running_loop()
        fake = [(0, 0, 0, "", ("not-an-ip-at-all", 80, 0, 0))]
        with patch.object(loop, "getaddrinfo", new=AsyncMock(return_value=fake)):
            with pytest.raises(McpError):
                await _validate_url_is_safe("http://weird.example/")
