import { marked } from "marked";
import hljs from "highlight.js";
import sanitizeHtml from "sanitize-html";

export interface MarkdownOptions {
  theme?: "light" | "dark" | "medical" | "minimal";
  includeStyles?: boolean;
  frenchTypography?: boolean;
}

interface ConversionResult {
  html: string;
  styles: string;
  wordCount: number;
  readingTimeMinutes: number;
  headings: Array<{ level: number; text: string; id: string }>;
}

// Theme color palettes
const themes = {
  light: {
    bg: "#ffffff",
    text: "#1a1a1a",
    heading: "#0d0d0d",
    link: "#0066cc",
    code: "#f4f4f4",
    codeBorder: "#e0e0e0",
    blockquote: "#f8f9fa",
    blockquoteBorder: "#dee2e6",
    calloutInfo: "#e7f3ff",
    calloutWarning: "#fff3cd",
    calloutTip: "#d4edda",
    calloutNote: "#f8f9fa",
  },
  dark: {
    bg: "#1a1a1a",
    text: "#e0e0e0",
    heading: "#ffffff",
    link: "#66b3ff",
    code: "#2d2d2d",
    codeBorder: "#404040",
    blockquote: "#252525",
    blockquoteBorder: "#404040",
    calloutInfo: "#1a3a5c",
    calloutWarning: "#5c4a1a",
    calloutTip: "#1a4a2a",
    calloutNote: "#2a2a2a",
  },
  medical: {
    bg: "#ffffff",
    text: "#2c3e50",
    heading: "#1a5276",
    link: "#2980b9",
    code: "#ecf0f1",
    codeBorder: "#bdc3c7",
    blockquote: "#e8f6f3",
    blockquoteBorder: "#1abc9c",
    calloutInfo: "#d6eaf8",
    calloutWarning: "#fdebd0",
    calloutTip: "#d5f5e3",
    calloutNote: "#f4f6f7",
  },
  minimal: {
    bg: "#ffffff",
    text: "#333333",
    heading: "#000000",
    link: "#000000",
    code: "#f5f5f5",
    codeBorder: "#eeeeee",
    blockquote: "#fafafa",
    blockquoteBorder: "#dddddd",
    calloutInfo: "#f0f0f0",
    calloutWarning: "#f0f0f0",
    calloutTip: "#f0f0f0",
    calloutNote: "#f0f0f0",
  },
};

// Apply French typography rules
function applyFrenchTypography(text: string): string {
  return text
    // Guillemets français
    .replace(/"([^"]+)"/g, "« $1 »")
    // Espaces insécables avant ponctuation double
    .replace(/ ([?!;:])/g, "\u00A0$1")
    // Tirets longs pour les dialogues
    .replace(/^- /gm, "— ")
    // Apostrophes typographiques
    .replace(/'/g, "'");
}

