import { describe, it, expect } from 'vitest';
import { ConsoleThoughtFormatter } from '../../formatter.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

describe('ConsoleThoughtFormatter', () => {
  describe('formatHeader (non-color mode)', () => {
    const formatter = new ConsoleThoughtFormatter(false);

    it('should produce plain [Thought] prefix for regular thought', () => {
      const header = formatter.formatHeader(makeThought());
      expect(header).toBe('[Thought] 1/3');
    });

    it('should produce [Revision] prefix for revision', () => {
      const header = formatter.formatHeader(
        makeThought({ isRevision: true, revisesThought: 1, thoughtNumber: 2 }),
      );
      expect(header).toBe('[Revision] 2/3 (revising thought 1)');
    });

    it('should produce [Branch] prefix for branch', () => {
      const header = formatter.formatHeader(
        makeThought({ branchFromThought: 1, branchId: 'b1', thoughtNumber: 2 }),
      );
      expect(header).toBe('[Branch] 2/3 (from thought 1, ID: b1)');
    });

    it('should not contain emoji in non-color mode', () => {
      const header = formatter.formatHeader(makeThought());
      expect(header).not.toMatch(/[\u{1F300}-\u{1FAD6}]/u);
    });
  });

  describe('formatHeader (color mode)', () => {
    const formatter = new ConsoleThoughtFormatter(true);

    it('should contain [Thought] text for regular thought', () => {
      const header = formatter.formatHeader(makeThought());
      // chalk is mocked as identity, so output is same as plain
      expect(header).toContain('[Thought]');
      expect(header).toContain('1/3');
    });

    it('should contain [Revision] text for revision', () => {
      const header = formatter.formatHeader(
        makeThought({ isRevision: true, revisesThought: 1, thoughtNumber: 2 }),
      );
      expect(header).toContain('[Revision]');
    });
  });

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

  describe('formatBody', () => {
    const formatter = new ConsoleThoughtFormatter(false);

    it('should return thought text as-is', () => {
      const body = formatter.formatBody(makeThought({ thought: 'hello world' }));
      expect(body).toBe('hello world');
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
      const header = formatter.formatHeader(
        makeThought({ isRevision: true, revisesThought: undefined }),
      );
      expect(header).toContain('?');
      expect(header).not.toContain('undefined');
    });

    it('should show fallback for undefined branchId', () => {
      const header = formatter.formatHeader(
        makeThought({ branchFromThought: 1, branchId: undefined }),
      );
      expect(header).toContain('unknown');
      expect(header).not.toContain('undefined');
    });
  });
});
