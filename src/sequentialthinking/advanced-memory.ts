/**
 * Advanced Memory System for Sequential Thinking
 * 
 * This module implements a persistent knowledge base that stores insights,
 * reasoning patterns, and effectiveness metrics across sessions.
 */

import * as fs from 'fs';
import * as path from 'path';
 import * as crypto from 'crypto';
 import * as os from 'os';
 import { ThoughtData } from './types.js';
 import { getEmbeddings } from './embeddings.js'; // Import embedding function
 
 // Define the memory storage location
const MEMORY_DIR = path.join(os.homedir(), '.sequential-thinking', 'memory');

// Ensure memory directory exists
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
 }
 
 // Use fs.promises
 import { promises as fsPromises } from 'fs';
 
 // Helper function for cosine similarity
 function cosineSimilarity(vecA: number[], vecB: number[]): number {
   if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
     return 0; // Return 0 for invalid inputs or zero vectors
   }
 
   let dotProduct = 0;
   let magnitudeA = 0;
   let magnitudeB = 0;
 
   for (let i = 0; i < vecA.length; i++) {
     dotProduct += vecA[i] * vecB[i];
     magnitudeA += vecA[i] * vecA[i];
     magnitudeB += vecB[i] * vecB[i];
   }
 
   magnitudeA = Math.sqrt(magnitudeA);
   magnitudeB = Math.sqrt(magnitudeB);
 
   if (magnitudeA === 0 || magnitudeB === 0) {
     return 0; // Avoid division by zero
   }
 
   return dotProduct / (magnitudeA * magnitudeB);
 }
 
 // Types for memory system
export interface MemoryItem {
  id: string;
  type: 'insight' | 'pattern' | 'effectiveness' | 'knowledge';
  content: string;
  metadata: {
    createdAt: string;
    updatedAt: string;
    associatedThoughts?: number[];
    tags: string[];
    confidence: number; // 0-1
    usageCount: number;
    effectiveness?: number; // 0-1, if measured
    projectContext?: string;
    codeContext?: {
      files: string[];
       symbols: string[];
     };
     embedding?: number[]; // Added optional embedding field
   };
 }

export interface ReasoningPattern {
  id: string;
  name: string;
  description: string;
  steps: string[];
  effectiveness: number; // 0-1
  applicableContexts: string[];
  usageCount: number;
  examples: {
    thoughtId: string;
    outcome: 'positive' | 'negative' | 'neutral';
  }[];
}

export interface MemoryQuery {
  type?: 'insight' | 'pattern' | 'effectiveness' | 'knowledge';
  tags?: string[];
  minConfidence?: number;
  minEffectiveness?: number;
   contextFiles?: string[];
   contextSymbols?: string[];
   queryText?: string; // Added for semantic search query
   similarityThreshold?: number; // Optional threshold for semantic search
   limit?: number;
 }

/**
 * Memory System class for storing and retrieving insights
 */
export class AdvancedMemorySystem {
  private memories: Map<string, MemoryItem> = new Map();
  private patterns: Map<string, ReasoningPattern> = new Map();
  private loaded = false;

  /**
   * Load memories from disk
   */
  public async loadMemories(): Promise<void> {
    if (this.loaded) return;
    
    try {
       // Load memories
       const memoriesPath = path.join(MEMORY_DIR, 'memories.json');
       if (fs.existsSync(memoriesPath)) { // Keep sync check for existence
         const memoriesData = await fsPromises.readFile(memoriesPath, 'utf8'); // Use async read
         const memoriesArray = JSON.parse(memoriesData) as MemoryItem[];
         memoriesArray.forEach(memory => {
          this.memories.set(memory.id, memory);
        });
      }
      
       // Load patterns
       const patternsPath = path.join(MEMORY_DIR, 'patterns.json');
       if (fs.existsSync(patternsPath)) { // Keep sync check for existence
         const patternsData = await fsPromises.readFile(patternsPath, 'utf8'); // Use async read
         const patternsArray = JSON.parse(patternsData) as ReasoningPattern[];
         patternsArray.forEach(pattern => {
          this.patterns.set(pattern.id, pattern);
        });
      }
      
      this.loaded = true;
      console.log(`Loaded ${this.memories.size} memories and ${this.patterns.size} patterns`);
    } catch (error) {
      console.error('Error loading memories:', error);
      // Initialize with empty memories on error
      this.memories = new Map();
      this.patterns = new Map();
      this.loaded = true;
    }
  }
  
