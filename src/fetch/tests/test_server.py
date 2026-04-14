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

    def test_empty_content(self):
        """Test that empty HTML is handled gracefully via fallback."""
        result = extract_content_from_html("")
        # Empty input produces empty output after fallback
        assert "<error>" not in result


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


class TestExtractContentFromHtmlFallback:
    """Tests for extract_content_from_html readability fallback."""

    def test_readability_sufficient_content_no_fallback(self):
        """When Readability returns enough content, no fallback is triggered."""
        html = "<html><body>" + "<p>word </p>" * 200 + "</body></html>"
        readability_content = "<div>" + "<p>word </p>" * 200 + "</div>"

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string") as mock_readability:
            mock_readability.return_value = {"content": readability_content}
            result = extract_content_from_html(html)
            assert mock_readability.call_count == 1
            assert "word" in result

    def test_readability_strips_content_falls_back_to_no_readability(self):
        """When Readability returns too little, falls back to non-Readability extraction."""
        html = "<html><body>" + "<p>content </p>" * 500 + "</body></html>"

        def mock_simple_json(h, use_readability=True):
            if use_readability:
                return {"content": "<div>Loading...</div>"}
            else:
                return {"content": "<div>" + "<p>content </p>" * 500 + "</div>"}

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string", side_effect=mock_simple_json):
            result = extract_content_from_html(html)
            assert "content" in result
            assert len(result.strip()) > 100

    def test_both_readability_modes_fail_falls_back_to_markdownify(self):
        """When both readabilipy modes return too little, falls back to raw markdownify."""
        html = "<html><body>" + "<p>important data </p>" * 300 + "</body></html>"

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string") as mock_readability:
            mock_readability.return_value = {"content": ""}
            result = extract_content_from_html(html)
            assert "important data" in result
            assert mock_readability.call_count == 2

    def test_readability_none_content_triggers_fallback(self):
        """When Readability returns None content, fallback is triggered."""
        html = "<html><body>" + "<p>real content </p>" * 200 + "</body></html>"

        call_count = [0]

        def mock_simple_json(h, use_readability=True):
            call_count[0] += 1
            if call_count[0] == 1:
                return {"content": None}
            else:
                return {"content": "<div>" + "<p>real content </p>" * 200 + "</div>"}

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string", side_effect=mock_simple_json):
            result = extract_content_from_html(html)
            assert "real content" in result

    def test_readability_missing_content_key_triggers_fallback(self):
        """When Readability returns dict without 'content' key, fallback is triggered."""
        html = "<html><body>" + "<p>data </p>" * 200 + "</body></html>"

        call_count = [0]

        def mock_simple_json(h, use_readability=True):
            call_count[0] += 1
            if call_count[0] == 1:
                return {}  # no "content" key at all
            else:
                return {"content": "<div>" + "<p>data </p>" * 200 + "</div>"}

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string", side_effect=mock_simple_json):
            result = extract_content_from_html(html)
            assert "data" in result

    def test_threshold_is_one_percent_of_html(self):
        """The fallback threshold is 1% of the input HTML length."""
        padding = "x" * 9000
        html = f'<html><body><div style="visibility:hidden">{padding}</div><p>tiny</p></body></html>'

        def mock_simple_json(h, use_readability=True):
            if use_readability:
                return {"content": "<p>tiny</p>"}
            else:
                return {"content": f"<div>{padding}</div><p>tiny</p>"}

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string", side_effect=mock_simple_json):
            result = extract_content_from_html(html)
            # "tiny" (4 chars) < 1% of ~9100 chars → fallback triggered
            assert len(result.strip()) > 50

    def test_content_at_threshold_boundary_no_fallback(self):
        """Content exactly at the 1% threshold does not trigger fallback."""
        # Build HTML of known size, readability returns content exactly at threshold
        filler = "a" * 1000
        html = f"<html><body><p>{filler}</p></body></html>"
        # 1% of ~1030 chars ≈ 10 chars; return content well above that
        readability_content = f"<p>{filler}</p>"

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string") as mock_readability:
            mock_readability.return_value = {"content": readability_content}
            result = extract_content_from_html(html)
            assert mock_readability.call_count == 1
            assert "a" in result

    def test_whitespace_only_readability_output_triggers_fallback(self):
        """Readability returning whitespace-only content triggers fallback."""
        html = "<html><body>" + "<p>payload </p>" * 300 + "</body></html>"

        def mock_simple_json(h, use_readability=True):
            if use_readability:
                return {"content": "<div>   \n\t  </div>"}
            else:
                return {"content": "<div>" + "<p>payload </p>" * 300 + "</div>"}

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string", side_effect=mock_simple_json):
            result = extract_content_from_html(html)
            assert "payload" in result

    def test_no_readability_also_returns_too_little_falls_to_raw(self):
        """When stage 2 (no-readability) also returns too little, raw markdownify is used."""
        html = "<html><body>" + "<p>deep content </p>" * 400 + "</body></html>"

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string") as mock_readability:
            # Both calls return minimal content
            mock_readability.return_value = {"content": "<p>x</p>"}
            result = extract_content_from_html(html)
            assert "deep content" in result
            assert mock_readability.call_count == 2

    def test_no_readability_returns_none_falls_to_raw(self):
        """When stage 2 (no-readability) returns None content, raw markdownify is used."""
        html = "<html><body>" + "<p>fallback target </p>" * 200 + "</body></html>"

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string") as mock_readability:
            mock_readability.return_value = {"content": None}
            result = extract_content_from_html(html)
            assert "fallback target" in result

    def test_empty_html_returns_empty_string(self):
        """Empty HTML input produces empty output, no error tags."""
        result = extract_content_from_html("")
        assert "<error>" not in result

    def test_small_html_min_length_is_one(self):
        """For very small HTML, min_length floors at 1 so fallback still works."""
        html = "<p>Hi</p>"
        result = extract_content_from_html(html)
        assert "<error>" not in result

    def test_hidden_ssr_content_triggers_fallback(self):
        """Test that hidden SSR content triggers fallback extraction."""
        visible_shell = "<p>Loading...</p>"
        hidden_content = "<p>{}</p>".format(" ".join(["word"] * 500))
        html = """
        <html>
        <body>
            <div id="shell">{}</div>
            <div style="visibility:hidden" id="ssr-data">{}</div>
        </body>
        </html>
        """.format(visible_shell, hidden_content)
        result = extract_content_from_html(html)
        assert len(result.strip()) > len(html) // 100

    def test_small_visible_shell_large_hidden_ssr(self):
        """Test realistic SSR pattern: small visible loading shell + large hidden content."""
        ssr_paragraphs = "\n".join(
            "<p>Article paragraph {} with enough text to be meaningful content.</p>".format(i)
            for i in range(50)
        )
        html = """
        <html>
        <head><title>SSR App</title></head>
        <body>
            <div id="app">
                <div class="spinner">Loading application...</div>
            </div>
            <div style="position:absolute;top:-9999px" id="__ssr_data__">
                <article>
                    <h1>Full Article Title</h1>
                    {}
                </article>
            </div>
        </body>
        </html>
        """.format(ssr_paragraphs)
        result = extract_content_from_html(html)
        assert len(result.strip()) > len(html) // 100

    def test_opacity_zero_hidden_content(self):
        """Content hidden via opacity:0 should be recovered by fallback."""
        hidden_text = " ".join(["secret"] * 300)
        html = """
        <html>
        <body>
            <div>Visible shell</div>
            <div style="opacity:0"><p>{}</p></div>
        </body>
        </html>
        """.format(hidden_text)
        result = extract_content_from_html(html)
        assert len(result.strip()) > len(html) // 100

    def test_result_never_contains_error_tags(self):
        """No code path in the updated function should produce <error> tags."""
        cases = [
            "",
            "<html></html>",
            "<html><body></body></html>",
            "<p>short</p>",
        ]
        for html in cases:
            result = extract_content_from_html(html)
            assert "<error>" not in result, f"Got <error> for input: {html!r}"

    def test_all_three_stages_called_when_needed(self):
        """Verify the full three-stage cascade: readability → no-readability → raw markdownify."""
        html = "<html><body>" + "<p>cascade </p>" * 400 + "</body></html>"

        calls = []

        def mock_simple_json(h, use_readability=True):
            calls.append(use_readability)
            return {"content": ""}

        with patch("mcp_server_fetch.server.readabilipy.simple_json.simple_json_from_html_string", side_effect=mock_simple_json):
            result = extract_content_from_html(html)
            # Stage 1: use_readability=True, Stage 2: use_readability=False
            assert calls == [True, False]
            # Stage 3: raw markdownify recovers content
            assert "cascade" in result
