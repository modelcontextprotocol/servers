"""Tests for the fetch MCP server."""

import ipaddress
import socket

import httpx
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    _get_with_validation,
    _is_blocked_ip,
    _validate_url,
    DEFAULT_USER_AGENT_AUTONOMOUS,
)


@pytest.fixture(autouse=True)
def _resolve_hosts_to_public_ip(monkeypatch):
    """Resolve every hostname to a single public IP so tests stay hermetic.

    The SSRF validation performs real hostname resolution; pinning the resolver
    to a public address lets each URL pass ``_validate_url`` without touching
    the network, while still exercising the real code path.
    """

    def fake_getaddrinfo(host, port):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0))]

    monkeypatch.setattr("socket.getaddrinfo", fake_getaddrinfo)


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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            # Should not raise
            await check_may_autonomously_fetch_url(
                "https://example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS
            )

    @pytest.mark.asyncio
    async def test_blocks_when_robots_txt_401(self):
        """Test that fetching is blocked when robots.txt returns 401."""
        mock_response = MagicMock()
        mock_response.status_code = 401

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await check_may_autonomously_fetch_url(
                    "https://example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS
                )

    @pytest.mark.asyncio
    async def test_blocks_when_robots_txt_403(self):
        """Test that fetching is blocked when robots.txt returns 403."""
        mock_response = MagicMock()
        mock_response.status_code = 403

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await check_may_autonomously_fetch_url(
                    "https://example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS
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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            # Should not raise
            await check_may_autonomously_fetch_url(
                "https://example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS
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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await check_may_autonomously_fetch_url(
                    "https://example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS
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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, prefix = await fetch_url(
                "https://example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS
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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, prefix = await fetch_url(
                "https://example.com/page",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                force_raw=True,
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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, prefix = await fetch_url(
                "https://api.example.com/data", DEFAULT_USER_AGENT_AUTONOMOUS
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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/notfound", DEFAULT_USER_AGENT_AUTONOMOUS
                )

    @pytest.mark.asyncio
    async def test_fetch_500_raises_error(self):
        """Test that 500 response raises McpError."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/error", DEFAULT_USER_AGENT_AUTONOMOUS
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
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                proxy_url="http://proxy.example.com:8080",
            )

            # Verify AsyncClient was called with proxy
            mock_client_class.assert_called_once_with(
                proxy="http://proxy.example.com:8080"
            )


class TestIsBlockedIp:
    """Unit tests for the blocked-address matcher."""

    @pytest.mark.parametrize(
        "ip_str",
        [
            "127.0.0.1",  # loopback
            "0.0.0.0",  # this network
            "10.0.0.1",  # RFC1918
            "172.16.0.1",  # RFC1918
            "192.168.1.5",  # RFC1918
            "169.254.169.254",  # link-local / cloud metadata
            "100.64.0.1",  # CGNAT
            "198.18.0.1",  # benchmarking
            "224.0.0.1",  # multicast
            "::1",  # IPv6 loopback
            "fc00::1",  # IPv6 unique-local
            "fe80::1",  # IPv6 link-local
            "::ffff:127.0.0.1",  # IPv4-mapped loopback
        ],
    )
    def test_blocked(self, ip_str):
        assert _is_blocked_ip(ipaddress.ip_address(ip_str)) is True

    @pytest.mark.parametrize("ip_str", ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    def test_public_allowed(self, ip_str):
        assert _is_blocked_ip(ipaddress.ip_address(ip_str)) is False


class TestValidateUrl:
    """Tests for SSRF / scheme validation of target URLs."""

    @pytest.mark.parametrize(
        "url",
        [
            "file:///etc/passwd",
            "ftp://example.com/file",
            "data:text/plain,hello",
            "gopher://example.com/",
        ],
    )
    def test_non_http_scheme_rejected(self, url):
        with pytest.raises(McpError):
            _validate_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "https://127.0.0.1/",
            "http://10.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "https://192.168.1.5/",
            "http://[::1]/",
            "http://[fc00::1]/",
            "http://[fe80::1]/",
            "http://[::ffff:127.0.0.1]/",
        ],
    )
    def test_literal_private_ip_rejected(self, url):
        with pytest.raises(McpError):
            _validate_url(url)

    @pytest.mark.parametrize(
        "url",
        ["http://8.8.8.8/", "https://example.com/", "http://[2606:4700:4700::1111]/"],
    )
    def test_public_url_accepted(self, url):
        # Hostname arms rely on the autouse fixture resolving to 8.8.8.8 (public).
        _validate_url(url)  # should not raise

    def test_hostname_resolving_to_private_is_rejected(self, monkeypatch):
        def fake_getaddrinfo(host, port):
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 0)),
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0)),
            ]

        monkeypatch.setattr("socket.getaddrinfo", fake_getaddrinfo)
        # Fail-closed: a host that maps to *any* blocked address is rejected,
        # even when a second A record points at a public IP.
        with pytest.raises(McpError):
            _validate_url("https://metadata.internal/latest/meta-data/")


class _StubAsyncClient:
    """Async client that yields a pre-scripted sequence of httpx responses."""

    def __init__(self, responses):
        self.responses = list(responses)

    async def get(self, *args, **kwargs):
        return self.responses.pop(0)


class TestRedirectValidation:
    """Redirect handling must validate every hop, not just the first URL."""

    @pytest.mark.asyncio
    async def test_redirect_into_private_network_is_blocked(self):
        redirect = httpx.Response(
            302, headers={"location": "http://169.254.169.254/latest/meta-data/"}
        )
        client = _StubAsyncClient([redirect])
        # First hop (example.com -> public) is fine, but following the 302 into
        # the metadata endpoint must be rejected before the request is issued.
        with pytest.raises(McpError):
            await _get_with_validation(client, "https://example.com/start", {})

    @pytest.mark.asyncio
    async def test_redirect_to_public_url_is_followed(self):
        redirect = httpx.Response(
            302, headers={"location": "https://example.com/final"}
        )
        ok = httpx.Response(
            200, request=httpx.Request("GET", "https://example.com/final")
        )
        client = _StubAsyncClient([redirect, ok])
        response = await _get_with_validation(client, "https://example.com/start", {})
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_redirect_to_non_http_scheme_is_blocked(self):
        redirect = httpx.Response(302, headers={"location": "file:///etc/passwd"})
        client = _StubAsyncClient([redirect])
        with pytest.raises(McpError):
            await _get_with_validation(client, "https://example.com/start", {})
