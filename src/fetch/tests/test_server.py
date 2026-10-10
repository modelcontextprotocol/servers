"""Tests for the fetch MCP server."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from mcp.shared.exceptions import McpError

from mcp_server_fetch.server import (
    extract_content_from_html,
    get_robots_txt_url,
    is_host_allowed,
    validate_url_allowed,
    check_may_autonomously_fetch_url,
    fetch_url,
    DEFAULT_USER_AGENT_AUTONOMOUS,
    MAX_REDIRECTS,
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

            # Verify AsyncClient was called with proxy
            mock_client_class.assert_called_once_with(proxy="http://proxy.example.com:8080")


def _make_mock_client(*responses):
    """Build a mock httpx.AsyncClient whose get() returns the given responses in order."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=list(responses))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


def _redirect_response(location: str, url: str = "https://example.com/start"):
    mock_response = MagicMock()
    mock_response.status_code = 302
    mock_response.headers = {"location": location}
    mock_response.url = url
    return mock_response


def _text_response(text: str = "hello", content_type: str = "text/plain"):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = text
    mock_response.headers = {"content-type": content_type}
    return mock_response


class TestIsHostAllowed:
    """Tests for is_host_allowed matching rules."""

    def test_no_allowlist_allows_everything(self):
        """Test that a None allowlist permits any host."""
        assert is_host_allowed("anything.example", None) is True
        assert is_host_allowed(None, None) is True

    def test_exact_match(self):
        """Test that an exact entry allows the same host."""
        assert is_host_allowed("example.com", ["example.com"]) is True

    def test_non_listed_host_denied(self):
        """Test that a host absent from the list is denied."""
        assert is_host_allowed("evil.com", ["example.com"]) is False

    def test_case_insensitive(self):
        """Test that matching ignores case on both sides."""
        assert is_host_allowed("ExAmPlE.CoM", ["example.com"]) is True
        assert is_host_allowed("example.com", ["EXAMPLE.COM"]) is True

    def test_trailing_dot_normalized(self):
        """Test that a trailing root-label dot is ignored."""
        assert is_host_allowed("example.com.", ["example.com"]) is True

    def test_subdomain_of_exact_entry_denied(self):
        """Test that an exact entry does not cover subdomains."""
        assert is_host_allowed("api.example.com", ["example.com"]) is False

    def test_wildcard_matches_subdomain(self):
        """Test that a wildcard entry matches a subdomain."""
        assert is_host_allowed("api.example.com", ["*.example.com"]) is True

    def test_wildcard_matches_bare_domain(self):
        """Test that a wildcard entry also matches the bare domain."""
        assert is_host_allowed("example.com", ["*.example.com"]) is True

    def test_wildcard_matches_deep_subdomain(self):
        """Test that a wildcard entry matches multi-level subdomains."""
        assert is_host_allowed("a.b.example.com", ["*.example.com"]) is True

    def test_wildcard_does_not_match_partial_suffix(self):
        """Test that lookalike domains sharing a suffix are denied."""
        assert is_host_allowed("notexample.com", ["*.example.com"]) is False
        assert is_host_allowed("example.com.evil.com", ["*.example.com"]) is False
        assert is_host_allowed("example.com.evil.com", ["example.com"]) is False

    def test_ip_literal_exact_match(self):
        """Test that IP literals match literally."""
        assert is_host_allowed("127.0.0.1", ["127.0.0.1"]) is True
        assert is_host_allowed("127.0.0.1", ["example.com"]) is False

    def test_ipv6_entry_with_or_without_brackets(self):
        """Test that IPv6 entries are accepted in both bracketed and bare form."""
        assert is_host_allowed("::1", ["::1"]) is True
        assert is_host_allowed("::1", ["[::1]"]) is True

    def test_empty_list_denies_everything(self):
        """Test that an empty allowlist denies all hosts."""
        assert is_host_allowed("example.com", []) is False

    def test_multiple_entries(self):
        """Test matching against several entries."""
        allowed = ["example.com", "*.github.com"]
        assert is_host_allowed("example.com", allowed) is True
        assert is_host_allowed("api.github.com", allowed) is True
        assert is_host_allowed("example.org", allowed) is False

    def test_entries_are_stripped(self):
        """Test that whitespace around entries is ignored."""
        assert is_host_allowed("example.com", [" example.com "]) is True

    def test_idn_matches_punycode_form(self):
        """Test that Unicode IDN hosts and punycode entries compare equal both ways."""
        assert is_host_allowed("例え.jp", ["xn--r8jz45g.jp"]) is True
        assert is_host_allowed("xn--r8jz45g.jp", ["例え.jp"]) is True
        assert is_host_allowed("api.例え.jp", ["*.例え.jp"]) is True


