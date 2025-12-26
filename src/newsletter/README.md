# Newsletter MCP Server

An MCP server for creating professional newsletters with markdown conversion, email templates, and preview generation.

## Features

### Tools

1. **convert_markdown** - Convert Markdown to styled HTML
   - Professional styling with themes (light, dark, medical, minimal)
   - Syntax highlighting for code blocks
   - Callouts (info, warning, tip, note)
   - French typography support (guillemets, non-breaking spaces)
   - Responsive images and styled tables

2. **generate_email_template** - Generate responsive email templates
   - Multiple output formats: MJML, HTML, SendGrid, Mailchimp
   - Customizable branding (colors, logo)
   - Responsive design for all email clients
   - Header, content, CTA button, footer sections

3. **generate_preview** - Generate newsletter previews
   - Desktop and mobile viewports
   - Light and dark themes
   - Reading time and word count metadata
   - Frame display option

## Installation

```bash
npm install @modelcontextprotocol/server-newsletter
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "newsletter": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-newsletter"]
    }
  }
}
```

## Tool Usage Examples

### Convert Markdown

```
Use the convert_markdown tool with:
- markdown: "# My Title\n\nContent here..."
- theme: "light" (optional)
- frenchTypography: true (optional)
```

### Generate Email Template

```
Use the generate_email_template tool with:
- title: "Monthly Newsletter"
- content: "Your newsletter content..."
- cta: { text: "Read More", url: "https://example.com" }
- format: "html" (or "mjml", "sendgrid", "mailchimp")
- brandColor: "#0066cc" (optional)
```

### Generate Preview

```
Use the generate_preview tool with:
- newsletter: { title: "...", contentMarkdown: "...", takeaways: [...] }
- viewport: "both" (or "desktop", "mobile")
- theme: "light" (or "dark")
```

## Output Formats

### Email Template Formats

- **MJML**: Recommended for customization, compile to HTML with mjml CLI
- **HTML**: Ready-to-send responsive HTML email
- **SendGrid**: Dynamic template format for SendGrid API
- **Mailchimp**: Compatible format for Mailchimp campaigns

## Themes

- **light**: Clean, bright theme with subtle colors
- **dark**: Dark mode with light text
- **medical**: Professional medical/clinical styling
- **minimal**: Simple, distraction-free design

## License

MIT
