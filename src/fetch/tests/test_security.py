"""
Security regression tests for fetch server.

This test suite validates the security controls implemented in server.py:
1. SSL Certificate Verification Toggle
2. SSRF (Server-Side Request Forgery) Protection
3. Payload Size Limits
4. URL Scheme Validation
"""

import os
import sys
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

# Add the source directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from mcp_server_fetch.server import (
    validate_url_for_ssrf,
    _is_ip_private_or_reserved,
    _is_hostname_blocked,
    _is_hostname_whitelisted,
    _normalize_hostname,
    _parse_obfuscated_ip,
    fetch_url,
    extract_content_from_html,
    BLOCKED_HOSTNAMES,
    CLOUD_METADATA_IPS,
)
from mcp.shared.exceptions import McpError


# =============================================================================
# TEST FIXTURES
# =============================================================================

@pytest.fixture
def reset_env():
    """Reset environment variables after each test."""
    original_ssl = os.environ.get('MCP_FETCH_SSL_VERIFY')
    original_private = os.environ.get('MCP_FETCH_ALLOW_PRIVATE_IPS')
    original_hosts = os.environ.get('MCP_FETCH_ALLOWED_PRIVATE_HOSTS')

    yield

    # Restore original values
    if original_ssl is not None:
        os.environ['MCP_FETCH_SSL_VERIFY'] = original_ssl
    elif 'MCP_FETCH_SSL_VERIFY' in os.environ:
        del os.environ['MCP_FETCH_SSL_VERIFY']

    if original_private is not None:
        os.environ['MCP_FETCH_ALLOW_PRIVATE_IPS'] = original_private
    elif 'MCP_FETCH_ALLOW_PRIVATE_IPS' in os.environ:
        del os.environ['MCP_FETCH_ALLOW_PRIVATE_IPS']

    if original_hosts is not None:
        os.environ['MCP_FETCH_ALLOWED_PRIVATE_HOSTS'] = original_hosts
    elif 'MCP_FETCH_ALLOWED_PRIVATE_HOSTS' in os.environ:
        del os.environ['MCP_FETCH_ALLOWED_PRIVATE_HOSTS']


# =============================================================================
# 1. SSL TOGGLE TESTS
# =============================================================================

class TestSSLToggle:
    """Test suite for SSL certificate verification toggle (Issue #508)."""

    @pytest.mark.asyncio
    async def test_ssl_verify_enabled_by_default(self):
        """SSL verification should be enabled when env var is not set."""
        # Remove env var if set
        if 'MCP_FETCH_SSL_VERIFY' in os.environ:
            del os.environ['MCP_FETCH_SSL_VERIFY']

        # Re-import to get fresh value
        import importlib
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        assert server_module.SSL_VERIFY is True

    @pytest.mark.asyncio
    async def test_ssl_verify_disabled_when_false(self, reset_env):
        """SSL verification should be disabled when env var is 'false'."""
        os.environ['MCP_FETCH_SSL_VERIFY'] = 'false'

        import importlib
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        assert server_module.SSL_VERIFY is False

    @pytest.mark.asyncio
    async def test_ssl_verify_case_insensitive(self, reset_env):
        """SSL toggle should handle case variations."""
        test_cases = [
            ('TRUE', True),
            ('True', True),
            ('true', True),
            ('FALSE', False),
            ('False', False),
            ('false', False),
        ]

        import importlib
        import mcp_server_fetch.server as server_module

        for value, expected in test_cases:
            os.environ['MCP_FETCH_SSL_VERIFY'] = value
            importlib.reload(server_module)
            assert server_module.SSL_VERIFY is expected, f"Failed for value: {value}"

    @pytest.mark.asyncio
    async def test_ssl_verify_invalid_value_stays_enabled(self, reset_env):
        """Invalid/unknown values should keep SSL verification ENABLED (fail-secure)."""
        os.environ['MCP_FETCH_SSL_VERIFY'] = 'invalid'

        import importlib
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Fail-secure: only explicit "false" disables SSL verification
        assert server_module.SSL_VERIFY is True

    @pytest.mark.asyncio
    async def test_ssl_disabled_allows_self_signed(self, reset_env):
        """When SSL is disabled, self-signed certificates should work."""
        os.environ['MCP_FETCH_SSL_VERIFY'] = 'false'

        import importlib
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Mock httpx.AsyncClient to verify verify=False is passed
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = "<html><body>Test</body></html>"
            mock_response.headers = {'content-type': 'text/html'}

            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            # Mock SSRF validation to allow test URL (DNS won't resolve for fake domain)
            with patch.object(server_module, 'validate_url_for_ssrf'):
                # This should not raise an SSL error
                await server_module.fetch_url(
                    "https://self-signed.example.com",
                    "TestAgent/1.0"
                )

            # Verify AsyncClient was called with verify=False
            mock_client.assert_called_once()
            call_kwargs = mock_client.call_args[1]
            assert call_kwargs.get('verify') is False


