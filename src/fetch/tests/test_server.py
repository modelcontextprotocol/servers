import socket
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from mcp.shared.exceptions import McpError
from mcp.types import INVALID_PARAMS

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    check_may_autonomously_fetch_url,
    fetch_url,
    is_private_or_restricted_host,
    _validate_request_host,
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

            # Verify AsyncClient was called with proxy and SSRF event hook
            mock_client_class.assert_called_once_with(
                proxy="http://proxy.example.com:8080",
                event_hooks={"request": [_validate_request_host]},
            )


class TestIsPrivateOrRestrictedHost:
    """Tests for is_private_or_restricted_host helper."""

    def test_localhost_and_loopback(self):
        """Test that localhost and loopback addresses are restricted."""
        assert is_private_or_restricted_host("localhost") is True
        assert is_private_or_restricted_host("LOCALHOST") is True
        assert is_private_or_restricted_host("127.0.0.1") is True
        assert is_private_or_restricted_host("127.0.0.2") is True
        assert is_private_or_restricted_host("0.0.0.0") is True
        assert is_private_or_restricted_host("::1") is True
        assert is_private_or_restricted_host("[::1]") is True

    def test_rfc1918_private_subnets(self):
        """Test that RFC1918 subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are restricted."""
        assert is_private_or_restricted_host("10.0.0.1") is True
        assert is_private_or_restricted_host("10.255.255.255") is True
        assert is_private_or_restricted_host("172.16.0.1") is True
        assert is_private_or_restricted_host("172.31.255.255") is True
        assert is_private_or_restricted_host("192.168.0.1") is True
        assert is_private_or_restricted_host("192.168.1.1") is True

    def test_cloud_metadata_and_link_local(self):
        """Test that cloud metadata addresses and link-local ranges are restricted."""
        # AWS / GCP / Azure metadata & link-local
        assert is_private_or_restricted_host("169.254.169.254") is True
        assert is_private_or_restricted_host("169.254.1.1") is True
        # Alibaba Cloud metadata
        assert is_private_or_restricted_host("100.100.100.100") is True
        # IPv6 link-local
        assert is_private_or_restricted_host("fe80::1") is True
        assert is_private_or_restricted_host("[fe80::1]") is True

    def test_local_tld(self):
        """Test that .local domains are restricted."""
        assert is_private_or_restricted_host("service.local") is True
        assert is_private_or_restricted_host("my-device.local") is True

    def test_public_hosts(self):
        """Test that public domains and IPs are not restricted."""
        assert is_private_or_restricted_host("example.com") is False
        assert is_private_or_restricted_host("8.8.8.8") is False
        assert is_private_or_restricted_host("1.1.1.1") is False

    def test_env_var_allows_private_ips(self, monkeypatch):
        """Test that FETCH_ALLOW_PRIVATE_IPS allows private/localhost access."""
        monkeypatch.setenv("FETCH_ALLOW_PRIVATE_IPS", "1")
        assert is_private_or_restricted_host("127.0.0.1") is False
        assert is_private_or_restricted_host("localhost") is False
        assert is_private_or_restricted_host("169.254.169.254") is False
        assert is_private_or_restricted_host("10.0.0.1") is False

        monkeypatch.setenv("FETCH_ALLOW_PRIVATE_IPS", "true")
        assert is_private_or_restricted_host("127.0.0.1") is False

        monkeypatch.setenv("FETCH_ALLOW_PRIVATE_IPS", "TRUE")
        assert is_private_or_restricted_host("localhost") is False

    def test_dns_resolution_to_private_ip(self):
        """Test that a hostname resolving to a private IP is restricted."""
        mock_addr = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.50", 0))]
        with patch("socket.getaddrinfo", return_value=mock_addr):
            assert is_private_or_restricted_host("internal.corp") is True

    def test_dns_resolution_failure(self):
        """Test that unresolvable hosts return False (httpx will handle failure)."""
        with patch("socket.getaddrinfo", side_effect=socket.gaierror):
            assert is_private_or_restricted_host("nonexistent.domain.invalid") is False

    def test_empty_or_none_host(self):
        """Test that empty or None host is treated as restricted."""
        assert is_private_or_restricted_host(None) is True
        assert is_private_or_restricted_host("") is True


