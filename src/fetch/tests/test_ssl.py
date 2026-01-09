"""
Tests for SSL certificate verification configuration.

These tests verify that the MCP_FETCH_SSL_VERIFY environment variable
correctly controls SSL certificate verification behavior.
"""

import os
import importlib
import pytest


class TestSSLConfiguration:
    """Tests for SSL_VERIFY environment variable configuration."""

    def test_ssl_verify_default_is_true(self, monkeypatch):
        """SSL verification should be enabled by default."""
        monkeypatch.delenv("MCP_FETCH_SSL_VERIFY", raising=False)
        
        # Re-import to pick up new env var
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)
        
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_explicit_true(self, monkeypatch):
        """SSL verification should be enabled when explicitly set to 'true'."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "true")
        
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)
        
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_explicit_True_uppercase(self, monkeypatch):
        """SSL verification should be enabled when set to 'True' (uppercase)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "True")
        
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)
        
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_false_lowercase(self, monkeypatch):
        """SSL verification should be disabled when set to 'false'."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "false")
        
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)
        
        assert server_module.SSL_VERIFY is False

    def test_ssl_verify_False_uppercase(self, monkeypatch):
        """SSL verification should be disabled when set to 'False' (uppercase)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "False")
        
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)
        
        assert server_module.SSL_VERIFY is False

    def test_ssl_verify_FALSE_all_caps(self, monkeypatch):
        """SSL verification should be disabled when set to 'FALSE' (all caps)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "FALSE")
        
        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)
        
        assert server_module.SSL_VERIFY is False

    def test_ssl_verify_invalid_value_stays_enabled(self, monkeypatch):
        """Invalid/unknown values should keep SSL verification ENABLED (fail-secure)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "invalid")

        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Fail-secure: only explicit "false" disables SSL verification
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_empty_string_stays_enabled(self, monkeypatch):
        """Empty string should keep SSL verification ENABLED (fail-secure)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "")

        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Fail-secure: only explicit "false" disables SSL verification
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_0_stays_enabled(self, monkeypatch):
        """'0' should keep SSL verification ENABLED (fail-secure, only 'false' disables)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "0")

        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Fail-secure: only explicit "false" disables SSL verification
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_1_stays_enabled(self, monkeypatch):
        """'1' should keep SSL verification ENABLED (fail-secure)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "1")

        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Fail-secure: only explicit "false" disables SSL verification
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_yes_stays_enabled(self, monkeypatch):
        """'yes' should keep SSL verification ENABLED (fail-secure)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "yes")

        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Fail-secure: only explicit "false" disables SSL verification
        assert server_module.SSL_VERIFY is True

    def test_ssl_verify_no_stays_enabled(self, monkeypatch):
        """'no' should keep SSL verification ENABLED (fail-secure, only 'false' disables)."""
        monkeypatch.setenv("MCP_FETCH_SSL_VERIFY", "no")

        import mcp_server_fetch.server as server_module
        importlib.reload(server_module)

        # Fail-secure: only explicit "false" disables SSL verification
        assert server_module.SSL_VERIFY is True


class TestSSLErrorHandling:
    """Tests for SSL error message formatting."""

    def test_ssl_error_message_format(self):
        """Verify SSL error messages are properly formatted."""
        import ssl
        
        # Create a sample SSL error
        ssl_error = ssl.SSLCertVerificationError(
            1, "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed"
        )
        
        # The error message should contain useful information
        error_str = str(ssl_error)
        assert "CERTIFICATE_VERIFY_FAILED" in error_str or "certificate" in error_str.lower()

