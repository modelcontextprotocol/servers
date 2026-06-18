"""Tests for the fetch MCP server."""

import socket
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    assert_url_safe_or_raise,
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
        mock_response.is_redirect = False
        mock_response.text ="User-agent: *\nAllow: /"

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
        mock_response.is_redirect = False
        mock_response.text ="User-agent: *\nDisallow: /"

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
        mock_response.is_redirect = False
        mock_response.text ="""
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
        mock_response.is_redirect = False
        mock_response.text =html_content
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
        mock_response.is_redirect = False
        mock_response.text =json_content
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
        mock_response.is_redirect = False

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
        mock_response.is_redirect = False

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
        mock_response.is_redirect = False
        mock_response.text ='{"data": "test"}'
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


class TestAssertUrlSafe:
    """Tests for the SSRF safety gate."""

    def test_blocks_file_scheme(self):
        """file:// scheme is rejected outright (would otherwise read local files via httpx)."""
        with pytest.raises(McpError, match="disallowed scheme"):
            assert_url_safe_or_raise("file:///etc/passwd", allow_private_networks=False)

    def test_blocks_gopher_scheme(self):
        """gopher:// and similar non-HTTP schemes are rejected."""
        with pytest.raises(McpError, match="disallowed scheme"):
            assert_url_safe_or_raise("gopher://example.com/", allow_private_networks=False)

    def test_blocks_dict_scheme(self):
        """dict:// is rejected — has been used for SSRF against Redis in the past."""
        with pytest.raises(McpError, match="disallowed scheme"):
            assert_url_safe_or_raise("dict://localhost:6379/", allow_private_networks=False)

    def test_blocks_ipv4_loopback_literal(self):
        """http://127.0.0.1 is rejected — covers naive local-service attacks."""
        with pytest.raises(McpError, match="loopback"):
            assert_url_safe_or_raise("http://127.0.0.1/admin", allow_private_networks=False)

    def test_blocks_ipv4_loopback_variant(self):
        """http://127.255.255.254 in the 127/8 range is also rejected."""
        with pytest.raises(McpError, match="loopback"):
            assert_url_safe_or_raise("http://127.255.255.254/", allow_private_networks=False)

    def test_blocks_ipv6_loopback_literal(self):
        """http://[::1] is rejected via the IPv6 path."""
        with pytest.raises(McpError, match="loopback"):
            assert_url_safe_or_raise("http://[::1]/", allow_private_networks=False)

    def test_blocks_aws_metadata_ip(self):
        """http://169.254.169.254 — the AWS EC2 metadata endpoint — is rejected as link-local."""
        with pytest.raises(McpError, match="link-local"):
            assert_url_safe_or_raise(
                "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
                allow_private_networks=False,
            )

    def test_blocks_rfc1918_10(self):
        """RFC1918 10.0.0.0/8 addresses are rejected as private."""
        with pytest.raises(McpError, match="private"):
            assert_url_safe_or_raise("http://10.0.0.5/", allow_private_networks=False)

    def test_blocks_rfc1918_192_168(self):
        """RFC1918 192.168.0.0/16 addresses are rejected as private."""
        with pytest.raises(McpError, match="private"):
            assert_url_safe_or_raise("http://192.168.1.1/", allow_private_networks=False)

    def test_blocks_rfc1918_172_16(self):
        """RFC1918 172.16.0.0/12 addresses are rejected as private."""
        with pytest.raises(McpError, match="private"):
            assert_url_safe_or_raise("http://172.20.0.1/", allow_private_networks=False)

    def test_blocks_unspecified(self):
        """http://0.0.0.0 is rejected as unspecified."""
        with pytest.raises(McpError, match="unspecified"):
            assert_url_safe_or_raise("http://0.0.0.0/", allow_private_networks=False)

    def test_blocks_empty_hostname(self):
        """URLs with empty hostnames (e.g. http:///path) are rejected."""
        with pytest.raises(McpError, match="empty hostname"):
            assert_url_safe_or_raise("http:///path", allow_private_networks=False)

    def test_blocks_hostname_resolving_to_loopback(self):
        """A hostname that resolves to 127.0.0.1 is rejected (covers 'localhost' aliases + DNS-rebinding-style names)."""
        fake_addr_info = [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 0))]
        with patch("socket.getaddrinfo", return_value=fake_addr_info):
            with pytest.raises(McpError, match="loopback"):
                assert_url_safe_or_raise("http://attacker-controlled.example/", allow_private_networks=False)

    def test_blocks_hostname_with_any_blocked_ip(self):
        """If a hostname resolves to multiple IPs and ANY is blocked, the URL is rejected.
        This matters because httpx's connection pool may pick any of them."""
        fake_addr_info = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0)),  # public (example.com)
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("169.254.169.254", 0)),  # cloud-metadata
        ]
        with patch("socket.getaddrinfo", return_value=fake_addr_info):
            with pytest.raises(McpError, match="link-local"):
                assert_url_safe_or_raise("http://dual-stack-attacker.example/", allow_private_networks=False)

    def test_blocks_when_dns_fails(self):
        """If DNS resolution fails the URL is rejected (don't fail open)."""
        with patch("socket.getaddrinfo", side_effect=socket.gaierror("nodename nor servname provided")):
            with pytest.raises(McpError, match="failed to resolve"):
                assert_url_safe_or_raise("http://does-not-resolve.example/", allow_private_networks=False)

    def test_allows_public_hostname(self):
        """A hostname that resolves to a non-blocked public IP passes."""
        fake_addr_info = [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))]
        with patch("socket.getaddrinfo", return_value=fake_addr_info):
            # Should not raise
            assert_url_safe_or_raise("http://example.com/page", allow_private_networks=False)

    def test_allows_https_public_hostname(self):
        """https:// against a public hostname passes."""
        fake_addr_info = [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))]
        with patch("socket.getaddrinfo", return_value=fake_addr_info):
            # Should not raise
            assert_url_safe_or_raise("https://example.com/page", allow_private_networks=False)

    def test_allow_private_networks_opt_in_permits_loopback(self):
        """When --allow-private-networks is set, loopback URLs are permitted."""
        # Should not raise
        assert_url_safe_or_raise("http://127.0.0.1/", allow_private_networks=True)
        assert_url_safe_or_raise("http://169.254.169.254/", allow_private_networks=True)
        assert_url_safe_or_raise("http://192.168.1.1/", allow_private_networks=True)

    def test_allow_private_networks_still_blocks_non_http_schemes(self):
        """Scheme block is unconditional — even --allow-private-networks doesn't unlock file://."""
        with pytest.raises(McpError, match="disallowed scheme"):
            assert_url_safe_or_raise("file:///etc/passwd", allow_private_networks=True)