  /**
   * Save memories to disk
   */
  private async saveMemories(): Promise<void> {
    try {
       // Save memories
       const memoriesArray = Array.from(this.memories.values());
       const memoriesPath = path.join(MEMORY_DIR, 'memories.json');
       await fsPromises.writeFile(memoriesPath, JSON.stringify(memoriesArray, null, 2)); // Use async write
       
       // Save patterns
       const patternsArray = Array.from(this.patterns.values());
       const patternsPath = path.join(MEMORY_DIR, 'patterns.json');
       await fsPromises.writeFile(patternsPath, JSON.stringify(patternsArray, null, 2)); // Use async write
     } catch (error) {
      console.error('Error saving memories:', error);
    }
  }
  
  /**
   * Store a new insight in memory
   */
  public async storeInsight(
    content: string,
    thoughtNumbers: number[],
    tags: string[] = [],
    confidence: number = 0.7,
    codeContext: { files: string[]; symbols: string[] } = { files: [], symbols: [] }
  ): Promise<string> {
    await this.loadMemories();
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const memory: MemoryItem = {
      id,
      type: 'insight',
      content,
      metadata: {
        createdAt: now,
        updatedAt: now,
        associatedThoughts: thoughtNumbers,
        tags,
        confidence,
         usageCount: 0,
         codeContext,
         embedding: undefined // Initialize embedding field
       }
     };
 
     // Generate embedding for the content
     try {
       const embedding = await getEmbeddings(content);
       if (embedding) {
         memory.metadata.embedding = embedding;
         console.log(`Generated embedding for memory item ${id}`);
       } else {
         console.warn(`Could not generate embedding for memory item ${id}`);
       }
     } catch (error) {
       console.error(`Error generating embedding for memory item ${id}:`, error);
     }
     
     this.memories.set(id, memory);
    await this.saveMemories();
    
    return id;
  }
  
  /**
   * Store a reasoning pattern
   */
  public async storePattern(
    name: string,
    description: string,
    steps: string[],
    applicableContexts: string[] = [],
    effectiveness: number = 0.5
  ): Promise<string> {
    await this.loadMemories();
    
    const id = crypto.randomUUID();
    
    const pattern: ReasoningPattern = {
      id,
      name,
      description,
      steps,
      effectiveness,
      applicableContexts,
      usageCount: 0,
      examples: []
    };
    
    this.patterns.set(id, pattern);
    await this.saveMemories();
    
    return id;
  }
  
  /**
   * Record the effectiveness of a thought
   */
  public async recordEffectiveness(
    thoughtNumbers: number[],
    effectiveness: number,
    context: string
  ): Promise<void> {
    await this.loadMemories();
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const memory: MemoryItem = {
      id,
      type: 'effectiveness',
      content: `Effectiveness score: ${effectiveness}. Context: ${context}`,
      metadata: {
        createdAt: now,
        updatedAt: now,
        associatedThoughts: thoughtNumbers,
        tags: ['effectiveness', 'metric'],
        confidence: 1.0, // This is a factual measurement
        usageCount: 0,
        effectiveness
      }
    };
    
    this.memories.set(id, memory);
    await this.saveMemories();
  }
  
