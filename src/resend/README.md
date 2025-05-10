# Resend MCP Server

A Model Context Protocol (MCP) server for interacting with the [Resend](https://resend.com) email API. This server allows AI assistants to send emails programmatically.

## Features

- Send emails with HTML or plain text content
- Send emails using Resend templates
- Support for attachments, CC, BCC, and reply-to addresses
- Email tagging for tracking
- Schedule emails for future delivery

## Setup

### Prerequisites

- Node.js 18 or higher
- A Resend API key (get one at [resend.com](https://resend.com))

### Installation

```bash
npm install -g @modelcontextprotocol/server-resend
```

### Usage

To use this server, you need to provide your Resend API key:

```bash
RESEND_API_KEY=your_api_key npx @modelcontextprotocol/server-resend
```

## Examples

### Sending a basic email

```typescript
const result = await sendEmail({
  from: "Your Name <you@example.com>",
  to: "recipient@example.com",
  subject: "Hello from Resend",
  html: "<h1>Hello World</h1><p>This is a test email sent via Resend.</p>"
});
```

### Sending a scheduled email

```typescript
const result = await sendEmail({
  from: "Your Name <you@example.com>",
  to: "recipient@example.com",
  subject: "Scheduled Email from Resend",
  html: "<p>This email was scheduled to be sent at a future time.</p>",
  scheduled_at: "2023-12-31T23:59:59Z" // ISO 8601 timestamp
});
```

### Sending an email with a template

```typescript
const result = await sendEmailWithTemplate({
  from: "Your Name <you@example.com>",
  to: "recipient@example.com",
  subject: "Hello from Resend",
  template_id: "your_template_id",
  data: {
    name: "John Doe",
    company: "Acme Inc."
  }
});
```

## Tools

### `send_email`

Sends an email using the Resend API.

Parameters:
- `from`: Sender email address (required)
- `to`: Recipient email address or array of addresses (required)
- `subject`: Email subject line (required)
- `html`: HTML content of the email (either html or text is required)
- `text`: Plain text content of the email (either html or text is required)
- `cc`: Carbon copy recipients
- `bcc`: Blind carbon copy recipients
- `reply_to`: Reply-to email address
- `attachments`: Array of file attachments
- `tags`: Array of tags for tracking emails
- `scheduled_at`: ISO 8601 timestamp for scheduling the email delivery

### `send_email_with_template`

Sends an email using a Resend template.

Parameters:
- `from`: Sender email address (required)
- `to`: Recipient email address or array of addresses (required)
- `subject`: Email subject line (required)
- `template_id`: ID of the template to use (required)
- `data`: Data to populate the template (required)
- `cc`: Carbon copy recipients
- `bcc`: Blind carbon copy recipients
- `reply_to`: Reply-to email address
- `attachments`: Array of file attachments
- `tags`: Array of tags for tracking emails
- `scheduled_at`: ISO 8601 timestamp for scheduling the email delivery

## License

MIT 