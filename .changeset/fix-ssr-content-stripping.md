---
"mcp-server-fetch": patch
---

Fix mcp-server-fetch dropping SSR content from streaming/progressive rendering sites

When a page uses progressive server-side rendering with streaming architecture, the SSR content may be injected hidden (visibility:hidden, position:absolute, top:-9999px). Readability's content extraction algorithm treats these elements as non-content and strips them entirely, causing the majority of page content to be silently dropped.

The fix adds a fallback mechanism: if Readability returns content that is less than 5% of the original HTML length, we fall back to converting the raw HTML to markdown instead. This preserves current behavior for normal pages while automatically recovering when Readability strips too aggressively.

Users fetching pages from sites using Next.js streaming, Remix deferred, or similar SSR patterns will now get the full page content instead of just the loading shell.
