import chalk from 'chalk';

// CSI sequence (`[...m`) emitted by chalk for color/style. We strip these
// before measuring "how wide is this string in a terminal" so that width math
// for box drawing isn't thrown off by non-printing escape bytes.
const ANSI_CSI = /\[\d+(?:;\d+)*m/g;

// Code-point ranges that render as full-width (2 columns) in conventional
// terminals: CJK ideographs, Hangul syllables, Hiragana/Katakana, and the
// SMP emoji blocks. This is a pragmatic subset of UAX #11 East Asian Width —
// good enough to keep CJK and emoji thoughts from breaking the box without
// pulling in a dependency.
function isWideCodePoint(code: number): boolean {
  return (
    // CJK / fullwidth (BMP)
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    // CJK Extension B–F (SMP)
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd) ||
    // Emoji blocks rendered as 2 cols in modern terminals
    (code >= 0x1f300 && code <= 0x1f6ff) ||  // Symbols & Pictographs, Emoticons, Transport
    (code >= 0x1f900 && code <= 0x1f9ff) ||  // Supplemental Symbols & Pictographs
    (code >= 0x1fa70 && code <= 0x1faff)     // Symbols & Pictographs Extended-A
  );
}

/** Width of a single grapheme cluster (1 narrow, 2 wide). */
function graphemeWidth(segment: string): number {
  if (segment.length === 0) return 0;
  const firstCp = segment.codePointAt(0)!;
  // VS-16 (U+FE0F) anywhere in the cluster forces emoji (wide) presentation.
  if (isWideCodePoint(firstCp) || segment.includes('️')) return 2;
  return 1;
}

/**
 * Best-effort terminal display width: strips ANSI styling, then sums column
 * widths per Unicode grapheme cluster (so ZWJ-joined emoji like 👨‍💻 and
 * variation-selected emoji like ⚠️ count as a single 2-column glyph). Not
 * aware of every Unicode curiosity but covers the cases that show up in real
 * thoughts: ASCII, CJK, common emoji, ZWJ sequences, VS-16.
 */
export function displayWidth(s: string): number {
  const stripped = s.replace(ANSI_CSI, '');
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  let width = 0;
  for (const { segment } of segmenter.segment(stripped)) {
    width += graphemeWidth(segment);
  }
  return width;
}

const TAB_WIDTH = 4;

// Default cap on how wide the rendered box may grow before we wrap thought
// lines. 80 columns is a safe lower bound for almost any terminal.
const DEFAULT_MAX_BOX_WIDTH = 80;

/** Expand tab characters so the box width is predictable; terminals would
 *  otherwise jump to the next tab stop and break the right border. */
function expandTabs(s: string): string {
  return s.replace(/\t/g, ' '.repeat(TAB_WIDTH));
}

/**
 * Wrap a single line so that its display width never exceeds `maxWidth`,
 * splitting only at grapheme boundaries (preserves ZWJ emoji clusters,
 * accented characters, etc.). Greedy: fills each row until the next cluster
 * would overflow.
 */
