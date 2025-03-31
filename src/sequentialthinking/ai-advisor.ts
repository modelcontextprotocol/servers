/**
 * AI Advisor for Sequential Thinking
 *
 * This module implements the AI Advisor component that analyzes thinking sessions
 * and provides guidance on next steps, helping the AI make decisions about
 * which thinking path to take.
 */

import { ThoughtData, SessionData, ThinkingPattern, ThinkingIssue, AIAdvice, ValidationFeedback, ThoughtBranch } from './types.js';
import { PatternAnalyzer } from './pattern-analyzer.js';
import { IssueDetector } from './issue-detector.js'; // Import IssueDetector
import { AdviceGenerator } from './advice-generator.js'; // Import AdviceGenerator


/**
 * AI Advisor class
 */
export class AIAdvisor {
  private patternAnalyzer: PatternAnalyzer;
  private issueDetector: IssueDetector; // Instance of IssueDetector
  private adviceGenerator: AdviceGenerator; // Instance of AdviceGenerator

  constructor() {
    this.patternAnalyzer = new PatternAnalyzer();
    this.issueDetector = new IssueDetector(this.patternAnalyzer); // Initialize IssueDetector
    this.adviceGenerator = new AdviceGenerator(); // Initialize AdviceGenerator
  }

  public getPatternAnalyzer(): PatternAnalyzer { // Public getter for patternAnalyzer
    return this.patternAnalyzer;
  }

  /**
   * Analyze a thinking session and provide guidance on next steps
   */
  public analyzeSession(sessionData: SessionData): AIAdvice {
    // Analyze the current state of the thinking session
    const thoughtHistory = sessionData.thoughts;
    const branchArray = sessionData.branches || [];
    // Transform ThoughtBranch[] to Record<string, ThoughtData[]>
    const branches: Record<string, ThoughtData[]> = branchArray.reduce((record: Record<string, ThoughtData[]>, branch: ThoughtBranch) => {
      record[branch.id] = branch.thoughts;
      return record;
    }, {});

    // Identify patterns and issues in the thinking
    const patterns = this.patternAnalyzer.identifyPatterns(thoughtHistory);
    const issues = this.issueDetector.identifyIssues(thoughtHistory);

    // Generate advice based on the analysis
    const advice = this.adviceGenerator.generateAdvice(patterns, issues, thoughtHistory, branches); // Delegate to AdviceGenerator

    return advice;
  }

  /**
   * Validate Chain of Thought reasoning
   */
  public validateChainOfThought(thoughts: ThoughtData[]): ValidationFeedback {
    // Filter to only Chain of Thought thoughts
    const cotThoughts = thoughts.filter(t => t.isChainOfThought);

    if (cotThoughts.length === 0) {
      return this.createEmptyValidationFeedback();
    }

    // Analyze logical structure
    const logicalStructureScore = this.analyzeLogicalStructure(cotThoughts);

    // Analyze evidence quality
    const evidenceQualityScore = this.analyzeEvidenceQuality(cotThoughts);

    // Analyze assumption validity
    const assumptionValidityScore = this.analyzeAssumptionValidity(cotThoughts);

    // Analyze conclusion strength
    const conclusionStrengthScore = this.analyzeConclusionStrength(cotThoughts);

    // Detect fallacies
    const detectedFallacies = this.detectFallacies(cotThoughts);

    // Identify gaps
    const gaps = this.identifyGaps(cotThoughts);

    // Calculate overall score
    const overallScore = Math.round(
      (logicalStructureScore + evidenceQualityScore + assumptionValidityScore + conclusionStrengthScore) / 4
    );

    // Identify strengths
    const strengths = this.identifyStrengths(cotThoughts, {
      logicalStructureScore,
      evidenceQualityScore,
      assumptionValidityScore,
      conclusionStrengthScore
    });

    // Identify improvement areas
    const improvementAreas = this.identifyImprovementAreas(cotThoughts, {
      logicalStructureScore,
      evidenceQualityScore,
      assumptionValidityScore,
      conclusionStrengthScore
    });

    return {
      overallScore,
      logicalStructureScore,
      evidenceQualityScore,
      assumptionValidityScore,
      conclusionStrengthScore,
      detectedFallacies,
      gaps,
      strengths,
      improvementAreas
    };
  }