// Generate CSS styles for a theme
function generateStyles(themeName: string): string {
  const t = themes[themeName as keyof typeof themes] || themes.medical;

  return `
    .newsletter-content {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 18px;
      line-height: 1.7;
      color: ${t.text};
      background-color: ${t.bg};
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem;
    }

    .newsletter-content h1,
    .newsletter-content h2,
    .newsletter-content h3,
    .newsletter-content h4,
    .newsletter-content h5,
    .newsletter-content h6 {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: ${t.heading};
      margin-top: 2em;
      margin-bottom: 0.5em;
      line-height: 1.3;
    }

    .newsletter-content h1 { font-size: 2.2em; border-bottom: 2px solid ${t.heading}; padding-bottom: 0.3em; }
    .newsletter-content h2 { font-size: 1.8em; }
    .newsletter-content h3 { font-size: 1.4em; }
    .newsletter-content h4 { font-size: 1.2em; }

    .newsletter-content a {
      color: ${t.link};
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s;
    }

    .newsletter-content a:hover {
      border-bottom-color: ${t.link};
    }

    .newsletter-content p {
      margin: 1.2em 0;
    }

    .newsletter-content blockquote {
      margin: 1.5em 0;
      padding: 1em 1.5em;
      background-color: ${t.blockquote};
      border-left: 4px solid ${t.blockquoteBorder};
      font-style: italic;
    }

    .newsletter-content blockquote p {
      margin: 0;
    }

    .newsletter-content pre {
      background-color: ${t.code};
      border: 1px solid ${t.codeBorder};
      border-radius: 6px;
      padding: 1em;
      overflow-x: auto;
      font-size: 0.9em;
    }

    .newsletter-content code {
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 0.9em;
      background-color: ${t.code};
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }

    .newsletter-content pre code {
      background: none;
      padding: 0;
    }

    .newsletter-content ul,
    .newsletter-content ol {
      margin: 1em 0;
      padding-left: 1.5em;
    }

    .newsletter-content li {
      margin: 0.5em 0;
    }

    .newsletter-content img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1.5em 0;
    }

    .newsletter-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5em 0;
    }

    .newsletter-content th,
    .newsletter-content td {
      border: 1px solid ${t.codeBorder};
      padding: 0.75em;
      text-align: left;
    }

    .newsletter-content th {
      background-color: ${t.code};
      font-weight: bold;
    }

    .newsletter-content hr {
      border: none;
      border-top: 1px solid ${t.codeBorder};
      margin: 2em 0;
    }

    /* Callouts */
    .callout {
      margin: 1.5em 0;
      padding: 1em 1.5em;
      border-radius: 8px;
      border-left: 4px solid;
    }

    .callout-info {
      background-color: ${t.calloutInfo};
      border-left-color: #3498db;
    }

    .callout-warning {
      background-color: ${t.calloutWarning};
      border-left-color: #f39c12;
    }

    .callout-tip {
      background-color: ${t.calloutTip};
      border-left-color: #27ae60;
    }

    .callout-note {
      background-color: ${t.calloutNote};
      border-left-color: #95a5a6;
    }

    .callout-title {
      font-weight: bold;
      margin-bottom: 0.5em;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }

    /* Takeaways box */
    .takeaways-box {
      background: linear-gradient(135deg, ${t.calloutTip} 0%, ${t.calloutInfo} 100%);
      border-radius: 12px;
      padding: 1.5em;
      margin: 2em 0;
    }

    .takeaways-box h3 {
      margin-top: 0;
      display: flex;
      align-items: center;
      gap: 0.5em;
    }

    .takeaways-box ul {
      margin-bottom: 0;
    }

    /* Heading anchors */
    .heading-anchor {
      opacity: 0;
      margin-left: 0.5em;
      font-size: 0.8em;
      text-decoration: none;
      color: ${t.link};
    }

    h1:hover .heading-anchor,
    h2:hover .heading-anchor,
    h3:hover .heading-anchor {
      opacity: 1;
    }
  `;
}

// Process callouts in markdown
function processCallouts(markdown: string): string {
  const calloutRegex = /:::(\w+)(?:\s+(.+?))?\n([\s\S]*?):::/g;

  return markdown.replace(calloutRegex, (_, type, title, content) => {
    const calloutType = ["info", "warning", "tip", "note"].includes(type)
      ? type
      : "note";
    const titleText = title || type.charAt(0).toUpperCase() + type.slice(1);

    return `<div class="callout callout-${calloutType}">
      <div class="callout-title">${titleText}</div>
      <div class="callout-content">${content.trim()}</div>
    </div>`;
  });
}

// Extract headings for TOC
function extractHeadings(html: string): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = [];
  const regex = /<h([1-6])[^>]*id="([^"]*)"[^>]*>([^<]*)/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      text: match[3],
      id: match[2],
    });
  }

  return headings;
}

// Count words
function countWords(text: string): number {
  return text
    .replace(/<[^>]*>/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

// Calculate reading time (average 200 words/minute)
function calculateReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 200));
}

// Main conversion function
export async function markdownToHtml(
  markdown: string,
  options: MarkdownOptions = {}
): Promise<ConversionResult> {
  const {
    theme = "medical",
    includeStyles = true,
    frenchTypography = true,
  } = options;

  // Apply French typography if enabled
  let processedMarkdown = frenchTypography
    ? applyFrenchTypography(markdown)
    : markdown;

  // Process callouts before markdown parsing
  processedMarkdown = processCallouts(processedMarkdown);

  // Configure marked with syntax highlighting
  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  // Custom renderer for headings with anchors
  const renderer = new marked.Renderer();

  renderer.heading = ({ text, depth }) => {
    const slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    return `<h${depth} id="${slug}">${text}<a href="#${slug}" class="heading-anchor">#</a></h${depth}>\n`;
  };

  renderer.code = ({ text, lang }) => {
    const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
    const highlighted = hljs.highlight(text, { language }).value;
    return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>\n`;
  };

  marked.use({ renderer });

  // Convert markdown to HTML
  let html = await marked.parse(processedMarkdown);

  // Sanitize HTML
  html = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "pre",
      "code",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["class", "id"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      code: ["class"],
    },
  });

  // Wrap in container
  html = `<div class="newsletter-content">${html}</div>`;

  // Generate styles
  const styles = generateStyles(theme);

  // Calculate metrics
  const wordCount = countWords(html);
  const readingTimeMinutes = calculateReadingTime(wordCount);

  // Extract headings
  const headings = extractHeadings(html);

  // Include styles if requested
  const finalHtml = includeStyles
    ? `<style>${styles}</style>${html}`
    : html;

  return {
    html: finalHtml,
    styles,
    wordCount,
    readingTimeMinutes,
    headings,
  };
}