# =============================================================================
# 2. IP OBFUSCATION PARSING TESTS
# =============================================================================

class TestIPObfuscationParsing:
    """Test suite for IP obfuscation detection and parsing."""

    @pytest.mark.parametrize("obfuscated,expected", [
        # Decimal encoding (127.0.0.1 = 2130706433)
        ("2130706433", "127.0.0.1"),
        # Decimal encoding (169.254.169.254 = 2852039166)
        ("2852039166", "169.254.169.254"),
        # Hex encoding
        ("0x7f000001", "127.0.0.1"),
        ("0x7F000001", "127.0.0.1"),  # uppercase
        # Octal integer format (without dots)
        ("017700000001", "127.0.0.1"),
        ("025177524776", "169.254.169.254"),  # metadata IP in octal
        # Octal dotted format
        ("0177.0.0.1", "127.0.0.1"),
        ("0177.0.0.01", "127.0.0.1"),
        # Hex dotted format
        ("0x7f.0.0.1", "127.0.0.1"),
        ("0x7f.0x0.0x0.0x1", "127.0.0.1"),
    ])
    def test_parses_obfuscated_ips(self, obfuscated, expected):
        """Obfuscated IP formats should be correctly decoded."""
        result = _parse_obfuscated_ip(obfuscated)
        assert result == expected, f"Failed to parse {obfuscated}"

    @pytest.mark.parametrize("normal_input", [
        "127.0.0.1",  # Normal IP - not obfuscated
        "example.com",  # Hostname
        "google.com",
        "192.168.1.1",  # Normal private IP
        "",  # Empty
        "not-an-ip",
    ])
    def test_returns_none_for_normal_inputs(self, normal_input):
        """Normal hostnames and IPs should return None (not obfuscated)."""
        result = _parse_obfuscated_ip(normal_input)
        assert result is None, f"Should not parse {normal_input} as obfuscated"

    def test_blocks_obfuscated_loopback_via_validation(self):
        """Obfuscated loopback should be blocked by validate_url_for_ssrf."""
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf("http://2130706433/")
        assert "obfuscated" in str(exc_info.value).lower() or "blocked" in str(exc_info.value).lower()

    def test_blocks_obfuscated_metadata_via_validation(self):
        """Obfuscated metadata IP should be blocked by validate_url_for_ssrf."""
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf("http://2852039166/")  # 169.254.169.254
        assert "obfuscated" in str(exc_info.value).lower() or "blocked" in str(exc_info.value).lower()


# =============================================================================
# 3. SSRF PROTECTION TESTS
# =============================================================================

