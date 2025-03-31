/**
 * Issue Detector for Sequential Thinking
 *
 * This module implements the IssueDetector component that detects issues
 * in thinking sessions.
 */

import { ThoughtData, ThinkingIssue } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { PatternAnalyzer } from './pattern-analyzer.js';

/**
 * IssueDetector class
 */
export class IssueDetector {
  private patternAnalyzer: PatternAnalyzer;

  constructor(patternAnalyzer: PatternAnalyzer) {
    this.patternAnalyzer = patternAnalyzer;
  }

  /**
   * Identify issues in the thinking
   */
  public identifyIssues(thoughtHistory: ThoughtData[]): ThinkingIssue[] {
    const issues: ThinkingIssue[] = [];

    // Look for lack of evidence
    const lacksEvidenceThoughts = this.getThoughtsLackingEvidence(thoughtHistory);
    if (lacksEvidenceThoughts.length > 0) {
      issues.push({
        id: uuidv4(),
        type: 'logical_gap',
        description: 'Claims are made without sufficient supporting evidence',
        relatedThoughts: lacksEvidenceThoughts.map(t => t.thoughtNumber),
        severity: 'medium'
      });
    }

    // Look for logical fallacies
    const fallacies = this.detectFallacies(thoughtHistory);
    for (const fallacy of fallacies) {
      issues.push({
        id: uuidv4(),
        type: 'logical_gap',
        description: `Logical fallacy detected: ${fallacy.description}`,
        relatedThoughts: fallacy.thoughtNumbers,
        severity: 'high'
      });
    }

    // Look for gaps in reasoning
    const gaps = this.identifyGaps(thoughtHistory);
    for (const gap of gaps) {
      issues.push({
        id: uuidv4(),
        type: 'logical_gap',
        description: `Gap in reasoning: ${gap.description}`,
        relatedThoughts: [gap.betweenThoughts[0], gap.betweenThoughts[1]],
        severity: 'medium'
      });
    }

    // Look for confirmation bias
    if (this.hasConfirmationBias(thoughtHistory)) {
      issues.push({
        id: uuidv4(),
        type: 'bias',
        description: 'Evidence that supports pre-existing beliefs is favored over contradictory evidence',
        relatedThoughts: this.getConfirmationBiasThoughtNumbers(thoughtHistory),
        severity: 'high'
      });
    }

    // Look for premature conclusion
    if (this.hasPrematureConclusion(thoughtHistory)) {
      issues.push({
        id: uuidv4(),
        type: 'premature_conclusion',
        description: 'Conclusion is reached before sufficient evidence or analysis',
        relatedThoughts: this.getPrematureConclusionThoughtNumbers(thoughtHistory),
        severity: 'high'
      });
    }

    return issues;
  }

  /**
   * Detect logical fallacies in thoughts
   */
  private detectFallacies(thoughts: ThoughtData[]): Array<{
    type: string;
    description: string;
    thoughtNumbers: number[];
    suggestionForImprovement: string;
  }> {
    const fallacies: Array<{
      type: string;
      description: string;
      thoughtNumbers: number[];
      suggestionForImprovement: string;
    }> = [];

    // Define fallacy patterns
    const fallacyPatterns = {
      ad_hominem: {
        keywords: ["stupid", "idiot", "ignorant", "fool", "incompetent", "dishonest", "liar", "wrong because they"],
        description: "Attacking the person rather than their argument",
        suggestion: "Focus on the argument's merits rather than attacking the person making it"
      },
      appeal_to_emotion: {
        keywords: ["fear", "scary", "terrifying", "devastating", "outrageous", "shocking", "horrible", "feel bad"],
        description: "Using emotions instead of logic to make an argument",
        suggestion: "Base arguments on facts and logic rather than emotional appeals"
      },
      false_dichotomy: {
        keywords: ["either", "or", "only two", "must be either", "no other option", "no alternative"],
        description: "Presenting only two options when more exist",
        suggestion: "Consider if there might be other alternatives or middle ground"
      },
      hasty_generalization: {
        keywords: ["always", "never", "everyone", "nobody", "all people", "every time", "proves that all"],
        description: "Drawing conclusions from insufficient evidence",
        suggestion: "Gather more evidence before making broad generalizations"
      },
      straw_man: {
        keywords: ["claims that", "says that", "argues that", "believes that", "thinks that"],
        description: "Misrepresenting an argument to make it easier to attack",
        suggestion: "Ensure you're addressing the actual argument being made"
      }
    };

    // Sliding window analysis
    const windowSize = 3; // Analyze 3 thoughts at a time
    for (let i = 0; i <= thoughts.length - windowSize; i++) {
      const window = thoughts.slice(i, i + windowSize);

      // Check each thought in the window for fallacies
      window.forEach((thought, index) => {
        const text = thought.thought.toLowerCase();

        // Check for each fallacy type
        Object.entries(fallacyPatterns).forEach(([fallacyType, pattern]) => {
          // Check if any of the fallacy keywords are present
          if (pattern.keywords.some(keyword => text.includes(keyword))) {
            // For straw man, additional check to see if it's actually misrepresenting something
            if (fallacyType === 'straw_man') {
              // Only count as straw man if the thought containing "claims/says/argues that"
              // is followed by a rebuttal or criticism in the same or next thought within the window
              const nextThought = (index + 1) < windowSize ? window[index + 1] : null;
              if (!nextThought || !this.isRebuttal(nextThought.thought)) {
                return;
              }
            }

            // Add the fallacy to the list
            fallacies.push({
              type: fallacyType,
              description: pattern.description,
              thoughtNumbers: [thought.thoughtNumber],
              suggestionForImprovement: pattern.suggestion
            });
          }
        });
      });
    }

    return fallacies;
  }

