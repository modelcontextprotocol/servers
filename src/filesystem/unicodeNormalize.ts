/**
 * Utility functions for Unicode normalization of file paths.
 * Specifically handles macOS screenshot filenames and similar Unicode quirks.
 */
export function normalizeUnicodePath(filename: string): string {
    // NFC normalization plus replacement for non-breaking and uncommon spaces/punctuation
    return filename
      .normalize('NFC')
      .replace(/\u00A0/g, ' ') // Non-breaking space (U+00A0) to normal space
      .replace(/[\u2000-\u206F\u2E00-\u2E7F]/g, ' '); // Other Unicode spaces/punctuations to space
  }