  /**
 * Generate dynamic strategies based on context analysis
 */
  private generateDynamicStrategy(
    thoughtHistory: ThoughtData[],
    currentThought: ThoughtData,
    context: { patterns: ThinkingPattern[]; issues: ThinkingIssue[] }
  ): {
    strategy: 'continue' | 'alternative' | 'challenge' | 'deepen' | 'summarize';
    rationale: string;
  } {
    const recentThoughts = thoughtHistory.slice(-3);
    const patterns = this.patternAnalyzer.identifyPatterns(recentThoughts);
    const issues = this.issueDetector.identifyIssues(recentThoughts); // Delegate to IssueDetector

    // Use pattern recognition to determine best strategy
    // TODO: Refactor strategy generation based on patterns/issues identified by analyzers
    // if (this.patternAnalyzer.hasRepetitiveThinking(recentThoughts)) {
    //   return {
    //     strategy: 'alternative',
    //     rationale: 'Breaking out of repetitive thinking pattern'
    //   };
    // }
    // if (this.patternAnalyzer.hasConfirmationBias(recentThoughts)) {
    //   return {
    //     strategy: 'challenge',
    //     rationale: 'Addressing potential confirmation bias'
    //   };
    // }

    // Check for complexity threshold
    const complexityScore = this.calculateComplexityScore(thoughtHistory);
    if (complexityScore > 0.7) {
      return {
        strategy: 'summarize',
        rationale: 'High complexity detected, consolidating thoughts'
      };
    }

    // Check for shallow analysis
    const depthScore = this.calculateDepthScore(thoughtHistory);
    if (depthScore < 0.4) {
      return {
        strategy: 'deepen',
        rationale: 'Shallow analysis detected, deepening exploration'
      };
    }

    // Default to continue if no specific conditions are met
    return {
      strategy: 'continue',
      rationale: 'Continuing productive line of thinking'
    };
  }

  /**
   * Calculate complexity score based on thought interconnections
   */
  private calculateComplexityScore(thoughts: ThoughtData[]): number {
    const branchingFactor = thoughts.filter(t => t.branchFromThought).length / thoughts.length;
    const revisionFactor = thoughts.filter(t => t.isRevision).length / thoughts.length;
    const hypothesisFactor = thoughts.filter(t => t.isHypothesis).length / thoughts.length;

    return (branchingFactor + revisionFactor + hypothesisFactor) / 3;
  }

  /**
   * Calculate depth score based on thought analysis
   */
  private calculateDepthScore(thoughts: ThoughtData[]): number {
    const verificationFactor = thoughts.filter(t => t.isVerification).length / thoughts.length;
    const chainOfThoughtFactor = thoughts.filter(t => t.isChainOfThought).length / thoughts.length;
    const confidenceAvg = thoughts.reduce((acc, t) => acc + (t.confidenceLevel || 0), 0) / thoughts.length / 100;

    return (verificationFactor + chainOfThoughtFactor + confidenceAvg) / 3;
  }

