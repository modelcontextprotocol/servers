import { markdownToHtml } from "./markdown-converter.js";

export interface PreviewOptions {
  newsletter: {
    title: string;
    intro?: string;
    contentMarkdown?: string;
    contentHtml?: string;
    takeaways?: string[];
    conclusion?: string;
    cta?: string;
  };
  viewport?: "desktop" | "mobile" | "both";
  theme?: "light" | "dark";
  showFrame?: boolean;
}

interface PreviewResult {
  desktop?: string;
  mobile?: string;
  combined?: string;
  metadata: {
    title: string;
    wordCount: number;
    readingTimeMinutes: number;
    hasImages: boolean;
    hasTakeaways: boolean;
    hasCta: boolean;
  };
}

// Generate frame styles
function getFrameStyles(theme: "light" | "dark"): string {
  const isDark = theme === "dark";

  return `
    .preview-frame {
      border: 1px solid ${isDark ? "#404040" : "#e0e0e0"};
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, ${isDark ? "0.3" : "0.1"});
      background: ${isDark ? "#1a1a1a" : "#ffffff"};
    }

    .preview-header {
      background: ${isDark ? "#2d2d2d" : "#f5f5f5"};
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid ${isDark ? "#404040" : "#e0e0e0"};
    }

    .preview-dots {
      display: flex;
      gap: 6px;
    }

    .preview-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .preview-dot.red { background: #ff5f57; }
    .preview-dot.yellow { background: #febc2e; }
    .preview-dot.green { background: #28c840; }

    .preview-title {
      flex: 1;
      text-align: center;
      font-size: 13px;
      color: ${isDark ? "#888" : "#666"};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .preview-content {
      padding: 0;
      overflow-y: auto;
    }

    .preview-metadata {
      background: ${isDark ? "#252525" : "#f8f9fa"};
      padding: 12px 16px;
      border-top: 1px solid ${isDark ? "#404040" : "#e0e0e0"};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: ${isDark ? "#888" : "#666"};
      display: flex;
      gap: 16px;
    }

    .preview-metadata-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .viewport-desktop {
      width: 800px;
      margin: 0 auto;
    }

    .viewport-mobile {
      width: 375px;
      margin: 0 auto;
    }

    .viewport-container {
      display: flex;
      gap: 24px;
      justify-content: center;
      padding: 24px;
      background: ${isDark ? "#0d0d0d" : "#f0f0f0"};
    }

    .viewport-label {
      text-align: center;
      font-size: 12px;
      color: ${isDark ? "#666" : "#999"};
      margin-bottom: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
  `;
}

// Generate preview HTML for a specific viewport
function generateViewportPreview(
  content: string,
  viewport: "desktop" | "mobile",
  theme: "light" | "dark",
  showFrame: boolean,
  metadata: PreviewResult["metadata"]
): string {
  const width = viewport === "desktop" ? 800 : 375;
  const frameClass = showFrame ? "preview-frame" : "";

  const metadataHtml = `
    <div class="preview-metadata">
      <div class="preview-metadata-item">
        <span>📖</span>
        <span>${metadata.readingTimeMinutes} min de lecture</span>
      </div>
      <div class="preview-metadata-item">
        <span>📝</span>
        <span>${metadata.wordCount} mots</span>
      </div>
      ${metadata.hasTakeaways ? '<div class="preview-metadata-item"><span>✨</span><span>Points clés</span></div>' : ""}
      ${metadata.hasCta ? '<div class="preview-metadata-item"><span>🎯</span><span>Call-to-action</span></div>' : ""}
    </div>
  `;

  if (showFrame) {
    return `
      <div class="viewport-${viewport}">
        <div class="viewport-label">${viewport === "desktop" ? "Desktop (800px)" : "Mobile (375px)"}</div>
        <div class="${frameClass}">
          <div class="preview-header">
            <div class="preview-dots">
              <div class="preview-dot red"></div>
              <div class="preview-dot yellow"></div>
              <div class="preview-dot green"></div>
            </div>
            <div class="preview-title">${metadata.title}</div>
          </div>
          <div class="preview-content" style="max-height: 600px; overflow-y: auto;">
            ${content}
          </div>
          ${metadataHtml}
        </div>
      </div>
    `;
  }

  return `
    <div class="viewport-${viewport}" style="width: ${width}px;">
      ${content}
      ${metadataHtml}
    </div>
  `;
}

