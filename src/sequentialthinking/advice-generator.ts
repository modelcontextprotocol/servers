import { ThoughtData, ThinkingPattern, ThinkingIssue, AIAdvice } from './types.js';

export class AdviceGenerator {
  public generateAdvice(
    patterns: ThinkingPattern[],
    issues: ThinkingIssue[],
    thoughtHistory: ThoughtData[],
    branches: Record<string, ThoughtData[]>
  ): AIAdvice {
    // Convert patterns' confidence scores to determine overall confidence
    const confidence = patterns.reduce((acc, p) => acc + (p.confidence || 0), 0) / Math.max(patterns.length, 1);

    // Generate main advice text based on patterns and issues
    const mainAdvice = this.generateMainAdvice(patterns, issues, thoughtHistory);

    // Group patterns by type and get supporting patterns
    const supportingPatterns = patterns.filter(p => p.strength && p.strength > 0.7);

    return {
      focusArea: 'overall',
      advice: mainAdvice, // Required property from AIAdvice interface
      adviceText: mainAdvice, // For backward compatibility
      confidence,
      relatedIssues: issues,
      relatedPatterns: patterns,
      supportingPatterns
    };
  }

  private generateMainAdvice(
    patterns: ThinkingPattern[],
    issues: ThinkingIssue[],
    thoughtHistory: ThoughtData[]
  ): string {
    let advice = '';

    // Add pattern-based observations
    if (patterns.length > 0) {
      advice += 'Based on observed thinking patterns:\n';
      patterns.forEach(pattern => {
        advice += `- ${pattern.name}: ${pattern.description}\n`;
      });
    }

    // Add issue-based recommendations
    if (issues.length > 0) {
      advice += '\nAreas for improvement:\n';
      issues.forEach(issue => {
        advice += `- ${issue.type}: ${issue.description}\n`;
        if (issue.suggestion) {
          advice += `  Suggestion: ${issue.suggestion}\n`;
        }
      });
    }

    // Add overall recommendations
    advice += '\nRecommended next steps:\n';
    if (this.shouldBranch(patterns, issues)) {
      advice += '- Consider exploring alternative perspectives\n';
    }
    if (this.needsMoreEvidence(patterns, issues)) {
      advice += '- Strengthen arguments with additional evidence\n';
    }
    if (this.shouldSynthesize(patterns, issues)) {
      advice += '- Synthesize key insights from different branches\n';
    }

    return advice.trim();
  }

  private shouldBranch(patterns: ThinkingPattern[], issues: ThinkingIssue[]): boolean {
    return patterns.some(p => p.name === 'Linear Progression') &&
           !patterns.some(p => p.name === 'Branching Exploration');
  }

  private needsMoreEvidence(patterns: ThinkingPattern[], issues: ThinkingIssue[]): boolean {
    return issues.some(i => i.type === 'logical_fallacy' || i.type === 'logical_gap');
  }

  private shouldSynthesize(patterns: ThinkingPattern[], issues: ThinkingIssue[]): boolean {
    return patterns.some(p => p.name === 'Branching Exploration') &&
           !patterns.some(p => p.name === 'Adaptive Thinking');
  }
}
