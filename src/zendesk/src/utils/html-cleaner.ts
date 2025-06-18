/**
 * Utility for cleaning HTML content returned from Zendesk API
 */

/**
 * Clean HTML content by removing empty tags and unnecessary attributes
 * @param html The HTML content to clean
 * @returns Cleaned HTML content
 */
export function cleanHtmlContent(html: string | undefined): string | undefined {
  if (!html) return html;

  // Regular expression pattern to remove empty tags
  // Removes empty tags like <p> </p>, <p></p>, <h3> </h3>, etc.
  const emptyTagPattern = /<([a-z][a-z0-9]*)[^>]*>\s*<\/\1>/gi;

  // Regular expression patterns to remove unnecessary attributes
  const styleAttributePattern = /\s+style=["']([^"']*)["']/gi;
  const idAttributePattern = /\s+id=["']([^"']*)["']/gi;
  const classAttributePattern = /\s+class=["']([^"']*)["']/gi;
  const targetAttributePattern = /\s+target=["']([^"']*)["']/gi;
  const borderAttributePattern = /\s+border=["']([^"']*)["']/gi;

  // Patterns to remove unnecessary tags but keep their text content
  const spanTagPattern = /<span[^>]*>([\s\S]*?)<\/span>/gi;
  const fontTagPattern = /<font[^>]*>([\s\S]*?)<\/font>/gi;

  // Remove consecutive blank lines
  const multipleLineBreaksPattern = /\n\s*\n/g;

  // Remove empty tags
  let cleanedHtml = html.replace(emptyTagPattern, "");

  // Remove unnecessary attributes
  cleanedHtml = cleanedHtml.replace(styleAttributePattern, "");
  cleanedHtml = cleanedHtml.replace(idAttributePattern, "");
  cleanedHtml = cleanedHtml.replace(classAttributePattern, "");
  cleanedHtml = cleanedHtml.replace(targetAttributePattern, "");
  cleanedHtml = cleanedHtml.replace(borderAttributePattern, "");

  // Remove unnecessary tags but keep their text content
  cleanedHtml = cleanedHtml.replace(spanTagPattern, "$1");
  cleanedHtml = cleanedHtml.replace(fontTagPattern, "$1");

  // Replace consecutive blank lines with a single line break
  cleanedHtml = cleanedHtml.replace(multipleLineBreaksPattern, "\n");

  // Remove extra line breaks inside table cells
  cleanedHtml = cleanedHtml.replace(/<td>\s*<p>(.*?)<\/p>\s*<\/td>/gi, "<td>$1</td>");

  return cleanedHtml;
}
