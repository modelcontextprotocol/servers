#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { markdownToHtml, MarkdownOptions } from "./markdown-converter.js";
import { generateEmailTemplate, EmailTemplateOptions } from "./email-template.js";
import { generatePreview, PreviewOptions } from "./preview-generator.js";

// Define available tools
const tools: Tool[] = [
  {
    name: "convert_markdown",
    description: `Converts Markdown to professionally styled HTML.

Features:
- Styled headings with anchors
- Code blocks with syntax highlighting
- Callouts (info, warning, tip, note)
- Styled blockquotes
- Bullet and numbered lists
- Responsive images
- Styled tables
- French typography support (guillemets, non-breaking spaces)`,
    inputSchema: {
      type: "object",
      properties: {
        markdown: {
          type: "string",
          description: "The Markdown content to convert",
        },
        theme: {
          type: "string",
          enum: ["light", "dark", "medical", "minimal"],
          description: "Style theme (default: light)",
        },
        includeStyles: {
          type: "boolean",
          description: "Include inline CSS styles (default: true)",
        },
        frenchTypography: {
          type: "boolean",
          description: "Apply French typography rules (default: false)",
        },
      },
      required: ["markdown"],
    },
  },
  {
    name: "generate_email_template",
    description: `Generates responsive email templates compatible with email clients.

Supported formats:
- MJML (recommended for customization)
- HTML email (ready to send)
- SendGrid compatible
- Mailchimp compatible

Template includes:
- Header with logo
- Main content
- CTA button
- Footer with unsubscribe links
- Inline styles for email compatibility`,
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Newsletter title",
        },
        intro: {
          type: "string",
          description: "Introduction/hook",
        },
        content: {
          type: "string",
          description: "Main content (HTML or Markdown)",
        },
        takeaways: {
          type: "array",
          items: { type: "string" },
          description: "Key takeaways",
        },
        cta: {
          type: "object",
          properties: {
            text: { type: "string" },
            url: { type: "string" },
          },
          description: "Call-to-action button",
        },
        format: {
          type: "string",
          enum: ["mjml", "html", "sendgrid", "mailchimp"],
          description: "Output format (default: html)",
        },
        brandColor: {
          type: "string",
          description: "Brand primary color (default: #0066cc)",
        },
        logoUrl: {
          type: "string",
          description: "Logo URL",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "generate_preview",
    description: `Generates a complete HTML preview of the newsletter.

Preview options:
- Desktop (800px)
- Mobile (375px)
- Light/dark theme
- With/without frame

Preview includes:
- Metadata (reading time, word count)
- Accurate content rendering
- Email rendering simulation`,
    inputSchema: {
      type: "object",
      properties: {
        newsletter: {
          type: "object",
          properties: {
            title: { type: "string" },
            intro: { type: "string" },
            contentMarkdown: { type: "string" },
            contentHtml: { type: "string" },
            takeaways: { type: "array", items: { type: "string" } },
            conclusion: { type: "string" },
            cta: { type: "string" },
          },
          required: ["title"],
          description: "Newsletter data",
        },
        viewport: {
          type: "string",
          enum: ["desktop", "mobile", "both"],
          description: "Screen size for preview (default: both)",
        },
        theme: {
          type: "string",
          enum: ["light", "dark"],
          description: "Preview theme (default: light)",
        },
        showFrame: {
          type: "boolean",
          description: "Show frame around preview (default: true)",
        },
      },
      required: ["newsletter"],
    },
  },
];

// Create server instance
const server = new Server(
  {
    name: "newsletter-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "convert_markdown": {
        const themeValue = (args?.theme as string) || "light";
        const options: MarkdownOptions = {
          theme: themeValue as "light" | "dark" | "medical" | "minimal",
          includeStyles: args?.includeStyles !== false,
          frenchTypography: args?.frenchTypography === true,
        };
        const result = await markdownToHtml(args?.markdown as string, options);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "generate_email_template": {
        const formatValue = (args?.format as string) || "html";
        const options: EmailTemplateOptions = {
          title: args?.title as string,
          intro: args?.intro as string,
          content: args?.content as string,
          takeaways: args?.takeaways as string[],
          cta: args?.cta as { text: string; url: string },
          format: formatValue as "mjml" | "html" | "sendgrid" | "mailchimp",
          brandColor: (args?.brandColor as string) || "#0066cc",
          logoUrl: args?.logoUrl as string,
        };
        const result = await generateEmailTemplate(options);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "generate_preview": {
        const viewportValue = (args?.viewport as string) || "both";
        const themePreviewValue = (args?.theme as string) || "light";
        const options: PreviewOptions = {
          newsletter: args?.newsletter as {
            title: string;
            intro?: string;
            contentMarkdown?: string;
            contentHtml?: string;
            takeaways?: string[];
            conclusion?: string;
            cta?: string;
          },
          viewport: viewportValue as "desktop" | "mobile" | "both",
          theme: themePreviewValue as "light" | "dark",
          showFrame: args?.showFrame !== false,
        };
        const result = await generatePreview(options);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Newsletter MCP Server running on stdio");
}

main().catch(console.error);