  /**
   * Helper method to detect if a thought contains a rebuttal
   */
  private isRebuttal(text: string): boolean {
    const rebuttalKeywords = [
      "wrong",
      "incorrect",
      "false",
      "mistaken",
      "error",
      "disagree",
      "but actually",
      "however",
      "in fact",
      "contrary"
    ];
    
    return rebuttalKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
  }

  /**
   * Identify gaps in reasoning between thoughts
   */
  private identifyGaps(thoughts: ThoughtData[]): Array<{
    description: string;
    betweenThoughts: [number, number];
    suggestionForImprovement: string;
  }> {
    const gaps: Array<{
      description: string;
      betweenThoughts: [number, number];
      suggestionForImprovement: string;
    }> = [];

    // Check each pair of consecutive thoughts
    for (let i = 0; i < thoughts.length - 1; i++) {
      const currentThought = thoughts[i];
      const nextThought = thoughts[i + 1];
      
      // Skip if thoughts are in different branches
      if (nextThought.branchFromThought !== undefined && nextThought.branchFromThought !== currentThought.thoughtNumber) {
        continue;
      }

      const currentText = currentThought.thought.toLowerCase();
      const nextText = nextThought.thought.toLowerCase();

      // Calculate coherence score
      const keywords1 = new Set(currentText.split(/\s+/));
      const keywords2 = new Set(nextText.split(/\s+/));
      const commonKeywords = new Set([...keywords1].filter(x => keywords2.has(x)));
      const overlapRatio = commonKeywords.size / Math.min(keywords1.size, keywords2.size);

      if (overlapRatio < 0.2) { // Less than 20% keyword overlap
        gaps.push({
          description: "Significant shift in topic without clear connection",
          betweenThoughts: [currentThought.thoughtNumber, nextThought.thoughtNumber],
          suggestionForImprovement: "Explain how these ideas are related"
        });
      }
    }

    return gaps;
  }

  /**
   * Get thoughts that make claims without providing supporting evidence
   */
  private getThoughtsLackingEvidence(thoughtHistory: ThoughtData[]): ThoughtData[] {
    const claimKeywords = [
      "because",
      "therefore",
      "thus",
      "consequently",
      "hence",
      "so",
      "conclude",
      "proves",
      "shows",
      "demonstrates"
    ];

    const evidenceKeywords = [
      "evidence",
      "data",
      "research",
      "study",
      "fact",
      "example",
      "observation",
      "measurement",
      "analysis",
      "experiment"
    ];

    return thoughtHistory.filter(thought => {
      const text = thought.thought.toLowerCase();
      const hasClaim = claimKeywords.some(keyword => text.includes(keyword));
      if (!hasClaim) return false;
      const hasEvidence = evidenceKeywords.some(keyword => text.includes(keyword));
      return !hasEvidence;
    });
  }

  private hasConfirmationBias(thoughtHistory: ThoughtData[]): boolean {
    return this.getConfirmationBiasThoughtNumbers(thoughtHistory).length > 0;
  }

  private getConfirmationBiasThoughtNumbers(thoughtHistory: ThoughtData[]): number[] {
    const biasedThoughts: number[] = [];
    const beliefs = new Map<number, string>();

    // First pass: identify beliefs/hypotheses
    thoughtHistory.forEach(thought => {
      const text = thought.thought.toLowerCase();
      if (text.includes("believe") || text.includes("think") || text.includes("hypothesis")) {
        beliefs.set(thought.thoughtNumber, text);
      }
    });

    // Second pass: analyze evidence handling for each belief
    beliefs.forEach((beliefText, beliefThoughtNumber) => {
      let supportCount = 0;
      let contradictCount = 0;

      thoughtHistory.filter(t => t.thoughtNumber > beliefThoughtNumber)
        .forEach(thought => {
          const text = thought.thought.toLowerCase();
          if (this.hasTextOverlap(text, beliefText)) {
            if (text.includes("proves") || text.includes("confirms") || text.includes("supports")) {
              supportCount++;
            }
            if (text.includes("but") || text.includes("however") || text.includes("although")) {
              contradictCount++;
            }
          }
        });

      if (supportCount > contradictCount * 2) {
        biasedThoughts.push(beliefThoughtNumber);
      }
    });

    return [...new Set(biasedThoughts)];
  }

  private hasTextOverlap(text1: string, text2: string): boolean {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    const commonWords = new Set([...words1].filter(x => words2.has(x)));
    return commonWords.size >= 2;
  }

  private hasPrematureConclusion(thoughtHistory: ThoughtData[]): boolean {
    return this.getPrematureConclusionThoughtNumbers(thoughtHistory).length > 0;
  }

  private getPrematureConclusionThoughtNumbers(thoughtHistory: ThoughtData[]): number[] {
    const prematureThoughts: number[] = [];

    thoughtHistory.forEach((currentThought, index) => {
      const text = currentThought.thought.toLowerCase();
      if (text.includes("therefore") || text.includes("thus") || text.includes("conclude")) {
        const previousThoughts = thoughtHistory.slice(0, index);
        if (previousThoughts.length < 3) {
          prematureThoughts.push(currentThought.thoughtNumber);
        }
      }
    });

    return prematureThoughts;
  }
}
