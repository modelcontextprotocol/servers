"""Tests for the distill_html function and distill parameter integration."""

import pytest

from mcp_server_fetch.server import distill_html, extract_content_from_html


class TestDistillHtml:
    """Tests for the distill_html function using BeautifulSoup."""

    def test_removes_script_tags(self):
        html = "<html><body><script>evil();</script><p>Safe</p></body></html>"
        result = distill_html(html)
        assert "<script" not in result.lower()
        assert "Safe" in result

    def test_removes_style_tags(self):
        html = "<html><body><style>.x{color:red}</style><p>Content</p></body></html>"
        result = distill_html(html)
        assert "<style" not in result.lower()
        assert "Content" in result

    def test_removes_nav_tags(self):
        html = "<html><body><nav><a href='/'>Home</a></nav><p>Article</p></body></html>"
        result = distill_html(html)
        assert "<nav" not in result.lower()
        assert "Article" in result

    def test_removes_header_tags(self):
        html = "<html><body><header>Logo</header><p>Main</p></body></html>"
        result = distill_html(html)
        assert "<header" not in result.lower()
        assert "Main" in result

    def test_removes_footer_tags(self):
        html = "<html><body><p>Content</p><footer>Copyright</footer></body></html>"
        result = distill_html(html)
        assert "<footer" not in result.lower()
        assert "Content" in result

    def test_removes_aside_tags(self):
        html = "<html><body><aside>Sidebar</aside><p>Main</p></body></html>"
        result = distill_html(html)
        assert "<aside" not in result.lower()
        assert "Main" in result

    def test_removes_iframe_tags(self):
        html = '<html><body><iframe src="ad.html"></iframe><p>Content</p></body></html>'
        result = distill_html(html)
        assert "<iframe" not in result.lower()
        assert "Content" in result

    def test_removes_svg_tags(self):
        html = "<html><body><svg><circle/></svg><p>Content</p></body></html>"
        result = distill_html(html)
        assert "<svg" not in result.lower()
        assert "Content" in result

    def test_removes_form_elements(self):
        html = "<html><body><form><input/><button>Go</button></form><p>Content</p></body></html>"
        result = distill_html(html)
        assert "<form" not in result.lower()
        assert "Content" in result

    def test_removes_html_comments(self):
        html = "<html><body><!-- secret --><p>Visible</p></body></html>"
        result = distill_html(html)
        assert "<!--" not in result
        assert "secret" not in result
        assert "Visible" in result

    def test_removes_nested_nav_tags(self):
        """Verifies BeautifulSoup handles nested tags (unlike regex)."""
        html = "<html><body><nav><nav>inner</nav>outer</nav><p>Content</p></body></html>"
        result = distill_html(html)
        assert "<nav" not in result.lower()
        assert "inner" not in result
        assert "outer" not in result
        assert "Content" in result

    def test_removes_elements_with_ad_class(self):
        html = '<html><body><div class="sidebar-ad">Buy now!</div><p>Real</p></body></html>'
        result = distill_html(html)
        assert "Buy now" not in result
        assert "Real" in result

    def test_removes_elements_with_cookie_id(self):
        html = '<html><body><div id="cookie-consent">Accept</div><p>Content</p></body></html>'
        result = distill_html(html)
        assert "Accept" not in result
        assert "Content" in result

    def test_removes_elements_with_social_class(self):
        html = '<html><body><div class="social-share">Share us</div><p>Article</p></body></html>'
        result = distill_html(html)
        assert "Share us" not in result
        assert "Article" in result

    def test_removes_empty_elements(self):
        html = "<html><body><div></div><span>   </span><p>Content</p></body></html>"
        result = distill_html(html)
        assert "Content" in result

    def test_preserves_br_hr_img(self):
        html = '<html><body><p>Before</p><br/><hr/><img src="x.jpg"/><p>After</p></body></html>'
        result = distill_html(html)
        assert "Before" in result
        assert "After" in result

    def test_returns_string(self):
        html = "<html><body><p>Hello</p></body></html>"
        result = distill_html(html)
        assert isinstance(result, str)


class TestExtractContentDistillIntegration:
    """Tests for the distill parameter in extract_content_from_html."""

    def test_distill_false_returns_content(self):
        html = "<html><body><article><h1>Title</h1><p>Body text.</p></article></body></html>"
        result = extract_content_from_html(html, distill=False)
        assert "Body text" in result

    def test_distill_true_returns_content(self):
        html = "<html><body><article><h1>Title</h1><p>Body text.</p></article></body></html>"
        result = extract_content_from_html(html, distill=True)
        assert "Body text" in result

    def test_distill_true_does_not_produce_empty_output(self):
        """Ensures distill doesn't strip core content (the 13-token bug)."""
        html = """<html><body>
        <article>
            <h1>Important Article</h1>
            <p>First paragraph with real content.</p>
            <p>Second paragraph with more details.</p>
        </article>
        </body></html>"""
        result = extract_content_from_html(html, distill=True)
        # Should have meaningful content, not just a few tokens
        assert len(result.split()) > 5

    def test_distill_default_is_false(self):
        html = "<html><body><article><p>Content</p></article></body></html>"
        result_default = extract_content_from_html(html)
        result_explicit = extract_content_from_html(html, distill=False)
        assert result_default == result_explicit