export function wrapToWidth(line: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [line];
  if (displayWidth(line) <= maxWidth) return [line];

  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const out: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const { segment } of segmenter.segment(line)) {
    const w = graphemeWidth(segment);
    if (currentWidth + w > maxWidth && current.length > 0) {
      out.push(current);
      current = segment;
      currentWidth = w;
    } else {
      current += segment;
      currentWidth += w;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

export type ThoughtValidation = { ok: true } | { ok: false; error: string };

/**
 * Cross-field semantic validation for ThoughtData. The Zod schema at the
 * SDK boundary enforces field-level shape, but cannot express dependencies
 * between fields ("revisesThought required when isRevision is true",
 * "branchFromThought must point to an earlier thought", etc.). We run this
 * after Zod parsing so the server returns helpful errors instead of
 * silently rendering "(revising thought undefined)" or dropping branch
 * data on the floor.
 */
export function validateThoughtData(input: ThoughtData): ThoughtValidation {
  if (input.isRevision) {
    if (input.revisesThought === undefined) {
      return { ok: false, error: 'revisesThought is required when isRevision is true' };
    }
    if (input.revisesThought >= input.thoughtNumber) {
      return {
        ok: false,
        error: `revisesThought (${input.revisesThought}) must be earlier than thoughtNumber (${input.thoughtNumber})`,
      };
    }
  }

  if (input.branchFromThought !== undefined) {
    if (input.branchId === undefined) {
      return { ok: false, error: 'branchId is required when branchFromThought is set' };
    }
    if (input.branchFromThought >= input.thoughtNumber) {
      return {
        ok: false,
        error: `branchFromThought (${input.branchFromThought}) must be earlier than thoughtNumber (${input.thoughtNumber})`,
      };
    }
  }

  return { ok: true };
}

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  /** Append spaces so the string occupies exactly `targetWidth` terminal columns. */
  private padToWidth(s: string, targetWidth: number): string {
    const gap = targetWidth - displayWidth(s);
    return gap > 0 ? s + ' '.repeat(gap) : s;
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    // Build the prefix in two forms: a styled version with chalk-injected ANSI
    // codes for terminal output, and a plain version we measure for width math.
    // Mixing the two avoids ANSI escape bytes inflating .length and throwing
    // off the box border alignment.
    let visiblePrefix: string;
    let styledPrefix: string;
    let context = '';

    if (isRevision) {
      visiblePrefix = '🔄 Revision';
      styledPrefix = chalk.yellow(visiblePrefix);
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      visiblePrefix = '🌿 Branch';
      styledPrefix = chalk.green(visiblePrefix);
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      visiblePrefix = '💭 Thought';
      styledPrefix = chalk.blue(visiblePrefix);
      context = '';
    }

    const visibleHeader = `${visiblePrefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const styledHeader = `${styledPrefix} ${thoughtNumber}/${totalThoughts}${context}`;

    // Multi-line thoughts get one row per line in the box. Otherwise a thought
    // like "step 1\nstep 2" would render with the second line outside the box.
    // Tabs are expanded so the right border stays put — terminals advance to
    // the next tab stop on \t which would otherwise misalign the box.
    // Long lines are then wrapped at grapheme boundaries so the box doesn't
    // overflow typical terminal widths.
    const headerWidth = displayWidth(visibleHeader);
    // Frame uses 4 columns (`│ ` + ` │`); cap content so total ≤ DEFAULT_MAX_BOX_WIDTH.
    // Header is never wrapped — it's short by construction — so the inner width
    // is at least the header width even if it slightly exceeds the cap.
    const contentCap = Math.max(headerWidth, DEFAULT_MAX_BOX_WIDTH - 4);
    const thoughtLines = expandTabs(thought)
      .split('\n')
      .flatMap((line) => wrapToWidth(line, contentCap));

    const innerWidth = Math.max(
      headerWidth,
      ...thoughtLines.map(displayWidth),
    );
    const border = '─'.repeat(innerWidth + 2);
    const headerLine = `│ ${this.padToWidth(styledHeader, innerWidth)} │`;
    const thoughtRows = thoughtLines
      .map((line) => `│ ${this.padToWidth(line, innerWidth)} │`)
      .join('\n');

    return `
┌${border}┐
${headerLine}
├${border}┤
${thoughtRows}
└${border}┘`;
  }

  public processThought(input: ThoughtData): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
    try {
      // Validation happens at the tool registration layer via Zod
      // Adjust totalThoughts if thoughtNumber exceeds it. We work on a local
      // copy so we never mutate the caller-supplied input — handlers that
      // forward the same object to other consumers shouldn't see our edits.
      const totalThoughts = Math.max(input.totalThoughts, input.thoughtNumber);
      const normalized: ThoughtData = { ...input, totalThoughts };

      this.thoughtHistory.push(normalized);

      if (normalized.branchFromThought && normalized.branchId) {
        if (!this.branches[normalized.branchId]) {
          this.branches[normalized.branchId] = [];
        }
        this.branches[normalized.branchId].push(normalized);
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(normalized);
        console.error(formattedThought);
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            thoughtNumber: normalized.thoughtNumber,
            totalThoughts: normalized.totalThoughts,
            nextThoughtNeeded: normalized.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}
