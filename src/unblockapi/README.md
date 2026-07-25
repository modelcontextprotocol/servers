# UnblockAPI MCP Server

**Repository:** https://github.com/kyle/unblockapi
**Registry:** `mcp-registry/server.json`
**Transport:** `streamable-http` at `https://api.unblockapi.com/mcp`

## Overview

Give AI agents the capabilities they lack — screenshots, browser rendering, web search, captcha solving, email verification, and SMS verification. All via a single MCP server with one API key. Pay-per-call pricing via Stripe.

## Tools

| Tool | Description |
|------|-------------|
| `unblock_screenshot` | Take a screenshot of any URL (returns base64 PNG) |
| `unblock_browser_fetch` | Fetch and extract content from JavaScript-rendered pages |
| `unblock_search` | Search the web via DuckDuckGo or SerpAPI |
| `unblock_solve_captcha` | Solve reCAPTCHA v2/v3, hCaptcha, FunCaptcha, Turnstile |
| `unblock_email_verify` | Verify email address deliverability |
| `unblock_sms` | Send and verify SMS codes (OTP verification) |
| `unblock_pricing` | Get current pricing and credit costs |
| `unblock_account` | Check account status and remaining credits |

## Packages

- **npm:** `@unblockapi/mcp-server`
- **PyPI:** `unblockapi-mcp-server`

## Free Tier

100 credits/month. No credit card required.
