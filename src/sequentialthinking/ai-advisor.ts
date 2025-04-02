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
    if (!thoughts || thoughts.length === 0) return 0;
    
    // Calculate logical flow score based on:
    // 1. Proper sequence of thoughts (does each build on previous)
    // 2. Presence of logical connectives (therefore, because, etc.)
    // 3. Consistent reasoning chain
    
    let score = 80; // Start with base score
    
    // Check for logical connectives and reasoning indicators
    const logicalTerms = [
      'therefore', 'thus', 'hence', 'consequently', 'because', 'since',
      'as a result', 'if', 'then', 'implies', 'follows that'
    ];
    
    // Check logical flow between consecutive thoughts
    for (let i = 1; i < thoughts.length; i++) {
      const prevThought = thoughts[i-1].thought || '';
      const currThought = thoughts[i].thought || '';
      
      // Check if current thought references previous thought
      const refersToLast = currThought.toLowerCase().includes('previous') || 
                           currThought.toLowerCase().includes('above') ||
                           (thoughts[i-1].thoughtNumber && 
                            currThought.includes(thoughts[i-1].thoughtNumber.toString()));
      
      // Check for logical connectives
      const hasLogicalTerms = logicalTerms.some(term => 
        currThought.toLowerCase().includes(term));
      
      // Reduce score if logical connection is weak
      if (!refersToLast && !hasLogicalTerms) {
        score -= 5;
      }
    }
    
    // Look for contradictions or inconsistencies
    for (let i = 0; i < thoughts.length; i++) {
      for (let j = i + 1; j < thoughts.length; j++) {
        const thoughtA = thoughts[i].thought || '';
        const thoughtB = thoughts[j].thought || '';
        
        // Simple contradiction detection (this could be more sophisticated)
        if (this.containsContradiction(thoughtA, thoughtB)) {
          score -= 10;
        }
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  // Helper method to detect potential contradictions
  private containsContradiction(textA: string, textB: string): boolean {
    const a = textA.toLowerCase();
    const b = textB.toLowerCase();
    
    // Check for direct negations
    const negationPairs = [
      ['is', 'is not'], ['can', 'cannot'], ['will', 'will not'],
      ['should', 'should not'], ['must', 'must not']
    ];
    
    for (const [positive, negative] of negationPairs) {
      if ((a.includes(positive) && b.includes(negative)) ||
          (a.includes(negative) && b.includes(positive))) {
        // Further check the context around these terms
        const aWords = a.split(/\s+/);
        const bWords = b.split(/\s+/);
        
        // Find words around the contradictory terms
        const contextA = this.extractContext(aWords, positive) || 
                         this.extractContext(aWords, negative);
        const contextB = this.extractContext(bWords, positive) || 
                         this.extractContext(bWords, negative);
        
        // If contexts are similar, likely a contradiction
        if (contextA && contextB && this.contextSimilarity(contextA, contextB) > 0.5) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Extract context around a term
  private extractContext(words: string[], term: string): string[] | null {
    const index = words.findIndex(w => w === term);
    if (index === -1) return null;
    
    // Get 3 words before and after
    const start = Math.max(0, index - 3);
    const end = Math.min(words.length, index + 4);
    return words.slice(start, end);
  }
  
  // Calculate similarity between contexts
  private contextSimilarity(contextA: string[], contextB: string[]): number {
    const setA = new Set(contextA);
    const setB = new Set(contextB);
    
    // Use Array.from to avoid directly iterating over Set
    let intersection = 0;
    Array.from(setA).forEach(word => {
      if (setB.has(word)) intersection++;
    });
    
    return intersection / (setA.size + setB.size - intersection);
  }

  private analyzeEvidenceQuality(thoughts: ThoughtData[]): number {
    if (!thoughts || thoughts.length === 0) return 0;
    
    // Calculate evidence quality score based on:
    // 1. Presence of concrete examples
    // 2. Citations or references
    // 3. Data points or measurements
    // 4. Specific scenarios or use cases
    
    let score = 70; // Start with base score
    
    // Evidence indicators
    const evidenceIndicators = [
      'example', 'instance', 'case', 'reference', 'according to',
      'research', 'study', 'data', 'statistics', 'evidence', 'survey',
      'experiment', 'observation', 'specifically', 'concretely'
    ];
    
    // Quantitative indicators
    const quantitativeIndicators = [
      '%', 'percent', 'increase', 'decrease', 'ratio', 'proportion',
      'amount', 'number', 'quantity', 'measure', 'rate', 'frequency'
    ];
    
    // Evaluate each thought for evidence quality
    for (const thought of thoughts) {
      const text = thought.thought || '';
      const lowerText = text.toLowerCase();
      
      // Check for evidence indicators
      const hasEvidenceIndicators = evidenceIndicators.some(term => lowerText.includes(term));
      if (hasEvidenceIndicators) {
        score += 5;
      }
      
      // Check for quantitative evidence
      const hasQuantitativeIndicators = quantitativeIndicators.some(term => lowerText.includes(term));
      if (hasQuantitativeIndicators) {
        score += 5;
      }
      
      // Check for numbers and statistics
      const hasNumbers = /\d+(\.\d+)?%?/.test(text);
      if (hasNumbers) {
        score += 5;
      }
    }
    
    // Reduce score if there's a lack of evidence
    if (thoughts.length > 3) {
      let evidenceCount = 0;
      for (const thought of thoughts) {
        const text = thought.thought || '';
        const lowerText = text.toLowerCase();
        
        if (evidenceIndicators.some(term => lowerText.includes(term))) {
          evidenceCount++;
        }
      }
      
      // If less than 30% of thoughts contain evidence, reduce score
      if (evidenceCount / thoughts.length < 0.3) {
        score -= 15;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private analyzeAssumptionValidity(thoughts: ThoughtData[]): number {
    if (!thoughts || thoughts.length === 0) return 0;
    
    // Calculate assumption validity score based on:
    // 1. Explicit acknowledgment of assumptions
    // 2. Testing or validating assumptions
    // 3. Considering alternative assumptions
    
    let score = 75; // Start with base score
    
    // Assumption indicators
    const assumptionIndicators = [
      'assume', 'assumption', 'presume', 'presumption', 'given that',
      'taking for granted', 'if we accept', 'supposing', 'hypothesis'
    ];
    
    // Validation indicators
    const validationIndicators = [
      'test', 'validate', 'verify', 'check', 'confirm', 'assess',
      'evaluate', 'examination', 'scrutiny', 'investigation'
    ];
    
    // Alternative consideration indicators
    const alternativeIndicators = [
      'alternative', 'other possibility', 'different approach', 'instead',
      'contrary', 'on the other hand', 'conversely', 'however'
    ];
    
    let hasExplicitAssumptions = false;
    let validatesAssumptions = false;
    let considersAlternatives = false;
    
    // Analyze each thought
    for (const thought of thoughts) {
      const text = thought.thought || '';
      const lowerText = text.toLowerCase();
      
      // Check if assumptions are explicitly acknowledged
      if (assumptionIndicators.some(term => lowerText.includes(term))) {
        hasExplicitAssumptions = true;
        score += 5;
      }
      
      // Check if assumptions are validated
      if (validationIndicators.some(term => lowerText.includes(term))) {
        validatesAssumptions = true;
        score += 10;
      }
      
      // Check if alternatives are considered
      if (alternativeIndicators.some(term => lowerText.includes(term))) {
        considersAlternatives = true;
        score += 5;
      }
    }
    
    // Penalize if assumptions aren't addressed at all
    if (!hasExplicitAssumptions) {
      score -= 15;
    }
    
    // Penalize if assumptions aren't validated
    if (hasExplicitAssumptions && !validatesAssumptions) {
      score -= 10;
    }
    
    // Penalize if alternatives aren't considered
    if (!considersAlternatives) {
      score -= 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private analyzeConclusionStrength(thoughts: ThoughtData[]): number {
    if (!thoughts || thoughts.length === 0) return 0;
    
    // Calculate conclusion strength based on:
    // 1. Clear statement of conclusions
    // 2. Connection to evidence and reasoning
    // 3. Acknowledgment of limitations
    // 4. Consideration of implications
    
    let score = 70; // Start with base score
    
    // Look for conclusion indicators
    const conclusionIndicators = [
      'conclude', 'conclusion', 'therefore', 'thus', 'hence',
      'consequently', 'in summary', 'to sum up', 'ultimately',
      'in the final analysis', 'as a result'
    ];
    
    // Look for limitation acknowledgment
    const limitationIndicators = [
      'limitation', 'constraint', 'drawback', 'weakness',
      'restriction', 'shortcoming', 'deficiency', 'caveat',
      'however', 'nevertheless', 'nonetheless', 'although'
    ];
    
    // Look for implication considerations
    const implicationIndicators = [
      'implication', 'consequence', 'impact', 'effect', 'result',
      'outcome', 'significance', 'importance', 'meaning', 'suggests'
    ];
    
    let hasConclusion = false;
    let acknowledgesLimitations = false;
    let considersImplications = false;
    
    // Focus on last 3 thoughts (assuming conclusion is near the end)
    const lastThoughts = thoughts.slice(-3);
    
    for (const thought of lastThoughts) {
      const text = thought.thought || '';
      const lowerText = text.toLowerCase();
      
      // Check for conclusion indicators
      if (conclusionIndicators.some(term => lowerText.includes(term))) {
        hasConclusion = true;
        score += 10;
      }
      
      // Check for limitation acknowledgment
      if (limitationIndicators.some(term => lowerText.includes(term))) {
        acknowledgesLimitations = true;
        score += 10;
      }
      
      // Check for implication considerations
      if (implicationIndicators.some(term => lowerText.includes(term))) {
        considersImplications = true;
        score += 10;
      }
    }
    
    // Penalize if no clear conclusion is found
    if (!hasConclusion) {
      score -= 25;
    }
    
    // Penalize if limitations aren't acknowledged
    if (!acknowledgesLimitations) {
      score -= 10;
    }
    
    // Penalize if implications aren't considered
    if (!considersImplications) {
      score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private detectFallacies(thoughts: ThoughtData[]): Array<{ 
    type: string; 
    description: string; 
    thoughtNumbers: number[]; 
    suggestionForImprovement: string; 
  }> {
    if (!thoughts || thoughts.length === 0) return [];
    
    const fallacies: Array<{
      type: string;
      description: string;
      thoughtNumbers: number[];
      suggestionForImprovement: string;
    }> = [];
    
    // Common fallacy patterns to check for
    const fallacyPatterns = [
      {
        type: 'Appeal to Authority',
        keywords: ['expert', 'authority', 'professor', 'scientist', 'according to'],
        nonQualifiers: ['evidence', 'reason', 'study', 'research', 'experiment'],
        description: 'Relying on authority figures rather than evidence or reasoning',
        suggestion: 'Support claims with evidence and reasoning instead of just authority figures'
      },
      {
        type: 'False Dichotomy',
        keywords: ['either', 'or', 'only two', 'only option', 'no other'],
        description: 'Presenting only two options when more exist',
        suggestion: 'Consider a broader range of possibilities instead of just two alternatives'
      },
      {
        type: 'Hasty Generalization',
        keywords: ['all', 'every', 'always', 'never', 'none', 'everyone', 'nobody'],
        description: 'Drawing broad conclusions from limited evidence',
        suggestion: 'Qualify statements with appropriate scope (some, many, often) instead of universal claims'
      },
      {
        type: 'Post Hoc Fallacy',
        keywords: ['because', 'after', 'following', 'since'],
        phrases: ['happened after', 'followed by', 'since this occurred'],
        description: 'Assuming correlation implies causation',
        suggestion: 'Establish causal mechanisms rather than assuming sequence implies causation'
      },
      {
        type: 'Slippery Slope',
        keywords: ['lead to', 'eventually', 'ultimately', 'end up', 'slippery', 'cascade'],
        description: 'Suggesting one event inevitably leads to extreme consequences',
        suggestion: 'Establish clear connections between steps instead of making extreme extrapolations'
      },
      {
        type: 'Circular Reasoning',
        description: 'Using a conclusion as a premise',
        suggestion: 'Support claims with independent evidence that does not assume the conclusion'
      },
      {
        type: 'Confirmation Bias',
        keywords: ['confirms', 'supports my', 'proves my', 'as I suspected', 'as expected'],
        description: 'Only considering evidence that supports existing beliefs',
        suggestion: 'Actively seek and consider evidence that might contradict your hypothesis'
      }
    ];
    
    // Check each thought for fallacies
    for (let i = 0; i < thoughts.length; i++) {
      const thought = thoughts[i];
      const text = thought.thought || '';
      const lowerText = text.toLowerCase();
      const thoughtNumber = thought.thoughtNumber || (i + 1);
      
      // Check for each fallacy pattern
      for (const pattern of fallacyPatterns) {
        let matchesPattern = false;
        
        // Check for keyword matches
        if (pattern.keywords) {
          matchesPattern = pattern.keywords.some(keyword => 
            lowerText.includes(keyword.toLowerCase()));
          
          // If potential match, check for qualifying words that might negate the fallacy
          if (matchesPattern && pattern.nonQualifiers) {
            const hasQualifier = pattern.nonQualifiers.some(qualifier => 
              lowerText.includes(qualifier.toLowerCase()));
            if (hasQualifier) {
              matchesPattern = false;
            }
          }
        }
        
        // Check for specific phrases
        if (!matchesPattern && pattern.phrases) {
          matchesPattern = pattern.phrases.some(phrase => 
            lowerText.includes(phrase.toLowerCase()));
        }
        
        // Check for circular reasoning (special case)
        if (!matchesPattern && pattern.type === 'Circular Reasoning') {
          // Simple check: does the same phrase appear at beginning and end?
          const sentences = text.split(/[.!?]\s+/);
          if (sentences.length >= 2) {
            const firstSentence = sentences[0].toLowerCase();
            const lastSentence = sentences[sentences.length - 1].toLowerCase();
            
            // Extract key phrases (3+ word sequences)
            const firstPhrases = this.extractPhrases(firstSentence, 3);
            const lastPhrases = this.extractPhrases(lastSentence, 3);
            
            // Check for overlapping phrases
            matchesPattern = firstPhrases.some(phrase => 
              lastPhrases.includes(phrase));
          }
        }
        
        // If we found a fallacy, record it
        if (matchesPattern) {
          fallacies.push({
            type: pattern.type,
            description: pattern.description,
            thoughtNumbers: [thoughtNumber],
            suggestionForImprovement: pattern.suggestion
          });
          
          // Only record one fallacy type per thought for simplicity
          break;
        }
      }
    }
    
    // Consolidate fallacies of the same type across multiple thoughts
    return this.consolidateFallacies(fallacies);
  }

  // Helper method to extract key phrases from text
  private extractPhrases(text: string, minWords: number): string[] {
    const words = text.split(/\s+/);
    const phrases: string[] = [];
    
    if (words.length < minWords) return [text];
    
    for (let i = 0; i <= words.length - minWords; i++) {
      phrases.push(words.slice(i, i + minWords).join(' '));
    }
    
    return phrases;
  }
  
  // Helper method to consolidate fallacies of the same type
  private consolidateFallacies(fallacies: Array<{
    type: string;
    description: string;
    thoughtNumbers: number[];
    suggestionForImprovement: string;
  }>): Array<{
    type: string;
    description: string;
    thoughtNumbers: number[];
    suggestionForImprovement: string;
  }> {
    const consolidated = new Map<string, {
      type: string;
      description: string;
      thoughtNumbers: number[];
      suggestionForImprovement: string;
    }>();
    
    for (const fallacy of fallacies) {
      if (consolidated.has(fallacy.type)) {
        const existing = consolidated.get(fallacy.type)!;
        existing.thoughtNumbers = [...existing.thoughtNumbers, ...fallacy.thoughtNumbers];
      } else {
        consolidated.set(fallacy.type, { ...fallacy });
      }
    }
    
    return Array.from(consolidated.values());
  }

  private identifyGaps(thoughts: ThoughtData[]): Array<{ 
    description: string; 
    betweenThoughts: [number, number]; 
    suggestionForImprovement: string; 
  }> {
    if (!thoughts || thoughts.length < 2) return [];
    
    const gaps: Array<{
      description: string;
      betweenThoughts: [number, number];
      suggestionForImprovement: string;
    }> = [];
    
    // Sort thoughts by number to ensure proper sequence analysis
    const sortedThoughts = [...thoughts];
    sortedThoughts.sort((a, b) => {
      const numA = a.thoughtNumber || 0;
      const numB = b.thoughtNumber || 0;
      return numA - numB;
    });
    
    // Define potential gap types to check for
    const gapTypes = [
      {
        type: 'Missing Evidence',
        keywords: ['therefore', 'thus', 'hence', 'so', 'conclude', 'clearly', 'obviously'],
        description: 'Conclusion drawn without sufficient supporting evidence',
        suggestion: 'Add intermediate steps with evidence supporting how you reached this conclusion'
      },
      {
        type: 'Logical Leap',
        description: 'Step in reasoning that seems disconnected from previous thoughts',
        suggestion: 'Add intermediate reasoning steps that connect these thoughts more clearly'
      },
      {
        type: 'Unexplained Concept',
        description: 'Introduction of a new concept without explanation',
        suggestion: 'Introduce and explain new concepts before building analysis upon them'
      },
      {
        type: 'Missing Context',
        description: 'Lack of necessary context for understanding the reasoning',
        suggestion: 'Add contextual information that helps frame the analysis'
      }
    ];
    
    // Analyze consecutive thoughts for gaps
    for (let i = 1; i < sortedThoughts.length; i++) {
      const prevThought = sortedThoughts[i-1];
      const currThought = sortedThoughts[i];
      
      const prevText = prevThought.thought || '';
      const currText = currThought.thought || '';
      
      const prevNumber = prevThought.thoughtNumber || i;
      const currNumber = currThought.thoughtNumber || (i + 1);
      
      // Skip thoughts that aren't actually consecutive in numbering
      // This accounts for any thoughts that might have been deleted
      if (Math.abs(currNumber - prevNumber) > 1.5) continue;
      
      // Check for various gap types
      
      // 1. Check for sudden conclusion without evidence
      if (gapTypes[0].keywords && gapTypes[0].keywords.some(kw => currText.toLowerCase().includes(kw))) {
        const wordOverlap = this.calculateWordOverlap(prevText, currText);
        if (wordOverlap < 0.2) { // Low overlap suggests a logical jump
          gaps.push({
            description: gapTypes[0].description,
            betweenThoughts: [prevNumber, currNumber],
            suggestionForImprovement: gapTypes[0].suggestion
          });
          continue; // Only report one gap type between these thoughts
        }
      }
      
      // 2. Check for logical leaps (significant topic shifts)
      const topicContinuity = this.assessTopicContinuity(prevText, currText);
      if (topicContinuity < 0.3) { // Low continuity suggests a topic shift
        gaps.push({
          description: gapTypes[1].description,
          betweenThoughts: [prevNumber, currNumber],
          suggestionForImprovement: gapTypes[1].suggestion
        });
        continue;
      }
      
      // 3. Check for unexplained new concepts
      const newConcepts = this.identifyNewConcepts(prevText, currText);
      if (newConcepts.length > 0) {
        gaps.push({
          description: `${gapTypes[2].description}: '${newConcepts.join("', '")}' introduced without explanation`,
          betweenThoughts: [prevNumber, currNumber],
          suggestionForImprovement: gapTypes[2].suggestion
        });
        continue;
      }
    }
    
    return gaps;
  }
  
  // Helper to calculate word overlap between two texts
  private calculateWordOverlap(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const wordsB = new Set(textB.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    
    let overlap = 0;
    // Use Array.from to avoid directly iterating over Set
    Array.from(wordsB).forEach(word => {
      if (wordsA.has(word)) overlap++;
    });
    
    return wordsB.size > 0 ? overlap / wordsB.size : 0;
  }
  
  // Helper to assess topic continuity between thoughts
  private assessTopicContinuity(textA: string, textB: string): number {
    // Extract key terms (nouns, proper nouns, etc.)
    const keyTermsA = this.extractKeyTerms(textA);
    const keyTermsB = this.extractKeyTerms(textB);
    
    // Calculate overlap of key terms
    let shared = 0;
    // Use Array.from to avoid directly iterating over Set
    Array.from(keyTermsB).forEach(term => {
      if (keyTermsA.has(term)) shared++;
    });
    
    return keyTermsB.size > 0 ? shared / keyTermsB.size : 0;
  }
  
  // Helper to extract key terms from text
  private extractKeyTerms(text: string): Set<string> {
    // Simple extraction of capitalized terms and frequent nouns
    const words = text.split(/\W+/);
    const keyTerms = new Set<string>();
    
    // Add capitalized words (likely important terms)
    for (const word of words) {
      if (word.length > 1 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        keyTerms.add(word.toLowerCase());
      }
    }
    
    // Add any words that look like technical terms
    const technicalPattern = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b|\b[a-z]+_[a-z]+\b|\b[a-z]+-[a-z]+\b/g;
    const technicalMatches = text.match(technicalPattern) || [];
    for (const match of technicalMatches) {
      keyTerms.add(match.toLowerCase());
    }
    
    return keyTerms;
  }
  
  // Helper to identify new concepts introduced without explanation
  private identifyNewConcepts(prevText: string, currText: string): string[] {
    const newConcepts: string[] = [];
    
    // Look for patterns like "X is" or "using X" where X wasn't in previous text
    const conceptPatterns = [
      /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b(?=\s+is\b|\s+are\b|\s+refers\b|\s+means\b)/g,  // CamelCase followed by "is"
      /\busing\s+([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g,  // "using CamelCase"
      /\b((?:[A-Z][a-z]+\s+){2,})\b(?=\s+is\b|\s+are\b|\s+refers\b|\s+means\b)/g,  // Multiple capitalized words
      /\b([A-Z][A-Z0-9]+)\b(?=\s+is\b|\s+are\b|\s+refers\b|\s+means\b)/g   // Acronyms
    ];
    
    const prevTextLower = prevText.toLowerCase();
    
    for (const pattern of conceptPatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      
      while ((match = pattern.exec(currText)) !== null) {
        const concept = match[1];
        
        // If concept is significant and wasn't in previous text
        if (concept && concept.length > 3 && !prevTextLower.includes(concept.toLowerCase())) {
          newConcepts.push(concept);
        }
      }
    }
    
    return newConcepts;
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