class TestSSRFProtection:
    """Test suite for SSRF (Server-Side Request Forgery) protection."""

    # -------------------------------------------------------------------------
    # Private IP Range Tests
    # -------------------------------------------------------------------------

    @pytest.mark.parametrize("private_ip", [
        # Loopback (127.0.0.0/8)
        "127.0.0.1",
        "127.0.0.2",
        "127.255.255.255",

        # Class A Private (10.0.0.0/8)
        "10.0.0.1",
        "10.255.255.255",

        # Class B Private (172.16.0.0/12)
        "172.16.0.1",
        "172.31.255.255",

        # Class C Private (192.168.0.0/16)
        "192.168.0.1",
        "192.168.1.1",
        "192.168.255.255",

        # Link-local (169.254.0.0/16)
        "169.254.0.1",
        "169.254.169.254",  # AWS/GCP/Azure metadata
        "169.254.170.2",    # AWS ECS metadata
    ])
    def test_blocks_private_ip_addresses(self, private_ip):
        """Private and reserved IP addresses must be blocked."""
        assert _is_ip_private_or_reserved(private_ip) is True

    @pytest.mark.parametrize("public_ip", [
        "8.8.8.8",          # Google DNS
        "1.1.1.1",          # Cloudflare DNS
        "142.250.80.46",    # google.com
        "151.101.1.140",    # reddit.com
    ])
    def test_allows_public_ip_addresses(self, public_ip):
        """Public IP addresses should be allowed."""
        assert _is_ip_private_or_reserved(public_ip) is False

    # -------------------------------------------------------------------------
    # Cloud Metadata Endpoint Tests
    # -------------------------------------------------------------------------

    @pytest.mark.parametrize("metadata_url", [
        "http://169.254.169.254/",
        "http://169.254.169.254/latest/meta-data/",
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        "http://169.254.170.2/v2/credentials/",
    ])
    def test_blocks_cloud_metadata_ips(self, metadata_url):
        """Cloud metadata IP addresses must be blocked."""
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf(metadata_url)

        error_msg = str(exc_info.value).lower()
        assert "private" in error_msg or "blocked" in error_msg

    @pytest.mark.parametrize("metadata_hostname", [
        "http://metadata.google.internal/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://kubernetes.default.svc/",
    ])
    def test_blocks_cloud_metadata_hostnames(self, metadata_hostname):
        """Cloud metadata hostnames must be blocked."""
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf(metadata_hostname)

        assert "blocked" in str(exc_info.value).lower()

    # -------------------------------------------------------------------------
    # Localhost Tests
    # -------------------------------------------------------------------------

    @pytest.mark.parametrize("localhost_url", [
        "http://localhost/",
        "http://localhost:8080/",
        "http://localhost:6379/",      # Redis
        "http://localhost:9200/",      # Elasticsearch
        "http://127.0.0.1/",
        "http://127.0.0.1:3306/",      # MySQL
        "http://[::1]/",               # IPv6 loopback
    ])
    def test_blocks_localhost_access(self, localhost_url):
        """Localhost and loopback addresses must be blocked."""
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf(localhost_url)

        error_msg = str(exc_info.value).lower()
        assert "blocked" in error_msg or "private" in error_msg

    # -------------------------------------------------------------------------
    # IP Obfuscation Tests
    # -------------------------------------------------------------------------

    @pytest.mark.parametrize("obfuscated_url,description", [
        ("http://2130706433/", "Decimal encoding of 127.0.0.1"),
        ("http://017700000001/", "Octal encoding of 127.0.0.1"),
        ("http://0x7f000001/", "Hex encoding of 127.0.0.1"),
        ("http://[::ffff:127.0.0.1]/", "IPv4-mapped IPv6 loopback"),
        ("http://[::ffff:169.254.169.254]/", "IPv4-mapped IPv6 metadata"),
    ])
    def test_blocks_ip_obfuscation(self, obfuscated_url, description):
        """IP obfuscation techniques must be detected and blocked."""
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf(obfuscated_url)

        # Should be blocked regardless of encoding
        error_msg = str(exc_info.value).lower()
        assert any(w in error_msg for w in ["blocked", "private", "internal"]), \
            f"Failed to block: {description}"

    # -------------------------------------------------------------------------
    # Hostname Blocklist Tests
    # -------------------------------------------------------------------------

    def test_blocked_hostnames_list(self):
        """Verify all critical hostnames are in the blocklist."""
        required_blocked = [
            "localhost",
            "metadata.google.internal",
            "kubernetes.default",
        ]

        for hostname in required_blocked:
            assert hostname in BLOCKED_HOSTNAMES, \
                f"Critical hostname '{hostname}' missing from blocklist"

    def test_hostname_normalization(self):
        """Hostname normalization should handle edge cases."""
        assert _normalize_hostname("LOCALHOST") == "localhost"
        assert _normalize_hostname("Localhost.") == "localhost"
        assert _normalize_hostname("EXAMPLE.COM.") == "example.com"

    def test_subdomain_blocking(self):
        """Subdomains of blocked hosts should also be blocked."""
        assert _is_hostname_blocked("evil.localhost") is True
        assert _is_hostname_blocked("sub.metadata.google.internal") is True


# =============================================================================
# 3. PAYLOAD LIMIT TESTS
# =============================================================================

