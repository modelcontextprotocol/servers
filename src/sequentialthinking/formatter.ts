import type { ThoughtFormatter, ThoughtData } from './interfaces.js';
import chalk from 'chalk';

export class ConsoleThoughtFormatter implements ThoughtFormatter {
  constructor(private readonly useColors: boolean = true) {}

  private getHeaderParts(thought: ThoughtData): { prefix: string; context: string } {
    const { isRevision, revisesThought, branchFromThought, branchId } = thought;

    if (isRevision) {
      return {
        prefix: '[Revision]',
        context: ` (revising thought ${revisesThought ?? '?'})`,
      };
    } else if (branchFromThought) {
      return {
        prefix: '[Branch]',
        context: ` (from thought ${branchFromThought}, ID: ${branchId ?? 'unknown'})`,
      };
    }
    return { prefix: '[Thought]', context: '' };
  }

  formatHeader(thought: ThoughtData): string {
    const { prefix, context } = this.getHeaderParts(thought);
    let coloredPrefix = prefix;
    if (this.useColors) {
      if (thought.isRevision) coloredPrefix = chalk.yellow(prefix);
      else if (thought.branchFromThought) coloredPrefix = chalk.green(prefix);
      else coloredPrefix = chalk.blue(prefix);
    }
    return `${coloredPrefix} ${thought.thoughtNumber}/${thought.totalThoughts}${context}`;
  }

  formatBody(thought: ThoughtData): string {
    return thought.thought;
  }

  format(thought: ThoughtData): string {
    const headerPlain = this.formatHeaderPlain(thought);
    const body = this.formatBody(thought);

    // Calculate border length based on plain text content (no ANSI codes)
    const bodyLines = body.split('\n');
    const maxLength = Math.max(headerPlain.length, ...bodyLines.map(l => l.length));
    const border = '─'.repeat(maxLength + 4);

    if (this.useColors) {
      const header = this.formatHeader(thought);
      const coloredBorder = chalk.gray(border);

      return `
${chalk.gray('┌')}${coloredBorder}${chalk.gray('┐')}
${chalk.gray('│')} ${chalk.cyan(header)} ${chalk.gray('│')}
${chalk.gray('├')}${coloredBorder}${chalk.gray('┤')}
${chalk.gray('│')} ${body.padEnd(maxLength)} ${chalk.gray('│')}
${chalk.gray('└')}${coloredBorder}${chalk.gray('┘')}`.trim();
    } else {
      return `
┌${border}┐
│ ${headerPlain} │
├${border}┤
│ ${body.padEnd(maxLength)} │
└${border}┘`.trim();
    }
  }

  private formatHeaderPlain(thought: ThoughtData): string {
    const { prefix, context } = this.getHeaderParts(thought);
    return `${prefix} ${thought.thoughtNumber}/${thought.totalThoughts}${context}`;
  }
}
