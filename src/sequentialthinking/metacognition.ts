import type { ThoughtData } from './interfaces.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'then', 'once', 'if', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up',
  'down', 'out', 'off', 'over', 'under', 'again', 'further', 'am', 'its',
]);

const PERSPECTIVES = [
  { name: 'optimist', description: 'What are the best possible outcomes and opportunities?', prefix: 'From an optimistic angle:' },
  { name: 'pessimist', description: 'What could go wrong and what are the risks?', prefix: 'From a cautious perspective:' },
  { name: 'expert', description: 'What would a domain expert immediately recognize?', prefix: 'An expert would note:' },
  { name: 'beginner', description: 'What basic questions might someone new ask?', prefix: 'A beginner would ask:' },
  { name: 'skeptic', description: 'What assumptions might be wrong?', prefix: 'Skeptically considering:' },
];

export interface CircularityResult {
  isCircular: boolean;
  similarity: number;
  consecutiveCount: number;
  warning: string | null;
}

export interface ConfidenceResult {
  confidence: number;
  factors: string[];
  suggestion: string | null;
}

export interface PerspectiveSuggestion {
  perspective: string;
  description: string;
  prompt: string;
}

export interface ProblemType {
  type: 'analysis' | 'design' | 'debugging' | 'planning' | 'optimization' | 'decision' | 'creative' | 'unknown';
  confidence: number;
  indicators: string[];
}

export interface PatternMatch {
  pattern: string;
  similarity: number;
  solution: string;
}

export class Metacognition {
  private circularityHistory: Map<string, CircularityResult> = new Map();