class TestValidateUrlAllowed:
    """Tests for validate_url_allowed."""

    def test_no_allowlist_never_raises(self):
        """Test that a None allowlist permits any URL."""
        validate_url_allowed("https://anything.example/page", None)

    def test_allowed_host_passes(self):
        """Test that an allowlisted host passes validation."""
        validate_url_allowed("https://api.example.com/page", ["*.example.com"])

    def test_denied_host_raises(self):
        """Test that a non-allowlisted host raises McpError."""
        with pytest.raises(McpError) as exc_info:
            validate_url_allowed("https://evil.com/page", ["example.com"])
        assert "not allowed" in str(exc_info.value)

    def test_userinfo_does_not_bypass_allowlist(self):
        """Test that https://allowed.com@evil.com/ connects to evil.com and is denied."""
        with pytest.raises(McpError) as exc_info:
            validate_url_allowed("https://example.com@evil.com/page", ["example.com"])
        assert "evil.com" in str(exc_info.value)

    def test_port_is_not_part_of_matching(self):
        """Test that an entry allows the host on any port."""
        validate_url_allowed("https://example.com:8443/page", ["example.com"])

    def test_ipv6_url_validated_without_brackets(self):
        """Test that the host of an IPv6 URL matches a bare IPv6 entry."""
        validate_url_allowed("https://[::1]/page", ["::1"])

    def test_url_without_hostname_raises(self):
        """Test that a URL without a hostname raises McpError."""
        with pytest.raises(McpError):
            validate_url_allowed("file:///etc/passwd", ["example.com"])

    def test_malformed_url_raises_mcp_error(self):
        """Test that malformed URLs (e.g. invalid IPv6 literal) fail closed with McpError."""
        with pytest.raises(McpError):
            validate_url_allowed("https://[example.com]/", ["example.com"])

    def test_url_without_hostname_allowed_when_no_allowlist(self):
        """Test that hostless URLs pass when no allowlist is set."""
        validate_url_allowed("file:///etc/passwd", None)