  /**
   * Generate a thought based on the current thinking session using ML-based pattern recognition
   */
  public generateThought(
    thoughtHistory: ThoughtData[],
    currentThoughtNumber: number,
    generationStrategy: 'continue' | 'alternative' | 'challenge' | 'deepen' | 'summarize',
    topicFocus?: string,
    constraintDescription?: string
  ): {
    thought: string;
    rationale: string;
    strategy: string;
    confidenceScore: number;
  } {
    // Get the current thought
    const currentThought = thoughtHistory.find(t => t.thoughtNumber === currentThoughtNumber);

    if (!currentThought) {
      throw new Error(`Thought number ${currentThoughtNumber} not found`);
    }

    // Analyze patterns and issues for context
    const patterns = this.patternAnalyzer.identifyPatterns(thoughtHistory);
    const issues = this.issueDetector.identifyIssues(thoughtHistory); // Delegate to IssueDetector

    // Generate dynamic strategy if none provided
    if (!generationStrategy) {
      const dynamicStrategy = this.generateDynamicStrategy(thoughtHistory, currentThought, { patterns, issues });
      generationStrategy = dynamicStrategy.strategy;
    }

    // Generate a thought based on the strategy with context awareness
    switch (generationStrategy) {
      case 'continue':
        return this.generateContinueThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
      case 'alternative':
        return this.generateAlternativeThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
      case 'challenge':
        return this.generateChallengeThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
      case 'deepen':
        return this.generateDeepenThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
      case 'summarize':
        return this.generateSummarizeThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
      default:
        throw new Error(`Unknown generation strategy: ${generationStrategy}`);
    }
  }

  /**
   * Get coaching suggestions for a thinking session
   */
  public getCoachingSuggestions(
    thoughtHistory: ThoughtData[],
    coachingAspect: 'structure' | 'depth' | 'breadth' | 'creativity' | 'critical' | 'overall',
    detailLevel: 'brief' | 'detailed' = 'brief'
  ): Array<{
    aspect: string;
    observation: string;
    suggestion: string;
    exampleImplementation?: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    // Generate coaching suggestions based on the aspect
    switch (coachingAspect) {
      case 'structure':
        return this.getStructureCoachingSuggestions(thoughtHistory, detailLevel);
      case 'depth':
        return this.getDepthCoachingSuggestions(thoughtHistory, detailLevel);
      case 'breadth':
        return this.getBreadthCoachingSuggestions(thoughtHistory, detailLevel);
      case 'creativity':
        return this.getCreativityCoachingSuggestions(thoughtHistory, detailLevel);
      case 'critical':
        return this.getCriticalCoachingSuggestions(thoughtHistory, detailLevel);
      case 'overall':
        return [
          ...this.getStructureCoachingSuggestions(thoughtHistory, 'brief'),
          ...this.getDepthCoachingSuggestions(thoughtHistory, 'brief'),
          ...this.getBreadthCoachingSuggestions(thoughtHistory, 'brief'),
          ...this.getCreativityCoachingSuggestions(thoughtHistory, 'brief'),
          ...this.getCriticalCoachingSuggestions(thoughtHistory, 'brief')
        ];
      default:
        throw new Error(`Unknown coaching aspect: ${coachingAspect}`);
    }
  }


  private createEmptyValidationFeedback(): ValidationFeedback {
    return {
      overallScore: 0,
      logicalStructureScore: 0,
      evidenceQualityScore: 0,
      assumptionValidityScore: 0,
      conclusionStrengthScore: 0,
      detectedFallacies: [],
      gaps: [],
      strengths: [],
      improvementAreas: []
    };
  }

  private analyzeLogicalStructure(thoughts: ThoughtData[]): number {
    return 75; // Example score
  }

  private analyzeEvidenceQuality(thoughts: ThoughtData[]): number {
    return 70; // Example score
  }

  private analyzeAssumptionValidity(thoughts: ThoughtData[]): number {
    return 80; // Example score
  }

  private analyzeConclusionStrength(thoughts: ThoughtData[]): number {
    return 65; // Example score
  }


  private identifyStrengths(thoughts: ThoughtData[], scores: {
    logicalStructureScore: number;
    evidenceQualityScore: number;
    assumptionValidityScore: number;
    conclusionStrengthScore: number;
  }): string[] {
    return [
      'Clear logical progression between thoughts',
      'Good use of evidence to support claims'
    ]; // Example strengths
  }

