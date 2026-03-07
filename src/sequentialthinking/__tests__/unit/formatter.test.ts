import { describe, it, expect } from 'vitest';
import { ConsoleThoughtFormatter } from '../../formatter.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

describe('ConsoleThoughtFormatter', () => {
  describe('format (non-color mode)', () => {
    const formatter = new ConsoleThoughtFormatter(false);

    it('should produce box-drawing border', () => {
      const output = formatter.format(makeThought());
      expect(output).toContain('┌');
      expect(output).toContain('┘');
      expect(output).toContain('─');
    });

    it('should contain header and body', () => {
      const output = formatter.format(makeThought({ thought: 'My analysis' }));
      expect(output).toContain('[Thought] 1/3');
      expect(output).toContain('My analysis');
    });

    it('should have border width matching content', () => {
      const thought = makeThought({ thought: 'Short' });
      const output = formatter.format(thought);
      const lines = output.split('\n');
      // All border lines should have the same length
      const borderLines = lines.filter(l => l.startsWith('┌') || l.startsWith('└') || l.startsWith('├'));
      const lengths = borderLines.map(l => l.length);
      expect(new Set(lengths).size).toBe(1);
    });
  });

  describe('multiline body', () => {
    const formatter = new ConsoleThoughtFormatter(false);

    it('should not throw on multiline thought body', () => {
      const output = formatter.format(makeThought({ thought: 'Line one\nLine two' }));
      expect(output).toContain('Line one');
      expect(output).toContain('Line two');
    });
  });

  describe('undefined optional fields', () => {
    const formatter = new ConsoleThoughtFormatter(false);

    it('should show fallback for undefined revisesThought', () => {
      const output = formatter.format(
        makeThought({ isRevision: true, revisesThought: undefined }),
      );
      expect(output).toContain('?');
      expect(output).not.toContain('undefined');
    });

    it('should show fallback for undefined branchId', () => {
      const output = formatter.format(
        makeThought({ branchFromThought: 1, branchId: undefined }),
      );
      expect(output).toContain('unknown');
      expect(output).not.toContain('undefined');
    });
  });
});