  tokenize(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));
    return new Set(words);
  }

  jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  detectCircularity(
    thoughts: ThoughtData[],
    threshold = 0.6,
    minConsecutive = 3,
  ): CircularityResult {
    if (thoughts.length < minConsecutive) {
      return { isCircular: false, similarity: 0, consecutiveCount: 0, warning: null };
    }

    const recentThoughts = thoughts.slice(-minConsecutive * 2);
    const tokens = recentThoughts.map(t => this.tokenize(t.thought));

    let maxConsecutive = 0;
    let currentConsecutive = 0;
    let maxSimilarity = 0;

    for (let i = 1; i < tokens.length; i++) {
      const similarity = this.jaccardSimilarity(tokens[i - 1], tokens[i]);
      maxSimilarity = Math.max(maxSimilarity, similarity);

      if (similarity > threshold) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }

    const isCircular = maxConsecutive >= minConsecutive;
    const warning = isCircular
      ? `Circular thinking detected (${maxConsecutive} similar thoughts, ${Math.round(maxSimilarity * 100)}% similarity). Consider pivoting or exploring a different approach.`
      : null;

    return {
      isCircular,
      similarity: maxSimilarity,
      consecutiveCount: maxConsecutive,
      warning,
    };
  }

  assessConfidence(thought: string, context: ThoughtData[], previousConfidence: number | null): ConfidenceResult {
    const factors: string[] = [];
    let confidence = this.computeBaseConfidence(thought, factors);

    if (previousConfidence !== null && context.length > 0) {
      confidence = this.adjustForRepetition(thought, context, previousConfidence, confidence, factors);
    }

    confidence = Math.max(0, Math.min(1, confidence));

    return this.buildConfidenceResult(confidence, factors);
  }

  private computeBaseConfidence(thought: string, factors: string[]): number {
    let conf = 0.7;
    const hasAction = /\b(should|must|need|will|definitely|certainly)\b/i.test(thought);
    const hasHedge = /\b(maybe|perhaps|might|could|possibly|probably)\b/i.test(thought);
    const hasEvidence = /\b(because|since|evidence|shown|demonstrated|proved)\b/i.test(thought);
    const hasQuestion = /\?$/.test(thought.trim());
    const hasUncertainty = /\b(不确定|not sure|don'?t know|unclear)\b/i.test(thought.toLowerCase());

    if (hasAction) { conf += 0.1; factors.push('assertive language'); }
    if (hasHedge) { conf -= 0.15; factors.push('hedging language'); }
    if (hasEvidence) { conf += 0.1; factors.push('evidence-based'); }
    if (hasQuestion) { conf -= 0.1; factors.push('question form'); }
    if (hasUncertainty) { conf -= 0.2; factors.push('explicit uncertainty'); }

    return conf;
  }

  private adjustForRepetition(
    thought: string,
    context: ThoughtData[],
    prevConf: number,
    conf: number,
    factors: string[],
  ): number {
    const similarity = this.jaccardSimilarity(
      this.tokenize(thought),
      this.tokenize(context[context.length - 1]?.thought || ''),
    );
    if (similarity > 0.7 && prevConf > 0.6) {
      conf -= 0.1;
      factors.push('repetitive content');
    }
    return conf;
  }

  private buildConfidenceResult(confidence: number, factors: string[]): ConfidenceResult {
    let suggestion: string | null = null;
    if (confidence < 0.4) {
      suggestion = 'Low confidence detected. Consider gathering more evidence or exploring alternative perspectives.';
    } else if (confidence > 0.8 && factors.length > 2) {
      suggestion = 'High confidence. Consider if you might be overconfident - seek counterarguments?';
    }
    return { confidence, factors, suggestion };
  }

  suggestPerspective(stuck = false, attemptCount = 0): PerspectiveSuggestion[] {
    if (!stuck && attemptCount < 2) {
      return [];
    }

    const numSuggestions = Math.min(attemptCount + 1, PERSPECTIVES.length);
    const shuffled = [...PERSPECTIVES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, numSuggestions).map(p => ({
      perspective: p.name,
      description: p.description,
      prompt: `${p.prefix} ${p.description}`,
    }));
  }

  classifyProblemType(thoughts: ThoughtData[]): ProblemType {
    if (thoughts.length === 0) {
      return { type: 'unknown', confidence: 0, indicators: [] };
    }

    const allText = thoughts.map(t => t.thought.toLowerCase()).join(' ');

    const typeIndicators = {
      analysis: ['analyze', 'examine', 'investigate', 'break down', 'understand', 'assess', 'evaluate', 'review'],
      design: ['design', 'create', 'build', 'develop', 'architect', 'structure', 'plan', 'construct'],
      debugging: ['bug', 'error', 'fix', 'issue', 'problem', 'wrong', 'broken', 'fail', 'exception'],
      planning: ['plan', 'strategy', 'roadmap', 'milestone', 'goal', 'objective', 'future', 'execute'],
      optimization: ['optimize', 'improve', 'better', 'performance', 'efficient', 'faster', 'reduce', 'enhance'],
      decision: ['choose', 'decision', 'option', 'alternative', 'select', 'pick', 'compare', 'tradeoff'],
      creative: ['creative', 'innovative', 'novel', 'new', 'idea', 'brainstorm', 'imagine', 'invent'],
    };

    const scores: Record<string, number> = {};
    for (const [type, keywords] of Object.entries(typeIndicators)) {
      scores[type] = keywords.filter(kw => allText.includes(kw)).length;
    }

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topType, topScore] = entries[0];

    const confidence = topScore > 0 ? Math.min(0.9, 0.3 + topScore * 0.2) : 0.1;
    const indicators = typeIndicators[topType as keyof typeof typeIndicators]
      ?.filter(kw => allText.includes(kw)) || [];

    return {
      type: topType as ProblemType['type'],
      confidence,
      indicators,
    };
  }

  findSimilarPatterns(currentProblem: string, patternDatabase: PatternMatch[] = []): PatternMatch[] {
    if (patternDatabase.length === 0) {
      return [];
    }

    const currentTokens = this.tokenize(currentProblem);
    const scored = patternDatabase.map(pattern => ({
      ...pattern,
      similarity: this.jaccardSimilarity(currentTokens, this.tokenize(pattern.pattern)),
    }));

    return scored
      .filter(p => p.similarity > 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }
}

export const metacognition = new Metacognition();