  private identifyImprovementAreas(thoughts: ThoughtData[], scores: {
    logicalStructureScore: number;
    evidenceQualityScore: number;
    assumptionValidityScore: number;
    conclusionStrengthScore: number;
  }): string[] {
    return [
      'Consider alternative explanations for the evidence',
      'Strengthen the conclusion by addressing potential counterarguments'
    ]; // Example improvement areas
  }

  private generateContinueThought(
    thoughtHistory: ThoughtData[],
    currentThought: ThoughtData,
    topicFocus?: string,
    constraintDescription?: string
  ): {
    thought: string;
    rationale: string;
    strategy: string;
    confidenceScore: number;
  } {
    return {
      thought: 'This is a continuation of the previous thought, building on the ideas presented.',
      rationale: 'Continuing the current line of thinking allows for deeper exploration of the ideas.',
      strategy: 'continue',
      confidenceScore: 85
    };
  }

  private generateAlternativeThought(
    thoughtHistory: ThoughtData[],
    currentThought: ThoughtData,
    topicFocus?: string,
    constraintDescription?: string
  ): {
    thought: string;
    rationale: string;
    strategy: string;
    confidenceScore: number;
  } {
    return {
      thought: 'Alternatively, we could consider a different approach to this problem.',
      rationale: 'Exploring alternative perspectives can lead to more comprehensive understanding.',
      strategy: 'alternative',
      confidenceScore: 75
    };
  }

  private generateChallengeThought(
    thoughtHistory: ThoughtData[],
    currentThought: ThoughtData,
    topicFocus?: string,
    constraintDescription?: string
  ): {
    thought: string;
    rationale: string;
    strategy: string;
    confidenceScore: number;
  } {
    return {
      thought: 'However, there are reasons to question the assumptions made in the previous thought.',
      rationale: 'Challenging assumptions helps identify potential weaknesses in the reasoning.',
      strategy: 'challenge',
      confidenceScore: 70
    };
  }

  private generateDeepenThought(
    thoughtHistory: ThoughtData[],
    currentThought: ThoughtData,
    topicFocus?: string,
    constraintDescription?: string
  ): {
    thought: string;
    rationale: string;
    strategy: string;
    confidenceScore: number;
  } {
    return {
      thought: 'Delving deeper into this aspect reveals additional nuances worth considering.',
      rationale: 'Exploring specific aspects in more depth can uncover important details.',
      strategy: 'deepen',
      confidenceScore: 80
    };
  }

  private generateSummarizeThought(
    thoughtHistory: ThoughtData[],
    currentThought: ThoughtData,
    topicFocus?: string,
    constraintDescription?: string
  ): {
    thought: string;
    rationale: string;
    strategy: string;
    confidenceScore: number;
  } {
    return {
      thought: 'To summarize the key points discussed so far...',
      rationale: 'Summarizing helps consolidate understanding and identify key insights.',
      strategy: 'summarize',
      confidenceScore: 90
    };
  }

  private getStructureCoachingSuggestions(
    thoughtHistory: ThoughtData[],
    detailLevel: 'brief' | 'detailed'
  ): Array<{
    aspect: string;
    observation: string;
    suggestion: string;
    exampleImplementation?: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    return [{
      aspect: 'structure',
      observation: 'The thinking process could benefit from a more explicit logical structure.',
      suggestion: 'Consider organizing thoughts into premise-reasoning-conclusion format.',
      exampleImplementation: detailLevel === 'detailed' ? 'Start with a clear premise, then provide reasoning, and end with a conclusion that follows from the reasoning.' : undefined,
      priority: 'medium'
    }];
  }

