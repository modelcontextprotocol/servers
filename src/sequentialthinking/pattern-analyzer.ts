import { ThoughtData, ThinkingPattern } from './types.js';
import { v4 as uuidv4 } from 'uuid';

interface AnalysisState {
  thoughtHistory: ThoughtData[];
  detectedPatterns: ThinkingPattern[];
  currentPhase: 'initial' | 'pattern_detection' | 'confidence_scoring' | 'complete';
  workingSet: ThoughtData[];
}

export class PatternAnalyzer {
  private patternWeights = {
    linear: 0.8,
    branching: 0.9,
    revision: 0.85,
    chainOfThought: 0.95,
    hypothesis: 0.9,
    repetitive: 0.7,
    confirmationBias: 0.6,
    anchoring: 0.65,
    learning: 0.8,
    adaptive: 0.85
  };

  /**
   * Enhanced pattern detection using state machine approach
   */
  public async analyzePatterns(thoughtHistory: ThoughtData[]): Promise<ThinkingPattern[]> {
    let state: AnalysisState = {
      thoughtHistory,
      detectedPatterns: [],
      currentPhase: 'initial',
      workingSet: []
    };

    // Phase 1: Initialize
    state = await this.initializeAnalysis(state);

    // Phase 2: Detect Patterns
    state = await this.detectPatterns(state);

    // Phase 3: Score Confidence
    state = await this.scoreConfidence(state);

    return this.prioritizePatterns(state.detectedPatterns);
  }

  private async initializeAnalysis(state: AnalysisState): Promise<AnalysisState> {
    return {
      ...state,
      currentPhase: 'pattern_detection',
      workingSet: state.thoughtHistory
    };
  }

  private async detectPatterns(state: AnalysisState): Promise<AnalysisState> {
    const patterns = this.identifyPatterns(state.workingSet);
    return {
      ...state,
      detectedPatterns: patterns,
      currentPhase: 'confidence_scoring'
    };
  }

  private async scoreConfidence(state: AnalysisState): Promise<AnalysisState> {
    const scoredPatterns = state.detectedPatterns.map(pattern => ({
      ...pattern,
      confidence: this.calculateContextConfidence(pattern, state.thoughtHistory)
    }));

    return {
      ...state,
      detectedPatterns: scoredPatterns,
      currentPhase: 'complete'
    };
  }

  public identifyPatterns(thoughts: ThoughtData[]): ThinkingPattern[] {
    const patterns: ThinkingPattern[] = [];

    // Linear progression pattern
    const linearThoughts = this.getLinearProgression(thoughts);
    if (linearThoughts.length > 0) {
      patterns.push(this.createLinearProgressionPattern(linearThoughts));
    }

    // Branching pattern detection
    const branchingThoughts = this.getBranchingThoughts(thoughts);
    if (branchingThoughts.length > 0) {
      patterns.push(this.createBranchingExplorationPattern(branchingThoughts, thoughts));
    }

    // Chain of thought pattern detection
    const cotThoughts = this.getChainOfThoughtThoughts(thoughts);
    if (cotThoughts.length > 0) {
      patterns.push(this.createChainOfThoughtPattern(cotThoughts));
    }

    // Iterative Refinement pattern detection
    const revisionThoughts = this.getRevisionThoughts(thoughts);
    if (revisionThoughts.length > 0) {
      patterns.push(this.createIterativeRefinementPattern(revisionThoughts, thoughts));
    }

    // Hypothesis Testing pattern detection
    const hypothesisThoughts = this.getHypothesisThoughts(thoughts);
    const verificationThoughts = this.getVerificationThoughts(thoughts);
    if (hypothesisThoughts.length > 0 && verificationThoughts.length > 0) {
      patterns.push(this.createHypothesisTestingPattern(hypothesisThoughts, verificationThoughts));
    }


    return patterns;
  }

  private createLinearProgressionPattern(linearThoughts: ThoughtData[]): ThinkingPattern {
    const confidence = this.calculateLinearConfidence(linearThoughts);
    return {
      id: uuidv4(),
      name: 'Linear Progression',
      description: 'Thoughts show clear step-by-step progression',
      thoughts: linearThoughts,
      detectedInThoughts: linearThoughts.map(t => t.thoughtNumber),
      confidence,
      strength: confidence
    };
  }

