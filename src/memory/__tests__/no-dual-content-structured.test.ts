import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('memory server tool returns (regression for #2689)', () => {
  it('every tool return with structuredContent only has content: [] (no JSON text)', () => {
    // Issue #2689: memory server tools returned both `content` (text array)
    // and `structuredContent` (object) simultaneously. The MCP SDK serializes
    // both into the response payload, producing invalid JSON like
    // `{"entities":[]}<text JSON>` that some clients (e.g. Gemini CLI)
    // reject with -32603: "Unexpected non-whitespace character after JSON".
    //
    // The fix: when `structuredContent` is set, `content` must be an
    // EMPTY array (per MCP spec, when a tool has outputSchema, the
    // structuredContent is the canonical output; text content is optional).
    //
    // An empty array is sufficient for the SDK's TypeScript type check
    // AND avoids the double-serialization.

    const serverPath = path.resolve(__dirname, '..', 'index.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');

    // Find every return block with structuredContent.
    const returnBlockRegex = /return\s*\{([\s\S]*?)\};/g;
    let match: RegExpExecArray | null;
    let inspected = 0;
    const violations: string[] = [];

    while ((match = returnBlockRegex.exec(content)) !== null) {
      const block = match[1];
      if (!/structuredContent/.test(block)) continue;
      inspected += 1;

      // Find the content: line in this block.
      const contentMatch = /^\s*content:\s*(\[[^\]]*\])/m.exec(block);
      if (!contentMatch) continue;

      const contentArray = contentMatch[1];
      // The content array must be empty (no text representation of the
      // structured data — that would double-serialize).
      if (contentArray !== '[]') {
        const lineNum = content.slice(0, match.index).split('\n').length;
        violations.push(`line ${lineNum}: content=${contentArray}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `${violations.length} tool return block(s) have non-empty ` +
          `\`content\` alongside \`structuredContent\` (MCP spec violation, ` +
          `see #2689):\n  ` +
          violations.join('\n  ')
      );
    }

    // Sanity: we did inspect at least 6 blocks (the 6 tools that had
    // duplicated content in the original code).
    expect(inspected).toBeGreaterThanOrEqual(6);
  });

  it('string messages do not leak into the content array', () => {
    // The hardcoded success messages ("Entities deleted successfully"
    // etc.) used to be duplicated in `content: [{ type: "text", text: msg }]`
    // AND `structuredContent: { message: msg }`. After the fix, the
    // success message lives only in `structuredContent`.
    const serverPath = path.resolve(__dirname, '..', 'index.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');

    const successMessages = [
      'Entities deleted successfully',
      'Observations deleted successfully',
      'Relations deleted successfully',
    ];

    for (const msg of successMessages) {
      // The message must appear in structuredContent.
      const objectContext = new RegExp(
        `structuredContent\\s*:\\s*\\{[^}]*${msg.replace(/[\[\]]/g, '\\$&')}[^}]*\\}`,
      );
      expect(
        content.match(objectContext),
        `${msg} should be in structuredContent.object.message`,
      ).toBeTruthy();

      // The message must NOT appear in any content array entry.
      const contentContext = new RegExp(
        `content:\\s*\\[[^\\]]*${msg.replace(/[\[\]]/g, '\\$&')}[^\\]]*\\]`,
      );
      expect(
        content.match(contentContext),
        `${msg} should NOT be in content (would double-serialize)`,
      ).toBeNull();
    }
  });
});
