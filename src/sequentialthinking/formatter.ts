import type { ThoughtFormatter, ThoughtData } from './interfaces.js';
import chalk from 'chalk';

export class ConsoleThoughtFormatter implements ThoughtFormatter {
  constructor(private readonly useColors = true) {}

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

  format(thought: ThoughtData): string {
    const { prefix, context } = this.getHeaderParts(thought);
    const suffix = ` ${thought.thoughtNumber}/${thought.totalThoughts}${context}`;
    const headerPlain = `${prefix}${suffix}`;
    const body = thought.thought;

    const bodyLines = body.split('\n');
    const maxLength = Math.max(headerPlain.length, ...bodyLines.map(l => l.length));
    const border = '─'.repeat(maxLength + 4);

    if (this.useColors) {
      let coloredPrefix: string;
      if (thought.isRevision) coloredPrefix = chalk.yellow(prefix);
      else if (thought.branchFromThought) coloredPrefix = chalk.green(prefix);
      else coloredPrefix = chalk.blue(prefix);
      const header = `${coloredPrefix}${suffix}`;
      const coloredBorder = chalk.gray(border);

      return `
 ${chalk.gray('┌')}${coloredBorder}${chalk.gray('┐')}
 ${chalk.gray('│')} ${chalk.cyan(header)} ${chalk.gray('│')}
 ${chalk.gray('├')}${coloredBorder}${chalk.gray('┤')}
 ${chalk.gray('│')} ${body.padEnd(maxLength)} ${chalk.gray('│')}
 ${chalk.gray('└')}${coloredBorder}${chalk.gray('┘')}`.trim();
    }
    return `
┌${border}┐
│ ${headerPlain} │
├${border}┤
│ ${body.padEnd(maxLength)} │
└${border}┘`.trim();
  }
}