class TestSSRFProtectionInFetchUrl:
    """Tests for SSRF protection in fetch_url."""

    @pytest.mark.asyncio
    async def test_fetch_loopback_ip_raises_mcperror(self):
        """Test that fetching http://127.0.0.1 raises McpError by default."""
        with pytest.raises(McpError) as exc_info:
            await fetch_url("http://127.0.0.1", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS
        assert "Access to private or restricted network address '127.0.0.1' is prohibited" in exc_info.value.error.message

    @pytest.mark.asyncio
    async def test_fetch_localhost_raises_mcperror(self):
        """Test that fetching http://localhost raises McpError by default."""
        with pytest.raises(McpError) as exc_info:
            await fetch_url("http://localhost", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS
        assert "Access to private or restricted network address 'localhost' is prohibited" in exc_info.value.error.message

    @pytest.mark.asyncio
    async def test_fetch_private_ip_raises_mcperror(self):
        """Test that fetching RFC1918 addresses raises McpError."""
        with pytest.raises(McpError) as exc_info:
            await fetch_url("http://10.0.0.1/admin", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS

        with pytest.raises(McpError) as exc_info:
            await fetch_url("http://192.168.1.1/", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS

    @pytest.mark.asyncio
    async def test_fetch_metadata_ip_raises_mcperror(self):
        """Test that fetching cloud metadata addresses raises McpError."""
        with pytest.raises(McpError) as exc_info:
            await fetch_url("http://169.254.169.254/latest/meta-data/", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS

        with pytest.raises(McpError) as exc_info:
            await fetch_url("http://100.100.100.100/latest/meta-data/", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS

    @pytest.mark.asyncio
    async def test_fetch_ipv6_loopback_raises_mcperror(self):
        """Test that fetching IPv6 loopback raises McpError."""
        with pytest.raises(McpError) as exc_info:
            await fetch_url("http://[::1]/", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS

    @pytest.mark.asyncio
    async def test_fetch_allow_private_ips_env_var(self, monkeypatch):
        """Test that FETCH_ALLOW_PRIVATE_IPS=1 allows fetching localhost and private IPs."""
        monkeypatch.setenv("FETCH_ALLOW_PRIVATE_IPS", "1")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "<html><body><article><p>Local Content</p></article></body></html>"
        mock_response.headers = {"content-type": "text/html"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, _ = await fetch_url("http://127.0.0.1/test", DEFAULT_USER_AGENT_AUTONOMOUS)
            assert "Local Content" in content

            content, _ = await fetch_url("http://localhost/test", DEFAULT_USER_AGENT_AUTONOMOUS)
            assert "Local Content" in content

    @pytest.mark.asyncio
    async def test_fetch_public_urls_unaffected(self):
        """Test that public URLs are unaffected by SSRF guards."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "<html><body><article><p>Public Content</p></article></body></html>"
        mock_response.headers = {"content-type": "text/html"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            content, _ = await fetch_url("https://example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS)
            assert "Public Content" in content

    @pytest.mark.asyncio
    async def test_redirect_to_private_ip_blocked(self):
        """Test that a redirect from a public URL to a private IP is blocked."""
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "public.example.com":
                return httpx.Response(302, headers={"Location": "http://127.0.0.1/secret"})
            return httpx.Response(200, text="Secret Content")

        transport = httpx.MockTransport(handler)
        real_async_client = httpx.AsyncClient

        def make_client(**kwargs):
            kwargs.pop("proxy", None)
            return real_async_client(transport=transport, **kwargs)

        with patch("httpx.AsyncClient", side_effect=make_client):
            with pytest.raises(McpError) as exc_info:
                await fetch_url("http://public.example.com", DEFAULT_USER_AGENT_AUTONOMOUS)
            assert exc_info.value.error.code == INVALID_PARAMS
            assert "Access to private or restricted network address '127.0.0.1' is prohibited" in exc_info.value.error.message

    @pytest.mark.asyncio
    async def test_redirect_to_metadata_ip_blocked(self):
        """Test that a redirect from a public URL to a cloud metadata IP is blocked."""
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "public.example.com":
                return httpx.Response(302, headers={"Location": "http://169.254.169.254/latest/meta-data/"})
            return httpx.Response(200, text="Metadata Content")

        transport = httpx.MockTransport(handler)
        real_async_client = httpx.AsyncClient

        def make_client(**kwargs):
            kwargs.pop("proxy", None)
            return real_async_client(transport=transport, **kwargs)

        with patch("httpx.AsyncClient", side_effect=make_client):
            with pytest.raises(McpError) as exc_info:
                await fetch_url("http://public.example.com", DEFAULT_USER_AGENT_AUTONOMOUS)
            assert exc_info.value.error.code == INVALID_PARAMS
            assert "Access to private or restricted network address '169.254.169.254' is prohibited" in exc_info.value.error.message


class TestSSRFProtectionInRobotsTxt:
    """Tests for SSRF protection in check_may_autonomously_fetch_url."""

    @pytest.mark.asyncio
    async def test_check_loopback_ip_raises_mcperror(self):
        """Test that robots.txt check on 127.0.0.1 raises McpError."""
        with pytest.raises(McpError) as exc_info:
            await check_may_autonomously_fetch_url("http://127.0.0.1", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS
        assert "Access to private or restricted network address '127.0.0.1' is prohibited" in exc_info.value.error.message

    @pytest.mark.asyncio
    async def test_check_localhost_raises_mcperror(self):
        """Test that robots.txt check on localhost raises McpError."""
        with pytest.raises(McpError) as exc_info:
            await check_may_autonomously_fetch_url("http://localhost", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS
        assert "Access to private or restricted network address 'localhost' is prohibited" in exc_info.value.error.message

    @pytest.mark.asyncio
    async def test_check_metadata_ip_raises_mcperror(self):
        """Test that robots.txt check on cloud metadata raises McpError."""
        with pytest.raises(McpError) as exc_info:
            await check_may_autonomously_fetch_url("http://169.254.169.254", DEFAULT_USER_AGENT_AUTONOMOUS)
        assert exc_info.value.error.code == INVALID_PARAMS

    @pytest.mark.asyncio
    async def test_check_allow_private_ips_env_var(self, monkeypatch):
        """Test that robots.txt check allows private IPs when FETCH_ALLOW_PRIVATE_IPS=1."""
        monkeypatch.setenv("FETCH_ALLOW_PRIVATE_IPS", "1")
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

            # Should not raise
            await check_may_autonomously_fetch_url("http://127.0.0.1/page", DEFAULT_USER_AGENT_AUTONOMOUS)

    @pytest.mark.asyncio
    async def test_robots_txt_redirect_to_private_ip_blocked(self):
        """Test that robots.txt redirecting to private IP is blocked."""
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "public.example.com":
                return httpx.Response(302, headers={"Location": "http://127.0.0.1/robots.txt"})
            return httpx.Response(200, text="User-agent: *\nAllow: /")

        transport = httpx.MockTransport(handler)
        real_async_client = httpx.AsyncClient

        def make_client(**kwargs):
            kwargs.pop("proxy", None)
            return real_async_client(transport=transport, **kwargs)

        with patch("httpx.AsyncClient", side_effect=make_client):
            with pytest.raises(McpError) as exc_info:
                await check_may_autonomously_fetch_url("http://public.example.com/page", DEFAULT_USER_AGENT_AUTONOMOUS)
            assert exc_info.value.error.code == INVALID_PARAMS
            assert "Access to private or restricted network address '127.0.0.1' is prohibited" in exc_info.value.error.message
