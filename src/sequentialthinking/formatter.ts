import type { ThoughtFormatter, ThoughtData } from './interfaces.js';
import chalk from 'chalk';

export class ConsoleThoughtFormatter implements ThoughtFormatter {
  constructor(private readonly useColors: boolean = true) {}
  
  formatHeader(thought: ThoughtData): string {
    const {
      thoughtNumber, totalThoughts, isRevision,
      revisesThought, branchFromThought, branchId,
    } = thought;
    
    let prefix = '';
    let context = '';
    
    if (this.useColors) {
      if (isRevision) {
        prefix = chalk.yellow('🔄 Revision');
        context = ` (revising thought ${revisesThought})`;
      } else if (branchFromThought) {
        prefix = chalk.green('🌿 Branch');
        context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
      } else {
        prefix = chalk.blue('💭 Thought');
        context = '';
      }
    } else {
      if (isRevision) {
        prefix = '🔄 Revision';
        context = ` (revising thought ${revisesThought})`;
      } else if (branchFromThought) {
        prefix = '🌿 Branch';
        context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
      } else {
        prefix = '💭 Thought';
        context = '';
      }
    }
    
    return `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
  }
  
  formatBody(thought: ThoughtData): string {
    return thought.thought;
  }
  
  format(thought: ThoughtData): string {
    const header = this.formatHeader(thought);
    const body = this.formatBody(thought);
    
    // Calculate border length based on content
    const maxLength = Math.max(header.length, body.length);
    const border = '─'.repeat(maxLength + 4);
    
    if (this.useColors) {
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
│ ${header} │
├${border}┤
│ ${body.padEnd(maxLength)} │
└${border}┘`.trim();
    }
  }
}

export class JsonThoughtFormatter implements ThoughtFormatter {
  constructor(private readonly includeContent: boolean = true) {}
  
  formatHeader(_thought: ThoughtData): string {
    return '';
  }
  
  formatBody(thought: ThoughtData): string {
    return thought.thought;
  }
  
  format(thought: ThoughtData): string {
    const formatted = {
      thoughtNumber: thought.thoughtNumber,
      totalThoughts: thought.totalThoughts,
      nextThoughtNeeded: thought.nextThoughtNeeded,
      isRevision: thought.isRevision,
      revisesThought: thought.revisesThought,
      branchFromThought: thought.branchFromThought,
      branchId: thought.branchId,
      timestamp: thought.timestamp,
      sessionId: thought.sessionId,
      ...(this.includeContent && { thought: thought.thought }),
    };
    
    return JSON.stringify(formatted, null, 2);
  }
}

export class PlainTextFormatter implements ThoughtFormatter {
  formatHeader(thought: ThoughtData): string {
    const {
      thoughtNumber, totalThoughts, isRevision,
      revisesThought, branchFromThought, branchId,
    } = thought;
    
    let prefix = '';
    let context = '';
    
    if (isRevision) {
      prefix = '[REVISION]';
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = '[BRANCH]';
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = '[THOUGHT]';
      context = '';
    }
    
    return `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
  }
  
  formatBody(thought: ThoughtData): string {
    return thought.thought;
  }
  
  format(thought: ThoughtData): string {
    const header = this.formatHeader(thought);
    const body = this.formatBody(thought);
    
    return `${header}
${body}`;
  }
}

export class CompositeFormatter implements ThoughtFormatter {
  private readonly formatters: ThoughtFormatter[] = [];
  
  constructor(formatters: ThoughtFormatter[]) {
    this.formatters = formatters;
  }
  
  formatHeader(thought: ThoughtData): string {
    return this.formatters[0]?.formatHeader?.(thought) ?? '';
  }
  
  formatBody(thought: ThoughtData): string {
    return this.formatters[0]?.formatBody?.(thought) ?? '';
  }
  
  format(thought: ThoughtData): string {
    // Return the first formatter's output
    if (this.formatters.length > 0) {
      return this.formatters[0].format(thought);
    }
    
    throw new Error('No formatters configured');
  }
  
  // Method to log using all formatters (for multiple outputs)
  formatAll(thought: ThoughtData): string[] {
    return this.formatters.map(
      formatter => formatter.format(thought),
    );
  }
}

interface FormatterOptions {
  useColors?: boolean;
  includeContent?: boolean;
}

// Factory function to create formatters based on configuration
export function createFormatter(
  type: 'console' | 'json' | 'plain',
  options: FormatterOptions = {},
): ThoughtFormatter {
  switch (type) {
  case 'console':
    return new ConsoleThoughtFormatter(options.useColors !== false);
  case 'json':
    return new JsonThoughtFormatter(
      options.includeContent !== false,
    );
  case 'plain':
    return new PlainTextFormatter();
  default:
    throw new Error(`Unknown formatter type: ${type}`);
  }
}