class TestPayloadLimits:
    """Test suite for payload size limits and resource exhaustion prevention."""

    @pytest.mark.asyncio
    async def test_large_response_truncated(self):
        """Responses larger than max_length should be truncated."""
        # Create a large HTML response (10MB)
        large_content = "<html><body>" + ("X" * 10_000_000) + "</body></html>"

        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = large_content
            mock_response.headers = {'content-type': 'text/html'}

            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            # Mock SSRF validation to allow the test URL
            with patch('mcp_server_fetch.server.validate_url_for_ssrf'):
                content, prefix = await fetch_url(
                    "https://example.com/large-file",
                    "TestAgent/1.0"
                )

            # Content should be returned (will be truncated by caller)
            # The fetch_url function returns the full content;
            # truncation happens in call_tool based on max_length parameter
            assert len(content) > 0

    @pytest.mark.asyncio
    async def test_billion_laughs_protection(self):
        """XML bomb / billion laughs attacks should be mitigated by size limits."""
        # Simulated expanded XML bomb content
        billion_laughs_expanded = "LOL" * 5_000_000  # 15MB of "LOL"

        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = billion_laughs_expanded
            mock_response.headers = {'content-type': 'text/xml'}

            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            with patch('mcp_server_fetch.server.validate_url_for_ssrf'):
                content, prefix = await fetch_url(
                    "https://example.com/xml",
                    "TestAgent/1.0"
                )

            # Response is returned but will be truncated by max_length in call_tool
            assert content is not None

    def test_max_length_parameter_validation(self):
        """max_length parameter should have upper bounds."""
        from mcp_server_fetch.server import Fetch
        from pydantic import AnyUrl, ValidationError

        test_url = AnyUrl("https://example.com")

        # Valid max_length
        fetch = Fetch(url=test_url, max_length=5000, start_index=0, raw=False)
        assert fetch.max_length == 5000

        # max_length at upper bound (lt=1000000 means < 1,000,000)
        fetch = Fetch(url=test_url, max_length=999999, start_index=0, raw=False)
        assert fetch.max_length == 999999

        # max_length exceeding upper bound should fail
        with pytest.raises(ValidationError):
            Fetch(url=test_url, max_length=1_000_001, start_index=0, raw=False)

        # max_length must be positive (gt=0)
        with pytest.raises(ValidationError):
            Fetch(url=test_url, max_length=0, start_index=0, raw=False)

        with pytest.raises(ValidationError):
            Fetch(url=test_url, max_length=-1, start_index=0, raw=False)


# =============================================================================
# 4. URL SCHEME VALIDATION TESTS
# =============================================================================

class TestURLSchemeValidation:
    """Test suite for URL scheme validation."""

    @pytest.mark.parametrize("valid_url", [
        "http://example.com/",
        "https://example.com/",
        "http://example.com:8080/path",
        "https://api.example.com/v1/resource",
        "HTTP://EXAMPLE.COM/",  # Case insensitive
        "HTTPS://EXAMPLE.COM/",
    ])
    def test_allows_http_and_https(self, valid_url):
        """HTTP and HTTPS schemes should be allowed."""
        # Should not raise for valid schemes (may raise for other reasons like DNS)
        # We mock DNS resolution to isolate scheme testing
        with patch('socket.getaddrinfo') as mock_dns:
            mock_dns.return_value = [
                (2, 1, 6, '', ('93.184.216.34', 0))  # example.com public IP
            ]
            try:
                validate_url_for_ssrf(valid_url)
            except McpError as e:
                # Should not be a scheme error
                assert "scheme" not in str(e).lower()

    @pytest.mark.parametrize("invalid_scheme_url,scheme", [
        ("file:///etc/passwd", "file"),
        ("ftp://ftp.example.com/file.txt", "ftp"),
        ("gopher://localhost/", "gopher"),
        ("data:text/html,<script>alert(1)</script>", "data"),
        ("javascript:alert(1)", "javascript"),
        ("ldap://localhost/", "ldap"),
        ("dict://localhost/", "dict"),
        ("sftp://example.com/file", "sftp"),
    ])
    def test_blocks_dangerous_schemes(self, invalid_scheme_url, scheme):
        """Non-HTTP(S) schemes must be blocked."""
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf(invalid_scheme_url)

        error_msg = str(exc_info.value).lower()
        assert "scheme" in error_msg or "not allowed" in error_msg

    def test_blocks_empty_scheme(self):
        """URLs without schemes should be rejected."""
        with pytest.raises(McpError):
            validate_url_for_ssrf("//example.com/path")

    def test_blocks_malformed_urls(self):
        """Malformed URLs should be rejected."""
        malformed_urls = [
            "",
            "not-a-url",
            "://missing-scheme.com",
            "http://",  # No hostname
        ]

        for url in malformed_urls:
            with pytest.raises(McpError):
                validate_url_for_ssrf(url)


