/**
 * Metacognition module for self-aware problem-solving.
 * Provides circularity detection, confidence scoring, perspective switching,
 * problem type classification, reasoning gap analysis, and adaptive learning.
 */
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

    const typeIndicators: Record<string, string[]> = {
      analysis: ['analyze', 'examine', 'investigate', 'break down', 'understand', 'assess', 'evaluate', 'review', 'explore', 'diagnose'],
      design: ['design', 'create', 'build', 'develop', 'architect', 'structure', 'plan', 'construct', 'interface', 'schema'],
      debugging: ['bug', 'error', 'fix', 'issue', 'problem', 'wrong', 'broken', 'fail', 'exception', 'crash', 'stack trace'],
      planning: ['plan', 'strategy', 'roadmap', 'milestone', 'goal', 'objective', 'future', 'execute', 'timeline', 'deliverable'],
      optimization: ['optimize', 'improve', 'better', 'performance', 'efficient', 'faster', 'reduce', 'enhance', 'latency', 'throughput'],
      decision: ['choose', 'decision', 'option', 'alternative', 'select', 'pick', 'compare', 'tradeoff', 'pros', 'cons'],
      creative: ['creative', 'innovative', 'novel', 'new', 'idea', 'brainstorm', 'imagine', 'invent', 'discover', 'generate'],
      refactoring: ['refactor', 'restructure', 'cleanup', 'simplify', 'debt', 'technical debt', 'improve code', 'reorganize'],
      testing: ['test', 'coverage', 'unit test', 'integration test', 'test case', 'assertion', 'mock', 'verify', 'spec'],
      security: ['security', 'vulnerability', 'attack', 'breach', 'auth', 'authorization', 'authentication', 'encryption', 'permission', 'threat'],
      performance: ['performance', 'speed', 'memory', 'cpu', 'bottleneck', 'profiling', 'load', 'scalability', 'cache'],
      integration: ['integrate', 'connect', 'api', 'interface', 'bridge', 'compatibility', 'interop', 'dependency'],
      migration: ['migrate', 'upgrade', 'convert', 'transform', 'import', 'export', 'backup', 'restore', 'transition'],
      documentation: ['document', 'doc', 'readme', 'specification', 'manual', 'guide', 'explain', 'describe'],
      research: ['research', 'investigate', 'explore', 'study', 'compare', 'alternatives', 'options', 'feasibility'],
      review: ['review', 'audit', 'assess', 'quality', 'best practice', 'standard', 'compliance', 'check'],
      deployment: ['deploy', 'release', 'publish', 'environment', 'staging', 'production', 'ci', 'cd', 'pipeline'],
      troubleshooting: ['troubleshoot', 'debug', 'solve', 'resolve', 'root cause', 'diagnostic', 'symptom'],
      architecture: ['architecture', 'system design', 'microservice', 'monolith', 'distributed', 'component', 'layer', 'pattern'],
      api_design: ['api', 'endpoint', 'rest', 'graphql', 'protocol', 'request', 'response', 'payload', 'schema'],
      data_modeling: ['database', 'schema', 'entity', 'relationship', 'table', 'model', 'normalization', 'query'],
      ux_design: ['user experience', 'ui', 'interface', 'design', 'accessibility', 'usability', 'user flow', 'prototype'],
      technical_writing: ['documentation', 'manual', 'guide', 'tutorial', 'spec', 'readme', 'changelog'],
      code_generation: ['generate', 'create code', 'scaffold', 'boilerplate', 'template', 'auto-generate', 'write code'],
    };

    const scores: Record<string, number> = {};
    for (const [type, keywords] of Object.entries(typeIndicators)) {
      scores[type] = keywords.filter(kw => allText.includes(kw)).length;
    }

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topType, topScore] = entries[0];

    const confidence = topScore > 0 ? Math.min(0.9, 0.3 + topScore * 0.15) : 0.1;
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
      analysis: 'Break down the problem. What are the key components? What evidence supports each? Consider root causes.',
      design: 'Define the architecture. What are the main components? How do they interact? What patterns apply?',
      debugging: 'Identify the root cause. What is expected vs actual? What changed? Where does it fail? Check logs and traces.',
      planning: 'Define milestones. What are deliverables? What dependencies? What is the timeline? Identify risks.',
      optimization: 'Measure first. What is current performance? What are bottlenecks? What has most impact? Profile before optimizing.',
      decision: 'Weigh alternatives. What are tradeoffs? What criteria matter most? What are risks of each option?',
      creative: 'Explore possibilities. What are 3 different approaches? What would a novice try? An expert?',
      refactoring: 'Start small. What code is hardest to change? What has most dependencies? Ensure tests pass after each change.',
      testing: 'Write failing test first. What behavior must be preserved? What edge cases matter? Test boundaries.',
      security: 'Think like an attacker. What could go wrong? Validate all input. Follow principle of least privilege.',
      performance: 'Profile to find hotspots. Measure before and after. Focus on algorithmic improvements first.',
      integration: 'Define contracts first. What is the interface? How handle failures? Version your APIs.',
      migration: 'Plan for rollback. Migrate incrementally. Keep old and new in sync during transition.',
      documentation: 'Explain the why, not just what. Include examples. Keep docs near code.',
      research: 'Start with questions. What have others tried? What worked? What are tradeoffs?',
      review: 'Focus on logic, not style. Look for edge cases. Verify error handling. Check security.',
      deployment: 'Automate everything. Roll back easily. Deploy in small increments. Monitor aggressively.',
      troubleshooting: 'Gather evidence first. What changed? When did it break? Reproduce consistently.',
      architecture: 'Consider scalability and maintainability. Keep it simple. Define clear boundaries.',
      api_design: 'Make it simple and consistent. Version early. Document with examples.',
      data_modeling: 'Normalize for consistency. Denormalize for performance. Index wisely.',
      ux_design: 'Know your user. Test with real people. Iterate based on feedback.',
      technical_writing: 'Know your audience. Use simple words. Show, dont just tell.',
      code_generation: 'Provide clear specs. Review generated code. Handle edge cases.',
      unknown: 'Clarify the goal. What does success look like? What constraints exist? What have you tried?',
    };
    return strategies[problemType] || strategies.unknown;
  }

  getCanonicalPatterns(problemType: string): string[] {
    const patterns: Record<string, string[]> = {
      analysis: [
        '1. Define the problem clearly',
        '2. Break into components',
        '3. Analyze each component',
        '4. Synthesize findings',
      ],
      design: [
        '1. Understand requirements',
        '2. Identify components',
        '3. Define interfaces',
        '4. Choose patterns',
        '5. Validate with stakeholders',
      ],
      debugging: [
        '1. Reproduce the issue',
        '2. Gather diagnostic info',
        '3. Form hypothesis',
        '4. Test hypothesis',
        '5. Fix and verify',
      ],
      planning: [
        '1. Define the goal',
        '2. Identify milestones',
        '3. Assess dependencies',
        '4. Allocate resources',
        '5. Define timeline',
      ],
      optimization: [
        '1. Measure baseline',
        '2. Identify bottleneck',
        '3. Try simplest fix',
        '4. Measure improvement',
        '5. Repeat if needed',
      ],
      decision: [
        '1. Define criteria',
        '2. List options',
        '3. Evaluate each',
        '4. Make decision',
        '5. Plan execution',
      ],
      refactoring: [
        '1. Ensure tests exist',
        '2. Make one small change',
        '3. Run tests',
        '4. Commit if passing',
        '5. Repeat',
      ],
      testing: [
        '1. Identify behaviors',
        '2. Write failing test',
        '3. Make test pass',
        '4. Refactor if needed',
        '5. Add edge cases',
      ],
      security: [
        '1. Identify assets',
        '2. Find threats',
        '3. Assess risks',
        '4. Implement controls',
        '5. Test and verify',
      ],
      performance: [
        '1. Profile baseline',
        '2. Find hotspots',
        '3. Optimize',
        '4. Measure improvement',
        '5. Verify no regression',
      ],
      integration: [
        '1. Define contract',
        '2. Implement interface',
        '3. Test integration',
        '4. Handle errors',
        '5. Deploy and monitor',
      ],
      migration: [
        '1. Audit source',
        '2. Plan migration',
        '3. Implement',
        '4. Validate data',
        '5. Switchover',
      ],
      documentation: [
        '1. Identify audience',
        '2. Outline structure',
        '3. Write content',
        '4. Review and edit',
        '5. Publish and maintain',
      ],
      research: [
        '1. Define question',
        '2. Gather sources',
        '3. Analyze findings',
        '4. Synthesize',
        '5. Present conclusions',
      ],
      review: [
        '1. Understand context',
        '2. Read thoroughly',
        '3. Note issues',
        '4. Categorize priority',
        '5. Provide feedback',
      ],
      deployment: [
        '1. Prepare release',
        '2. Deploy to staging',
        '3. Run smoke tests',
        '4. Deploy to prod',
        '5. Monitor health',
      ],
      troubleshooting: [
        '1. Gather symptoms',
        '2. Identify scope',
        '3. Form hypothesis',
        '4. Test fix',
        '5. Document solution',
      ],
      architecture: [
        '1. Gather requirements',
        '2. Design high-level',
        '3. Detail components',
        '4. Review design',
        '5. Document decisions',
      ],
      api_design: [
        '1. Define use cases',
        '2. Design endpoints',
        '3. Define schema',
        '4. Document',
        '5. Version API',
      ],
      data_modeling: [
        '1. Define entities',
        '2. Define relationships',
        '3. Normalize schema',
        '4. Add indexes',
        '5. Document model',
      ],
      ux_design: [
        '1. Research users',
        '2. Define flows',
        '3. Create wireframes',
        '4. Build prototype',
        '5. Test with users',
      ],
      technical_writing: [
        '1. Know audience',
        '2. Outline',
        '3. Write draft',
        '4. Review',
        '5. Publish',
      ],
      code_generation: [
        '1. Define spec',
        '2. Generate code',
        '3. Review output',
        '4. Refine',
        '5. Test',
      ],
      creative: [
        '1. Explore broadly',
        '2. Generate ideas',
        '3. Combine concepts',
        '4. Evaluate',
        '5. Refine solution',
      ],
      unknown: [
        '1. Clarify goal',
        '2. Explore context',
        '3. Identify type',
        '4. Apply approach',
        '5. Validate',
      ],
    };
    return patterns[problemType] || [];
  }

  getProblemTypeMetadata(problemType: string): {
    phases: string[];
    successIndicators: string[];
    antiPatterns: string[];
    recommendedMode: 'fast' | 'expert' | 'deep';
    estimatedEffort: 'low' | 'medium' | 'high';
  } {
    const metadata: Record<string, {
      phases: string[];
      successIndicators: string[];
      antiPatterns: string[];
      recommendedMode: 'fast' | 'expert' | 'deep';
      estimatedEffort: 'low' | 'medium' | 'high';
    }> = {
      analysis: {
        phases: ['Define scope', 'Gather information', 'Identify components', 'Analyze relationships', 'Synthesize findings'],
        successIndicators: ['Clear breakdown', 'All components identified', 'Relationships understood', 'Root cause found'],
        antiPatterns: ['Jumping to conclusions', 'Missing components', 'Ignoring evidence', 'Overcomplicating'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      design: {
        phases: ['Requirements', 'Architecture', 'Component design', 'Interface design', 'Review'],
        successIndicators: ['Scalable architecture', 'Clear interfaces', 'SOLID principles', 'Documented decisions'],
        antiPatterns: ['Over-engineering', 'Premature optimization', 'Tight coupling', 'Missing error handling'],
        recommendedMode: 'deep',
        estimatedEffort: 'high',
      },
      debugging: {
        phases: ['Reproduce', 'Gather info', 'Form hypothesis', 'Test hypothesis', 'Fix', 'Verify'],
        successIndicators: ['Reproduced consistently', 'Root cause identified', 'Fix works', 'No regression'],
        antiPatterns: ['Guessing fix', 'Not reproducing', 'Breaking other things', 'Not verifying'],
        recommendedMode: 'fast',
        estimatedEffort: 'low',
      },
      planning: {
        phases: ['Define goal', 'Identify tasks', 'Estimate effort', 'Sequence tasks', 'Define timeline'],
        successIndicators: ['Clear milestones', 'Realistic timeline', 'Risks identified', 'Dependencies mapped'],
        antiPatterns: ['Unrealistic estimates', 'Missing tasks', 'No buffer', 'Unclear goals'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      optimization: {
        phases: ['Measure baseline', 'Identify bottleneck', 'Optimize', 'Measure again', 'Verify'],
        successIndicators: ['Measured improvement', 'No regression', 'Maintainable', 'Worth the cost'],
        antiPatterns: ['Premature optimization', 'Not measuring', 'Breaking functionality', 'Over-optimizing'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      decision: {
        phases: ['Define criteria', 'List options', 'Evaluate', 'Make choice', 'Plan execution'],
        successIndicators: ['Clear criteria', 'All options considered', 'Tradeoffs understood', 'Commitment to choice'],
        antiPatterns: ['Analysis paralysis', 'Ignoring tradeoffs', 'No clear criteria', 'Reversing frequently'],
        recommendedMode: 'fast',
        estimatedEffort: 'low',
      },
      creative: {
        phases: ['Explore', 'Generate ideas', 'Evaluate', 'Select', 'Refine'],
        successIndicators: ['Novel solutions', 'Multiple options', 'Feasible approach', 'Stakeholder buy-in'],
        antiPatterns: ['Self-censoring', 'First idea is best', 'Ignoring constraints', 'Perfectionism'],
        recommendedMode: 'deep',
        estimatedEffort: 'high',
      },
      refactoring: {
        phases: ['Ensure tests', 'Make small change', 'Test', 'Commit', 'Repeat'],
        successIndicators: ['Tests pass', 'Cleaner code', 'No regression', 'Intent clearer'],
        antiPatterns: ['Big changes', 'No tests', 'Breaking builds', 'Mixing refactor with new features'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      testing: {
        phases: ['Identify behaviors', 'Write test', 'Watch fail', 'Make pass', 'Refactor'],
        successIndicators: ['Good coverage', 'Meaningful assertions', 'Fast tests', 'Maintainable'],
        antiPatterns: ['No failing test first', 'Testing implementation', 'Fragile tests', 'Slow tests'],
        recommendedMode: 'fast',
        estimatedEffort: 'medium',
      },
      security: {
        phases: ['Identify assets', 'Find threats', 'Assess risk', 'Implement controls', 'Verify'],
        successIndicators: ['No vulnerabilities', 'Defense in depth', 'Compliance', 'Security tested'],
        antiPatterns: ['Security after', 'Ignoring threats', 'Single point of failure', 'Hardcoded secrets'],
        recommendedMode: 'deep',
        estimatedEffort: 'high',
      },
      performance: {
        phases: ['Profile', 'Identify hotspot', 'Optimize', 'Measure', 'Verify'],
        successIndicators: ['Measured gains', 'Scalability improved', 'No regression', 'Worth the complexity'],
        antiPatterns: ['Guessing', 'Not profiling', 'Breaking correctness', 'Premature optimization'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      integration: {
        phases: ['Define contract', 'Implement', 'Test', 'Deploy', 'Monitor'],
        successIndicators: ['Works end-to-end', 'Error handling', 'Documented', 'Monitored'],
        antiPatterns: ['No contract', 'Tight coupling', 'Ignoring failures', 'No rollback'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      migration: {
        phases: ['Audit source', 'Plan migration', 'Implement', 'Validate', 'Switchover'],
        successIndicators: ['Data intact', 'Zero downtime', 'Rollback plan', 'Validated'],
        antiPatterns: ['No rollback', 'Data loss', 'Long downtime', 'Not testing'],
        recommendedMode: 'deep',
        estimatedEffort: 'high',
      },
      documentation: {
        phases: ['Identify audience', 'Outline', 'Write', 'Review', 'Publish'],
        successIndicators: ['Clear', 'Accurate', 'Complete', 'Maintained'],
        antiPatterns: ['Outdated', 'Missing', 'Too long', 'Wrong audience'],
        recommendedMode: 'fast',
        estimatedEffort: 'low',
      },
      research: {
        phases: ['Define question', 'Gather sources', 'Analyze', 'Synthesize', 'Present'],
        successIndicators: ['Clear answer', 'Sources cited', 'Tradeoffs understood', 'Actionable'],
        antiPatterns: ['No clear question', 'Single source', 'Ignoring evidence', 'Overcomplicating'],
        recommendedMode: 'deep',
        estimatedEffort: 'high',
      },
      review: {
        phases: ['Understand context', 'Read code', 'Note issues', 'Categorize', 'Report'],
        successIndicators: ['Constructive', 'Specific', 'Balanced', 'Actionable'],
        antiPatterns: ['Personal', 'Vague', 'Nitpicking', 'Ignoring context'],
        recommendedMode: 'fast',
        estimatedEffort: 'low',
      },
      deployment: {
        phases: ['Prepare', 'Deploy', 'Verify', 'Monitor', 'Rollback if needed'],
        successIndicators: ['Works in prod', 'Rollback ready', 'Monitored', 'No incidents'],
        antiPatterns: ['No testing', 'No rollback', 'Not monitoring', 'Big bang'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      troubleshooting: {
        phases: ['Gather symptoms', 'Identify cause', 'Fix', 'Verify', 'Prevent'],
        successIndicators: ['Root cause fixed', 'No recurrence', 'Documented', 'Automated'],
        antiPatterns: ['Treating symptoms', 'Not gathering data', 'Not documenting', 'Quick fix only'],
        recommendedMode: 'fast',
        estimatedEffort: 'low',
      },
      architecture: {
        phases: ['Requirements', 'High-level design', 'Detailed design', 'Review', 'Validate'],
        successIndicators: ['Scalable', 'Maintainable', 'Secure', 'Documented'],
        antiPatterns: ['Over-engineering', 'Single point of failure', 'Tight coupling', 'No consideration for scale'],
        recommendedMode: 'deep',
        estimatedEffort: 'high',
      },
      api_design: {
        phases: ['Define use cases', 'Design endpoints', 'Define schema', 'Document', 'Version'],
        successIndicators: ['Intuitive', 'Consistent', 'Documented', 'Versioned'],
        antiPatterns: ['Breaking changes', 'Inconsistent', 'Poor naming', 'No documentation'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      data_modeling: {
        phases: ['Requirements', 'Conceptual model', 'Logical model', 'Physical model', 'Optimize'],
        successIndicators: ['Normalized', 'Indexed', 'Documented', 'Performant'],
        antiPatterns: ['Denormalized too early', 'Missing relationships', 'No indexes', 'Not documented'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      ux_design: {
        phases: ['Research', 'Define user flow', 'Wireframe', 'Prototype', 'Test'],
        successIndicators: ['User-friendly', 'Accessible', 'Consistent', 'Tested with users'],
        antiPatterns: ['No research', 'Complex', 'Inconsistent', 'Not tested'],
        recommendedMode: 'deep',
        estimatedEffort: 'high',
      },
      technical_writing: {
        phases: ['Identify audience', 'Outline', 'Write', 'Review', 'Publish'],
        successIndicators: ['Clear', 'Concise', 'Complete', 'Up-to-date'],
        antiPatterns: ['Jargon', 'Outdated', 'Incomplete', 'Wrong level'],
        recommendedMode: 'fast',
        estimatedEffort: 'low',
      },
      code_generation: {
        phases: ['Define spec', 'Generate', 'Review', 'Refine', 'Test'],
        successIndicators: ['Correct', 'Clean', 'Documented', 'Tested'],
        antiPatterns: ['No review', 'Not testing', 'Wrong assumptions', 'Not understanding generated code'],
        recommendedMode: 'expert',
        estimatedEffort: 'medium',
      },
      unknown: {
        phases: ['Clarify', 'Explore', 'Define', 'Approach', 'Solve'],
        successIndicators: ['Clear goal', 'Known approach', 'Progress made', 'Learning documented'],
        antiPatterns: ['No clarity', 'Random exploration', 'No progress', 'Not learning'],
        recommendedMode: 'fast',
        estimatedEffort: 'low',
      },
    };

    return metadata[problemType] || metadata.unknown;
  }

  assessCompleteness(thoughts: ThoughtData[], problemType: string): {
    completeness: number;
    phase: string;
    suggestions: string[];
  } {
    if (thoughts.length < 2) {
      return { completeness: 0.1, phase: 'starting', suggestions: ['Define your goal clearly'] };
    }

    const metadata = this.getProblemTypeMetadata(problemType);
    const lastThought = thoughts[thoughts.length - 1]?.thought.toLowerCase() || '';
    const allText = thoughts.map(t => t.thought).join(' ').toLowerCase();

    const completionMarkers = [
      'con', 'therefore', 'thusclusion', 'summary', 'final', 'decision made',
      'implemented', 'resolved', 'fixed', 'completed', 'done', 'finished',
      'recommend', 'suggest', 'next step', 'action item',
    ];
    const hasConclusion = completionMarkers.some(m => lastThought.includes(m));

    const questionMarkers = allText.match(/\?/g) || [];
    const openQuestions = questionMarkers.length;

    const phaseIndex = Math.min(
      Math.floor((thoughts.length / 10) * metadata.phases.length),
      metadata.phases.length - 1,
    );
    const phase = metadata.phases[phaseIndex] || 'starting';

    let completeness = Math.min(0.95, thoughts.length / 10);
    if (hasConclusion) completeness = Math.min(1.0, completeness + 0.1);
    completeness -= openQuestions * 0.05;

    const suggestions: string[] = [];
    if (openQuestions > 2) suggestions.push('Answer remaining questions before concluding');
    if (!hasConclusion && thoughts.length > 5) suggestions.push('Consider wrapping up with a conclusion');
    if (thoughts.length < 5) suggestions.push('May need more exploration');
    if (phase === metadata.phases[metadata.phases.length - 1]) {
      suggestions.push('You appear to be in the final phase - ready to conclude?');
    }

    return { completeness: Math.max(0, Math.min(1, completeness)), phase, suggestions };
  }

  detectReasoningStyle(thoughts: ThoughtData[]): { style: string; confidence: number } {
    if (thoughts.length === 0) {
      return { style: 'deductive', confidence: 0 };
    }

    const allText = thoughts.map(t => t.thought.toLowerCase()).join(' ');

    const styleIndicators = {
      deductive: ['therefore', 'thus', 'hence', 'consequently', 'it follows', 'must be', 'all', 'every', 'if then'],
      inductive: ['suggests', 'appears', 'seems', 'likely', 'probably', 'often', 'sometimes', 'typically', 'in general'],
      abductive: ['probably', 'most likely', 'best explanation', 'likely cause', 'makes sense', 'would explain'],
      analogical: ['similar to', 'like', 'analogous', 'compared to', 'just as', 'similarly', 'in the same way'],
      recursive: ['repeat', 'again', 'iterate', 'loop', 'same problem', 'self-similar', 'fractal'],
      systems: ['component', 'interaction', 'feedback', 'loop', 'ecosystem', 'network', 'relationship', 'dependency'],
    };

    const scores: Record<string, number> = {};
    for (const [style, keywords] of Object.entries(styleIndicators)) {
      scores[style] = keywords.filter(kw => allText.includes(kw)).length;
    }

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topStyle, topScore] = entries[0];

    return {
      style: topScore > 0 ? topStyle : 'deductive',
      confidence: topScore > 0 ? Math.min(0.9, 0.3 + topScore * 0.2) : 0.3,
    };
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

  analyzeComplexity(thoughts: ThoughtData[]): {
    complexity: 'simple' | 'moderate' | 'complex';
    reasoning: string;
    recommendedMode: 'fast' | 'expert' | 'deep';
  } {
    if (thoughts.length < 2) {
      return { complexity: 'simple', reasoning: 'Insufficient thoughts for analysis', recommendedMode: 'fast' };
    }

    const allText = thoughts.map(t => t.thought).join(' ').toLowerCase();
    const patterns = [
      /\b(code|algorithm|function|implement|optimize|debug|error|bug|system|architecture|api|database)\b/gi,
      /\b(analyze|compare|evaluate|assess|determine|calculate|measure|model|simulate)\b/gi,
      /\b(plan|strategy|roadmap|approach|method|technique|process|workflow)\b/gi,
      /\b(invent|design|create|imagine|explore|discover|innovate|brainstorm)\b/gi,
      /\b(decide|choose|select|option|alternative|tradeoff|priority)\b/gi,
    ];

    const totalIndicators = patterns.reduce((sum, p) => sum + (allText.match(p) || []).length, 0);
    const hasMultipleCategories = patterns.filter(p => (allText.match(p) || []).length > 0).length;
    const hasTradeoffs = /\b(however|but|although|tradeoff|alternative|versus|vs)\b/i.test(allText);
    const complexityScore = Math.min(totalIndicators / 10, 3) + hasMultipleCategories * 0.5 + (hasTradeoffs ? 1 : 0);

    const result = complexityScore >= 3
      ? { complexity: 'complex' as const, recommendedMode: 'deep' as const }
      : complexityScore >= 1.5
        ? { complexity: 'moderate' as const, recommendedMode: 'expert' as const }
        : { complexity: 'simple' as const, recommendedMode: 'fast' as const };

    return { ...result, reasoning: `Score: ${complexityScore.toFixed(1)}, indicators: ${totalIndicators}` };
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

  getProblemTypeRecommendations(currentType: string): {
    follows: string[];
    precedes: string[];
    related: string[];
  } {
    const workflow: Record<string, { follows: string[]; precedes: string[]; related: string[] }> = {
      debugging: {
        follows: ['refactoring', 'testing'],
        precedes: [],
        related: ['troubleshooting', 'performance', 'security'],
      },
      refactoring: {
        follows: ['testing', 'documentation'],
        precedes: ['debugging'],
        related: ['optimization', 'code_generation'],
      },
      testing: {
        follows: ['deployment', 'documentation'],
        precedes: ['refactoring', 'debugging'],
        related: ['integration', 'code_generation'],
      },
      security: {
        follows: ['deployment', 'documentation'],
        precedes: [],
        related: ['review', 'architecture'],
      },
      performance: {
        follows: ['deployment', 'testing'],
        precedes: [],
        related: ['optimization', 'architecture'],
      },
      architecture: {
        follows: ['api_design', 'data_modeling', 'integration'],
        precedes: [],
        related: ['design', 'devops'],
      },
      api_design: {
        follows: ['code_generation', 'integration', 'documentation'],
        precedes: ['architecture'],
        related: ['backend', 'mobile'],
      },
      data_modeling: {
        follows: ['migration', 'integration'],
        precedes: ['architecture'],
        related: ['backend', 'data'],
      },
      planning: {
        follows: ['design', 'architecture', 'deployment'],
        precedes: [],
        related: ['decision', 'research'],
      },
      research: {
        follows: ['planning', 'decision', 'design'],
        precedes: [],
        related: ['analysis', 'architecture'],
      },
      migration: {
        follows: ['deployment', 'testing'],
        precedes: ['data_modeling'],
        related: ['integration', 'devops'],
      },
      deployment: {
        follows: [],
        precedes: ['testing', 'security', 'migration'],
        related: ['devops', 'monitoring'],
      },
      design: {
        follows: ['architecture', 'api_design', 'ux_design'],
        precedes: ['planning', 'research'],
        related: ['creative', 'code_generation'],
      },
      documentation: {
        follows: [],
        precedes: ['testing', 'refactoring', 'deployment'],
        related: ['technical_writing', 'code_generation'],
      },
      review: {
        follows: ['refactoring', 'testing'],
        precedes: [],
        related: ['security', 'documentation'],
      },
      optimization: {
        follows: ['testing', 'deployment'],
        precedes: ['performance'],
        related: ['refactoring', 'architecture'],
      },
      decision: {
        follows: ['planning', 'design'],
        precedes: ['research'],
        related: ['planning', 'architecture'],
      },
      creative: {
        follows: ['design', 'code_generation'],
        precedes: [],
        related: ['ux_design', 'architecture'],
      },
      integration: {
        follows: ['deployment', 'testing'],
        precedes: ['api_design', 'data_modeling'],
        related: ['devops', 'migration'],
      },
      troubleshooting: {
        follows: ['debugging', 'fixing'],
        precedes: [],
        related: ['debugging', 'performance'],
      },
      unknown: {
        follows: ['analysis', 'research'],
        precedes: [],
        related: [],
      },
    };

    return workflow[currentType] || { follows: [], precedes: [], related: [] };
  }

  detectInsightType(thoughts: ThoughtData[]): { type: string; confidence: number } {
    if (thoughts.length < 2) {
      return { type: 'question_reframing', confidence: 0.1 };
    }

    const allText = thoughts.map(t => t.thought.toLowerCase()).join(' ');

    const insightIndicators = {
      breakthrough: ['completely changed', 'realized', 'suddenly understood', 'the key was', 'game changer', 'paradigm shift'],
      connection: ['linked to', 'connected to', 'similar to', 'like', 'relates to', 'brings together'],
      pivot: ['instead', 'change direction', 'switch to', 'rather than', 'new approach', 'different strategy'],
      validation: ['confirmed', 'verified', 'validated', 'proved correct', 'as expected', 'checked'],
      dead_end: ['wont work', 'doesnt work', 'failed', 'stuck', 'no progress', 'not possible', 'impractical'],
      simplification: ['simpler', 'easier way', 'overcomplicated', 'actually just', 'in other words'],
      pattern_recognition: ['same pattern', 'like before', 'reminds me of', 'similar problem', 'seen this before'],
      question_reframing: ['better question', 'reframe', 'what if', 'instead ask', 'wrong question', 'real issue'],
    };

    const scores: Record<string, number> = {};
    for (const [insight, keywords] of Object.entries(insightIndicators)) {
      scores[insight] = keywords.filter(kw => allText.includes(kw)).length;
    }

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topInsight, topScore] = entries[0];

    return {
      type: topScore > 0 ? topInsight : 'question_reframing',
      confidence: topScore > 0 ? Math.min(0.9, 0.3 + topScore * 0.2) : 0.2,
    };
  }

  detectDomain(thoughts: ThoughtData[]): { domain: string; confidence: number } {
    if (thoughts.length === 0) {
      return { domain: 'general', confidence: 0 };
    }

    const allText = thoughts.map(t => t.thought.toLowerCase()).join(' ');

    const domainIndicators = {
      frontend: ['react', 'vue', 'angular', 'css', 'html', 'javascript', 'typescript', 'browser', 'dom', 'ui', 'component', 'render'],
      backend: ['server', 'api', 'database', 'rest', 'graphql', 'sql', 'node', 'express', 'endpoint', 'authentication'],
      devops: ['docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'aws', 'azure', 'gcp', 'deploy', 'infrastructure', 'terraform'],
      data: ['data', 'pipeline', 'etl', 'analytics', 'warehouse', 'sql', 'query', 'dataset', 'streaming'],
      machine_learning: ['model', 'training', 'neural', 'tensorflow', 'pytorch', 'inference', 'accuracy', 'dataset', 'feature', 'gradient'],
      security: ['auth', 'security', 'vulnerability', 'encryption', 'token', 'permission', 'oauth', 'ssl', 'certificate'],
      mobile: ['ios', 'android', 'react native', 'flutter', 'mobile', 'app', 'device', 'swift', 'kotlin'],
      desktop: ['desktop', 'electron', 'native', 'gui', 'window', 'application'],
      embedded: ['arduino', 'raspberry', 'firmware', 'microcontroller', 'hardware', 'embedded', 'rtos'],
      networking: ['protocol', 'tcp', 'http', 'socket', 'network', 'dns', 'load balancer', 'distributed'],
      gaming: ['game', 'unity', 'unreal', 'graphics', 'physics', 'rendering', 'sprite'],
      blockchain: ['blockchain', 'smart contract', 'ethereum', 'solidity', 'token', 'web3', ' decentralization'],
    };

    const scores: Record<string, number> = {};
    for (const [domain, keywords] of Object.entries(domainIndicators)) {
      scores[domain] = keywords.filter(kw => allText.includes(kw)).length;
    }

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topDomain, topScore] = entries[0];

    return {
      domain: topScore > 0 ? topDomain : 'general',
      confidence: topScore > 0 ? Math.min(0.9, 0.3 + topScore * 0.15) : 0.2,
    };
  }
}

export const metacognition = new Metacognition();