class TestFetchUrlWithAllowlist:
    """Tests for allowlist enforcement in fetch_url."""

    @pytest.mark.asyncio
    async def test_allowed_host_fetches(self):
        """Test that an allowlisted host is fetched normally."""
        mock_client = _make_mock_client(_text_response('{"ok": true}', "application/json"))
        with patch("httpx.AsyncClient", return_value=mock_client):
            content, _ = await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                allowed_hosts=["example.com"],
            )
        assert content == '{"ok": true}'

    @pytest.mark.asyncio
    async def test_denied_host_raises_before_request(self):
        """Test that a denied host raises before any request is sent."""
        mock_client = _make_mock_client(_text_response())
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError) as exc_info:
                await fetch_url(
                    "https://evil.com/data",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    allowed_hosts=["example.com"],
                )
        assert "not allowed" in str(exc_info.value)
        mock_client.get.assert_not_called()

    @pytest.mark.asyncio
    async def test_wildcard_allowlist_permits_subdomain(self):
        """Test fetching a subdomain allowed via a wildcard entry."""
        mock_client = _make_mock_client(_text_response("sub", "text/plain"))
        with patch("httpx.AsyncClient", return_value=mock_client):
            content, _ = await fetch_url(
                "https://api.example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                allowed_hosts=["*.example.com"],
            )
        assert content == "sub"

    @pytest.mark.asyncio
    async def test_redirect_to_allowed_host_followed(self):
        """Test that a redirect to an allowlisted host is followed."""
        mock_client = _make_mock_client(
            _redirect_response("https://cdn.example.com/final"),
            _text_response("redirected", "text/plain"),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            content, _ = await fetch_url(
                "https://example.com/start",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                allowed_hosts=["*.example.com"],
            )
        assert content == "redirected"
        assert mock_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_redirect_to_denied_host_blocked(self):
        """Test that a redirect to a denied host raises before the second request."""
        mock_client = _make_mock_client(
            _redirect_response("https://evil.com/steal"),
            _text_response(),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError) as exc_info:
                await fetch_url(
                    "https://example.com/start",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    allowed_hosts=["example.com"],
                )
        assert "not allowed" in str(exc_info.value)
        # Only the first request may have gone out
        assert mock_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_redirect_loop_raises(self):
        """Test that an endless redirect loop raises after the redirect limit."""
        mock_client = _make_mock_client(
            *[_redirect_response("https://example.com/loop", url="https://example.com/loop")]
            * (MAX_REDIRECTS + 1),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError) as exc_info:
                await fetch_url(
                    "https://example.com/loop",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    allowed_hosts=["example.com"],
                )
        assert "redirect" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_relative_redirect_resolved(self):
        """Test that a relative Location header is resolved against the hop URL."""
        mock_client = _make_mock_client(
            _redirect_response("/final", url="https://example.com/start"),
            _text_response("relative ok", "text/plain"),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            content, _ = await fetch_url(
                "https://example.com/start",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                allowed_hosts=["example.com"],
            )
        assert content == "relative ok"
        assert mock_client.get.call_args_list[1].args[0] == "https://example.com/final"

    @pytest.mark.asyncio
    async def test_empty_location_redirect_loops_until_limit(self):
        """Test that an empty Location header self-redirects (like httpx) until the limit."""
        mock_client = _make_mock_client(
            *[_redirect_response("", url="https://example.com/start")] * (MAX_REDIRECTS + 1),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError) as exc_info:
                await fetch_url(
                    "https://example.com/start",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                )
        assert "redirect" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_malformed_location_raises_mcp_error(self):
        """Test that an unparseable Location header raises McpError, not a raw exception."""
        mock_client = _make_mock_client(
            _redirect_response("http://[::1", url="https://example.com/start"),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError):
                await fetch_url(
                    "https://example.com/start",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                )

    @pytest.mark.asyncio
    async def test_redirect_without_location_returned_as_final(self):
        """Test that a redirect status without a Location header is returned as-is."""
        response = _text_response("placeholder", "text/plain")
        response.status_code = 302
        mock_client = _make_mock_client(response)
        with patch("httpx.AsyncClient", return_value=mock_client):
            content, _ = await fetch_url(
                "https://example.com/start",
                DEFAULT_USER_AGENT_AUTONOMOUS,
            )
        assert content == "placeholder"
        assert mock_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_no_allowlist_redirect_anywhere_still_works(self):
        """Test that without an allowlist, redirects to any host behave as before."""
        mock_client = _make_mock_client(
            _redirect_response("https://other.example/final"),
            _text_response("free", "text/plain"),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            content, _ = await fetch_url(
                "https://example.com/start",
                DEFAULT_USER_AGENT_AUTONOMOUS,
            )
        assert content == "free"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status_code", [301, 302, 303, 307, 308])
    async def test_all_redirect_statuses_followed_and_validated(self, status_code):
        """Test that every redirect status triggers re-validation of the target."""
        redirect = _redirect_response("https://evil.com/final")
        redirect.status_code = status_code
        mock_client = _make_mock_client(redirect, _text_response())
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError) as exc_info:
                await fetch_url(
                    "https://example.com/start",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    allowed_hosts=["example.com"],
                )
        assert "not allowed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_per_request_timeout_preserved(self):
        """Test that fetch requests keep their 30 second per-request timeout."""
        mock_client = _make_mock_client(_text_response("ok", "text/plain"))
        with patch("httpx.AsyncClient", return_value=mock_client):
            await fetch_url(
                "https://example.com/data",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                allowed_hosts=["example.com"],
            )
        assert mock_client.get.call_args.kwargs["timeout"] == 30


class TestCheckMayAutonomouslyFetchUrlWithAllowlist:
    """Tests for allowlist enforcement in the robots.txt pre-check."""

    @pytest.mark.asyncio
    async def test_denied_host_raises_before_request(self):
        """Test that a denied host raises before the robots.txt request is sent."""
        mock_client = _make_mock_client(_text_response())
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError) as exc_info:
                await check_may_autonomously_fetch_url(
                    "https://evil.com/page",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    allowed_hosts=["example.com"],
                )
        assert "not allowed" in str(exc_info.value)
        mock_client.get.assert_not_called()

    @pytest.mark.asyncio
    async def test_allowed_host_checks_robots(self):
        """Test that an allowlisted host has its robots.txt fetched."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_client = _make_mock_client(mock_response)
        with patch("httpx.AsyncClient", return_value=mock_client):
            # Should not raise
            await check_may_autonomously_fetch_url(
                "https://example.com/page",
                DEFAULT_USER_AGENT_AUTONOMOUS,
                allowed_hosts=["*.example.com"],
            )
        assert mock_client.get.call_args_list[0].args[0] == "https://example.com/robots.txt"

    @pytest.mark.asyncio
    async def test_robots_redirect_to_denied_host_blocked(self):
        """Test that a robots.txt redirect to a denied host is blocked."""
        mock_client = _make_mock_client(
            _redirect_response("https://evil.com/robots.txt", url="https://example.com/robots.txt"),
            _text_response(),
        )
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(McpError) as exc_info:
                await check_may_autonomously_fetch_url(
                    "https://example.com/page",
                    DEFAULT_USER_AGENT_AUTONOMOUS,
                    allowed_hosts=["example.com"],
                )
        assert "not allowed" in str(exc_info.value)
        assert mock_client.get.call_count == 1
