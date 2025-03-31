import { ThoughtData, OptimizedPrompt } from './types.js';

interface OptimizerResult {
  prompt: string;
  stats: {
    originalTokens: number;
    optimizedTokens: number;
    compressionRatio: number;
  };
}

export class PromptOptimizer {
  private static patterns = {
    redundantPhrases: [
      /please |kindly |if you could |would you |can you /gi,
      /thoroughly |completely |fully /gi,
      /I want you to |I would like you to |I need you to /gi,
      /in order to |for the purpose of /gi,
      /considering all aspects of /gi
    ],
    semanticShortcuts: {
      'analyze and provide feedback': 'analyze',
      'potential improvements and enhancements': 'enhance',
      'identify issues and problems': 'issues',
      'explain in detail': 'explain',
      'implementation plan and strategy': 'plan'
    }
  };

  static compress(context: string): OptimizerResult {
    const original = context.trim();
    let optimized = original;

    // Remove redundant phrases
    this.patterns.redundantPhrases.forEach(pattern => {
      optimized = optimized.replace(pattern, '');
    });

    // Apply semantic shortcuts
    Object.entries(this.patterns.semanticShortcuts).forEach(([phrase, shortcut]) => {
      optimized = optimized.replace(new RegExp(phrase, 'gi'), shortcut);
    });

    // Apply hierarchical structure
    optimized = this.structureHierarchically(optimized);

    // Calculate stats
    const stats = {
      originalTokens: this.estimateTokens(original),
      optimizedTokens: this.estimateTokens(optimized),
      compressionRatio: 0
    };
    stats.compressionRatio = 1 - (stats.optimizedTokens / stats.originalTokens);

    return { prompt: optimized, stats };
  }

  static validate(prompt: string): boolean {
    // Ensure key information markers are present
    const requiredMarkers = ['analyze', 'enhance', 'plan'];
    return requiredMarkers.some(marker => prompt.includes(marker));
  }

  private static structureHierarchically(text: string): string {
    // Convert flat text to hierarchical structure
    const sections = text.split(/[.!?]\s+/);
    const structured = sections
      .filter(s => s.length > 0)
      .map(s => s.trim())
      .join(' > ');
    return structured;
  }

  private static estimateTokens(text: string): number {
    // Simple token estimation (words + punctuation)
    return text.split(/[\s\p{P}]+/u).length;
  }

  static optimizeThought(thought: ThoughtData): OptimizedPrompt {
    // Create a more detailed context for Claude analysis
    const context = `
    Analyze the following thought in detail:
    
    Thought ${thought.thoughtNumber}/${thought.totalThoughts}:
    ${thought.thought}
    
    Context:
    ${thought.isChainOfThought ? `- Part of Chain of Thought sequence (Step ${thought.chainOfThoughtStep}/${thought.totalChainOfThoughtSteps})` : ''}
    ${thought.isHypothesis ? '- This is a hypothesis' : ''}
    ${thought.isVerification ? '- This is a verification step' : ''}
    ${thought.confidenceLevel ? `- Confidence Level: ${thought.confidenceLevel}%` : ''}
    
    Please provide the analysis using bullet points for the following sections:
    - Key insights and implications
    - Potential issues or considerations
    - Suggestions for improvement
    - Connection to previous thoughts
    - Impact on overall reasoning
    `;

    const { prompt, stats } = this.compress(context);

    return {
      original: context,
      optimized: prompt,
      compressionStats: stats,
      prompt: prompt
    };
  }
}
