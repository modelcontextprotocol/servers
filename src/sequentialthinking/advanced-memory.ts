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

// Define the memory storage location
const MEMORY_DIR = path.join(os.homedir(), '.sequential-thinking', 'memory');

// Ensure memory directory exists
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
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
      if (fs.existsSync(memoriesPath)) {
        const memoriesData = fs.readFileSync(memoriesPath, 'utf8');
        const memoriesArray = JSON.parse(memoriesData) as MemoryItem[];
        memoriesArray.forEach(memory => {
          this.memories.set(memory.id, memory);
        });
      }
      
      // Load patterns
      const patternsPath = path.join(MEMORY_DIR, 'patterns.json');
      if (fs.existsSync(patternsPath)) {
        const patternsData = fs.readFileSync(patternsPath, 'utf8');
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
      fs.writeFileSync(memoriesPath, JSON.stringify(memoriesArray, null, 2));
      
      // Save patterns
      const patternsArray = Array.from(this.patterns.values());
      const patternsPath = path.join(MEMORY_DIR, 'patterns.json');
      fs.writeFileSync(patternsPath, JSON.stringify(patternsArray, null, 2));
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
        codeContext
      }
    };
    
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
   * Query memories based on criteria
   */
  public async queryMemories(query: MemoryQuery): Promise<MemoryItem[]> {
    await this.loadMemories();
    
    let results = Array.from(this.memories.values());
    
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
    
    // Filter by code context
    if (query.contextFiles && query.contextFiles.length > 0) {
      results = results.filter(memory => 
        memory.metadata.codeContext?.files.some(file => 
          query.contextFiles!.includes(file)
        )
      );
    }
    
    if (query.contextSymbols && query.contextSymbols.length > 0) {
      results = results.filter(memory => 
        memory.metadata.codeContext?.symbols.some(symbol => 
          query.contextSymbols!.includes(symbol)
        )
      );
    }
    
    // Sort by most recent first
    results.sort((a, b) => 
      new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
    );
    
    // Apply limit
    if (query.limit !== undefined) {
      results = results.slice(0, query.limit);
    }
    
    return results;
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
    
    // Look for similar past memories
    const similarMemories = await this.queryMemories({
      type: 'insight',
      contextFiles: codeContext.files,
      limit: 3
    });
    
    if (similarMemories.length > 0) {
      insights.push(`Based on past insights: ${similarMemories.map(m => m.content.substring(0, 100)).join(' | ')}`);
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