  private createBranchingExplorationPattern(branchingThoughts: ThoughtData[], allThoughts: ThoughtData[]): ThinkingPattern {
    const confidence = this.calculateBranchingConfidence(branchingThoughts, allThoughts);
    return {
      id: uuidv4(),
      name: 'Branching Exploration',
      description: 'Multiple alternative paths explored',
      thoughts: branchingThoughts,
      detectedInThoughts: branchingThoughts.map(t => t.thoughtNumber),
      confidence,
      strength: confidence
    };
  }

  private createChainOfThoughtPattern(cotThoughts: ThoughtData[]): ThinkingPattern {
    const confidence = this.calculateChainOfThoughtConfidence(cotThoughts);
    return {
      id: uuidv4(),
      name: 'Chain of Thought',
      description: 'Explicit step-by-step reasoning process',
      thoughts: cotThoughts,
      detectedInThoughts: cotThoughts.map(t => t.thoughtNumber),
      confidence,
      strength: confidence
    };
  }

  private createIterativeRefinementPattern(revisionThoughts: ThoughtData[], allThoughts: ThoughtData[]): ThinkingPattern {
    const confidence = this.calculateRevisionConfidence(revisionThoughts, allThoughts);
    return {
      id: uuidv4(),
      name: 'Iterative Refinement',
      description: 'Ideas are actively revised and improved',
      thoughts: revisionThoughts,
      detectedInThoughts: revisionThoughts.map(t => t.thoughtNumber),
      confidence,
      strength: confidence
    };
  }

  private createHypothesisTestingPattern(hypothesisThoughts: ThoughtData[], verificationThoughts: ThoughtData[]): ThinkingPattern {
    const confidence = this.calculateHypothesisConfidence(hypothesisThoughts, verificationThoughts);
    return {
      id: uuidv4(),
      name: 'Hypothesis Testing',
      description: 'Hypotheses are formed and verified',
      thoughts: [...hypothesisThoughts, ...verificationThoughts],
      detectedInThoughts: [...hypothesisThoughts, ...verificationThoughts].map(t => t.thoughtNumber),
      confidence,
      strength: confidence
    };
  }


  private calculateContextConfidence(pattern: ThinkingPattern, thoughts: ThoughtData[]): number {
    if (!pattern.thoughts) return 0;

    return Math.min(1,
      (pattern.confidence ?? 0.5) *
      (thoughts.length > 0 ? pattern.thoughts.length / thoughts.length : 0.5)
    );
  }

  private getRevisionThoughts(thoughts: ThoughtData[]): ThoughtData[] {
    return thoughts.filter(t => t.isRevision);
  }

  private getHypothesisThoughts(thoughts: ThoughtData[]): ThoughtData[] {
    return thoughts.filter(t => t.isHypothesis);
  }

  private getVerificationThoughts(thoughts: ThoughtData[]): ThoughtData[] {
    return thoughts.filter(t => t.isVerification);
  }

  private getLinearProgression(thoughts: ThoughtData[]): ThoughtData[] {
    return thoughts.filter((thought, i) => {
      if (i === 0) return false;
      const current = thought;
      const previous = thoughts[i - 1];
      return !current.branchFromThought &&
        !current.isRevision &&
        this.hasLogicalProgression(previous, current);
    });
  }

  private getBranchingThoughts(thoughts: ThoughtData[]): ThoughtData[] {
    return thoughts.filter(t => {
      if (!t.branchFromThought) return false;
      const parentThought = thoughts.find(pt => pt.thoughtNumber === t.branchFromThought);
      return parentThought && this.isValidBranch(parentThought, t);
    });
  }

  private getChainOfThoughtThoughts(thoughts: ThoughtData[]): ThoughtData[] {
    return thoughts.filter((t, i) => {
      if (!t.isChainOfThought) return false;
      if (i === 0) return true;
      return this.hasLogicalConnection(thoughts[i - 1], t);
    });
  }

  private hasLogicalProgression(previous: ThoughtData, current: ThoughtData): boolean {
    const overlap = this.getKeywordOverlap(previous.thought, current.thought);
    return overlap > 0.3 && overlap < 0.8;
  }