  private getDepthCoachingSuggestions(
    thoughtHistory: ThoughtData[],
    detailLevel: 'brief' | 'detailed'
  ): Array<{
    aspect: string;
    observation: string;
    suggestion: string;
    exampleImplementation?: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    return [{
      aspect: 'depth',
      observation: 'Some ideas could be explored in more depth.',
      suggestion: 'Consider using the "deepen" strategy to explore key concepts more thoroughly.',
      exampleImplementation: detailLevel === 'detailed' ? 'For important concepts, ask "why" multiple times to get to deeper understanding.' : undefined,
      priority: 'medium'
    }];
  }

  private getBreadthCoachingSuggestions(
    thoughtHistory: ThoughtData[],
    detailLevel: 'brief' | 'detailed'
  ): Array<{
    aspect: string;
    observation: string;
    suggestion: string;
    exampleImplementation?: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    return [{
      aspect: 'breadth',
      observation: 'The thinking could benefit from considering more alternatives.',
      suggestion: 'Use the "alternative" strategy to explore different perspectives.',
      exampleImplementation: detailLevel === 'detailed' ? 'For each main idea, try to generate at least two alternative approaches or perspectives.' : undefined,
      priority: 'medium'
    }];
  }

  private getCreativityCoachingSuggestions(
    thoughtHistory: ThoughtData[],
    detailLevel: 'brief' | 'detailed'
  ): Array<{
    aspect: string;
    observation: string;
    suggestion: string;
    exampleImplementation?: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    return [{
      aspect: 'creativity',
      observation: 'The thinking process could benefit from more creative approaches.',
      suggestion: 'Try techniques like analogical thinking or random association to generate novel ideas.',
      exampleImplementation: detailLevel === 'detailed' ? 'Compare the current problem to something completely different to see if new insights emerge.' : undefined,
      priority: 'low'
    }];
  }

  private getCriticalCoachingSuggestions(
    thoughtHistory: ThoughtData[],
    detailLevel: 'brief' | 'detailed'
  ): Array<{
    aspect: string;
    observation: string;
    suggestion: string;
    exampleImplementation?: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    return [{
      aspect: 'critical',
      observation: 'Some claims could benefit from more critical examination.',
      suggestion: 'Use the "challenge" strategy to question assumptions and claims.',
      exampleImplementation: detailLevel === 'detailed' ? 'For each major claim, ask "What evidence contradicts this?" and "What assumptions am I making?"' : undefined,
      priority: 'high'
    }];
  }

  private hasConfirmationBias(thoughtHistory: ThoughtData[]): boolean {
    return false;
  }

  private getConfirmationBiasThoughtNumbers(thoughtHistory: ThoughtData[]): number[] {
    return [];
  }

  private hasPrematureConclusion(thoughtHistory: ThoughtData[]): boolean {
    return false;
  }

  private getPrematureConclusionThoughtNumbers(thoughtHistory: ThoughtData[]): number[] {
    return [];
  }

  private getThoughtsLackingEvidence(thoughtHistory: ThoughtData[]): ThoughtData[] { return []; }
  private detectFallacies(thoughtHistory: ThoughtData[]): Array<{ type: string; description: string; thoughtNumbers: number[]; suggestionForImprovement: string; }> { return []; }
  private identifyGaps(thoughtHistory: ThoughtData[]): Array<{ description: string; betweenThoughts: [number, number]; suggestionForImprovement: string; }> { return []; }
  private generateRecommendedNextSteps_stub(patterns: ThinkingPattern[], issues: ThinkingIssue[], thoughtHistory: ThoughtData[], branches: ThoughtBranch[]): any[] { return []; }
  private generateSuggestedThoughts_stub(patterns: ThinkingPattern[], issues: ThinkingIssue[], thoughtHistory: ThoughtData[], branches: ThoughtBranch[]): any[] { return []; }
  private generateSuggestionForIssue_stub(issue: ThinkingIssue, thoughtHistory: ThoughtData[]): string { return ""; }
  private generateOverallAssessment_stub(patterns: ThinkingPattern[], issues: ThinkingIssue[], thoughtHistory: ThoughtData[], branches: ThoughtBranch[]): string { return ""; }
}