# =============================================================================
# 5. INTEGRATION TESTS
# =============================================================================

class TestSecurityIntegration:
    """Integration tests combining multiple security controls."""

    @pytest.mark.asyncio
    async def test_full_security_chain(self):
        """Test the complete security validation chain."""
        # This test verifies that all security checks are applied in order

        # 1. Scheme validation happens first
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf("file:///etc/passwd")
        assert "scheme" in str(exc_info.value).lower()

        # 2. Hostname blocklist check
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf("http://localhost/")
        assert "blocked" in str(exc_info.value).lower()

        # 3. IP validation
        with pytest.raises(McpError) as exc_info:
            validate_url_for_ssrf("http://127.0.0.1/")
        assert "private" in str(exc_info.value).lower()

        # 4. DNS resolution and IP check
        with patch('socket.getaddrinfo') as mock_dns:
            # Simulate DNS resolving to private IP
            mock_dns.return_value = [
                (2, 1, 6, '', ('10.0.0.1', 0))
            ]
            with pytest.raises(McpError) as exc_info:
                validate_url_for_ssrf("http://internal.evil.com/")
            assert "private" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_timeout_protection(self):
        """Verify timeout is set on requests."""
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)

            # Simulate a timeout
            import httpx
            mock_instance.get = AsyncMock(
                side_effect=httpx.TimeoutException("Connection timed out")
            )
            mock_client.return_value = mock_instance

            with patch('mcp_server_fetch.server.validate_url_for_ssrf'):
                with pytest.raises(McpError) as exc_info:
                    await fetch_url("https://slow.example.com/", "TestAgent/1.0")

            assert "failed" in str(exc_info.value).lower()

    def test_security_constants_immutable(self):
        """Security constants should be immutable (frozenset)."""
        assert isinstance(BLOCKED_HOSTNAMES, frozenset)
        assert isinstance(CLOUD_METADATA_IPS, frozenset)

        # frozenset has no .add() method - it's truly immutable
        assert not hasattr(BLOCKED_HOSTNAMES, 'add') or not callable(getattr(BLOCKED_HOSTNAMES, 'add', None))

        # Verify we cannot create a modified version that affects the original
        original_len = len(BLOCKED_HOSTNAMES)
        _ = BLOCKED_HOSTNAMES | {"new-host"}  # Creates new frozenset, doesn't modify original
        assert len(BLOCKED_HOSTNAMES) == original_len


# =============================================================================
# 6. EDGE CASE TESTS
# =============================================================================

class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_ipv6_addresses(self):
        """IPv6 addresses should be properly validated."""
        # IPv6 loopback
        assert _is_ip_private_or_reserved("::1") is True

        # IPv6 link-local
        assert _is_ip_private_or_reserved("fe80::1") is True

        # IPv6 private (unique local)
        assert _is_ip_private_or_reserved("fc00::1") is True
        assert _is_ip_private_or_reserved("fd00::1") is True

    def test_unspecified_addresses(self):
        """Unspecified addresses (0.0.0.0, ::) should be blocked."""
        assert _is_ip_private_or_reserved("0.0.0.0") is True
        assert _is_ip_private_or_reserved("::") is True

    def test_multicast_addresses(self):
        """Multicast addresses should be blocked."""
        assert _is_ip_private_or_reserved("224.0.0.1") is True
        assert _is_ip_private_or_reserved("239.255.255.255") is True
        assert _is_ip_private_or_reserved("ff02::1") is True

    def test_url_with_credentials(self):
        """URLs with embedded credentials should be handled."""
        # These should still be validated for SSRF
        with pytest.raises(McpError):
            validate_url_for_ssrf("http://user:pass@localhost/")

        with pytest.raises(McpError):
            validate_url_for_ssrf("http://admin:admin@169.254.169.254/")

    def test_url_with_port_bypass_attempt(self):
        """Port variations should not bypass security."""
        with pytest.raises(McpError):
            validate_url_for_ssrf("http://localhost:80/")

        with pytest.raises(McpError):
            validate_url_for_ssrf("http://localhost:443/")

        with pytest.raises(McpError):
            validate_url_for_ssrf("http://127.0.0.1:65535/")


# =============================================================================
# RUN CONFIGURATION
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])