  private isValidBranch(parent: ThoughtData, branch: ThoughtData): boolean {
    const overlap = this.getKeywordOverlap(parent.thought, branch.thought);
    return overlap > 0.2 && overlap < 0.6;
  }

  private hasLogicalConnection(previous: ThoughtData, current: ThoughtData): boolean {
    if (!current.chainOfThoughtStep || !previous.chainOfThoughtStep) return false;
    return current.chainOfThoughtStep === previous.chainOfThoughtStep + 1;
  }

  private getKeywordOverlap(thought1: string, thought2: string): number {
    const keywords1 = this.extractKeywords(thought1);
    const keywords2 = this.extractKeywords(thought2);
    const commonKeywords = keywords1.filter(keyword => keywords2.includes(keyword));
    return commonKeywords.length / Math.max(keywords1.length, keywords2.length);
  }

  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
  }

  private calculateLinearConfidence(thoughts: ThoughtData[]): number {
    if (thoughts.length < 2) return 0;

    const progressionScore = thoughts.reduce((score, thought, i) => {
      if (i === 0) return score;
      const previous = thoughts[i - 1];
      const connection = this.hasLogicalProgression(previous, thought) ? 1 : 0;
      return score + connection;
    }, 0) / (thoughts.length - 1);

    return progressionScore * this.patternWeights.linear;
  }

  private calculateBranchingConfidence(branches: ThoughtData[], allThoughts: ThoughtData[]): number {
    if (branches.length === 0) return 0;

    const branchQuality = branches.reduce((score, branch) => {
      const parent = allThoughts.find(t => t.thoughtNumber === branch.branchFromThought);
      if (!parent) return score;
      const relevance = 1 - this.getKeywordOverlap(parent.thought, branch.thought);
      return score + relevance;
    }, 0) / branches.length;

    return branchQuality * this.patternWeights.branching;
  }

  private calculateChainOfThoughtConfidence(thoughts: ThoughtData[]): number {
    if (thoughts.length < 2) return 0;

    const chainQuality = thoughts.reduce((score, thought, i) => {
      if (i === 0) return score;
      const connection = this.hasLogicalConnection(thoughts[i - 1], thought) ? 1 : 0;
      return score + connection;
    }, 0) / (thoughts.length - 1);

    return chainQuality * this.patternWeights.chainOfThought;
  }

  private calculateRevisionConfidence(revisions: ThoughtData[], allThoughts: ThoughtData[]): number {
    if (revisions.length === 0) return 0;

    const revisionQuality = revisions.reduce((score, revision) => {
      const original = allThoughts.find(t => t.thoughtNumber === revision.revisesThought);
      if (!original) return score;
      const improvement = this.calculateRevisionImprovement(original, revision);
      return score + improvement;
    }, 0) / revisions.length;

    return revisionQuality * this.patternWeights.revision;
  }

  private calculateHypothesisConfidence(hypothesisThoughts: ThoughtData[], verificationThoughts: ThoughtData[]): number {
    if (hypothesisThoughts.length === 0) return 0;
    if (verificationThoughts.length === 0) return 0;

    const hypothesisQuality = hypothesisThoughts.reduce((score, hypothesis) => {
      const relatedVerifications = verificationThoughts.filter(v => 
        this.isRelatedVerification(hypothesis, v));
      return score + (relatedVerifications.length > 0 ? 1 : 0);
    }, 0) / hypothesisThoughts.length;

    return hypothesisQuality * this.patternWeights.hypothesis;
  }

  private isRelatedVerification(hypothesis: ThoughtData, verification: ThoughtData): boolean {
    return this.getKeywordOverlap(hypothesis.thought, verification.thought) > 0.4;
  }

  private calculateRevisionImprovement(original: ThoughtData, revision: ThoughtData): number {
      const similarity = this.getKeywordOverlap(original.thought, revision.thought);
      return 1 - Math.abs(0.5 - similarity); // Optimal at 0.5 similarity
  }


  private prioritizePatterns(patterns: ThinkingPattern[]): ThinkingPattern[] {
    return [...patterns].sort((a, b) => {
      const confidenceA = a.confidence ?? 0;
      const confidenceB = b.confidence ?? 0;
      if (confidenceB !== confidenceA) {
        return confidenceB - confidenceA;
      }
      return b.detectedInThoughts.length - a.detectedInThoughts.length;
    });
  }
}
