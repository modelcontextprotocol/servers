import mjml2html from "mjml";

export interface EmailTemplateOptions {
  title: string;
  intro?: string;
  content: string;
  takeaways?: string[];
  cta?: { text: string; url: string };
  format?: "mjml" | "html" | "sendgrid" | "mailchimp";
  brandColor?: string;
  logoUrl?: string;
  footerText?: string;
  unsubscribeUrl?: string;
}

interface EmailTemplateResult {
  format: string;
  template: string;
  mjml?: string;
  previewText: string;
}

// Generate MJML template
function generateMjml(options: EmailTemplateOptions): string {
  const {
    title,
    intro,
    content,
    takeaways,
    cta,
    brandColor = "#0066cc",
    logoUrl,
    footerText = "SkinArt - Médecine esthétique",
    unsubscribeUrl = "#",
  } = options;

  const takeawaysSection = takeaways?.length
    ? `
      <mj-section background-color="#f4f7f6" padding="20px">
        <mj-column>
          <mj-text font-size="18px" font-weight="bold" color="#1a5276">
            ✨ À retenir
          </mj-text>
          <mj-text font-size="16px" color="#2c3e50" line-height="1.6">
            <ul style="margin: 0; padding-left: 20px;">
              ${takeaways.map((t) => `<li style="margin-bottom: 8px;">${t}</li>`).join("")}
            </ul>
          </mj-text>
        </mj-column>
      </mj-section>
    `
    : "";

  const ctaSection = cta
    ? `
      <mj-section padding="30px 0">
        <mj-column>
          <mj-button
            background-color="${brandColor}"
            color="white"
            font-size="16px"
            font-weight="bold"
            border-radius="8px"
            padding="15px 30px"
            href="${cta.url}"
          >
            ${cta.text}
          </mj-button>
        </mj-column>
      </mj-section>
    `
    : "";

  const logoSection = logoUrl
    ? `
      <mj-section padding="20px 0">
        <mj-column>
          <mj-image src="${logoUrl}" alt="Logo" width="150px" align="center" />
        </mj-column>
      </mj-section>
    `
    : "";

  return `
<mjml>
  <mj-head>
    <mj-title>${title}</mj-title>
    <mj-preview>${intro || title}</mj-preview>
    <mj-attributes>
      <mj-all font-family="'Helvetica Neue', Arial, sans-serif" />
      <mj-text font-size="16px" color="#2c3e50" line-height="1.6" />
    </mj-attributes>
    <mj-style>
      .link-nostyle { color: inherit !important; text-decoration: none !important; }
      h1, h2, h3 { color: #1a5276; margin-top: 24px; margin-bottom: 12px; }
      h1 { font-size: 28px; }
      h2 { font-size: 22px; }
      h3 { font-size: 18px; }
      p { margin: 16px 0; }
      ul, ol { margin: 16px 0; padding-left: 24px; }
      li { margin: 8px 0; }
      blockquote {
        border-left: 4px solid ${brandColor};
        padding-left: 16px;
        margin: 20px 0;
        font-style: italic;
        color: #5a6c7d;
      }
    </mj-style>
  </mj-head>
  <mj-body background-color="#f4f4f4">
    ${logoSection}

    <!-- Header -->
    <mj-section background-color="${brandColor}" padding="30px 20px">
      <mj-column>
        <mj-text font-size="28px" font-weight="bold" color="white" align="center">
          ${title}
        </mj-text>
        ${intro ? `<mj-text font-size="18px" color="white" align="center" padding-top="10px">${intro}</mj-text>` : ""}
      </mj-column>
    </mj-section>

    <!-- Main Content -->
    <mj-section background-color="white" padding="30px 20px">
      <mj-column>
        <mj-text>
          ${content}
        </mj-text>
      </mj-column>
    </mj-section>

    ${takeawaysSection}

    ${ctaSection}

    <!-- Footer -->
    <mj-section background-color="#2c3e50" padding="30px 20px">
      <mj-column>
        <mj-text font-size="14px" color="#95a5a6" align="center">
          ${footerText}
        </mj-text>
        <mj-text font-size="12px" color="#7f8c8d" align="center" padding-top="10px">
          <a href="${unsubscribeUrl}" style="color: #7f8c8d;">Se désabonner</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
  `.trim();
}

// Convert to SendGrid dynamic template format
function convertToSendGrid(html: string, options: EmailTemplateOptions): string {
  // SendGrid uses Handlebars-style placeholders
  const sendGridTemplate = {
    subject: options.title,
    preheader: options.intro || options.title,
    html_content: html,
    plain_content: stripHtml(html),
    // SendGrid dynamic data placeholders
    substitution_tag: "{{}}",
    categories: ["newsletter", "skinart"],
  };

  return JSON.stringify(sendGridTemplate, null, 2);
}

// Convert to Mailchimp template format
function convertToMailchimp(html: string, options: EmailTemplateOptions): string {
  // Mailchimp uses *|MERGE|* style placeholders
  const mailchimpHtml = html
    .replace(/\{\{first_name\}\}/g, "*|FNAME|*")
    .replace(/\{\{email\}\}/g, "*|EMAIL|*")
    .replace(/\{\{unsubscribe_url\}\}/g, "*|UNSUB|*");

  // Add Mailchimp editable regions
  const withEditableRegions = mailchimpHtml
    .replace(
      /<mj-section([^>]*)background-color="white"([^>]*)>/g,
      '<mj-section$1background-color="white"$2 mc:edit="main_content">'
    );

  return `
<!--
  Mailchimp Template
  Campaign: ${options.title}
  Created: ${new Date().toISOString()}
-->

*|IF:FNAME|*
Bonjour *|FNAME|*,
*|END:IF|*

${withEditableRegions}

*|LIST:DESCRIPTION|*
*|HTML:LIST_ADDRESS_HTML|*

<a href="*|UNSUB|*">Se désabonner</a>
  `.trim();
}

// Strip HTML for plain text version
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Main function
export async function generateEmailTemplate(
  options: EmailTemplateOptions
): Promise<EmailTemplateResult> {
  const format = options.format || "html";

  // Generate MJML
  const mjmlTemplate = generateMjml(options);

  // Convert MJML to HTML
  const { html, errors } = mjml2html(mjmlTemplate, {
    validationLevel: "soft",
  });

  if (errors.length > 0) {
    console.warn("MJML warnings:", errors);
  }

  // Generate preview text
  const previewText = options.intro || options.title;

  switch (format) {
    case "mjml":
      return {
        format: "mjml",
        template: mjmlTemplate,
        mjml: mjmlTemplate,
        previewText,
      };

    case "sendgrid":
      return {
        format: "sendgrid",
        template: convertToSendGrid(html, options),
        mjml: mjmlTemplate,
        previewText,
      };

    case "mailchimp":
      return {
        format: "mailchimp",
        template: convertToMailchimp(html, options),
        mjml: mjmlTemplate,
        previewText,
      };

    case "html":
    default:
      return {
        format: "html",
        template: html,
        mjml: mjmlTemplate,
        previewText,
      };
  }
}