  /**
   * Query memories based on criteria, including semantic search.
   */
  public async queryMemories(query: MemoryQuery): Promise<MemoryItem[]> {
    await this.loadMemories();
    
    let results = Array.from(this.memories.values());
    let queryEmbedding: number[] | null = null;

    // Generate embedding for query text if provided
    if (query.queryText) {
      try {
        queryEmbedding = await getEmbeddings(query.queryText);
        if (!queryEmbedding) {
          console.warn(`Could not generate embedding for query text: "${query.queryText.substring(0, 50)}..."`);
        }
      } catch (error) {
        console.error(`Error generating embedding for query text:`, error);
      }
    }
    
    // --- Standard Filtering ---
    // Filter by type
    if (query.type) {
      results = results.filter(memory => memory.type === query.type);
    }
    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(memory => 
        query.tags!.some(tag => memory.metadata.tags.includes(tag))
      );
    }
    // Filter by confidence
    if (query.minConfidence !== undefined) {
      results = results.filter(memory => 
        memory.metadata.confidence >= query.minConfidence!
      );
    }
    // Filter by effectiveness
    if (query.minEffectiveness !== undefined) {
      results = results.filter(memory => 
        memory.metadata.effectiveness !== undefined &&
        memory.metadata.effectiveness >= query.minEffectiveness!
      );
    }
    // Filter by code context files
    if (query.contextFiles && query.contextFiles.length > 0) {
      results = results.filter(memory => 
        memory.metadata.codeContext?.files.some(file => 
          query.contextFiles!.includes(file)
        )
      );
    }
    // Filter by code context symbols
    if (query.contextSymbols && query.contextSymbols.length > 0) {
      results = results.filter(memory => 
        memory.metadata.codeContext?.symbols.some(symbol => 
          query.contextSymbols!.includes(symbol)
         )
       );
     }

    // --- Semantic Search Filtering & Ranking ---
    let scoredResults: Array<MemoryItem & { similarityScore?: number }> = results.map(r => ({...r})); // Clone results

    if (queryEmbedding && query.queryText) {
      const threshold = query.similarityThreshold ?? 0.7; // Default similarity threshold
      console.log(`Performing semantic search with threshold ${threshold}`);

      scoredResults = scoredResults
        .map(memory => {
          let similarityScore: number | undefined = undefined;
          if (memory.metadata.embedding && queryEmbedding) {
            similarityScore = cosineSimilarity(queryEmbedding, memory.metadata.embedding);
          }
          // Assign score even if undefined for consistent sorting/filtering
          return { ...memory, similarityScore }; 
        })
        .filter(memory => 
          memory.similarityScore !== undefined && memory.similarityScore >= threshold
        );

      // Sort primarily by similarity (desc), then by recency (desc) as a tie-breaker
      scoredResults.sort((a, b) => {
        const simDiff = (b.similarityScore ?? -1) - (a.similarityScore ?? -1); // Treat undefined as lowest score
        if (simDiff !== 0) return simDiff;
        return new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime();
      });
      console.log(`Found ${scoredResults.length} memories above similarity threshold.`);

    } else {
      // If no semantic query, sort by recency only
      scoredResults.sort((a, b) => 
        new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
      );
    }
    
    // Apply limit to the potentially re-sorted results
    if (query.limit !== undefined) {
      scoredResults = scoredResults.slice(0, query.limit);
    }
    
