/**
 * AI Advisor for Sequential Thinking
 */

import { 
  ThoughtData, 
  SessionData, 
  ThinkingPattern, 
  ThinkingIssue, 
  AIAdvice, 
  ValidationFeedback, 
  ThoughtBranch,
  BranchRecord 
} from './types.js';
import { PatternAnalyzer } from './pattern-analyzer.js';
import { IssueDetector } from './issue-detector.js';
import { AdviceGenerator } from './advice-generator.js';

// Internal interface for validation scores
interface ValidationScores {
  logicalStructureScore: number;
  evidenceQualityScore: number;
  assumptionValidityScore: number;
  conclusionStrengthScore: number;
  detectedFallacies: Array<{ type: string; description: string; thoughtNumbers: number[]; suggestionForImprovement: string; }>;
  gaps: Array<{ description: string; betweenThoughts: [number, number]; suggestionForImprovement: string; }>;
}

export class AIAdvisor {
  private patternAnalyzer: PatternAnalyzer;
  private issueDetector: IssueDetector;
  private adviceGenerator: AdviceGenerator;

  constructor() {
    this.patternAnalyzer = new PatternAnalyzer();
    this.issueDetector = new IssueDetector(this.patternAnalyzer);
    this.adviceGenerator = new AdviceGenerator();
  }

  public getPatternAnalyzer(): PatternAnalyzer {
    return this.patternAnalyzer;
  }

  public analyzeSession(sessionData: SessionData): AIAdvice {
    // Use thoughtHistory by default, fall back to thoughts if needed
    const thoughts = sessionData.thoughtHistory || sessionData.thoughts || [];
    
    // Convert branch record to array of ThoughtBranch objects
    const branchArray = Object.entries(sessionData.branches || {}).map(([id, branchThoughts]) => ({
      id,
      branchId: id,
      startThoughtNumber: branchThoughts[0]?.thoughtNumber || 0,
      thoughts: branchThoughts
    }));

    // Transform branch array to record
    const branches = branchArray.reduce<BranchRecord>((acc, branch) => {
      acc[branch.id] = branch.thoughts;
      return acc;
    }, {});

    // Identify patterns and issues in the thinking
    const patterns = this.patternAnalyzer.identifyPatterns(thoughts);
    const issues = this.issueDetector.identifyIssues(thoughts);
    
    // Generate advice based on patterns and issues
    const advice = this.adviceGenerator.generateAdvice(patterns, issues, thoughts, branches);

    return advice;
  }

  public validateChainOfThought(thoughts: ThoughtData[]): ValidationFeedback {
    const cotThoughts = thoughts.filter(t => t.isChainOfThought);

    if (cotThoughts.length === 0) {
      return this.createEmptyValidationFeedback();
    }

    // Analyze the chain of thought and collect scores
    const scores: ValidationScores = {
      logicalStructureScore: this.analyzeLogicalStructure(cotThoughts),
      evidenceQualityScore: this.analyzeEvidenceQuality(cotThoughts),
      assumptionValidityScore: this.analyzeAssumptionValidity(cotThoughts),
      conclusionStrengthScore: this.analyzeConclusionStrength(cotThoughts),
      detectedFallacies: this.detectFallacies(cotThoughts),
      gaps: this.identifyGaps(cotThoughts)
    };

    // Calculate overall score
    const overallScore = Math.round(
      (scores.logicalStructureScore + 
       scores.evidenceQualityScore + 
       scores.assumptionValidityScore + 
       scores.conclusionStrengthScore) / 4
    );

    // Identify strengths and areas for improvement
    const strengths = this.identifyStrengths(cotThoughts, scores);
    const improvementAreas = this.identifyImprovementAreas(cotThoughts, scores);

    // Return the feedback in the expected format
    return {
      isValid: overallScore >= 70,
      reason: overallScore >= 70 
        ? "Chain of thought demonstrates solid logical progression" 
        : "Chain of thought needs improvement in logical structure and evidence",
      suggestions: improvementAreas,
      overallScore,
      strengths,
      improvementAreas
    };
  }

  private createEmptyValidationFeedback(): ValidationFeedback {
    return {
      isValid: false,
      reason: "No chain of thought thoughts found to validate",
      suggestions: [],
      overallScore: 0,
      strengths: [],
      improvementAreas: []
    };
  }

  private analyzeLogicalStructure(thoughts: ThoughtData[]): number {
    return 75; // Example implementation
  }

  private analyzeEvidenceQuality(thoughts: ThoughtData[]): number {
    return 70; // Example implementation
  }

  private analyzeAssumptionValidity(thoughts: ThoughtData[]): number {
    return 80; // Example implementation
  }

  private analyzeConclusionStrength(thoughts: ThoughtData[]): number {
    return 65; // Example implementation
  }

  private detectFallacies(thoughts: ThoughtData[]): Array<{ 
    type: string; 
    description: string; 
    thoughtNumbers: number[]; 
    suggestionForImprovement: string; 
  }> {
    return []; // Example implementation
  }

  private identifyGaps(thoughts: ThoughtData[]): Array<{ 
    description: string; 
    betweenThoughts: [number, number]; 
    suggestionForImprovement: string; 
  }> {
    return []; // Example implementation
  }

  private identifyStrengths(thoughts: ThoughtData[], scores: ValidationScores): string[] {
    return [
      'Clear logical progression between thoughts',
      'Good use of evidence to support claims'
    ];
  }

  private identifyImprovementAreas(thoughts: ThoughtData[], scores: ValidationScores): string[] {
    return [
      'Consider alternative explanations for the evidence',
      'Strengthen the conclusion by addressing potential counterarguments'
    ];
  }

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
    // Example implementation
    return {
      thought: `Generated thought using ${generationStrategy} strategy`,
      rationale: 'Based on analysis of thought history and context',
      strategy: generationStrategy,
      confidenceScore: 75
    };
  }

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
    // Example implementation
    return [{
      aspect: coachingAspect,
      observation: 'Room for improvement identified',
      suggestion: 'Consider implementing structured approach',
      exampleImplementation: detailLevel === 'detailed' ? 'Detailed example here' : undefined,
      priority: 'medium'
    }];
  }
}
