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

  getStrategyGuidance(problemType: string): string {
    const strategies: Record<string, string> = {
      analysis: 'Focus on breaking down the problem. What are the key components? What evidence supports each component?',
      design: 'Consider the architecture. What are the main components? How do they interact? What patterns apply?',
      debugging: 'Identify the root cause. What is the expected vs actual behavior? What changed? Where is the failure?',
      planning: 'Define milestones. What are the key deliverables? What dependencies exist? What is the timeline?',
      optimization: 'Measure first. What is the current performance? What are the bottlenecks? What has the most impact?',
      decision: 'Weigh alternatives. What are the tradeoffs? What criteria matter most? What are the risks of each option?',
      creative: 'Explore possibilities. What are 3 different approaches? What would a novice try? What would an expert do differently?',
      unknown: 'Clarify the goal. What does success look like? What constraints exist? What have you tried?',
    };
    return strategies[problemType] || strategies.unknown;
  }

  computeConfidenceTrend(history: number[]): 'improving' | 'declining' | 'stable' | 'insufficient' {
    if (history.length < 3) return 'insufficient';
    const recent = history.slice(-3);
    const diff1 = recent[1] - recent[0];
    const diff2 = recent[2] - recent[1];
    const avgDiff = (diff1 + diff2) / 2;
    if (avgDiff > 0.1) return 'improving';
    if (avgDiff < -0.1) return 'declining';
    return 'stable';
  }

  getActivePerspectivePrompt(suggestions: PerspectiveSuggestion[]): string | null {
    if (suggestions.length === 0) return null;
    const primary = suggestions[0];
    return `[${primary.perspective.toUpperCase()} VIEWPOINT] ${primary.description}`;
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

  private evaluationHistory: Array<{
    problemType: string;
    strategy: string;
    perspective: string;
    value: number;
  }> = [];

  recordEvaluation(
    problemType: string,
    strategy: string,
    perspective: string,
    value: number,
  ): void {
    this.evaluationHistory.push({ problemType, strategy, perspective, value });
    if (this.evaluationHistory.length > 100) {
      this.evaluationHistory = this.evaluationHistory.slice(-100);
    }
  }

  private computeAverageScores(
    relevant: Array<{ strategy: string; perspective: string; value: number }>,
  ): { strategy: Record<string, number>; perspective: Record<string, number> } {
    const strategyScores: Record<string, { total: number; count: number }> = {};
    const perspectiveScores: Record<string, { total: number; count: number }> = {};

    for (const e of relevant) {
      if (!strategyScores[e.strategy]) strategyScores[e.strategy] = { total: 0, count: 0 };
      strategyScores[e.strategy].total += e.value;
      strategyScores[e.strategy].count++;

      if (!perspectiveScores[e.perspective]) perspectiveScores[e.perspective] = { total: 0, count: 0 };
      perspectiveScores[e.perspective].total += e.value;
      perspectiveScores[e.perspective].count++;
    }

    const avg = (s: { total: number; count: number }) => s.total / s.count;

    return {
      strategy: Object.fromEntries(
        Object.entries(strategyScores).map(([k, v]) => [k, avg(v)]),
      ),
      perspective: Object.fromEntries(
        Object.entries(perspectiveScores).map(([k, v]) => [k, avg(v)]),
      ),
    };
  }

  getAdaptiveStrategy(problemType: string): {
    recommendedStrategy: string | null;
    recommendedPerspective: string | null;
    reasoning: string;
  } {
    const relevant = this.evaluationHistory.filter(e => e.problemType === problemType);
    if (relevant.length < 3) {
      return { recommendedStrategy: null, recommendedPerspective: null, reasoning: 'Insufficient evaluation history.' };
    }

    const scores = this.computeAverageScores(relevant);
    const bestStrat = Object.entries(scores.strategy).sort((a, b) => b[1] - a[1])[0];
    const bestPersp = Object.entries(scores.perspective).sort((a, b) => b[1] - a[1])[0];

    return {
      recommendedStrategy: bestStrat?.[0] ?? null,
      recommendedPerspective: bestPersp?.[0] ?? null,
      reasoning: `From ${relevant.length} evals: "${bestStrat?.[0]}" (${bestStrat?.[1]?.toFixed(2)}), "${bestPersp?.[0]}" (${bestPersp?.[1]?.toFixed(2)}) best.`,
    };
  }

  analyzeReasoningGaps(thoughts: ThoughtData[]): {
    hasGaps: boolean;
    gaps: Array<{ thoughtNumber: number; issue: string }>;
  } {
    const gaps: Array<{ thoughtNumber: number; issue: string }> = [];
    const conclusionIndices: number[] = [];

    for (let i = 0; i < thoughts.length; i++) {
      const t = thoughts[i].thought.toLowerCase();
      if (/\b(therefore|thus|so|conclude|conclusion|therefore|hence|accordingly)\b/.test(t)) {
        conclusionIndices.push(i);
      }
    }

    for (const idx of conclusionIndices) {
      if (idx < 2) {
        gaps.push({ thoughtNumber: thoughts[idx].thoughtNumber, issue: 'Premature conclusion - too few prior thoughts' });
        continue;
      }

      const priorThoughts = thoughts.slice(0, idx);
      const hasEvidence = priorThoughts.some(t =>
        /\b(because|since|evidence|shown|demonstrated|proved|however|although|but)\b/.test(t.thought.toLowerCase()),
      );
      if (!hasEvidence) {
        gaps.push({ thoughtNumber: thoughts[idx].thoughtNumber, issue: 'Conclusion lacks supporting evidence' });
      }
    }

    return { hasGaps: gaps.length > 0, gaps };
  }

  generateReflectionPrompt(
    phase: 'exploring' | 'evaluating' | 'converging' | 'concluded',
    confidenceTrend: string,
    circularity: boolean,
    confidenceScore: number,
  ): string | null {
    if (phase !== 'converging' && phase !== 'concluded') return null;

    const prompts: string[] = [];

    if (circularity) {
      prompts.push('What assumption is causing you to loop back to the same ideas?');
    }

    if (confidenceTrend === 'declining') {
      prompts.push('Your confidence is declining. What evidence contradicts your current path?');
    }

    if (confidenceTrend === 'improving' && confidenceScore > 0.8) {
      prompts.push('High confidence detected. What might you be missing? Consider a skeptic\'s view.');
    }

    if (phase === 'concluded') {
      prompts.push('What is the single strongest counterargument to your conclusion?');
      prompts.push('If you were wrong, what would prove it?');
    }

    return prompts.length > 0 ? prompts[Math.floor(Math.random() * prompts.length)] : null;
  }

  private crossBranchPatterns: Map<string, Array<{ problemType: string; solution: string; score: number }>> = new Map();

  recordCrossBranchPattern(
    problemKey: string,
    problemType: string,
    solution: string,
    score: number,
  ): void {
    const existing = this.crossBranchPatterns.get(problemKey) || [];
    existing.push({ problemType, solution, score });
    if (existing.length > 20) existing.shift();
    this.crossBranchPatterns.set(problemKey, existing);
  }

  findCrossBranchPattern(problemKey: string): Array<{ solution: string; avgScore: number }> {
    const patterns = this.crossBranchPatterns.get(problemKey);
    if (!patterns || patterns.length === 0) return [];

    const bySolution: Record<string, { total: number; count: number }> = {};
    for (const p of patterns) {
      if (!bySolution[p.solution]) bySolution[p.solution] = { total: 0, count: 0 };
      bySolution[p.solution].total += p.score;
      bySolution[p.solution].count++;
    }

    return Object.entries(bySolution)
      .map(([solution, { total, count }]) => ({ solution, avgScore: total / count }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 3);
  }
}

export const metacognition = new Metacognition();