    // Return the final results (optionally removing the score)
    // For now, keep the score as it might be useful context for the caller
    return scoredResults; //.map(({ similarityScore, ...rest }) => rest); // Uncomment to remove score
  }
  
  /**
   * Query reasoning patterns
   */
  public async queryPatterns(
    contextTags: string[] = [],
    minEffectiveness: number = 0
  ): Promise<ReasoningPattern[]> {
    await this.loadMemories();
    
    let results = Array.from(this.patterns.values());
    
    // Filter by applicable contexts
    if (contextTags.length > 0) {
      results = results.filter(pattern => 
        contextTags.some(tag => pattern.applicableContexts.includes(tag))
      );
    }
    
    // Filter by effectiveness
    results = results.filter(pattern => pattern.effectiveness >= minEffectiveness);
    
    // Sort by most effective first
    results.sort((a, b) => b.effectiveness - a.effectiveness);
    
    return results;
  }
  
  /**
   * Update a pattern's effectiveness based on usage
   */
  public async updatePatternEffectiveness(
    patternId: string,
    newEffectiveness: number,
    thoughtId: string,
    outcome: 'positive' | 'negative' | 'neutral'
  ): Promise<void> {
    await this.loadMemories();
    
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      console.error(`Pattern ${patternId} not found`);
      return;
    }
    
    // Update pattern effectiveness using weighted average
    const oldWeight = pattern.usageCount;
    const newWeight = 1;
    const totalWeight = oldWeight + newWeight;
    
    pattern.effectiveness = 
      (pattern.effectiveness * oldWeight + newEffectiveness * newWeight) / totalWeight;
    
    // Increment usage count
    pattern.usageCount += 1;
    
    // Add example
    pattern.examples.push({
      thoughtId,
      outcome
    });
    
    await this.saveMemories();
  }
  
  /**
   * Extract reasoning patterns from thoughts
   */
  public async extractPatternsFromThoughts(thoughts: ThoughtData[]): Promise<ReasoningPattern[]> {
    // This is a simplified implementation that would be enhanced with ML in production
    const patterns: ReasoningPattern[] = [];
    
    // Check for hypothesis-testing pattern
    const hasHypothesis = thoughts.some(t => t.isHypothesis);
    const hasVerification = thoughts.some(t => t.isVerification);
    
    if (hasHypothesis && hasVerification) {
      patterns.push({
        id: crypto.randomUUID(),
        name: 'Hypothesis Testing',
        description: 'Form a hypothesis and then verify it through testing',
        steps: [
          'Identify the problem',
          'Form a hypothesis',
          'Design verification approach',
          'Test the hypothesis',
          'Analyze results'
        ],
        effectiveness: 0.85,
        applicableContexts: ['debugging', 'research', 'analysis'],
        usageCount: 1,
        examples: []
      });
    }
    
    // Check for iterative refinement pattern
    const hasRevisions = thoughts.some(t => t.isRevision);
    
    if (hasRevisions) {
      patterns.push({
        id: crypto.randomUUID(),
        name: 'Iterative Refinement',
        description: 'Start with an initial solution and progressively refine it',
        steps: [
          'Create initial solution',
          'Identify weaknesses',
          'Refine the solution',
          'Repeat until satisfactory'
        ],
        effectiveness: 0.8,
        applicableContexts: ['design', 'optimization', 'problem-solving'],
        usageCount: 1,
        examples: []
      });
    }
    
    // Check for branching exploration pattern
    const hasBranches = thoughts.some(t => t.branchId);
    
    if (hasBranches) {
      patterns.push({
        id: crypto.randomUUID(),
        name: 'Branching Exploration',
        description: 'Explore multiple solution paths simultaneously',
        steps: [
          'Identify different approaches',
          'Explore each approach separately',
          'Compare results',
          'Choose best solution or merge insights'
        ],
        effectiveness: 0.75,
        applicableContexts: ['complex-problems', 'design', 'research'],
        usageCount: 1,
        examples: []
      });
    }
    
    return patterns;
  }
  
  /**
   * Generate insights about the current thought process
   */
  public async generateInsights(
    thoughts: ThoughtData[],
    codeContext: { files: string[]; symbols: string[] }
  ): Promise<string[]> {
    await this.loadMemories();
    
    const insights: string[] = [];
    
    // Look for patterns in the thought process
    const patterns = await this.extractPatternsFromThoughts(thoughts);
    
    if (patterns.length > 0) {
      insights.push(`Your thought process shows ${patterns.map(p => p.name).join(', ')} patterns, which are effective for ${patterns.map(p => p.applicableContexts[0] || 'problem-solving').join(', ')}.`);
    }
    
    // Look for similar past memories using semantic search if possible
    const queryText = thoughts.length > 0 ? thoughts[thoughts.length - 1].thought : undefined; // Use last thought as query
    const similarMemories = await this.queryMemories({
      type: 'insight',
      contextFiles: codeContext.files, // Keep context file filtering
      queryText: queryText, // Add semantic query
      similarityThreshold: 0.75, // Slightly higher threshold for insights
      limit: 3
    });
    
    if (similarMemories.length > 0) {
      // Include similarity score in the insight text for debugging/transparency
      // Explicitly cast to access similarityScore
      insights.push(`Based on past insights (similarity score): ${similarMemories.map(m => `${m.content.substring(0, 80)}... (${((m as any).similarityScore! * 100).toFixed(1)}%)`).join(' | ')}`);
    }
    
    // Check for reasoning effectiveness
    const effectivenessMemories = await this.queryMemories({
      type: 'effectiveness',
      minEffectiveness: 0.8,
      limit: 3
    });
    
    if (effectivenessMemories.length > 0) {
      insights.push(`Previous successful approaches: ${effectivenessMemories.map(m => m.content.substring(0, 100)).join(' | ')}`);
    }
    
    return insights;
  }
}

// Export singleton instance
export const memorySystem = new AdvancedMemorySystem();