class TestFetchUrlRedirectRevalidation:
    """Tests that fetch_url manually validates each redirect target so a public→loopback redirect doesn't bypass the SSRF gate."""

    @pytest.mark.asyncio
    async def test_redirect_to_loopback_is_blocked(self):
        """A 302 from a public URL to http://127.0.0.1 must be rejected, not silently followed."""
        redirect_response = MagicMock()
        redirect_response.status_code = 302
        redirect_response.is_redirect = True
        redirect_response.headers = {"location": "http://127.0.0.1/admin"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=redirect_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError, match="loopback"):
                await fetch_url(
                    "https://example.com/redirector",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                )

    @pytest.mark.asyncio
    async def test_redirect_chain_terminates_on_max_hops(self):
        """An infinite redirect loop is bounded by MAX_REDIRECTS rather than running away."""
        # Each redirect points at example.com itself — the safety gate should pass each
        # time (resolves to public IP), but we must stop after MAX_REDIRECTS hops.
        redirect_response = MagicMock()
        redirect_response.status_code = 302
        redirect_response.is_redirect = True
        redirect_response.headers = {"location": "https://example.com/next"}

        fake_addr_info = [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))]
        with patch("socket.getaddrinfo", return_value=fake_addr_info), \
             patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=redirect_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError, match="exceeded.*redirects"):
                await fetch_url(
                    "https://example.com/start",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                )