// Count words in text
function countWords(text: string): number {
  return text
    .replace(/<[^>]*>/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

// Main function
export async function generatePreview(
  options: PreviewOptions
): Promise<PreviewResult> {
  const {
    newsletter,
    viewport = "both",
    theme = "light",
    showFrame = true,
  } = options;

  // Convert content
  let htmlContent: string;

  if (newsletter.contentHtml) {
    htmlContent = newsletter.contentHtml;
  } else if (newsletter.contentMarkdown) {
    const converted = await markdownToHtml(newsletter.contentMarkdown, {
      theme: theme === "dark" ? "dark" : "medical",
      includeStyles: true,
    });
    htmlContent = converted.html;
  } else {
    htmlContent = "<p>Pas de contenu</p>";
  }

  // Build full content with intro, takeaways, conclusion, cta
  let fullContent = `
    <div style="padding: 24px;">
      <h1 style="margin-top: 0;">${newsletter.title}</h1>
      ${newsletter.intro ? `<p style="font-size: 1.2em; color: #666; font-style: italic;">${newsletter.intro}</p>` : ""}
      ${htmlContent}
  `;

  if (newsletter.takeaways && newsletter.takeaways.length > 0) {
    fullContent += `
      <div style="background: #e8f6f3; padding: 20px; border-radius: 12px; margin: 24px 0;">
        <h3 style="margin-top: 0; color: #1a5276;">✨ À retenir</h3>
        <ul>
          ${newsletter.takeaways.map((t) => `<li>${t}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  if (newsletter.conclusion) {
    fullContent += `<p>${newsletter.conclusion}</p>`;
  }

  if (newsletter.cta) {
    fullContent += `
      <p style="text-align: center; margin-top: 32px;">
        <a href="#" style="
          display: inline-block;
          background: #0066cc;
          color: white;
          padding: 14px 28px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: bold;
        ">${newsletter.cta}</a>
      </p>
    `;
  }

  fullContent += "</div>";

  // Calculate metadata
  const wordCount = countWords(fullContent);
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  const metadata: PreviewResult["metadata"] = {
    title: newsletter.title,
    wordCount,
    readingTimeMinutes,
    hasImages: /<img\s/i.test(fullContent),
    hasTakeaways: !!newsletter.takeaways?.length,
    hasCta: !!newsletter.cta,
  };

  // Generate previews
  const styles = getFrameStyles(theme);
  const result: PreviewResult = { metadata };

  const wrapWithStyles = (html: string) => `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Preview: ${newsletter.title}</title>
      <style>${styles}</style>
    </head>
    <body style="margin: 0; padding: 24px; background: ${theme === "dark" ? "#0d0d0d" : "#f0f0f0"};">
      ${html}
    </body>
    </html>
  `;

  if (viewport === "desktop" || viewport === "both") {
    result.desktop = wrapWithStyles(
      generateViewportPreview(fullContent, "desktop", theme, showFrame, metadata)
    );
  }

  if (viewport === "mobile" || viewport === "both") {
    result.mobile = wrapWithStyles(
      generateViewportPreview(fullContent, "mobile", theme, showFrame, metadata)
    );
  }

  if (viewport === "both") {
    result.combined = wrapWithStyles(`
      <div class="viewport-container">
        ${generateViewportPreview(fullContent, "desktop", theme, showFrame, metadata)}
        ${generateViewportPreview(fullContent, "mobile", theme, showFrame, metadata)}
      </div>
    `);
  }

  return result;
}
