import { ThoughtData, OptimizedPrompt } from './types.js';

// Extended thought interface to include analysis props
interface ExtendedThoughtData extends ThoughtData {
  semanticAnalysisPrompt?: string;
  memoryInsightsPrompt?: string;
  analysis?: string;
  fileContentPrompt?: string;
}
import { encoding_for_model } from "tiktoken";

interface NeuralConnection {
  weight: number;
  connections: Set<string>;
  lastUsed: number;
  context: Set<string>;
}

interface DominantPattern {
  word: string;
  weight: number;
}

interface Trend {
  type: 'confidence' | 'complexity';
  direction: 'increasing' | 'decreasing';
  value: number;
}

interface SessionContext {
  sessionStage: string;
  stageConfidence: number;
  dominantPatterns: DominantPattern[];
  trends: Trend[];
  recentContext?: string;
}

export class PromptOptimizer {
  private static readonly LEARNING_RATE = 0.1;
  private static readonly DECAY_FACTOR = 0.95;
  private static readonly MIN_WEIGHT = 0.1;
  private static readonly MAX_PATTERNS = 100;
  private static readonly CONTEXT_WINDOW_SIZE = 3; // Default context window size
  private static readonly DECAY_RATE = 0.8;

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
    },
    // Dynamic pattern recognition system
    contextualPatterns: new Map<string, RegExp>(),
    thoughtRelationships: new Map<number, Set<number>>(),
    semanticMemory: new Map<string, Array<string>>(),
    neuralNetwork: new Map<string, NeuralConnection>()
  };

  private static patternWeights: { [key: string]: number } = {
    'recursive': 1,
    'circular': 1,
    'branch': 1,
    'conceptual': 1,
    'relational': 1,
  };

  private static stopWords: Set<string> = new Set([
    'the', 'and', 'is', 'are', 'a', 'an', 'in', 'on', 'of', 'to', 'for', 'with',
    'that', 'this', 'it', 'be', 'as', 'at', 'by', 'from', 'but', 'not', 'or',
    'so', 'than', 'too', 'very', 'can', 'will', 'just', 'if', 'we', 'you', 'he',
    'she', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'hers',
    'its', 'our', 'their'
  ]);

  private static initializeContextualPatterns(): void {
    this.patterns.contextualPatterns.set('recursive', /(\w+)\s*\1/gi);
    this.patterns.contextualPatterns.set('circular', /(\w+).*?\1/gi);
    this.patterns.contextualPatterns.set('branch', /\[(.*?)\]/g);
    this.patterns.contextualPatterns.set('conceptual', /\{(.*?)\}/g);
    this.patterns.contextualPatterns.set('relational', /(\w+)\s*(->|→|⇒)\s*(\w+)/g);
  }

  private static updateNeuralNetwork(concept: string, context: Set<string>, confidence: number = 0.5): void {
    const now = Date.now();
    const connection = this.patterns.neuralNetwork.get(concept) || {
      weight: 0.5,
      connections: new Set<string>(),
      lastUsed: now,
      context: new Set<string>()
    };

    // Apply time-based decay
    const timeDiff = (now - connection.lastUsed) / (1000 * 60 * 60);
    connection.weight *= Math.pow(this.DECAY_FACTOR, timeDiff);
    connection.weight = Math.max(connection.weight, this.MIN_WEIGHT);

    // Update weight based on confidence and context
    const learningRate = this.LEARNING_RATE * (1 + confidence);
    connection.weight += learningRate * (1 - connection.weight);

    // Update connections and context
    context.forEach(c => {
      connection.connections.add(c);
      connection.context.add(c);
    });
    
    connection.lastUsed = now;
    this.patterns.neuralNetwork.set(concept, connection);

    // Prune weak connections periodically
    if (this.patterns.neuralNetwork.size > this.MAX_PATTERNS) {
      this.pruneWeakConnections();
    }
  }

  private static pruneWeakConnections(): void {
    const connections = Array.from(this.patterns.neuralNetwork.entries())
      .sort(([, a], [, b]) => b.weight - a.weight)
      .slice(0, this.MAX_PATTERNS);
    
    this.patterns.neuralNetwork = new Map(connections);
  }

  private static updateSemanticMemory(thought: ThoughtData): void {
    const concepts = new Set(thought.thought.toLowerCase().match(/\b\w+\b/g) || []);
    const context = new Set<string>();
    
    // Build context from the thought
    if (thought.isHypothesis) context.add('hypothesis');
    if (thought.isVerification) context.add('verification');
    if (thought.isChainOfThought) context.add('chain');
    
    concepts.forEach(concept => {
      // Update neural network with dynamic confidence
      const confidence = thought.confidenceLevel ? thought.confidenceLevel / 100 : 0.5;
      this.updateNeuralNetwork(concept, context, confidence);

      // Update semantic memory
      const related = this.patterns.semanticMemory.get(concept) || [];
      concepts.forEach(related_concept => {
        if (concept !== related_concept && !related.includes(related_concept)) {
          related.push(related_concept);
        }
      });
      this.patterns.semanticMemory.set(concept, related);
    });
  }

  static compress(context: string): OptimizedPrompt {
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

    // Remove duplicated whitespace
    optimized = optimized.replace(/\s+/g, ' ');

    // Remove redundant metadata sections if they don't contain unique information
    const sections = optimized.split('\n');
    optimized = sections
      .filter((section, index) => {
        if (section.includes('Pattern Analysis:') || 
            section.includes('Trend Analysis:') || 
            section.includes('Neural Network State:') || 
            section.includes('Dynamic Analysis:')) {
          // Only include if it contains meaningful data
          return sections[index + 1]?.trim().startsWith('-');
        }
        return true;
      })
      .join('\n');

    // Remove empty lines and extra whitespace
    optimized = optimized
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join('\n')
      .trim();

    const compressionStats = this.calculateCompressionStats(original, optimized);

    return { 
      prompt: optimized, 
      compressionStats: compressionStats, 
      original: original, 
      optimized: optimized, 
      stats: compressionStats 
    };
  }

  private static calculateCompressionStats(original: string, optimized: string): {
    originalTokens: number;
    optimizedTokens: number;
    compressionRatio: number;
  } {
    const originalTokens = this.estimateTokens(original);
    const optimizedTokens = this.estimateTokens(optimized);
    
    // Calculate size ratio: optimizedTokens / originalTokens
    const sizeRatio = originalTokens === 0 ?
      0 :
      (optimizedTokens / originalTokens);

    return {
      originalTokens,
      optimizedTokens,
      compressionRatio: Number((sizeRatio * 100).toFixed(2)) // Display as percentage for user-friendliness
    };
  }

  private static estimateTokens(text: string): number {
    // Use tiktoken for more accurate estimation (using gpt-4 encoding as approximation)
    try {
      const encoding = encoding_for_model("gpt-4");
      const tokens = encoding.encode(text);
      encoding.free(); // Free up memory used by the encoder
      return tokens.length;
    } catch (error) {
      console.error("Tiktoken error, falling back to basic estimation:", error);
      // Fallback to basic word count if tiktoken fails
      return text.split(/[\s\p{P}]+/u).filter(word => word).length;
    }
  }

  static validate(prompt: string): boolean {
    const requiredMarkers = ['analyze', 'enhance', 'plan'];
    return requiredMarkers.some(marker => prompt.includes(marker));
  }

  private static structureHierarchically(text: string, thought?: ThoughtData): string {
    const sections = text.split(/[.!?]\s+/);
    
    if (thought?.isChainOfThought) {
      const relationships = this.patterns.thoughtRelationships.get(thought.thoughtNumber);
      if (relationships) {
        sections.push(`[Related: ${Array.from(relationships).join(', ')}]`);
      }
    }

    return sections
      .filter(s => s.length > 0)
      .map(s => {
        const semanticEnhanced = this.enhanceWithSemanticMemory(s.trim());
        return this.applyContextualPatterns(semanticEnhanced);
      })
      .join(' > ');
  }

  private static enhanceWithSemanticMemory(text: string): string {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const enhancedContext = new Set<string>();

    words.forEach(word => {
      // Get and validate neural connections
      const neural = this.patterns.neuralNetwork.get(word);
      if (neural && neural.weight > this.MIN_WEIGHT && neural.context.size > 0) {
        const contexts = Array.from(neural.context)
          .slice(0, 3)
          .join(', ');
        const weight = (neural.weight * 100).toFixed(1);
        enhancedContext.add(`{neural:${word}(${weight}%) -> ${contexts}}`);
      }

      // Get semantic memory
      const related = this.patterns.semanticMemory.get(word);
      if (related?.length) {
        enhancedContext.add(`{semantic:${related.slice(0, 3).join(', ')}}`);
      }
    });

    return `${text} ${Array.from(enhancedContext).join(' ')}`;
  }

  private static applyContextualPatterns(text: string): string {
    let enhancedText = text;
    
    // Apply existing contextual patterns
    this.patterns.contextualPatterns.forEach((pattern, key) => {
      const matches = text.match(pattern);
      if (matches?.length) {
        const weight = this.getPatternWeight(key); // Get dynamic weight
        enhancedText += ` [${key}:${matches.length} weight:${weight.toFixed(2)}]`;
        this.updatePatternWeight(key, matches.length); // Update pattern weight
      }
    });

    // Simple dynamic pattern identification (log potential new patterns - n-grams)
    const words = text.toLowerCase().match(/\b\w{3,}\b/g) || []; // Get words (3+ chars)
    const ngrams: Record<string, number> = {};
    const n = 3; // Example: look for trigrams

    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      ngrams[ngram] = (ngrams[ngram] || 0) + 1;
    }

    // Log frequent n-grams as potential new patterns (e.g., appearing more than once)
    Object.entries(ngrams).forEach(([ngram, count]) => {
      if (count > 1) {
        // Check if this pattern (or similar) already exists before logging
        let exists = false;
        this.patterns.contextualPatterns.forEach((pattern) => {
            // Basic check if the regex source includes the ngram words
            if (pattern.source.includes(ngram.split(' ')[0]) && pattern.source.includes(ngram.split(' ')[1]) && pattern.source.includes(ngram.split(' ')[2])) {
                exists = true;
            }
        });
        if (!exists) {
             console.log(`Potential new pattern detected: "${ngram}" (count: ${count})`);
             // In a more advanced implementation, we could add this ngram as a new RegExp 
             // to this.patterns.contextualPatterns or a separate dynamic patterns map.
        }
      }
    });

    return enhancedText;
  }

  private static getPatternWeight(key: string): number {
    return this.patternWeights[key] || 1;
  }

  private static updatePatternWeight(key: string, matchCount: number): void {
    if (this.patternWeights[key]) {
      this.patternWeights[key] += this.LEARNING_RATE * matchCount;
      this.patternWeights[key] = Math.max(0.1, Math.min(this.patternWeights[key], 5));
     }
   }

   static optimizeThought(
     thought: ThoughtData, 
     thoughtHistory: ThoughtData[], 
     dynamicContextWindowSize?: number,
     // Add IDE context parameters
     fileStructure?: string, 
     openFiles?: string[] 
   ): OptimizedPrompt {
     if (this.patterns.contextualPatterns.size === 0) {
       this.initializeContextualPatterns();
    }
    
    this.updateSemanticMemory(thought);
    
    // Use dynamic context window size if provided, otherwise default
    const sessionContext = this.analyzeSessionContext(thoughtHistory, dynamicContextWindowSize);
    const contextEnhancedThought = this.applySessionContext(thought, sessionContext);

    if (thought.isChainOfThought && thought.chainOfThoughtStep && thought.chainOfThoughtStep > 1) {
       this.trackThoughtRelationship(thought.thoughtNumber, thought.thoughtNumber - 1);
     }

     // Prepare IDE context string with more emphasis on using it
     let ideContextString = '';
     if (fileStructure) {
       ideContextString += `\n\n## File Structure Analysis:\n${fileStructure}\n`;
     }
     if (openFiles && openFiles.length > 0) {
       ideContextString += `\n## Open Files:\n${openFiles.map(f => `- ${f}`).join('\n')}\n`;
     }
     
     // Add explicit instruction to incorporate file analysis in the response
     if (fileStructure || (openFiles && openFiles.length > 0)) {
       ideContextString += `\n\n## IMPORTANT: Your response MUST incorporate relevant insights from the above file structure analysis and open files. Reference specific elements from the analysis that are relevant to this thought process.\n`;
     }

     // Analyze current thought content for context-aware file inclusion
     let fileContentSection = '';
     // Define extendedThought before first use
     const extendedThought = thought as ExtendedThoughtData;
     
     if (typeof extendedThought.fileContentPrompt === 'string' && extendedThought.fileContentPrompt.length > 0) {
       // Extract key terms from the thought to improve contextual relevance of included files
       const keyTerms = this.extractCodeEntitiesFromThought(thought.thought);
       
       // Log the key terms for debugging
       if (keyTerms.length > 0) {
         console.log(`[CONTEXT] Extracted ${keyTerms.length} key terms from thought #${thought.thoughtNumber}:`, keyTerms);
       }
       
       // Add context info to the file content section
       fileContentSection = `

## Source Code From Open Files:
${keyTerms.length > 0 ? `// Context-relevant files prioritized based on: ${keyTerms.join(', ')}\n` : ''}
${extendedThought.fileContentPrompt}
`;
     }
     
     // Check if we have semantic analysis to include
     let semanticAnalysisSection = '';
     if (typeof extendedThought.semanticAnalysisPrompt === 'string' && extendedThought.semanticAnalysisPrompt.length > 0) {
       semanticAnalysisSection = `

## Semantic Code Analysis:
${extendedThought.semanticAnalysisPrompt}
`;
       console.log("[DEBUG] Including semantic analysis in prompt");
     } else {
       console.log("[DEBUG] No semantic analysis available for prompt", 
                 typeof extendedThought.semanticAnalysisPrompt, 
                 extendedThought.semanticAnalysisPrompt ? extendedThought.semanticAnalysisPrompt.length : 'undefined');
     }
     
     // Check if we have memory insights to include
     let memoryInsightsSection = '';
     // Use the already declared extendedThought variable
     if (typeof extendedThought.memoryInsightsPrompt === 'string' && extendedThought.memoryInsightsPrompt.length > 0) {
       memoryInsightsSection = `

## Learning From Similar Problems:
${extendedThought.memoryInsightsPrompt}
`;
       console.log("[DEBUG] Including memory insights in prompt");
     } else {
       console.log("[DEBUG] No memory insights available for prompt", 
                 typeof extendedThought.memoryInsightsPrompt, 
                 extendedThought.memoryInsightsPrompt ? extendedThought.memoryInsightsPrompt.length : 'undefined');
     }
     
     // Add step history to maintain continuity across steps
     let stepHistorySection = '';
     if (thoughtHistory.length > 0) {
       // Get the last 3 thoughts as history to maintain context
       const recentThoughts = thoughtHistory.slice(-3);
       const historyText = recentThoughts.map(t => {
         // Format each thought as a summary
         const stepNum = typeof t.thoughtNumber === 'number' ? 
           (Math.floor(t.thoughtNumber) === t.thoughtNumber ? 
             t.thoughtNumber.toString() : 
             t.thoughtNumber.toFixed(1)) : 
           '?';
         
         // Extract the first 150 chars of thought and analysis
         const thoughtPreview = t.thought?.substring(0, 150) + '...';
         // Handle analysis which may not be part of ThoughtData type
         const analysisText = (t as any).analysis || '';
         const analysisPreview = analysisText.substring(0, 150) + '...';
         
         return `Step ${stepNum}: ${thoughtPreview}\nKey insight: ${analysisPreview}\n`;
       }).join('\n');
       
       stepHistorySection = `

## Recent Analysis History:
${historyText}
`;
       console.log("[DEBUG] Including history from previous steps");
     } else {
       console.log("[DEBUG] No step history available yet");
     }

     const context = `
## IDE Context and Codebase Information:
${ideContextString.trim() || 'No IDE context provided.'}
${fileContentSection}
${semanticAnalysisSection}
${memoryInsightsSection}
${stepHistorySection}

## Current Thought (${thought.thoughtNumber}/${thought.totalThoughts}):
${thought.thought}

## Analysis Focus:
Stage: ${sessionContext.sessionStage}
Focus: ${sessionContext.recentContext || 'Pre-reason and Chain-of-thought optimization'}
    
    ${thought.isChainOfThought ? `CoT Step ${thought.chainOfThoughtStep}/${thought.totalChainOfThoughtSteps}` : ''}

## RESPONSE FORMAT:
1. Begin with a brief analysis of the current thought
2. Relate the thought to relevant aspects of the codebase structure and source code (when available)
3. Reference specific code sections from the provided files when applicable
4. Continue the sequential thinking process with deep reasoning

## STEP STRUCTURE GUIDELINES:
- Identify this analysis as "Step X" or "Step X.Y" at the beginning of your response
- For main points, use the format "Step 1:", "Step 2:", etc.
- For detailed exploration of specific components, use substeps like "Step 1.1:", "Step 1.2:", etc.
- Connect this step to previous steps by referencing their insights
- Recommend the next logical step in the analysis sequence
    ${thought.isHypothesis ? 'Hypothesis' : ''}
    ${thought.isVerification ? 'Verification' : ''}
    ${sessionContext.dominantPatterns.length > 0 ? `Patterns: ${sessionContext.dominantPatterns.slice(0,2).map(p => p.word).join(', ')}` : ''}
    `;

    const { prompt, compressionStats } = this.compress(context);
    return {
      prompt,
      compressionStats,
      original: context,
      optimized: prompt,
      stats: compressionStats
    };
  }

  private static analyzeSessionContext(thoughtHistory: ThoughtData[], contextWindowSize: number = this.CONTEXT_WINDOW_SIZE): SessionContext {
    if (!thoughtHistory || thoughtHistory.length === 0) {
      return {
        sessionStage: 'initial',
        stageConfidence: 1,
        dominantPatterns: [],
        trends: [],
        recentContext: ''
      };
    }

    const lastThought = thoughtHistory[thoughtHistory.length - 1];
    const recentThoughts = thoughtHistory.slice(-contextWindowSize);
    
    const stageAnalysis = this.determineSessionStage(recentThoughts);
    const complexityAnalysis = this.analyzeComplexityProgression(thoughtHistory);
    const relationshipAnalysis = this.analyzeThoughtRelationships(thoughtHistory);
    const weightedKeywords = this.extractWeightedKeywords(thoughtHistory);
    
    const dominantPatterns = this.getDominantPatternsWithNeuralInfluence(
      weightedKeywords,
      relationshipAnalysis
    );

    const trends = [
      ...this.analyzeTrends(thoughtHistory),
      ...(complexityAnalysis.trends || []),
      ...(relationshipAnalysis.trends || [])
    ];

    return {
      sessionStage: stageAnalysis.stage,
      stageConfidence: stageAnalysis.confidence,
      dominantPatterns: dominantPatterns,
      trends: trends,
      recentContext: this.summarizeRecentContext(recentThoughts),
    };
  }

  private static analyzeComplexityProgression(thoughtHistory: ThoughtData[]): { trends: Trend[] } {
    const trends: Trend[] = [];
    if (thoughtHistory.length < 2) return { trends };

    const complexityOverTime = thoughtHistory.map(t => this.estimateComplexity(t.thought));
    const recentComplexities = complexityOverTime.slice(-3);
    
    const isIncreasing = recentComplexities.every((c, i) => 
      i === 0 || c > recentComplexities[i - 1]
    );
    
    const isDecreasing = recentComplexities.every((c, i) => 
      i === 0 || c < recentComplexities[i - 1]
    );
    
    const sustainedTrend = isIncreasing ? 'increasing' : isDecreasing ? 'decreasing' : null;

    if (sustainedTrend) {
      trends.push({
        type: 'complexity',
        direction: sustainedTrend,
        value: Math.abs(recentComplexities[recentComplexities.length - 1] - recentComplexities[0])
      });
    }

    return { trends };
  }

  private static analyzeThoughtRelationships(thoughtHistory: ThoughtData[]): { trends: Trend[] } {
    const trends: Trend[] = [];
    const relationships = Array.from(this.patterns.thoughtRelationships.entries());
    
    if (relationships.length < 2) return { trends };

    const recentRelationships = relationships
      .filter(([thoughtNum]) => thoughtNum > thoughtHistory.length - this.CONTEXT_WINDOW_SIZE)
      .map(([, refs]) => refs.size);

    if (recentRelationships.length === 0) return { trends };

    const avgRelationships = recentRelationships.reduce((a, b) => a + b, 0) / recentRelationships.length;

    trends.push({
      type: 'complexity',
      direction: avgRelationships > 1.5 ? 'increasing' : 'decreasing',
      value: avgRelationships
    });

    return { trends };
  }

  private static getDominantPatternsWithNeuralInfluence(
    weightedKeywords: [string, number][],
    relationshipAnalysis: { trends: Trend[] }
  ): DominantPattern[] {
    return weightedKeywords
      .slice(0, 5)
      .map(([word, weight]) => {
        const neuralConnection = this.patterns.neuralNetwork.get(word);
        const neuralWeight = neuralConnection ? neuralConnection.weight : 1;
        
        return {
          word,
          weight: weight * neuralWeight
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }

  private static determineSessionStage(recentThoughts: ThoughtData[]): { stage: string; confidence: number } {
    const stageScores: Record<string, number> = {
      initial: 0,
      hypothesis: 0,
      verification: 0,
      analysis: 0,
      conclusion: 0
    };

    recentThoughts.forEach((thought, index) => {
      const weight = Math.pow(this.DECAY_RATE, recentThoughts.length - index - 1);
      const text = thought.thought.toLowerCase();

      if (text.includes('hypothesis') || text.includes('assume')) {
        stageScores.hypothesis += weight;
      }
      if (text.includes('verify') || text.includes('validate') || text.includes('test')) {
        stageScores.verification += weight;
      }
      if (text.includes('analyze') || text.includes('examine')) {
        stageScores.analysis += weight;
      }
      if (text.includes('conclude') || text.includes('therefore') || text.includes('result')) {
        stageScores.conclusion += weight;
      }
    });

    const entries = Object.entries(stageScores);
    const [highestStage, highestScore] = entries.reduce((max, curr) => 
      curr[1] > max[1] ? curr : max, ['initial', 0]
    );

    const sortedScores = entries.sort(([,a], [,b]) => b - a);
    const confidence = sortedScores[1][1] === 0 ? 
      1 : 
      (highestScore - sortedScores[1][1]) / highestScore;

    return {
      stage: highestScore === 0 ? 'initial' : highestStage,
      confidence: confidence
    };
  }

  private static analyzeTrends(thoughtHistory: ThoughtData[]): Trend[] {
    const trends: Trend[] = [];
    if (thoughtHistory.length < 2) return trends;

    const recentThoughts = thoughtHistory.slice(-this.CONTEXT_WINDOW_SIZE);
    
    const confidences = recentThoughts
      .filter(t => t.confidenceLevel !== undefined)
      .map(t => t.confidenceLevel!);
    
    if (confidences.length >= 2) {
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      const confidenceTrend = confidences[confidences.length - 1] - avgConfidence;
      
      trends.push({
        type: 'confidence',
        direction: confidenceTrend > 0 ? 'increasing' : 'decreasing',
        value: Math.abs(confidenceTrend)
      });
    }

    const complexities = recentThoughts.map(t => this.estimateComplexity(t.thought));
    
    if (complexities.length >= 2) {
      const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
      const complexityTrend = complexities[complexities.length - 1] - avgComplexity;
      
      if (Math.abs(complexityTrend) > 0.1) {
        trends.push({
          type: 'complexity',
          direction: complexityTrend > 0 ? 'increasing' : 'decreasing',
          value: Math.abs(complexityTrend)
        });
      }

      const complexityVariance = complexities
        .map(c => Math.pow(c - avgComplexity, 2))
        .reduce((a, b) => a + b, 0) / complexities.length;

      if (complexityVariance > 1) {
        trends.push({
          type: 'complexity',
          direction: 'increasing',
          value: complexityVariance
        });
      }
    }

    return trends;
  }

  private static estimateComplexity(text: string): number {
    const words = text.split(/\s+/).length;
    const uniqueWords = new Set(text.toLowerCase().split(/\s+/)).size;
    const avgWordLength = text.length / (words || 1); // Avoid division by zero
    
    return (words * 0.3) + (uniqueWords * 0.5) + (avgWordLength * 0.2);
  }

  private static extractWeightedKeywords(thoughtHistory: ThoughtData[]): [string, number][] {
    const weightedCounts: { [key: string]: number } = {};
    
    thoughtHistory.forEach((thought, index) => {
      const weight = Math.pow(this.DECAY_RATE, thoughtHistory.length - index - 1);
      
      const words = thought.thought.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (!this.stopWords.has(word) && word.length > 2) {
          weightedCounts[word] = (weightedCounts[word] || 0) + weight;
        }
      });
    });

    return Object.entries(weightedCounts)
      .sort(([,a], [,b]) => b - a);
  }

  private static summarizeRecentContext(recentThoughts: ThoughtData[]): string {
    if (recentThoughts.length === 0) return '';

    const keywords = recentThoughts
      .map(t => this.extractKeywords(t.thought))
      .flat()
      .slice(0, 3);

    return `Recent focus: ${keywords.join(', ')}`;
  }

  private static extractKeywords(text: string): string[] {
    const wordCounts: { [key: string]: number } = {};
    const words = text.toLowerCase().split(/\s+/);

    words.forEach(word => {
      if (!this.stopWords.has(word) && word.length > 2) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });

    return Object.entries(wordCounts)
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([word]) => word);
  }
  
  /**
   * Extracts code entities (function names, class names, variable names) from thought text
   * to improve context-aware file relevance
   * @param thoughtText The text content of the thought
   * @returns Array of extracted code entity names
   */
  private static extractCodeEntitiesFromThought(thoughtText: string): string[] {
    if (!thoughtText) return [];
    
    const entities: Set<string> = new Set();
    
    // Common code entity patterns
    const patterns = [
      // Function calls: functionName(...)
      /\b([a-zA-Z][a-zA-Z0-9_]*)\s*\(/g,
      
      // Class names: often start with capital letters
      /\b([A-Z][a-zA-Z0-9_]*)\b/g,
      
      // Variable names: often in camelCase or snake_case
      /\b([a-z][a-zA-Z0-9]*)\b/g,
      
      // File references
      /\b([\w-]+\.(js|ts|jsx|tsx|html|css|py|java|go|rb|php))\b/g,
      
      // Directory/path references
      /['"`]([\w\-\.\/]+)['"`]/g,
      
      // Import/require statements
      /(?:import|require)\s+['"`]([^'"`]+)['"`]/g
    ];
    
    // Extract entities from thought text using regex patterns
    for (const pattern of patterns) {
      const matches = thoughtText.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 2) { // Skip very short matches
          // Filter out common words and reserved keywords
          if (!this.isCommonWordOrKeyword(match[1])) {
            entities.add(match[1]);
          }
        }
      }
    }
    
    // Convert set to array and limit to most relevant terms
    return Array.from(entities).slice(0, 10);
  }
  
  /**
   * Checks if a term is a common word or programming keyword
   * @param term The term to check
   * @returns True if the term is a common word or keyword
   */
  private static isCommonWordOrKeyword(term: string): boolean {
    // Common programming keywords to filter out
    const programmingKeywords = new Set([
      'function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
      'return', 'import', 'export', 'default', 'async', 'await', 'try', 'catch',
      'new', 'this', 'super', 'extends', 'implements', 'interface', 'type',
      'string', 'number', 'boolean', 'array', 'object', 'undefined', 'null',
      'true', 'false', 'public', 'private', 'protected', 'static', 'void'
    ]);
    
    // Check if the term is too short, a stop word, or a programming keyword
    return term.length < 3 || 
           this.stopWords.has(term.toLowerCase()) || 
           programmingKeywords.has(term.toLowerCase());
  }

  private static applySessionContext(thought: ThoughtData, sessionContext: SessionContext): ThoughtData {
    const enhancedThought = { ...thought };
    const prefix: string[] = [];
    const suffix: string[] = [];

    if (sessionContext.sessionStage !== 'initial') {
      prefix.push(`${sessionContext.sessionStage.charAt(0).toUpperCase() + sessionContext.sessionStage.slice(1)}-driven (${(sessionContext.stageConfidence * 100).toFixed(1)}% confidence)`);
    }

    if (sessionContext.recentContext) {
      prefix.push(sessionContext.recentContext);
    }

    if (sessionContext.dominantPatterns.length > 0) {
      const patterns = sessionContext.dominantPatterns
        .map((p: DominantPattern) => `${p.word}(${(p.weight * 100).toFixed(1)}%)`)
        .join(', ');
      suffix.push(`Dominant patterns: ${patterns}`);
    }

    if (sessionContext.trends.length > 0) {
      sessionContext.trends.forEach((trend: Trend) => {
        if (trend.type === 'confidence') {
          suffix.push(`Confidence ${trend.direction} by ${trend.value.toFixed(1)}%`);
        } else if (trend.type === 'complexity') {
          suffix.push(`Complexity ${trend.direction} by ${trend.value.toFixed(1)}`);
        }
      });
    }

    enhancedThought.thought = [
      prefix.length > 0 ? prefix.join(' | ') + ':' : '',
      thought.thought,
      suffix.length > 0 ? '[' + suffix.join(' | ') + ']' : ''
    ].filter(Boolean).join(' ');

    return enhancedThought;
  }

  private static trackThoughtRelationship(current: number, related: number): void {
    const relationships = this.patterns.thoughtRelationships.get(current) || new Set<number>();
    relationships.add(related);
    this.patterns.thoughtRelationships.set(current, relationships);
  }
}
