#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CreateMessageResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
// Fixed chalk import for ESM
import chalk from 'chalk';

// Attachment interfaces for multi-modal content
interface AttachmentMetadata {
  language?: string;      // Programming language for code blocks
  format?: string;        // File format, diagram type, image format
  size?: number;          // Content size in bytes
  created?: string;       // ISO timestamp when attachment was created
  description?: string;   // Human-readable description of the attachment
  encoding?: string;      // Content encoding (base64, utf-8, etc.)
  schema?: string;        // JSON schema for validation
  width?: number;         // Image width in pixels
  height?: number;        // Image height in pixels
  complexity?: number;    // Code complexity score (0-100)
  lineCount?: number;     // Number of lines in code/text
}

interface Attachment {
  id: string;                    // Unique identifier for the attachment
  type: 'code' | 'diagram' | 'image' | 'json' | 'table' | 'file' | 'url' | 'text' | 'markdown' | 'yaml' | 'xml';
  name: string;                  // Human-readable name
  content: string | object;      // The actual content
  metadata?: AttachmentMetadata; // Additional metadata
  thoughtReferences?: number[];  // Other thoughts this attachment relates to
}

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
  // References and tagging system
  references?: number[];
  tags?: string[];
  // Confidence and evidence tracking
  confidence?: number; // 0-1 scale, where 0 = very uncertain, 1 = very confident
  evidence?: string[]; // Array of supporting evidence for this thought
  assumptions?: string[]; // Array of underlying assumptions this thought relies on
  // Multi-modal attachments
  attachments?: Attachment[]; // Array of multimedia attachments
  // Session tracking
  timestamp?: string;
  sessionId?: string;
  // Interactive editing support
  userId?: string; // User ID for collaborative environments
  editHistory?: ThoughtEdit[]; // Complete edit history
  originalContent?: string;
  lastEditTimestamp?: string;
}

// Change tracking interfaces
interface ThoughtEdit {
  editId: string;
  timestamp: string;
  changeType: 'content' | 'confidence' | 'evidence' | 'assumptions' | 'tags' | 'attachments';
  previousValue: any;
  newValue: any;
  reason?: string;
  userId?: string;
}

// Collaborative thinking interfaces
interface CollaborativeUser {
  userId: string;
  name: string;
  role?: string;
  permissions: UserPermissions;
  joinedAt: string;
  lastActive: string;
}

interface UserPermissions {
  canCreateThoughts: boolean;
  canEditOwnThoughts: boolean;
  canEditAllThoughts: boolean;
  canDeleteThoughts: boolean;
  canManageUsers: boolean;
  canExtractPatterns: boolean;
  canViewEditHistory: boolean;
}

interface CollaborativeSession {
  sessionId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
  participants: CollaborativeUser[];
  permissions: SessionPermissions;
  thoughtCount: number;
  lastActivity: string;
}

interface SessionPermissions {
  isPublic: boolean;
  allowGuestUsers: boolean;
  requireApprovalForEdits: boolean;
  allowAnonymousContributions: boolean;
}

interface ThoughtContribution {
  thoughtNumber: number;
  contributorId: string;
  contributorName: string;
  contributionType: 'created' | 'edited' | 'reviewed' | 'approved';
  timestamp: string;
  details?: string;
}

interface CollaborationActivity {
  activityId: string;
  sessionId: string;
  userId: string;
  userName: string;
  activityType: 'join' | 'leave' | 'create_thought' | 'edit_thought' | 'add_attachment' | 'extract_pattern';
  targetThoughtNumber?: number;
  timestamp: string;
  details?: string;
}

// Synthesis interfaces
interface Decision {
  thoughtNumber: number;
  decision: string;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  alternatives?: string[];
}

interface Risk {
  thoughtNumber: number;
  riskArea: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  mitigation?: string;
}

interface Assumption {
  thoughtNumber: number;
  assumption: string;
  basis: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  action: string;
  context: string;
  relatedThoughts: number[];
}

interface AlternativeApproach {
  approach: string;
  pros: string[];
  cons: string[];
  feasibility: 'high' | 'medium' | 'low';
  consideredInThoughts: number[];
}

interface SynthesisResult {
  summary: {
    totalThoughts: number;
    branches: number;
    revisions: number;
    keyInsights: string[];
    attachmentSummary?: {
      totalAttachments: number;
      types: Record<string, number>;
      evidenceBoost: number;
      thoughtsWithAttachments: number;
    };
  };
  decisions: Decision[];
  assumptions: Assumption[];
  risks: Risk[];
  actionItems: ActionItem[];
  alternativeApproaches: AlternativeApproach[];
  confidenceAssessment: {
    overallConfidence: 'high' | 'medium' | 'low';
    reasoningQuality: 'excellent' | 'good' | 'fair' | 'poor';
    completeness: 'complete' | 'mostly-complete' | 'partial' | 'incomplete';
  };
  nextSteps: string[];
  attachmentAnalysis?: {
    summary: {
      totalAttachments: number;
      types: Record<string, number>;
      evidenceBoost: number;
      thoughtsWithAttachments: number;
    };
    codeAnalysis?: {
      totalCodeBlocks: number;
      languages: Record<string, number>;
      averageComplexity: number;
      thoughtsWithCode: number;
    };
    diagramAnalysis?: {
      totalDiagrams: number;
      types: Record<string, number>;
      thoughtsWithDiagrams: number;
    };
    dataAnalysis?: {
      totalDataSets: number;
      formats: Record<string, number>;
      thoughtsWithData: number;
    };
  };
}

// Decision tree visualization interfaces
interface TreeNode {
  thoughtNumber: number;
  thought: ThoughtData;
  children: TreeNode[];
  parent: TreeNode | null;
  isDecisionPoint: boolean;
  isCriticalPath: boolean;
  depth: number;
}

interface DecisionTreeVisualization {
  ascii: string;
  json: TreeStructure;
  statistics: TreeStatistics;
}

interface TreeStructure {
  nodes: Array<{
    thoughtNumber: number;
    confidence: number | undefined;
    evidenceCount: number;
    assumptionCount: number;
    tags: string[];
    isDecisionPoint: boolean;
    isCriticalPath: boolean;
    children: number[];
    references: number[];
  }>;
  branches: number;
  depth: number;
  criticalPath: number[];
}

interface TreeStatistics {
  totalNodes: number;
  decisionPoints: number;
  averageConfidence: number | null;
  criticalPath: number[];
  depth: number;
  breadth: number;
  lowConfidenceNodes: number;
  evidenceGaps: number;
  assumptionRisks: number;
}

// Subagent interfaces
interface SubagentPrompt {
  subagentType: string;
  prompt: string;
  context: {
    problemDomain: string[];
    totalThoughts: number;
    confidenceGaps: Array<{
      thoughtNumber: number;
      confidence: number;
      issue: string;
    }>;
    evidenceNeeds: string[];
    assumptionRisks: Array<{
      assumption: string;
      dependentThoughts: number[];
      riskLevel: 'low' | 'medium' | 'high';
    }>;
    nextLogicalSteps: string[];
  };
  expectedOutput: {
    format: string;
    requirements: string[];
    thoughtCount: number;
  };
}

// Pattern learning system interfaces
interface PatternStep {
  stepType: 'analysis' | 'decomposition' | 'validation' | 'synthesis' | 'decision' | 'exploration';
  description: string;
  expectedConfidence: number;
  keyTags: string[];
  evidenceRequirements: string[];
  commonPitfalls: string[];
}

interface ReasoningPattern {
  id: string;
  name: string;
  description: string;
  domain: string[];
  approach: string;
  problemContext: {
    complexity: 'low' | 'medium' | 'high';
    type: string[];
    keywords: string[];
    characteristics: string[];
  };
  successMetrics: {
    averageConfidence: number;
    completionRate: number;
    evidenceQuality: number;
    usageCount: number;
    lastUsed: string;
  };
  thoughtSequence: PatternStep[];
  adaptationGuidance: string;
  variations: Array<{
    name: string;
    description: string;
    conditions: string[];
    modifications: string[];
  }>;
  created: string;
  updated: string;
}

interface PatternMatch {
  pattern: ReasoningPattern;
  confidence: number;
  matchReasons: string[];
  adaptationSuggestions: string[];
  applicabilityScore: number;
}

interface PatternExtractionContext {
  sessionId: string;
  totalThoughts: number;
  averageConfidence: number;
  completionStatus: 'complete' | 'partial' | 'abandoned';
  domains: string[];
  approaches: string[];
  successFactors: string[];
  challenges: string[];
}

class PatternLibrary {
  private patterns: Map<string, ReasoningPattern> = new Map();
  private patternIndex: {
    byDomain: Map<string, Set<string>>;
    byApproach: Map<string, Set<string>>;
    byKeywords: Map<string, Set<string>>;
    bySuccessRate: Array<{ id: string; score: number }>;
  };

  constructor() {
    this.patternIndex = {
      byDomain: new Map(),
      byApproach: new Map(),
      byKeywords: new Map(),
      bySuccessRate: []
    };
  }

  addPattern(pattern: ReasoningPattern): void {
    this.patterns.set(pattern.id, pattern);
    this.updateIndex(pattern);
  }

  getPattern(id: string): ReasoningPattern | undefined {
    return this.patterns.get(id);
  }

  findSimilarPatterns(context: {
    domains?: string[];
    approach?: string;
    keywords?: string[];
    complexity?: string;
    problemType?: string[];
  }): PatternMatch[] {
    const candidates = new Set<string>();
    
    // Find candidates by domain
    if (context.domains) {
      context.domains.forEach(domain => {
        const domainPatterns = this.patternIndex.byDomain.get(domain);
        if (domainPatterns) {
          domainPatterns.forEach(id => candidates.add(id));
        }
      });
    }
    
    // Find candidates by approach
    if (context.approach) {
      const approachPatterns = this.patternIndex.byApproach.get(context.approach);
      if (approachPatterns) {
        approachPatterns.forEach(id => candidates.add(id));
      }
    }
    
    // Find candidates by keywords
    if (context.keywords) {
      context.keywords.forEach(keyword => {
        const keywordPatterns = this.patternIndex.byKeywords.get(keyword.toLowerCase());
        if (keywordPatterns) {
          keywordPatterns.forEach(id => candidates.add(id));
        }
      });
    }
    
    // If no specific criteria, consider all patterns
    if (candidates.size === 0) {
      this.patterns.forEach((pattern, id) => candidates.add(id));
    }
    
    // Score and rank candidates
    const matches: PatternMatch[] = [];
    candidates.forEach(id => {
      const pattern = this.patterns.get(id);
      if (pattern) {
        const match = this.calculatePatternMatch(pattern, context);
        if (match.confidence >= 0.15) { // Only include matches above minimum threshold
          matches.push(match);
        }
      }
    });
    
    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  private calculatePatternMatch(pattern: ReasoningPattern, context: {
    domains?: string[];
    approach?: string;
    keywords?: string[];
    complexity?: string;
    problemType?: string[];
  }): PatternMatch {
    let score = 0;
    let maxScore = 0;
    const matchReasons: string[] = [];
    const adaptationSuggestions: string[] = [];
    
    // Enhanced domain matching with semantic similarity (weight: 30%)
    if (context.domains && pattern.domain.length > 0) {
      const exactMatches = context.domains.filter(d => pattern.domain.includes(d)).length;
      const semanticScore = this.calculateDomainSimilarity(context.domains, pattern.domain);
      
      // Prefer exact matches but allow some semantic similarity
      const domainScore = exactMatches > 0 ? 
        (exactMatches / Math.max(context.domains.length, pattern.domain.length)) :
        Math.max(0, semanticScore - 0.3); // Require minimum semantic similarity
        
      score += domainScore * 0.3;
      if (exactMatches > 0) {
        matchReasons.push(`Exact domain matches (${exactMatches}): ${context.domains.filter(d => pattern.domain.includes(d)).join(', ')}`);
      } else if (semanticScore > 0.3) {
        matchReasons.push(`Related domains (similarity: ${Math.round(semanticScore * 100)}%)`);
      }
    }
    maxScore += 0.3;
    
    // Enhanced approach matching with compatibility (weight: 25%)
    if (context.approach && pattern.approach) {
      const approachCompatibility = this.calculateApproachCompatibility(context.approach, pattern.approach);
      score += approachCompatibility * 0.25;
      if (approachCompatibility === 1.0) {
        matchReasons.push(`Exact approach match: ${pattern.approach}`);
      } else if (approachCompatibility > 0.5) {
        matchReasons.push(`Compatible approach: ${pattern.approach} (${Math.round(approachCompatibility * 100)}% compatible)`);
      } else if (approachCompatibility > 0) {
        adaptationSuggestions.push(`Approach mismatch: ${context.approach} vs ${pattern.approach} - significant adaptation needed`);
      }
    }
    maxScore += 0.25;
    
    // Keyword matching (weight: 20%)
    if (context.keywords && pattern.problemContext.keywords.length > 0) {
      const keywordOverlap = context.keywords.filter(k => 
        pattern.problemContext.keywords.some(pk => pk.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(pk.toLowerCase()))
      ).length;
      const keywordScore = keywordOverlap / Math.max(context.keywords.length, pattern.problemContext.keywords.length);
      score += keywordScore * 0.2;
      if (keywordOverlap > 0) {
        matchReasons.push(`${keywordOverlap} keyword matches`);
      }
    }
    maxScore += 0.2;
    
    // Success rate (weight: 15%)
    const successScore = pattern.successMetrics.averageConfidence * pattern.successMetrics.completionRate;
    score += successScore * 0.15;
    maxScore += 0.15;
    
    // Complexity matching (weight: 10%)
    if (context.complexity && pattern.problemContext.complexity) {
      const complexityScore = context.complexity === pattern.problemContext.complexity ? 1 : 0.5;
      score += complexityScore * 0.1;
    }
    maxScore += 0.1;
    
    const confidence = maxScore > 0 ? score / maxScore : 0;
    
    // Generate adaptation suggestions for acceptable matches ONLY
    if (confidence >= 0.15) {
      if (context.complexity !== pattern.problemContext.complexity) {
        adaptationSuggestions.push(`Adjust for ${context.complexity} complexity (pattern is for ${pattern.problemContext.complexity})`);
      }
      
      if (pattern.variations.length > 0) {
        adaptationSuggestions.push(`Consider variations: ${pattern.variations.map(v => v.name).join(', ')}`);
      }
      
      if (pattern.adaptationGuidance) {
        adaptationSuggestions.push(pattern.adaptationGuidance);
      }
    }
    
    return {
      pattern,
      confidence,
      matchReasons,
      adaptationSuggestions: adaptationSuggestions.filter(s => s.length > 0),
      applicabilityScore: confidence * (pattern.successMetrics.usageCount > 0 ? Math.min(Math.log(pattern.successMetrics.usageCount + 1) / 5, 1) : 0.1)
    };
  }

  private calculateDomainSimilarity(contextDomains: string[], patternDomains: string[]): number {
    // Define domain semantic relationships
    const domainGroups = {
      technical: ['technical', 'programming', 'software', 'system', 'architecture', 'development', 'debugging', 'code'],
      analytical: ['research', 'analysis', 'investigation', 'study', 'data', 'hypothesis', 'evaluation', 'assessment'],
      creative: ['creative', 'design', 'art', 'ui', 'ux', 'interface', 'user', 'experience', 'brainstorming'],
      strategic: ['strategy', 'planning', 'business', 'goals', 'objectives', 'decision', 'management'],
      problem_solving: ['problem-solving', 'troubleshooting', 'issue', 'fix', 'solution', 'debugging']
    };
    
    // Get semantic groups for each domain set
    const contextGroups = new Set<string>();
    const patternGroups = new Set<string>();
    
    contextDomains.forEach(domain => {
      Object.entries(domainGroups).forEach(([group, keywords]) => {
        if (keywords.includes(domain.toLowerCase())) {
          contextGroups.add(group);
        }
      });
    });
    
    patternDomains.forEach(domain => {
      Object.entries(domainGroups).forEach(([group, keywords]) => {
        if (keywords.includes(domain.toLowerCase())) {
          patternGroups.add(group);
        }
      });
    });
    
    // Calculate overlap
    const intersection = new Set([...contextGroups].filter(g => patternGroups.has(g)));
    const union = new Set([...contextGroups, ...patternGroups]);
    
    // High penalty for cross-domain mismatches (e.g., technical vs creative)
    const incompatiblePairs = [
      ['technical', 'creative'],
      ['technical', 'strategic'], 
      ['creative', 'analytical']
    ];
    
    const hasIncompatible = incompatiblePairs.some(([a, b]) => 
      (contextGroups.has(a) && patternGroups.has(b)) || 
      (contextGroups.has(b) && patternGroups.has(a))
    );
    
    if (hasIncompatible && intersection.size === 0) {
      return 0.1; // Very low similarity for incompatible domains
    }
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  private calculateApproachCompatibility(contextApproach: string, patternApproach: string): number {
    const approach1 = contextApproach.toLowerCase();
    const approach2 = patternApproach.toLowerCase();
    
    // Exact match
    if (approach1 === approach2) return 1.0;
    
    // Define approach compatibility matrix
    const compatibilityMatrix: Record<string, Record<string, number>> = {
      'systematic-decomposition': {
        'evidence-based': 0.8,
        'structured-analysis': 0.9,
        'step-by-step': 0.7,
        'creative-exploration': 0.3,
        'intuitive': 0.2
      },
      'evidence-based': {
        'systematic-decomposition': 0.8,
        'analytical': 0.9,
        'research-driven': 0.8,
        'creative-exploration': 0.2,
        'intuitive': 0.1
      },
      'creative-exploration': {
        'brainstorming': 0.9,
        'intuitive': 0.7,
        'open-ended': 0.8,
        'systematic-decomposition': 0.3,
        'evidence-based': 0.2
      },
      'strategic-planning': {
        'systematic-decomposition': 0.7,
        'goal-oriented': 0.8,
        'structured-analysis': 0.7,
        'creative-exploration': 0.5
      }
    };
    
    const compatibility = compatibilityMatrix[approach1]?.[approach2] || 
                         compatibilityMatrix[approach2]?.[approach1] ||
                         0.4; // Default moderate compatibility for unknown approaches
    
    return compatibility;
  }

  private updateIndex(pattern: ReasoningPattern): void {
    // Update domain index
    pattern.domain.forEach(domain => {
      if (!this.patternIndex.byDomain.has(domain)) {
        this.patternIndex.byDomain.set(domain, new Set());
      }
      this.patternIndex.byDomain.get(domain)!.add(pattern.id);
    });
    
    // Update approach index
    if (!this.patternIndex.byApproach.has(pattern.approach)) {
      this.patternIndex.byApproach.set(pattern.approach, new Set());
    }
    this.patternIndex.byApproach.get(pattern.approach)!.add(pattern.id);
    
    // Update keyword index
    pattern.problemContext.keywords.forEach(keyword => {
      const key = keyword.toLowerCase();
      if (!this.patternIndex.byKeywords.has(key)) {
        this.patternIndex.byKeywords.set(key, new Set());
      }
      this.patternIndex.byKeywords.get(key)!.add(pattern.id);
    });
    
    // Update success rate index
    const successScore = pattern.successMetrics.averageConfidence * pattern.successMetrics.completionRate;
    this.patternIndex.bySuccessRate.push({ id: pattern.id, score: successScore });
    this.patternIndex.bySuccessRate.sort((a, b) => b.score - a.score);
    
    // Keep only top 1000 patterns by success rate to manage memory
    if (this.patternIndex.bySuccessRate.length > 1000) {
      this.patternIndex.bySuccessRate = this.patternIndex.bySuccessRate.slice(0, 1000);
    }
  }

  updatePatternMetrics(patternId: string, metrics: {
    confidence?: number;
    completed?: boolean;
    evidenceQuality?: number;
  }): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;
    
    // Update usage count and last used
    pattern.successMetrics.usageCount += 1;
    pattern.successMetrics.lastUsed = new Date().toISOString();
    
    // Update metrics using exponential moving average
    const alpha = 0.1; // Learning rate
    
    if (metrics.confidence !== undefined) {
      pattern.successMetrics.averageConfidence = 
        (1 - alpha) * pattern.successMetrics.averageConfidence + alpha * metrics.confidence;
    }
    
    if (metrics.completed !== undefined) {
      const completionValue = metrics.completed ? 1 : 0;
      pattern.successMetrics.completionRate = 
        (1 - alpha) * pattern.successMetrics.completionRate + alpha * completionValue;
    }
    
    if (metrics.evidenceQuality !== undefined) {
      pattern.successMetrics.evidenceQuality = 
        (1 - alpha) * pattern.successMetrics.evidenceQuality + alpha * metrics.evidenceQuality;
    }
    
    pattern.updated = new Date().toISOString();
    
    // Update index
    this.updateIndex(pattern);
  }

  getAllPatterns(): ReasoningPattern[] {
    return Array.from(this.patterns.values()).sort((a, b) => 
      (b.successMetrics.averageConfidence * b.successMetrics.completionRate) - 
      (a.successMetrics.averageConfidence * a.successMetrics.completionRate)
    );
  }

  searchPatterns(query: {
    text?: string;
    domains?: string[];
    approaches?: string[];
    minConfidence?: number;
    minUsage?: number;
  }): ReasoningPattern[] {
    let results = Array.from(this.patterns.values());
    
    if (query.text) {
      const searchTerm = query.text.toLowerCase();
      results = results.filter(pattern => 
        pattern.name.toLowerCase().includes(searchTerm) ||
        pattern.description.toLowerCase().includes(searchTerm) ||
        pattern.approach.toLowerCase().includes(searchTerm) ||
        pattern.problemContext.keywords.some(k => k.toLowerCase().includes(searchTerm))
      );
    }
    
    if (query.domains && query.domains.length > 0) {
      results = results.filter(pattern => 
        query.domains!.some(domain => pattern.domain.includes(domain))
      );
    }
    
    if (query.approaches && query.approaches.length > 0) {
      results = results.filter(pattern => 
        query.approaches!.includes(pattern.approach)
      );
    }
    
    if (query.minConfidence !== undefined) {
      results = results.filter(pattern => 
        pattern.successMetrics.averageConfidence >= query.minConfidence!
      );
    }
    
    if (query.minUsage !== undefined) {
      results = results.filter(pattern => 
        pattern.successMetrics.usageCount >= query.minUsage!
      );
    }
    
    return results.sort((a, b) => 
      (b.successMetrics.averageConfidence * b.successMetrics.completionRate) - 
      (a.successMetrics.averageConfidence * a.successMetrics.completionRate)
    );
  }
}

class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;
  private server: Server | null = null;
  private patternLibrary: PatternLibrary = new PatternLibrary();
  private currentSessionId: string = `session-${Date.now()}`;
  private sessionStartTime: Date = new Date();
  // Collaborative features
  private collaborativeSessions: Map<string, CollaborativeSession> = new Map();
  private activeUsers: Map<string, CollaborativeUser> = new Map();
  private activityLog: CollaborationActivity[] = [];
  private currentCollaborativeSession: CollaborativeSession | null = null;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  public setServer(server: Server) {
    this.server = server;
  }
  
  // Session management methods
  public resetSession(): { content: Array<{ type: string; text: string }> } {
    const previousSessionId = this.currentSessionId;
    const previousThoughtCount = this.thoughtHistory.length;
    
    this.currentSessionId = `session-${Date.now()}`;
    this.sessionStartTime = new Date();
    this.thoughtHistory = [];
    this.branches = {};
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          previousSession: {
            id: previousSessionId,
            thoughtCount: previousThoughtCount
          },
          newSession: {
            id: this.currentSessionId,
            startTime: this.sessionStartTime.toISOString()
          },
          message: "Session reset complete. Starting fresh with thought number 1."
        }, null, 2)
      }]
    };
  }
  
  public getCurrentSessionInfo(): { content: Array<{ type: string; text: string }> } {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sessionId: this.currentSessionId,
          startTime: this.sessionStartTime.toISOString(),
          thoughtCount: this.thoughtHistory.length,
          duration: Date.now() - this.sessionStartTime.getTime()
        }, null, 2)
      }]
    };
  }

  public editThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as Record<string, unknown>;
      
      if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
        throw new Error('Invalid thoughtNumber: must be a number');
      }
      
      const thoughtNumber = data.thoughtNumber as number;
      const thoughtIndex = this.thoughtHistory.findIndex(t => t.thoughtNumber === thoughtNumber);
      
      if (thoughtIndex === -1) {
        throw new Error(`Thought ${thoughtNumber} not found`);
      }
      
      const existingThought = this.thoughtHistory[thoughtIndex];
      const editId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const editTimestamp = new Date().toISOString();
      const reason = data.reason as string || 'User edit';
      const userId = data.userId as string || 'anonymous';
      
      // Initialize edit history if not present
      if (!existingThought.editHistory) {
        existingThought.editHistory = [];
        existingThought.originalContent = existingThought.thought;
      }
      
      const edits: ThoughtEdit[] = [];
      
      // Track changes to different fields
      if (data.thought && typeof data.thought === 'string' && data.thought !== existingThought.thought) {
        edits.push({
          editId,
          timestamp: editTimestamp,
          changeType: 'content',
          previousValue: existingThought.thought,
          newValue: data.thought,
          reason,
          userId
        });
        existingThought.thought = data.thought as string;
      }
      
      if (data.confidence !== undefined && typeof data.confidence === 'number' && data.confidence !== existingThought.confidence) {
        edits.push({
          editId,
          timestamp: editTimestamp,
          changeType: 'confidence',
          previousValue: existingThought.confidence,
          newValue: data.confidence,
          reason,
          userId
        });
        existingThought.confidence = data.confidence as number;
      }
      
      if (data.evidence && Array.isArray(data.evidence)) {
        const newEvidence = data.evidence as string[];
        if (JSON.stringify(newEvidence) !== JSON.stringify(existingThought.evidence || [])) {
          edits.push({
            editId,
            timestamp: editTimestamp,
            changeType: 'evidence',
            previousValue: existingThought.evidence || [],
            newValue: newEvidence,
            reason,
            userId
          });
          existingThought.evidence = newEvidence;
        }
      }
      
      if (data.assumptions && Array.isArray(data.assumptions)) {
        const newAssumptions = data.assumptions as string[];
        if (JSON.stringify(newAssumptions) !== JSON.stringify(existingThought.assumptions || [])) {
          edits.push({
            editId,
            timestamp: editTimestamp,
            changeType: 'assumptions',
            previousValue: existingThought.assumptions || [],
            newValue: newAssumptions,
            reason,
            userId
          });
          existingThought.assumptions = newAssumptions;
        }
      }
      
      if (data.tags && Array.isArray(data.tags)) {
        const newTags = data.tags as string[];
        if (JSON.stringify(newTags) !== JSON.stringify(existingThought.tags || [])) {
          edits.push({
            editId,
            timestamp: editTimestamp,
            changeType: 'tags',
            previousValue: existingThought.tags || [],
            newValue: newTags,
            reason,
            userId
          });
          existingThought.tags = newTags;
        }
      }
      
      if (edits.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              thoughtNumber,
              status: "no_changes",
              message: "No changes detected. Thought remains unchanged.",
              currentThought: existingThought
            }, null, 2)
          }]
        };
      }
      
      // Add edits to history
      existingThought.editHistory!.push(...edits);
      existingThought.lastEditTimestamp = editTimestamp;
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber,
            status: "edited",
            message: `Thought ${thoughtNumber} successfully edited with ${edits.length} change(s)`,
            editsApplied: edits.map(edit => ({
              changeType: edit.changeType,
              previousValue: edit.previousValue,
              newValue: edit.newValue,
              reason: edit.reason
            })),
            updatedThought: existingThought,
            changesSummary: {
              totalEdits: existingThought.editHistory!.length,
              lastEditTimestamp: editTimestamp,
              originalContent: existingThought.originalContent
            }
          }, null, 2)
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Failed to edit thought: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: "Please provide thoughtNumber and at least one field to edit (thought, confidence, evidence, assumptions, or tags)"
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public getThoughtEditHistory(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as Record<string, unknown>;
      
      if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
        throw new Error('Invalid thoughtNumber: must be a number');
      }
      
      const thoughtNumber = data.thoughtNumber as number;
      const thought = this.thoughtHistory.find(t => t.thoughtNumber === thoughtNumber);
      
      if (!thought) {
        throw new Error(`Thought ${thoughtNumber} not found`);
      }
      
      const editHistory = thought.editHistory || [];
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber,
            hasEditHistory: editHistory.length > 0,
            originalContent: thought.originalContent || thought.thought,
            currentContent: thought.thought,
            totalEdits: editHistory.length,
            editHistory: editHistory.map(edit => ({
              editId: edit.editId,
              timestamp: edit.timestamp,
              changeType: edit.changeType,
              previousValue: edit.previousValue,
              newValue: edit.newValue,
              reason: edit.reason || 'No reason provided',
              userId: edit.userId || 'anonymous'
            })),
            lastEditTimestamp: thought.lastEditTimestamp
          }, null, 2)
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Failed to get edit history: ${error instanceof Error ? error.message : 'Unknown error'}`
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  // Collaborative Thinking Methods
  public createCollaborativeSession(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as Record<string, unknown>;
      
      const sessionName = data.name as string || `Collaborative Session ${Date.now()}`;
      const description = data.description as string || '';
      const createdBy = data.createdBy as string || 'anonymous';
      const isPublic = data.isPublic as boolean || false;
      const allowGuestUsers = data.allowGuestUsers as boolean || true;
      
      const sessionId = `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      
      // Create creator as first participant
      const creator: CollaborativeUser = {
        userId: createdBy,
        name: data.creatorName as string || createdBy,
        role: 'owner',
        permissions: {
          canCreateThoughts: true,
          canEditOwnThoughts: true,
          canEditAllThoughts: true,
          canDeleteThoughts: true,
          canManageUsers: true,
          canExtractPatterns: true,
          canViewEditHistory: true
        },
        joinedAt: now,
        lastActive: now
      };
      
      const session: CollaborativeSession = {
        sessionId,
        name: sessionName,
        description,
        createdBy,
        createdAt: now,
        isActive: true,
        participants: [creator],
        permissions: {
          isPublic,
          allowGuestUsers,
          requireApprovalForEdits: data.requireApprovalForEdits as boolean || false,
          allowAnonymousContributions: data.allowAnonymousContributions as boolean || true
        },
        thoughtCount: 0,
        lastActivity: now
      };
      
      this.collaborativeSessions.set(sessionId, session);
      this.activeUsers.set(createdBy, creator);
      this.currentCollaborativeSession = session;
      
      // Log activity
      this.logCollaborationActivity({
        activityId: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        userId: createdBy,
        userName: creator.name,
        activityType: 'join',
        timestamp: now,
        details: 'Created and joined collaborative session'
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId,
            status: "created",
            message: `Collaborative session '${sessionName}' created successfully`,
            session: {
              sessionId,
              name: sessionName,
              description,
              createdBy,
              isActive: true,
              participantCount: 1,
              permissions: session.permissions
            },
            creator,
            joinInstructions: {
              sessionId,
              message: "Share this sessionId with collaborators to invite them"
            }
          }, null, 2)
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Failed to create collaborative session: ${error instanceof Error ? error.message : 'Unknown error'}`
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public joinCollaborativeSession(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as Record<string, unknown>;
      
      if (!data.sessionId || typeof data.sessionId !== 'string') {
        throw new Error('Invalid sessionId: must be a string');
      }
      
      if (!data.userId || typeof data.userId !== 'string') {
        throw new Error('Invalid userId: must be a string');
      }
      
      const sessionId = data.sessionId as string;
      const userId = data.userId as string;
      const userName = data.userName as string || userId;
      const userRole = data.role as string || 'participant';
      
      const session = this.collaborativeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Collaborative session ${sessionId} not found`);
      }
      
      if (!session.isActive) {
        throw new Error(`Collaborative session ${sessionId} is not active`);
      }
      
      // Check if user already in session
      const existingParticipant = session.participants.find(p => p.userId === userId);
      if (existingParticipant) {
        existingParticipant.lastActive = new Date().toISOString();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              sessionId,
              status: "already_joined",
              message: `User ${userName} is already in session '${session.name}'`,
              session: this.getSessionSummary(session),
              userRole: existingParticipant.role
            }, null, 2)
          }]
        };
      }
      
      // Create new participant
      const participant: CollaborativeUser = {
        userId,
        name: userName,
        role: userRole,
        permissions: this.getDefaultPermissions(userRole),
        joinedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      session.participants.push(participant);
      session.lastActivity = new Date().toISOString();
      this.activeUsers.set(userId, participant);
      
      // Log activity
      this.logCollaborationActivity({
        activityId: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        userId,
        userName,
        activityType: 'join',
        timestamp: new Date().toISOString(),
        details: `Joined as ${userRole}`
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId,
            status: "joined",
            message: `User ${userName} joined session '${session.name}' as ${userRole}`,
            session: this.getSessionSummary(session),
            participant,
            collaborators: session.participants.map(p => ({
              userId: p.userId,
              name: p.name,
              role: p.role,
              joinedAt: p.joinedAt
            }))
          }, null, 2)
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Failed to join collaborative session: ${error instanceof Error ? error.message : 'Unknown error'}`
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public getCollaborativeSessionStatus(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const data = input as Record<string, unknown>;
      
      const sessionId = data.sessionId as string || this.currentCollaborativeSession?.sessionId;
      if (!sessionId) {
        throw new Error('No sessionId provided and no active collaborative session');
      }
      
      const session = this.collaborativeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Collaborative session ${sessionId} not found`);
      }
      
      // Get recent activity
      const recentActivity = this.activityLog
        .filter(a => a.sessionId === sessionId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
      
      // Get thought contributions
      const contributions: ThoughtContribution[] = [];
      this.thoughtHistory.forEach((thought, index) => {
        if (thought.timestamp && thought.sessionId === sessionId) {
          contributions.push({
            thoughtNumber: thought.thoughtNumber,
            contributorId: thought.userId || 'anonymous',
            contributorName: this.activeUsers.get(thought.userId || '')?.name || 'anonymous',
            contributionType: 'created',
            timestamp: thought.timestamp,
            details: `Created thought: "${thought.thought.substring(0, 50)}..."`
          });
          
          // Add edit contributions
          if (thought.editHistory) {
            thought.editHistory.forEach(edit => {
              contributions.push({
                thoughtNumber: thought.thoughtNumber,
                contributorId: edit.userId || 'anonymous',
                contributorName: this.activeUsers.get(edit.userId || '')?.name || 'anonymous',
                contributionType: 'edited',
                timestamp: edit.timestamp,
                details: `${edit.changeType}: ${edit.reason || 'No reason provided'}`
              });
            });
          }
        }
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            session: this.getSessionSummary(session),
            participants: session.participants,
            thoughtCount: this.thoughtHistory.filter(t => t.sessionId === sessionId).length,
            recentActivity,
            contributions: contributions.sort((a, b) => 
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            ).slice(0, 20),
            statistics: {
              totalParticipants: session.participants.length,
              activeParticipants: session.participants.filter(p => {
                const lastActive = new Date(p.lastActive).getTime();
                const now = Date.now();
                return (now - lastActive) < 3600000; // Active in last hour
              }).length,
              totalActivities: this.activityLog.filter(a => a.sessionId === sessionId).length,
              sessionDuration: Date.now() - new Date(session.createdAt).getTime()
            }
          }, null, 2)
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Failed to get session status: ${error instanceof Error ? error.message : 'Unknown error'}`
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private getDefaultPermissions(role: string): UserPermissions {
    switch (role.toLowerCase()) {
      case 'owner':
        return {
          canCreateThoughts: true,
          canEditOwnThoughts: true,
          canEditAllThoughts: true,
          canDeleteThoughts: true,
          canManageUsers: true,
          canExtractPatterns: true,
          canViewEditHistory: true
        };
      case 'moderator':
        return {
          canCreateThoughts: true,
          canEditOwnThoughts: true,
          canEditAllThoughts: true,
          canDeleteThoughts: false,
          canManageUsers: true,
          canExtractPatterns: true,
          canViewEditHistory: true
        };
      case 'contributor':
        return {
          canCreateThoughts: true,
          canEditOwnThoughts: true,
          canEditAllThoughts: false,
          canDeleteThoughts: false,
          canManageUsers: false,
          canExtractPatterns: true,
          canViewEditHistory: true
        };
      case 'viewer':
      case 'participant':
      default:
        return {
          canCreateThoughts: true,
          canEditOwnThoughts: true,
          canEditAllThoughts: false,
          canDeleteThoughts: false,
          canManageUsers: false,
          canExtractPatterns: false,
          canViewEditHistory: false
        };
    }
  }

  private getSessionSummary(session: CollaborativeSession) {
    return {
      sessionId: session.sessionId,
      name: session.name,
      description: session.description,
      createdBy: session.createdBy,
      createdAt: session.createdAt,
      isActive: session.isActive,
      participantCount: session.participants.length,
      thoughtCount: session.thoughtCount,
      lastActivity: session.lastActivity,
      permissions: session.permissions
    };
  }

  private logCollaborationActivity(activity: CollaborationActivity): void {
    this.activityLog.push(activity);
    
    // Keep only last 1000 activities to prevent memory issues
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-1000);
    }
    
    // Update session last activity
    const session = this.collaborativeSessions.get(activity.sessionId);
    if (session) {
      session.lastActivity = activity.timestamp;
    }
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    // Validate references array if provided
    let references: number[] | undefined;
    if (data.references !== undefined) {
      if (!Array.isArray(data.references)) {
        throw new Error('Invalid references: must be an array of numbers');
      }
      references = data.references.filter(ref => typeof ref === 'number' && ref > 0);
    }

    // Validate tags array if provided
    let tags: string[] | undefined;
    if (data.tags !== undefined) {
      if (!Array.isArray(data.tags)) {
        throw new Error('Invalid tags: must be an array of strings');
      }
      tags = data.tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0)
        .map(tag => tag.trim().toLowerCase());
    }

    // Validate confidence if provided
    if (data.confidence !== undefined) {
      if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
        throw new Error('Invalid confidence: must be a number between 0 and 1');
      }
    }

    // Validate evidence if provided
    if (data.evidence !== undefined) {
      if (!Array.isArray(data.evidence) || !data.evidence.every(item => typeof item === 'string')) {
        throw new Error('Invalid evidence: must be an array of strings');
      }
    }

    // Validate assumptions if provided
    if (data.assumptions !== undefined) {
      if (!Array.isArray(data.assumptions) || !data.assumptions.every(item => typeof item === 'string')) {
        throw new Error('Invalid assumptions: must be an array of strings');
      }
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
      references,
      tags,
      confidence: data.confidence as number | undefined,
      evidence: data.evidence as string[] | undefined,
      assumptions: data.assumptions as string[] | undefined,
    };
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId, references, tags, confidence, evidence, assumptions } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    // Add confidence indicator
    let confidenceIndicator = '';
    if (confidence !== undefined) {
      const confidencePercent = Math.round(confidence * 100);
      const confidenceColor = confidence >= 0.7 ? chalk.green : confidence >= 0.5 ? chalk.yellow : chalk.red;
      const confidenceEmoji = confidence >= 0.7 ? '🟢' : confidence >= 0.5 ? '🟡' : '🔴';
      confidenceIndicator = ` ${confidenceEmoji} ${confidenceColor(`${confidencePercent}%`)}`;
    }

    // Add references and tags information
    let metaInfo = '';
    if (references && references.length > 0) {
      metaInfo += ` | 🔗 References: ${references.join(', ')}`;
    }
    if (tags && tags.length > 0) {
      metaInfo += ` | 🏷️ Tags: ${tags.join(', ')}`;
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}${confidenceIndicator}${metaInfo}`;
    
    // Calculate width needed for content
    let maxWidth = Math.max(header.length, thought.length);
    
    // Add evidence section if present
    let evidenceSection = '';
    if (evidence && evidence.length > 0) {
      evidenceSection = `\n│ ${chalk.cyan('📋 Evidence:')} │\n`;
      evidence.forEach((item, index) => {
        const evidenceText = `  • ${item}`;
        maxWidth = Math.max(maxWidth, evidenceText.length);
        evidenceSection += `│ ${evidenceText.padEnd(maxWidth)} │\n`;
      });
    }

    // Add assumptions section if present
    let assumptionsSection = '';
    if (assumptions && assumptions.length > 0) {
      assumptionsSection = `\n│ ${chalk.magenta('🔮 Assumes:')} │\n`;
      assumptions.forEach((item, index) => {
        const assumptionText = `  • ${item}`;
        maxWidth = Math.max(maxWidth, assumptionText.length);
        assumptionsSection += `│ ${assumptionText.padEnd(maxWidth)} │\n`;
      });
    }

    const border = '─'.repeat(maxWidth + 4);
    const thoughtPadded = thought.padEnd(maxWidth);

    return `
┌${border}┐
│ ${header.padEnd(maxWidth)} │
├${border}┤
│ ${thoughtPadded} │${evidenceSection}${assumptionsSection}
└${border}┘`;
  }

  public getThought(thoughtNumber: number): ThoughtData | null {
    return this.thoughtHistory.find(thought => thought.thoughtNumber === thoughtNumber) || null;
  }

  public searchThoughts(query: string, tags?: string[]): ThoughtData[] {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedTags = tags?.map(tag => tag.toLowerCase().trim());

    return this.thoughtHistory.filter(thought => {
      // Check if thought content matches query
      const contentMatch = normalizedQuery === '' || 
        thought.thought.toLowerCase().includes(normalizedQuery);

      // Check if thought has all required tags
      const tagMatch = !normalizedTags || normalizedTags.length === 0 ||
        (thought.tags && normalizedTags.every(tag => thought.tags!.includes(tag)));

      return contentMatch && tagMatch;
    });
  }

  public getRelatedThoughts(thoughtNumber: number): ThoughtData[] {
    const baseThought = this.getThought(thoughtNumber);
    if (!baseThought) {
      return [];
    }

    const related: ThoughtData[] = [];

    // Find thoughts that reference this one
    const referencingThoughts = this.thoughtHistory.filter(thought => 
      thought.references && thought.references.includes(thoughtNumber)
    );

    // Find thoughts that this one references
    const referencedThoughts = baseThought.references ? 
      baseThought.references.map(ref => this.getThought(ref)).filter(Boolean) as ThoughtData[] : [];

    // Find thoughts in the same branch
    const branchThoughts = baseThought.branchId ? 
      this.thoughtHistory.filter(thought => thought.branchId === baseThought.branchId && thought.thoughtNumber !== thoughtNumber) : [];

    // Find thoughts with similar tags
    const similarTaggedThoughts = baseThought.tags && baseThought.tags.length > 0 ?
      this.thoughtHistory.filter(thought => 
        thought.thoughtNumber !== thoughtNumber &&
        thought.tags && 
        thought.tags.some(tag => baseThought.tags!.includes(tag))
      ) : [];

    // Combine and deduplicate
    const allRelated = [...referencingThoughts, ...referencedThoughts, ...branchThoughts, ...similarTaggedThoughts];
    const uniqueRelated = allRelated.filter((thought, index, arr) => 
      arr.findIndex(t => t.thoughtNumber === thought.thoughtNumber) === index
    );

    return uniqueRelated;
  }

  /**
   * Identify thoughts with low confidence (below 0.5 by default)
   */
  private getLowConfidenceThoughts(threshold: number = 0.5): ThoughtData[] {
    return this.thoughtHistory.filter(thought => 
      thought.confidence !== undefined && thought.confidence < threshold
    );
  }

  /**
   * Identify assumption chains - thoughts that build on previous assumptions
   */
  private getAssumptionChains(): Array<{
    assumption: string;
    dependentThoughts: number[];
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    const assumptionMap = new Map<string, number[]>();
    
    // Collect all assumptions and which thoughts reference them
    this.thoughtHistory.forEach(thought => {
      if (thought.assumptions) {
        thought.assumptions.forEach(assumption => {
          const normalizedAssumption = assumption.toLowerCase().trim();
          if (!assumptionMap.has(normalizedAssumption)) {
            assumptionMap.set(normalizedAssumption, []);
          }
          assumptionMap.get(normalizedAssumption)!.push(thought.thoughtNumber);
        });
      }
    });

    return Array.from(assumptionMap.entries()).map(([assumption, thoughtNumbers]) => ({
      assumption,
      dependentThoughts: thoughtNumbers,
      riskLevel: thoughtNumbers.length > 3 ? 'high' : thoughtNumbers.length > 1 ? 'medium' : 'low'
    }));
  }

  /**
   * Analyze the overall reasoning quality
   */
  private analyzeReasoningQuality(): {
    averageConfidence: number | null;
    lowConfidenceCount: number;
    highRiskAssumptions: number;
    evidenceCoverage: number;
    overallQuality: 'weak' | 'moderate' | 'strong';
  } {
    const thoughtsWithConfidence = this.thoughtHistory.filter(t => t.confidence !== undefined);
    const averageConfidence = thoughtsWithConfidence.length > 0 
      ? thoughtsWithConfidence.reduce((sum, t) => sum + (t.confidence || 0), 0) / thoughtsWithConfidence.length
      : null;
    
    const lowConfidenceCount = this.getLowConfidenceThoughts().length;
    const assumptionChains = this.getAssumptionChains();
    const highRiskAssumptions = assumptionChains.filter(chain => chain.riskLevel === 'high').length;
    
    const thoughtsWithEvidence = this.thoughtHistory.filter(t => t.evidence && t.evidence.length > 0);
    const evidenceCoverage = this.thoughtHistory.length > 0 
      ? thoughtsWithEvidence.length / this.thoughtHistory.length 
      : 0;

    let overallQuality: 'weak' | 'moderate' | 'strong' = 'moderate';
    
    if (averageConfidence && averageConfidence < 0.4) {
      overallQuality = 'weak';
    } else if (highRiskAssumptions > 2 || evidenceCoverage < 0.3) {
      overallQuality = 'weak';
    } else if (averageConfidence && averageConfidence > 0.7 && evidenceCoverage > 0.6) {
      overallQuality = 'strong';
    }

    return {
      averageConfidence,
      lowConfidenceCount,
      highRiskAssumptions,
      evidenceCoverage,
      overallQuality
    };
  }

  /**
   * Auto-thinking methods for autonomous thought generation
   */
  
  private generateSubagentPrompt(): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const contextAnalysis = this.analyzeContextForSubagent();
      const subagentRecommendation = this.recommendSubagentType(contextAnalysis);
      const structuredPrompt = this.buildSubagentPrompt(subagentRecommendation, contextAnalysis);
      
      const response: SubagentPrompt = {
        subagentType: subagentRecommendation,
        prompt: structuredPrompt,
        context: {
          problemDomain: contextAnalysis.domains,
          totalThoughts: this.thoughtHistory.length,
          confidenceGaps: contextAnalysis.confidenceGaps,
          evidenceNeeds: contextAnalysis.evidenceNeeds,
          assumptionRisks: contextAnalysis.assumptionRisks,
          nextLogicalSteps: contextAnalysis.nextSteps
        },
        expectedOutput: {
          format: "Sequential thoughts in ThoughtData format",
          requirements: [
            "Each thought must have confidence, tags, evidence, and assumptions",
            "Reference previous thoughts where relevant",
            "Address identified confidence gaps and evidence needs",
            "Build logically on existing analysis",
            "Mark final thought with nextThoughtNeeded: false if reasoning is complete"
          ],
          thoughtCount: Math.min(contextAnalysis.recommendedThoughtCount, 5)
        }
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
            mode: 'subagent'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private analyzeContextForSubagent(): {
    domains: string[];
    confidenceGaps: Array<{
      thoughtNumber: number;
      confidence: number;
      issue: string;
    }>;
    evidenceNeeds: string[];
    assumptionRisks: Array<{
      assumption: string;
      dependentThoughts: number[];
      riskLevel: 'low' | 'medium' | 'high';
    }>;
    nextSteps: string[];
    recommendedThoughtCount: number;
    complexity: 'low' | 'medium' | 'high';
  } {
    // Analyze problem domains from tags
    const allTags = this.thoughtHistory.flatMap(t => t.tags || []);
    const tagCounts = allTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const domains = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tag]) => tag);

    // Identify confidence gaps
    const confidenceGaps = this.thoughtHistory
      .filter(t => t.confidence !== undefined && t.confidence < 0.6)
      .map(t => ({
        thoughtNumber: t.thoughtNumber,
        confidence: t.confidence || 0,
        issue: this.diagnoseConfidenceIssue(t)
      }));

    // Identify evidence needs
    const evidenceNeeds = this.identifyEvidenceNeeds();
    
    // Get assumption risks
    const assumptionChains = this.getAssumptionChains();
    const assumptionRisks = assumptionChains.filter(chain => chain.riskLevel !== 'low');
    
    // Determine next logical steps
    const nextSteps = this.identifyNextLogicalSteps();
    
    // Assess complexity
    const complexity = this.assessReasoningComplexity();
    
    // Recommend thought count based on gaps and complexity
    const baseCount = 2;
    const gapBonus = Math.min(confidenceGaps.length, 2);
    const complexityBonus = complexity === 'high' ? 2 : complexity === 'medium' ? 1 : 0;
    const recommendedThoughtCount = baseCount + gapBonus + complexityBonus;
    
    return {
      domains,
      confidenceGaps,
      evidenceNeeds,
      assumptionRisks,
      nextSteps,
      recommendedThoughtCount,
      complexity
    };
  }

  private recommendSubagentType(context: ReturnType<typeof this.analyzeContextForSubagent>): string {
    const { domains, confidenceGaps, complexity } = context;
    
    // Determine subagent based on problem domains and needs
    if (domains.includes('code') || domains.includes('technical') || domains.includes('architecture')) {
      return 'technical-analyst';
    }
    
    if (domains.includes('research') || domains.includes('analysis') || domains.includes('investigation')) {
      return 'research-specialist';
    }
    
    if (domains.includes('risk') || domains.includes('security') || domains.includes('validation')) {
      return 'risk-assessor';
    }
    
    if (domains.includes('planning') || domains.includes('strategy') || domains.includes('design')) {
      return 'strategic-planner';
    }
    
    if (domains.includes('review') || domains.includes('evaluation') || domains.includes('quality')) {
      return 'quality-reviewer';
    }
    
    if (confidenceGaps.length > 3 || complexity === 'high') {
      return 'deep-reasoner';
    }
    
    // Default to general purpose
    return 'general-reasoner';
  }

  private buildSubagentPrompt(subagentType: string, context: ReturnType<typeof this.analyzeContextForSubagent>): string {
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    const thoughtSummary = this.generateThoughtsSummary();
    
    let roleDescription = '';
    let specialInstructions = '';
    
    switch (subagentType) {
      case 'technical-analyst':
        roleDescription = 'You are a technical analysis specialist with deep expertise in architecture, code quality, and technical problem-solving.';
        specialInstructions = 'Focus on technical feasibility, implementation details, architecture patterns, and code quality considerations.';
        break;
      case 'research-specialist':
        roleDescription = 'You are a research specialist skilled in investigation, evidence gathering, and analytical reasoning.';
        specialInstructions = 'Prioritize evidence collection, fact verification, source evaluation, and comprehensive analysis.';
        break;
      case 'risk-assessor':
        roleDescription = 'You are a risk assessment specialist focused on identifying, analyzing, and mitigating potential issues.';
        specialInstructions = 'Identify failure points, assess probability and impact, suggest mitigation strategies, and validate assumptions.';
        break;
      case 'strategic-planner':
        roleDescription = 'You are a strategic planning specialist skilled in long-term thinking, goal alignment, and systematic approach design.';
        specialInstructions = 'Focus on strategic alignment, long-term implications, systematic approaches, and goal optimization.';
        break;
      case 'quality-reviewer':
        roleDescription = 'You are a quality review specialist focused on thoroughness, accuracy, and process improvement.';
        specialInstructions = 'Review for completeness, accuracy, logical consistency, and identify areas needing improvement.';
        break;
      case 'deep-reasoner':
        roleDescription = 'You are a deep reasoning specialist capable of handling complex, multi-layered problems requiring sophisticated analysis.';
        specialInstructions = 'Apply advanced reasoning techniques, explore multiple perspectives, and strengthen weak reasoning chains.';
        break;
      default:
        roleDescription = 'You are a general reasoning specialist capable of systematic problem-solving and analysis.';
        specialInstructions = 'Apply clear logical reasoning, maintain systematic approach, and address identified gaps.';
    }

    const prompt = `${roleDescription}

## Current Thinking Context

**Problem Domains:** ${context.domains.join(', ') || 'General'}

**Existing Analysis Summary:**
${thoughtSummary}

**Current Status:**
- Total thoughts analyzed: ${this.thoughtHistory.length}
- Last thought (#${lastThought.thoughtNumber}): "${lastThought.thought.substring(0, 200)}${lastThought.thought.length > 200 ? '...' : ''}"
- Overall reasoning complexity: ${context.complexity}

## Critical Issues to Address

**Confidence Gaps:** ${context.confidenceGaps.length} identified
${context.confidenceGaps.map(gap => 
  `- Thought #${gap.thoughtNumber} (${Math.round(gap.confidence * 100)}% confidence): ${gap.issue}`
).join('\n')}

**Evidence Needs:**
${context.evidenceNeeds.map(need => `- ${need}`).join('\n')}

**Assumption Risks:**
${context.assumptionRisks.map(risk => 
  `- ${risk.assumption} (${risk.riskLevel} risk, affects thoughts: ${risk.dependentThoughts.join(', ')})`
).join('\n')}

**Suggested Next Steps:**
${context.nextSteps.map(step => `- ${step}`).join('\n')}

## Your Task

${specialInstructions}

Generate ${context.recommendedThoughtCount} sequential reasoning steps that:

1. **Address identified gaps:** Strengthen low-confidence areas with evidence and validation
2. **Build logically:** Reference and build upon existing thoughts using the references array
3. **Provide enhanced metadata:** Include confidence levels, supporting evidence, assumptions, and relevant tags
4. **Maintain focus:** Stay aligned with the problem domains and current analysis direction
5. **Drive toward resolution:** Move the reasoning toward actionable conclusions or next steps

## Output Format

Return a JSON array of ThoughtData objects with this exact structure:

\`\`\`json
[
  {
    "thought": "Your reasoning step here",
    "thoughtNumber": ${this.thoughtHistory.length + 1},
    "totalThoughts": ${Math.max(this.thoughtHistory.length + context.recommendedThoughtCount, this.thoughtHistory[0]?.totalThoughts || this.thoughtHistory.length + context.recommendedThoughtCount)},
    "nextThoughtNeeded": true/false,
    "confidence": 0.0-1.0,
    "tags": ["relevant", "tags"],
    "evidence": ["supporting", "evidence"],
    "assumptions": ["key", "assumptions"],
    "references": [previous_thought_numbers]
  }
]
\`\`\`

Begin your enhanced reasoning analysis now.`;

    return prompt;
  }

  private diagnoseConfidenceIssue(thought: ThoughtData): string {
    const thoughtText = thought.thought.toLowerCase();
    
    if (!thought.evidence || thought.evidence.length === 0) {
      return 'lacks supporting evidence';
    }
    if (thoughtText.includes('unsure') || thoughtText.includes('uncertain')) {
      return 'expresses uncertainty';
    }
    if (!thought.assumptions || thought.assumptions.length > 3) {
      return 'relies on many untested assumptions';
    }
    if (thoughtText.includes('might') || thoughtText.includes('perhaps') || thoughtText.includes('maybe')) {
      return 'uses tentative language indicating uncertainty';
    }
    
    return 'needs validation or stronger reasoning';
  }

  private identifyEvidenceNeeds(): string[] {
    const needs: string[] = [];
    
    // Look for thoughts that mention needing evidence
    const evidenceThoughts = this.thoughtHistory.filter(t => 
      t.thought.toLowerCase().includes('evidence') || 
      t.thought.toLowerCase().includes('validate') ||
      t.thought.toLowerCase().includes('verify')
    );
    
    if (evidenceThoughts.length > 0) {
      needs.push('Validation of claims made in previous thoughts');
    }
    
    // Look for assumptions that need supporting evidence
    const assumptionCount = this.thoughtHistory.reduce((sum, t) => sum + (t.assumptions?.length || 0), 0);
    if (assumptionCount > 5) {
      needs.push('Evidence to support or refute key assumptions');
    }
    
    // Look for low-confidence thoughts that need evidence
    const lowConfidenceCount = this.getLowConfidenceThoughts().length;
    if (lowConfidenceCount > 2) {
      needs.push('Strengthen low-confidence reasoning with additional support');
    }
    
    if (needs.length === 0) {
      needs.push('Comprehensive validation of current analysis');
    }
    
    return needs;
  }

  private identifyNextLogicalSteps(): string[] {
    const steps: string[] = [];
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    
    if (lastThought?.nextThoughtNeeded) {
      steps.push('Continue the reasoning process as indicated by the last thought');
    }
    
    const lowConfThoughts = this.getLowConfidenceThoughts();
    if (lowConfThoughts.length > 0) {
      steps.push('Address and strengthen low-confidence areas');
    }
    
    const assumptionChains = this.getAssumptionChains().filter(chain => chain.riskLevel === 'high');
    if (assumptionChains.length > 0) {
      steps.push('Validate high-risk assumptions that could affect conclusions');
    }
    
    // Look for decision points that need resolution
    const decisionThoughts = this.thoughtHistory.filter(t => 
      t.thought.toLowerCase().includes('decide') || 
      t.thought.toLowerCase().includes('choose') ||
      t.thought.toLowerCase().includes('option')
    );
    
    if (decisionThoughts.length > 0 && !this.hasReachedConclusion()) {
      steps.push('Resolve pending decisions and choose optimal approach');
    }
    
    if (!this.hasReachedConclusion()) {
      steps.push('Synthesize findings and move toward actionable conclusions');
    }
    
    if (steps.length === 0) {
      steps.push('Deepen analysis and explore additional perspectives');
    }
    
    return steps;
  }

  private assessReasoningComplexity(): 'low' | 'medium' | 'high' {
    const factors = {
      thoughtCount: this.thoughtHistory.length,
      branchCount: Object.keys(this.branches).length,
      revisionCount: this.thoughtHistory.filter(t => t.isRevision).length,
      assumptionCount: this.thoughtHistory.reduce((sum, t) => sum + (t.assumptions?.length || 0), 0),
      lowConfidenceCount: this.getLowConfidenceThoughts().length,
      domainCount: new Set(this.thoughtHistory.flatMap(t => t.tags || [])).size
    };
    
    let complexityScore = 0;
    
    if (factors.thoughtCount > 8) complexityScore += 2;
    else if (factors.thoughtCount > 4) complexityScore += 1;
    
    if (factors.branchCount > 2) complexityScore += 2;
    else if (factors.branchCount > 0) complexityScore += 1;
    
    if (factors.revisionCount > 2) complexityScore += 1;
    if (factors.assumptionCount > 10) complexityScore += 1;
    if (factors.lowConfidenceCount > 3) complexityScore += 1;
    if (factors.domainCount > 5) complexityScore += 1;
    
    if (complexityScore >= 6) return 'high';
    if (complexityScore >= 3) return 'medium';
    return 'low';
  }

  private generateThoughtsSummary(): string {
    if (this.thoughtHistory.length === 0) return 'No thoughts yet.';
    
    let summary = this.thoughtHistory.slice(0, 3).map((thought, index) => {
      const confidence = thought.confidence ? ` (${Math.round(thought.confidence * 100)}% confident)` : '';
      const tags = thought.tags ? ` [${thought.tags.join(', ')}]` : '';
      return `${index + 1}. ${thought.thought.substring(0, 150)}${thought.thought.length > 150 ? '...' : ''}${confidence}${tags}`;
    }).join('\n');
    
    if (this.thoughtHistory.length > 3) {
      summary += `\n... (${this.thoughtHistory.length - 3} more thoughts)`;
    }
    
    return summary;
  }

  private hasReachedConclusion(): boolean {
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    if (!lastThought) return false;
    
    const conclusionPatterns = [
      /\b(therefore|thus|in conclusion|finally|ultimately|result|answer|solution)\b/i,
      /\b(complete|finished|done|resolved|decided)\b/i
    ];
    
    return conclusionPatterns.some(pattern => pattern.test(lastThought.thought)) && !lastThought.nextThoughtNeeded;
  }
  
  private async requestSampling(prompt: string, maxTokens: number = 500): Promise<string> {
    if (!this.server) {
      throw new Error("Server not initialized for sampling");
    }

    // Check if client supports sampling
    const clientCapabilities = this.server.getClientCapabilities();
    if (!clientCapabilities?.sampling) {
      throw new Error("Client does not support MCP sampling. Auto-thinking requires an MCP client with sampling capability.");
    }

    const params = {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: prompt,
          },
        },
      ],
      maxTokens,
      modelPreferences: {
        intelligencePriority: 0.8, // Prefer higher intelligence models for reasoning
      },
    };

    try {
      const result = await this.server.createMessage(params);
      return (result as any).content?.text || "No response generated";
    } catch (error) {
      throw new Error(`Sampling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateContextPrompt(): string {
    const thoughtCount = this.thoughtHistory.length;
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    
    // Extract current problem domains from tags
    const allTags = this.thoughtHistory.flatMap(t => t.tags || []);
    const tagCounts = allTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const dominantTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([tag]) => tag);

    // Identify areas needing attention
    const lowConfidenceThoughts = this.getLowConfidenceThoughts();
    const assumptionChains = this.getAssumptionChains().filter(chain => chain.riskLevel === 'high');
    
    let contextSummary = `Current thinking session context:
- Total thoughts so far: ${thoughtCount}
- Problem domains: ${dominantTags.length > 0 ? dominantTags.join(', ') : 'general'}`;

    if (lastThought) {
      contextSummary += `
- Last thought (#${lastThought.thoughtNumber}): "${lastThought.thought.substring(0, 150)}${lastThought.thought.length > 150 ? '...' : ''}"`;
      if (lastThought.confidence !== undefined) {
        contextSummary += `
- Last thought confidence: ${Math.round(lastThought.confidence * 100)}%`;
      }
    }

    if (lowConfidenceThoughts.length > 0) {
      contextSummary += `
- ${lowConfidenceThoughts.length} low-confidence thoughts need strengthening`;
    }

    if (assumptionChains.length > 0) {
      contextSummary += `
- ${assumptionChains.length} high-risk assumption chains identified`;
    }

    return contextSummary;
  }

  private generateNextStepPrompt(): string {
    const contextPrompt = this.generateContextPrompt();
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    
    let nextStepPrompt = `${contextPrompt}

Based on this thinking session, generate the next logical thought step. Your response should be a single coherent thought that advances the reasoning.

Consider:
- What logical next step would strengthen the analysis?
- Are there gaps in reasoning that need addressing?
- Do any low-confidence areas need more evidence?
- Are there unstated assumptions that should be explored?
- What would move us closer to a solution or conclusion?

Respond with just the thought content - I will handle the metadata.`;

    if (lastThought?.nextThoughtNeeded) {
      nextStepPrompt += `\n\nThe previous thought indicated more thinking was needed. Build on this direction.`;
    }

    return nextStepPrompt;
  }

  private async autoEnhanceThought(rawThought: string, thoughtNumber: number): Promise<Partial<ThoughtData>> {
    const enhancementPrompt = `Analyze this reasoning step and provide metadata:

Thought: "${rawThought}"

Provide a JSON response with:
{
  "confidence": 0.0-1.0 (how certain/supported is this reasoning?),
  "tags": ["tag1", "tag2"] (2-4 relevant categorization tags),
  "evidence": ["evidence1", "evidence2"] (supporting evidence mentioned or implied),
  "assumptions": ["assumption1"] (underlying assumptions),
  "references": [1, 2] (which previous thought numbers does this build on, if any?)
}

Base confidence on:
- Certainty of language used
- Quality of evidence provided
- Logical soundness
- Specificity vs vagueness

Use tags like: analysis, problem-solving, planning, risk-assessment, decision, hypothesis, evaluation, research, etc.`;

    try {
      const response = await this.requestSampling(enhancementPrompt, 300);
      const enhancementData = JSON.parse(response);
      
      // Validate and clean the enhancement data
      const enhancement: Partial<ThoughtData> = {};
      
      if (typeof enhancementData.confidence === 'number' && 
          enhancementData.confidence >= 0 && enhancementData.confidence <= 1) {
        enhancement.confidence = enhancementData.confidence;
      }
      
      if (Array.isArray(enhancementData.tags)) {
        enhancement.tags = enhancementData.tags
          .filter((tag: any) => typeof tag === 'string')
          .map((tag: string) => tag.toLowerCase().trim())
          .slice(0, 4);
      }
      
      if (Array.isArray(enhancementData.evidence)) {
        enhancement.evidence = enhancementData.evidence
          .filter((item: any) => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 5);
      }
      
      if (Array.isArray(enhancementData.assumptions)) {
        enhancement.assumptions = enhancementData.assumptions
          .filter((item: any) => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 3);
      }
      
      if (Array.isArray(enhancementData.references)) {
        enhancement.references = enhancementData.references
          .filter((ref: any) => typeof ref === 'number' && ref > 0 && ref < thoughtNumber)
          .slice(0, 3);
      }
      
      return enhancement;
    } catch (error) {
      // If enhancement fails, provide basic defaults
      return {
        confidence: 0.5,
        tags: ['auto-generated'],
        evidence: [],
        assumptions: [],
        references: []
      };
    }
  }

  public async autoThink(maxIterations: number = 3, useSubagent: boolean = false): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    if (this.thoughtHistory.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "No existing thoughts to build upon. Start with manual thoughts first.",
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }

    // If subagent mode is enabled, return structured prompts instead of generating thoughts
    if (useSubagent) {
      return this.generateSubagentPrompt();
    }

    // Check if MCP sampling is available
    const hasSamplingSupport = this.server && this.server.getClientCapabilities()?.sampling;
    
    if (!hasSamplingSupport) {
      // Use fallback rule-based auto-thinking
      return this.autoThinkFallback(maxIterations);
    }

    const results = [];
    let iteration = 0;

    try {
      while (iteration < maxIterations) {
        iteration++;
        
        // Generate next thought
        const nextStepPrompt = this.generateNextStepPrompt();
        const rawThought = await this.requestSampling(nextStepPrompt, 400);
        
        if (!rawThought || rawThought.trim().length === 0) {
          break;
        }
        
        // Determine thought number and total
        const thoughtNumber = this.thoughtHistory.length + 1;
        const totalThoughts = Math.max(thoughtNumber + 1, this.thoughtHistory[0]?.totalThoughts || thoughtNumber + 1);
        
        // Auto-enhance the thought
        const enhancement = await this.autoEnhanceThought(rawThought, thoughtNumber);
        
        // Determine if more thinking is needed based on the content and current state
        const needsMoreThinking = this.assessNeedsMoreThinking(rawThought, iteration, maxIterations);
        
        // Create the complete thought data
        const thoughtData: ThoughtData = {
          thought: rawThought.trim(),
          thoughtNumber,
          totalThoughts,
          nextThoughtNeeded: needsMoreThinking,
          ...enhancement
        };
        
        // Process the thought
        const result = this.processThought(thoughtData);
        results.push({
          iteration,
          thoughtNumber,
          result: JSON.parse(result.content[0].text)
        });
        
        // Check if we should continue
        if (!needsMoreThinking) {
          break;
        }
        
        // Small delay to prevent overwhelming the sampling
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: 'completed',
            iterations: iteration,
            autoGeneratedThoughts: results.length,
            thoughtsGenerated: results,
            message: `Generated ${results.length} autonomous thoughts in ${iteration} iterations`,
            nextSteps: this.thoughtHistory.length > 0 ? this.generateNextSteps() : []
          }, null, 2)
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
            completedIterations: results.length,
            partialResults: results
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  /**
   * Fallback auto-thinking implementation when MCP sampling is not available
   */
  private async autoThinkFallback(maxIterations: number = 3): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const results = [];
    let iteration = 0;

    // Rule-based thought generation patterns
    const followUpPatterns = [
      "Let me analyze the assumptions I've made so far and check if they're valid.",
      "I should consider alternative approaches to this problem.",
      "What are the potential risks or failure points in my current reasoning?",
      "Let me break down the problem into smaller, more manageable components.",
      "I need to evaluate the evidence supporting my conclusions.",
      "What questions remain unanswered from my analysis so far?",
      "Let me consider the long-term implications of this approach.",
      "Are there any stakeholders or perspectives I haven't considered?",
      "What would be the next logical step to validate this reasoning?",
      "Let me synthesize the key insights from my thinking process."
    ];

    try {
      while (iteration < maxIterations) {
        iteration++;
        
        // Generate context-aware follow-up thought
        const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
        const thoughtNumber = this.thoughtHistory.length + 1;
        const totalThoughts = Math.max(thoughtNumber + 1, this.thoughtHistory[0]?.totalThoughts || thoughtNumber + 1);
        
        // Select appropriate follow-up based on current context
        let rawThought: string;
        
        if (lastThought?.needsMoreThoughts) {
          rawThought = "I need to address the unresolved issues from my previous thoughts and provide more detailed analysis.";
        } else if (this.getLowConfidenceThoughts().length > 0) {
          rawThought = "I should strengthen my low-confidence reasoning by gathering more evidence and validating assumptions.";
        } else if (iteration === 1) {
          rawThought = followUpPatterns[0]; // Start with assumption analysis
        } else if (iteration === maxIterations) {
          rawThought = followUpPatterns[followUpPatterns.length - 1]; // End with synthesis
        } else {
          // Select based on what we haven't covered yet
          const selectedPattern = followUpPatterns[Math.min(iteration, followUpPatterns.length - 1)];
          rawThought = selectedPattern;
        }
        
        // Create basic enhancement (simplified version without LLM sampling)
        const enhancement: Partial<ThoughtData> = {
          confidence: 0.6, // Medium confidence for rule-based thoughts
          tags: this.generateContextualTags(rawThought),
          evidence: this.extractImpliedEvidence(rawThought),
          assumptions: this.extractImpliedAssumptions(rawThought),
          references: this.findRelevantReferences(rawThought, thoughtNumber)
        };
        
        // Determine if more thinking is needed
        const needsMoreThinking = iteration < maxIterations && !rawThought.includes('synthesize');
        
        // Create the complete thought data
        const thoughtData: ThoughtData = {
          thought: rawThought.trim(),
          thoughtNumber,
          totalThoughts,
          nextThoughtNeeded: needsMoreThinking,
          ...enhancement
        };
        
        // Process the thought
        const result = this.processThought(thoughtData);
        results.push({
          iteration,
          thoughtNumber,
          result: JSON.parse(result.content[0].text)
        });
        
        // Check if we should continue
        if (!needsMoreThinking) {
          break;
        }
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: 'completed',
            method: 'fallback-rule-based',
            iterations: iteration,
            autoGeneratedThoughts: results.length,
            thoughtsGenerated: results,
            message: `Generated ${results.length} rule-based autonomous thoughts in ${iteration} iterations (MCP sampling not available)`,
            nextSteps: this.thoughtHistory.length > 0 ? this.generateNextSteps() : []
          }, null, 2)
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
            method: 'fallback-rule-based',
            completedIterations: results.length,
            partialResults: results
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  /**
   * Generate contextual tags based on thought content (simplified heuristic approach)
   */
  private generateContextualTags(thought: string): string[] {
    const tags: string[] = [];
    const thoughtLower = thought.toLowerCase();
    
    if (thoughtLower.includes('assumption') || thoughtLower.includes('assume')) tags.push('assumptions');
    if (thoughtLower.includes('alternative') || thoughtLower.includes('approach')) tags.push('alternatives');
    if (thoughtLower.includes('risk') || thoughtLower.includes('failure')) tags.push('risk-analysis');
    if (thoughtLower.includes('evidence') || thoughtLower.includes('validate')) tags.push('validation');
    if (thoughtLower.includes('break') || thoughtLower.includes('component')) tags.push('decomposition');
    if (thoughtLower.includes('implication') || thoughtLower.includes('consequence')) tags.push('implications');
    if (thoughtLower.includes('stakeholder') || thoughtLower.includes('perspective')) tags.push('stakeholder-analysis');
    if (thoughtLower.includes('synthesize') || thoughtLower.includes('insight')) tags.push('synthesis');
    if (thoughtLower.includes('question') || thoughtLower.includes('unanswered')) tags.push('open-questions');
    
    // Add general tag if no specific ones found
    if (tags.length === 0) tags.push('analysis');
    
    return tags.slice(0, 3); // Limit to 3 tags
  }

  /**
   * Extract implied evidence from rule-based thoughts
   */
  private extractImpliedEvidence(thought: string): string[] {
    const evidence: string[] = [];
    
    if (thought.includes('assumption')) {
      evidence.push('Previous thoughts contain assumptions that need validation');
    }
    if (thought.includes('alternative')) {
      evidence.push('Multiple approaches exist for this problem');
    }
    if (thought.includes('risk') || thought.includes('failure')) {
      evidence.push('Identified potential failure points in current reasoning');
    }
    
    return evidence.slice(0, 2); // Limit to 2 evidence items
  }

  /**
   * Extract implied assumptions from rule-based thoughts
   */
  private extractImpliedAssumptions(thought: string): string[] {
    const assumptions: string[] = [];
    
    if (thought.includes('analyze') || thought.includes('check')) {
      assumptions.push('Current reasoning is complete enough to analyze');
    }
    if (thought.includes('consider') || thought.includes('alternative')) {
      assumptions.push('Better solutions may exist beyond current approach');
    }
    if (thought.includes('evaluate') || thought.includes('evidence')) {
      assumptions.push('Evidence exists to support or refute current conclusions');
    }
    
    return assumptions.slice(0, 2); // Limit to 2 assumptions
  }

  /**
   * Find relevant references to previous thoughts (simplified heuristic)
   */
  private findRelevantReferences(thought: string, currentThoughtNumber: number): number[] {
    const references: number[] = [];
    const thoughtLower = thought.toLowerCase();
    
    // Reference low-confidence thoughts if talking about assumptions or validation
    if (thoughtLower.includes('assumption') || thoughtLower.includes('validate')) {
      const lowConfThoughts = this.getLowConfidenceThoughts();
      if (lowConfThoughts.length > 0) {
        references.push(lowConfThoughts[0].thoughtNumber);
      }
    }
    
    // Reference recent thoughts for synthesis
    if (thoughtLower.includes('synthesize') || thoughtLower.includes('insight')) {
      const recent = Math.max(1, currentThoughtNumber - 2);
      references.push(recent);
    }
    
    // Reference first thought for broad analysis
    if (thoughtLower.includes('analyze') && this.thoughtHistory.length > 1) {
      references.push(1);
    }
    
    return references.slice(0, 2); // Limit to 2 references
  }

  private assessNeedsMoreThinking(thought: string, currentIteration: number, maxIterations: number): boolean {
    // Don't continue if we're at max iterations
    if (currentIteration >= maxIterations) {
      return false;
    }
    
    // Check if the thought indicates completion
    const completionPatterns = [
      /\b(?:conclusion|final|complete|finished|done|solved)\b/i,
      /\b(?:therefore|thus|in summary|to conclude)\b/i,
      /\b(?:answer is|solution is|result is)\b/i
    ];
    
    if (completionPatterns.some(pattern => pattern.test(thought))) {
      return false;
    }
    
    // Check if the thought indicates more work needed
    const continuationPatterns = [
      /\b(?:need to|should|must|next|however|but|although)\b/i,
      /\b(?:unclear|uncertain|question|investigate|explore)\b/i,
      /\b(?:more|further|additional|deeper|better)\b/i
    ];
    
    if (continuationPatterns.some(pattern => pattern.test(thought))) {
      return true;
    }
    
    // Default: continue for a few iterations unless explicitly stopping
    return currentIteration < Math.min(2, maxIterations);
  }

  // Synthesis methods
  private extractDecisions(): Decision[] {
    const decisions: Decision[] = [];
    
    for (const thought of this.thoughtHistory) {
      const thoughtText = thought.thought.toLowerCase();
      
      // Look for decision indicators
      const decisionPatterns = [
        /(?:decide|decided|decision|choose|chose|will|should|must|going to)/,
        /(?:option|approach|strategy|method|way)/,
        /(?:therefore|thus|so|hence|consequently)/
      ];
      
      const hasDecisionPattern = decisionPatterns.some(pattern => pattern.test(thoughtText));
      
      if (hasDecisionPattern || thought.isRevision) {
        // Extract the main decision point
        const sentences = thought.thought.split(/[.!?]+/).filter(s => s.trim());
        
        for (const sentence of sentences) {
          const sentenceLower = sentence.toLowerCase();
          if (decisionPatterns.some(pattern => pattern.test(sentenceLower))) {
            const confidence = this.assessConfidence(sentence);
            
            decisions.push({
              thoughtNumber: thought.thoughtNumber,
              decision: sentence.trim(),
              rationale: thought.thought,
              confidence,
              alternatives: this.extractAlternatives(thought.thought)
            });
            break;
          }
        }
      }
    }
    
    return decisions;
  }

  private identifyRisks(): Risk[] {
    const risks: Risk[] = [];
    
    for (const thought of this.thoughtHistory) {
      const thoughtText = thought.thought.toLowerCase();
      
      // Look for risk indicators
      const riskPatterns = [
        /(?:risk|danger|problem|issue|concern|worry|uncertain|unsure)/,
        /(?:might not|may not|could fail|might fail|potential|possibly)/,
        /(?:unclear|ambiguous|confusing|difficult|challenging)/,
        /(?:assumption|assume|presume|suppose)/
      ];
      
      const hasRiskPattern = riskPatterns.some(pattern => pattern.test(thoughtText));
      
      if (hasRiskPattern || thought.needsMoreThoughts) {
        const severity = this.assessRiskSeverity(thought.thought);
        const riskArea = this.extractRiskArea(thought.thought);
        
        risks.push({
          thoughtNumber: thought.thoughtNumber,
          riskArea,
          description: thought.thought,
          severity,
          mitigation: this.suggestMitigation(thought.thought)
        });
      }
    }
    
    return risks;
  }

  private extractAssumptions(): Assumption[] {
    const assumptions: Assumption[] = [];
    
    for (const thought of this.thoughtHistory) {
      const thoughtText = thought.thought.toLowerCase();
      
      // Look for assumption indicators
      const assumptionPatterns = [
        /(?:assume|assuming|assumption|presume|presuming|suppose|supposing)/,
        /(?:given that|if we|provided that|considering)/,
        /(?:likely|probably|presumably|apparently)/
      ];
      
      const hasAssumptionPattern = assumptionPatterns.some(pattern => pattern.test(thoughtText));
      
      if (hasAssumptionPattern) {
        const confidence = this.assessConfidence(thought.thought);
        
        assumptions.push({
          thoughtNumber: thought.thoughtNumber,
          assumption: this.extractMainAssumption(thought.thought),
          basis: thought.thought,
          confidence
        });
      }
    }
    
    return assumptions;
  }

  private generateActionItems(): ActionItem[] {
    const actionItems: ActionItem[] = [];
    
    // Look for explicit action items
    for (const thought of this.thoughtHistory) {
      const thoughtText = thought.thought.toLowerCase();
      
      const actionPatterns = [
        /(?:need to|should|must|have to|ought to)/,
        /(?:next step|next|then|after)/,
        /(?:implement|create|build|develop|design)/,
        /(?:todo|task|action)/
      ];
      
      const hasActionPattern = actionPatterns.some(pattern => pattern.test(thoughtText));
      
      if (hasActionPattern || thought.nextThoughtNeeded) {
        const priority = this.assessActionPriority(thought.thought);
        
        actionItems.push({
          priority,
          action: this.extractActionDescription(thought.thought),
          context: thought.thought,
          relatedThoughts: [thought.thoughtNumber]
        });
      }
    }
    
    // Add implicit action items based on unresolved issues
    const unresolved = this.thoughtHistory.filter(t => t.needsMoreThoughts || t.nextThoughtNeeded);
    if (unresolved.length > 0 && !this.thoughtHistory[this.thoughtHistory.length - 1]?.nextThoughtNeeded) {
      actionItems.push({
        priority: 'medium',
        action: 'Address unresolved issues from earlier thoughts',
        context: 'Some thoughts indicated more analysis was needed',
        relatedThoughts: unresolved.map(t => t.thoughtNumber)
      });
    }
    
    return actionItems;
  }

  private identifyAlternativeApproaches(): AlternativeApproach[] {
    const alternatives: AlternativeApproach[] = [];
    const branchesArray = Object.entries(this.branches);
    
    for (const [branchId, branchThoughts] of branchesArray) {
      if (branchThoughts.length > 0) {
        const approach = this.extractApproachFromBranch(branchThoughts);
        const pros = this.extractProsFromBranch(branchThoughts);
        const cons = this.extractConsFromBranch(branchThoughts);
        
        alternatives.push({
          approach,
          pros,
          cons,
          feasibility: this.assessFeasibility(branchThoughts),
          consideredInThoughts: branchThoughts.map(t => t.thoughtNumber)
        });
      }
    }
    
    return alternatives;
  }

  public synthesizeInsights(): SynthesisResult {
    if (this.thoughtHistory.length === 0) {
      throw new Error('No thoughts to synthesize. Please add thoughts first.');
    }

    const decisions = this.extractDecisions();
    const assumptions = this.extractAssumptions();
    const risks = this.identifyRisks();
    const actionItems = this.generateActionItems();
    const alternativeApproaches = this.identifyAlternativeApproaches();

    const keyInsights = this.extractKeyInsights();
    const confidenceAssessment = this.assessOverallConfidence();
    const nextSteps = this.generateNextSteps();

    // Collect all attachments for analysis
    const allAttachments: Array<{ thought: number; attachment: Attachment }> = [];
    for (const thought of this.thoughtHistory) {
      if (thought.attachments) {
        for (const attachment of thought.attachments) {
          allAttachments.push({ thought: thought.thoughtNumber, attachment });
        }
      }
    }

    // Enhanced analysis with attachments
    const attachmentAnalysis = this.analyzeAttachmentsInSynthesis(allAttachments);
    
    return {
      summary: {
        totalThoughts: this.thoughtHistory.length,
        branches: Object.keys(this.branches).length,
        revisions: this.thoughtHistory.filter(t => t.isRevision).length,
        keyInsights,
        attachmentSummary: attachmentAnalysis.summary
      },
      decisions,
      assumptions,
      risks,
      actionItems,
      alternativeApproaches,
      confidenceAssessment,
      nextSteps,
      attachmentAnalysis
    };
  }

  private analyzeAttachmentsInSynthesis(attachments: Array<{ thought: number; attachment: Attachment }>): any {
    if (attachments.length === 0) {
      return {
        summary: {
          totalAttachments: 0,
          types: {},
          evidenceBoost: 0,
          thoughtsWithAttachments: 0
        },
        codeAnalysis: null,
        diagramAnalysis: null,
        dataAnalysis: null
      };
    }

    const typeDistribution = this.analyzeAttachmentTypes(attachments.map(a => a.attachment));
    const evidenceAttachments = attachments.filter(a => this.isEvidentialAttachment(a.attachment));
    
    return {
      summary: {
        totalAttachments: attachments.length,
        types: typeDistribution,
        evidenceBoost: evidenceAttachments.length * 0.05, // 5% boost per evidential attachment
        thoughtsWithAttachments: new Set(attachments.map(a => a.thought)).size
      },
      codeAnalysis: this.analyzeCodeAttachments(attachments.filter(a => a.attachment.type === 'code')),
      diagramAnalysis: this.analyzeDiagramAttachments(attachments.filter(a => a.attachment.type === 'diagram')),
      dataAnalysis: this.analyzeDataAttachments(attachments.filter(a => ['json', 'table'].includes(a.attachment.type)))
    };
  }

  private analyzeCodeAttachments(codeAttachments: Array<{ thought: number; attachment: Attachment }>): any {
    if (codeAttachments.length === 0) return null;

    const languages = this.analyzeLanguageDistribution(codeAttachments.map(c => c.attachment));
    const totalComplexity = codeAttachments
      .filter(c => c.attachment.metadata?.complexity !== undefined)
      .reduce((sum, c) => sum + (c.attachment.metadata!.complexity || 0), 0);
    
    const avgComplexity = codeAttachments.length > 0 ? totalComplexity / codeAttachments.length : 0;

    return {
      totalCodeBlocks: codeAttachments.length,
      languages,
      averageComplexity: Math.round(avgComplexity),
      thoughtsWithCode: new Set(codeAttachments.map(c => c.thought)).size
    };
  }

  private analyzeDiagramAttachments(diagramAttachments: Array<{ thought: number; attachment: Attachment }>): any {
    if (diagramAttachments.length === 0) return null;

    const diagramTypes: Record<string, number> = {};
    diagramAttachments.forEach(d => {
      const type = d.attachment.metadata?.description || 'unknown';
      diagramTypes[type] = (diagramTypes[type] || 0) + 1;
    });

    return {
      totalDiagrams: diagramAttachments.length,
      types: diagramTypes,
      thoughtsWithDiagrams: new Set(diagramAttachments.map(d => d.thought)).size
    };
  }

  private analyzeDataAttachments(dataAttachments: Array<{ thought: number; attachment: Attachment }>): any {
    if (dataAttachments.length === 0) return null;

    const formats: Record<string, number> = {};
    dataAttachments.forEach(d => {
      const format = d.attachment.metadata?.format || 'unknown';
      formats[format] = (formats[format] || 0) + 1;
    });

    return {
      totalDataSets: dataAttachments.length,
      formats,
      thoughtsWithData: new Set(dataAttachments.map(d => d.thought)).size
    };
  }

  // Helper methods for assessment and extraction
  private assessConfidence(text: string): 'high' | 'medium' | 'low' {
    const highConfidenceWords = /(?:certain|definitely|clearly|obviously|sure|confident)/i;
    const lowConfidenceWords = /(?:uncertain|unsure|maybe|perhaps|might|possibly|unclear)/i;
    
    if (highConfidenceWords.test(text)) return 'high';
    if (lowConfidenceWords.test(text)) return 'low';
    return 'medium';
  }

  private assessRiskSeverity(text: string): 'high' | 'medium' | 'low' {
    const highSeverityWords = /(?:critical|fatal|disaster|failure|impossible|major)/i;
    const lowSeverityWords = /(?:minor|small|slight|unlikely|negligible)/i;
    
    if (highSeverityWords.test(text)) return 'high';
    if (lowSeverityWords.test(text)) return 'low';
    return 'medium';
  }

  private extractRiskArea(text: string): string {
    // Simple heuristic to extract the main risk area
    const sentences = text.split(/[.!?]+/);
    const riskSentence = sentences.find(s => 
      /(?:risk|problem|issue|concern)/i.test(s)
    ) || sentences[0];
    
    return riskSentence?.trim() || 'General risk';
  }

  private suggestMitigation(text: string): string | undefined {
    // Look for mitigation suggestions in the text
    if (/(?:should|could|might|need to).+(?:address|solve|fix|mitigate)/i.test(text)) {
      const sentences = text.split(/[.!?]+/);
      const mitigationSentence = sentences.find(s => 
        /(?:should|could|might|need to).+(?:address|solve|fix|mitigate)/i.test(s)
      );
      return mitigationSentence?.trim();
    }
    return undefined;
  }

  private extractMainAssumption(text: string): string {
    const sentences = text.split(/[.!?]+/);
    const assumptionSentence = sentences.find(s => 
      /(?:assume|assuming|presume|suppose)/i.test(s)
    ) || sentences[0];
    
    return assumptionSentence?.trim() || 'Unstated assumption';
  }

  private assessActionPriority(text: string): 'high' | 'medium' | 'low' {
    const highPriorityWords = /(?:urgent|critical|immediately|must|essential|crucial)/i;
    const lowPriorityWords = /(?:later|eventually|when possible|nice to have|optional)/i;
    
    if (highPriorityWords.test(text)) return 'high';
    if (lowPriorityWords.test(text)) return 'low';
    return 'medium';
  }

  private extractActionDescription(text: string): string {
    // Extract action-oriented sentences
    const sentences = text.split(/[.!?]+/);
    const actionSentence = sentences.find(s => 
      /(?:need to|should|must|implement|create|build)/i.test(s)
    ) || sentences[0];
    
    return actionSentence?.trim() || 'Action needed';
  }

  private extractAlternatives(text: string): string[] | undefined {
    // Look for alternative mentions
    const alternatives: string[] = [];
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      if (/(?:alternative|option|instead|or|another way)/i.test(sentence)) {
        alternatives.push(sentence.trim());
      }
    }
    
    return alternatives.length > 0 ? alternatives : undefined;
  }

  private extractApproachFromBranch(branchThoughts: ThoughtData[]): string {
    return branchThoughts[0]?.thought || 'Alternative approach';
  }

  private extractProsFromBranch(branchThoughts: ThoughtData[]): string[] {
    const pros: string[] = [];
    for (const thought of branchThoughts) {
      if (/(?:advantage|benefit|pro|good|positive)/i.test(thought.thought)) {
        pros.push(thought.thought);
      }
    }
    return pros.length > 0 ? pros : ['Potential benefits identified'];
  }

  private extractConsFromBranch(branchThoughts: ThoughtData[]): string[] {
    const cons: string[] = [];
    for (const thought of branchThoughts) {
      if (/(?:disadvantage|problem|con|bad|negative|risk)/i.test(thought.thought)) {
        cons.push(thought.thought);
      }
    }
    return cons.length > 0 ? cons : ['Potential drawbacks identified'];
  }

  private assessFeasibility(branchThoughts: ThoughtData[]): 'high' | 'medium' | 'low' {
    for (const thought of branchThoughts) {
      if (/(?:impossible|can't|won't work|unfeasible)/i.test(thought.thought)) return 'low';
      if (/(?:easy|simple|straightforward|feasible)/i.test(thought.thought)) return 'high';
    }
    return 'medium';
  }

  private extractKeyInsights(): string[] {
    const insights: string[] = [];
    
    // Look for conclusion or insight patterns
    for (const thought of this.thoughtHistory) {
      if (/(?:insight|realize|understand|key|important|conclude)/i.test(thought.thought)) {
        insights.push(thought.thought);
      }
    }
    
    // If no explicit insights, use the most recent non-revision thoughts
    if (insights.length === 0) {
      const recentThoughts = this.thoughtHistory
        .filter(t => !t.isRevision)
        .slice(-3);
      insights.push(...recentThoughts.map(t => t.thought));
    }
    
    return insights.slice(0, 5); // Limit to 5 key insights
  }

  private assessOverallConfidence(): {
    overallConfidence: 'high' | 'medium' | 'low';
    reasoningQuality: 'excellent' | 'good' | 'fair' | 'poor';
    completeness: 'complete' | 'mostly-complete' | 'partial' | 'incomplete';
  } {
    const totalThoughts = this.thoughtHistory.length;
    const revisions = this.thoughtHistory.filter(t => t.isRevision).length;
    const unresolved = this.thoughtHistory.filter(t => t.needsMoreThoughts).length;
    
    // Assess overall confidence
    let overallConfidence: 'high' | 'medium' | 'low' = 'medium';
    if (revisions / totalThoughts > 0.3) overallConfidence = 'low';
    else if (revisions / totalThoughts < 0.1 && unresolved === 0) overallConfidence = 'high';
    
    // Assess reasoning quality
    let reasoningQuality: 'excellent' | 'good' | 'fair' | 'poor' = 'good';
    if (totalThoughts < 3) reasoningQuality = 'poor';
    else if (totalThoughts > 10 && revisions > 0) reasoningQuality = 'excellent';
    else if (totalThoughts > 6) reasoningQuality = 'good';
    else reasoningQuality = 'fair';
    
    // Assess completeness
    let completeness: 'complete' | 'mostly-complete' | 'partial' | 'incomplete' = 'complete';
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    if (lastThought?.nextThoughtNeeded) completeness = 'incomplete';
    else if (unresolved > 0) completeness = 'partial';
    else if (revisions > 0) completeness = 'mostly-complete';
    
    return { overallConfidence, reasoningQuality, completeness };
  }

  private generateNextSteps(): string[] {
    const nextSteps: string[] = [];
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    
    if (lastThought?.nextThoughtNeeded) {
      nextSteps.push('Continue thinking process - more analysis needed');
    }
    
    const unresolved = this.thoughtHistory.filter(t => t.needsMoreThoughts);
    if (unresolved.length > 0) {
      nextSteps.push(`Address ${unresolved.length} unresolved issue(s) from earlier thoughts`);
    }
    
    const decisions = this.extractDecisions();
    const lowConfidenceDecisions = decisions.filter(d => d.confidence === 'low');
    if (lowConfidenceDecisions.length > 0) {
      nextSteps.push(`Validate ${lowConfidenceDecisions.length} low-confidence decision(s)`);
    }
    
    if (nextSteps.length === 0) {
      nextSteps.push('Review synthesis results and plan implementation');
    }
    
    return nextSteps;
  }

  /**
   * Decision Tree Visualization Methods
   */
  
  /**
   * Build tree structure from thought history using references
   */
  private buildDecisionTree(): TreeNode[] {
    if (this.thoughtHistory.length === 0) {
      return [];
    }

    // Create nodes map
    const nodeMap = new Map<number, TreeNode>();
    
    // Initialize all nodes
    for (const thought of this.thoughtHistory) {
      nodeMap.set(thought.thoughtNumber, {
        thoughtNumber: thought.thoughtNumber,
        thought,
        children: [],
        parent: null,
        isDecisionPoint: this.isDecisionPoint(thought),
        isCriticalPath: false, // Will be calculated later
        depth: 0 // Will be calculated later
      });
    }

    // Build parent-child relationships based on references and sequence
    const rootNodes: TreeNode[] = [];
    
    for (const thought of this.thoughtHistory) {
      const node = nodeMap.get(thought.thoughtNumber)!;
      
      if (thought.references && thought.references.length > 0) {
        // Use the most recent reference as parent for tree structure
        const primaryParentNum = Math.max(...thought.references);
        const parent = nodeMap.get(primaryParentNum);
        
        if (parent) {
          node.parent = parent;
          parent.children.push(node);
        } else {
          rootNodes.push(node);
        }
      } else if (thought.branchFromThought) {
        // Handle explicit branches
        const parent = nodeMap.get(thought.branchFromThought);
        if (parent) {
          node.parent = parent;
          parent.children.push(node);
        } else {
          rootNodes.push(node);
        }
      } else if (thought.thoughtNumber === 1 || rootNodes.length === 0) {
        // First thought or orphaned thought becomes root
        rootNodes.push(node);
      } else {
        // Default: attach to previous thought in sequence
        const prevThought = nodeMap.get(thought.thoughtNumber - 1);
        if (prevThought && !prevThought.children.some(child => child.thoughtNumber === thought.thoughtNumber)) {
          node.parent = prevThought;
          prevThought.children.push(node);
        } else {
          rootNodes.push(node);
        }
      }
    }

    // Calculate depths
    this.calculateDepths(rootNodes);
    
    // Identify critical path (highest confidence path to deepest node)
    const criticalPath = this.findCriticalPath(rootNodes);
    this.markCriticalPath(criticalPath, nodeMap);

    return rootNodes;
  }

  private calculateDepths(rootNodes: TreeNode[]): void {
    const calculateNodeDepth = (node: TreeNode, depth: number): void => {
      node.depth = depth;
      for (const child of node.children) {
        calculateNodeDepth(child, depth + 1);
      }
    };

    for (const root of rootNodes) {
      calculateNodeDepth(root, 0);
    }
  }

  private findCriticalPath(rootNodes: TreeNode[]): number[] {
    let bestPath: number[] = [];
    let bestScore = -1;

    const explorePath = (node: TreeNode, currentPath: number[]): void => {
      const newPath = [...currentPath, node.thoughtNumber];
      
      // Calculate path score based on confidence and depth
      const pathScore = this.calculatePathScore(newPath);
      
      if (node.children.length === 0) {
        // Leaf node - evaluate complete path
        if (pathScore > bestScore) {
          bestScore = pathScore;
          bestPath = newPath;
        }
      } else {
        // Continue exploring children
        for (const child of node.children) {
          explorePath(child, newPath);
        }
      }
    };

    for (const root of rootNodes) {
      explorePath(root, []);
    }

    return bestPath;
  }

  private calculatePathScore(path: number[]): number {
    let totalConfidence = 0;
    let validConfidenceCount = 0;

    for (const thoughtNum of path) {
      const thought = this.thoughtHistory.find(t => t.thoughtNumber === thoughtNum);
      if (thought && thought.confidence !== undefined) {
        totalConfidence += thought.confidence;
        validConfidenceCount++;
      }
    }

    const avgConfidence = validConfidenceCount > 0 ? totalConfidence / validConfidenceCount : 0.5;
    const depthBonus = path.length * 0.1; // Slight bonus for deeper paths
    
    return avgConfidence + depthBonus;
  }

  private markCriticalPath(criticalPath: number[], nodeMap: Map<number, TreeNode>): void {
    for (const thoughtNum of criticalPath) {
      const node = nodeMap.get(thoughtNum);
      if (node) {
        node.isCriticalPath = true;
      }
    }
  }

  private isDecisionPoint(thought: ThoughtData): boolean {
    const thoughtText = thought.thought.toLowerCase();
    
    // Decision indicators
    const decisionPatterns = [
      /(?:decide|decision|choose|option|alternative)/,
      /(?:should|could|might|either|or)/,
      /(?:consider|evaluate|compare)/
    ];
    
    const hasDecisionPattern = decisionPatterns.some(pattern => pattern.test(thoughtText));
    
    // Also consider low confidence or branching as decision points
    const isLowConfidence = thought.confidence !== undefined && thought.confidence < 0.6;
    const hasBranches = thought.branchId !== undefined;
    const needsMoreThoughts = thought.needsMoreThoughts === true;
    
    return hasDecisionPattern || isLowConfidence || hasBranches || needsMoreThoughts;
  }

  /**
   * Generate ASCII visualization of the decision tree
   */
  private generateAsciiTree(
    rootNodes: TreeNode[],
    confidenceThreshold?: number,
    focusBranch?: string,
    showEvidence: boolean = true
  ): string {
    if (rootNodes.length === 0) {
      return "No thoughts to visualize";
    }

    let output = "Decision Tree Visualization\n";
    output += "═".repeat(50) + "\n\n";

    const filteredRoots = this.filterNodes(rootNodes, confidenceThreshold, focusBranch);

    for (let i = 0; i < filteredRoots.length; i++) {
      const isLast = i === filteredRoots.length - 1;
      output += this.renderNode(filteredRoots[i], "", isLast, showEvidence);
    }

    // Add statistics
    const stats = this.calculateTreeStatistics(rootNodes);
    output += "\n" + "─".repeat(50) + "\n";
    output += `Decision Points: ${stats.decisionPoints} | Critical Path: ${stats.criticalPath.join('→')} | Avg Confidence: ${stats.averageConfidence?.toFixed(2) || 'N/A'}\n`;
    output += `Depth: ${stats.depth} | Breadth: ${stats.breadth} | Low Confidence: ${stats.lowConfidenceNodes} | Evidence Gaps: ${stats.evidenceGaps}`;

    return output;
  }

  private filterNodes(rootNodes: TreeNode[], confidenceThreshold?: number, focusBranch?: string): TreeNode[] {
    if (!confidenceThreshold && !focusBranch) {
      return rootNodes;
    }

    const filtered: TreeNode[] = [];
    
    for (const root of rootNodes) {
      const filteredRoot = this.filterNodeRecursive(root, confidenceThreshold, focusBranch);
      if (filteredRoot) {
        filtered.push(filteredRoot);
      }
    }

    return filtered;
  }

  private filterNodeRecursive(node: TreeNode, confidenceThreshold?: number, focusBranch?: string): TreeNode | null {
    // Check confidence threshold
    if (confidenceThreshold !== undefined && 
        node.thought.confidence !== undefined && 
        node.thought.confidence < confidenceThreshold) {
      return null;
    }

    // Check branch focus
    if (focusBranch && node.thought.branchId && node.thought.branchId !== focusBranch) {
      return null;
    }

    // Create filtered node
    const filteredNode: TreeNode = {
      ...node,
      children: []
    };

    // Recursively filter children
    for (const child of node.children) {
      const filteredChild = this.filterNodeRecursive(child, confidenceThreshold, focusBranch);
      if (filteredChild) {
        filteredChild.parent = filteredNode;
        filteredNode.children.push(filteredChild);
      }
    }

    return filteredNode;
  }

  private renderNode(node: TreeNode, prefix: string, isLast: boolean, showEvidence: boolean): string {
    const thought = node.thought;
    let output = "";

    // Tree structure characters
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    // Confidence visualization
    const confidenceBar = this.getConfidenceBar(thought.confidence);
    const confidenceText = thought.confidence !== undefined ? 
      ` (${(thought.confidence * 100).toFixed(0)}%)` : '';

    // Decision point marker
    const decisionMarker = node.isDecisionPoint ? "🔶 " : "";
    
    // Critical path marker
    const criticalMarker = node.isCriticalPath ? "⭐ " : "";

    // Tags display
    const tagsText = thought.tags && thought.tags.length > 0 ? 
      ` [${thought.tags.slice(0, 3).join(', ')}]` : '';

    // Evidence and assumption counts
    const evidenceCount = thought.evidence ? thought.evidence.length : 0;
    const assumptionCount = thought.assumptions ? thought.assumptions.length : 0;
    const metaText = showEvidence && (evidenceCount > 0 || assumptionCount > 0) ? 
      ` +${evidenceCount}E` + (assumptionCount > 0 ? ` -${assumptionCount}A` : '') : '';

    // Truncate thought text for tree display
    const thoughtText = thought.thought.length > 40 ? 
      thought.thought.substring(0, 37) + "..." : thought.thought;

    output += `${prefix}${connector}[${thought.thoughtNumber}] ${confidenceBar} ${criticalMarker}${decisionMarker}${thoughtText}${confidenceText}${tagsText}${metaText}\n`;

    // Render children
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const isLastChild = i === node.children.length - 1;
      output += this.renderNode(child, prefix + childPrefix, isLastChild, showEvidence);
    }

    return output;
  }

  private getConfidenceBar(confidence?: number): string {
    if (confidence === undefined) return "░░░";
    
    const level = Math.round(confidence * 3);
    switch (level) {
      case 3: return "███"; // High confidence
      case 2: return "██░"; // Medium-high confidence  
      case 1: return "█░░"; // Medium-low confidence
      case 0: return "░░░"; // Low confidence
      default: return "░░░";
    }
  }

  private calculateTreeStatistics(rootNodes: TreeNode[]): TreeStatistics {
    let totalNodes = 0;
    let decisionPoints = 0;
    let lowConfidenceNodes = 0;
    let evidenceGaps = 0;
    let assumptionRisks = 0;
    let maxDepth = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;
    let criticalPath: number[] = [];

    // Find critical path
    for (const root of rootNodes) {
      const path = this.findNodeCriticalPath(root);
      if (path.length > criticalPath.length) {
        criticalPath = path;
      }
    }

    // Calculate statistics recursively
    const analyzeNode = (node: TreeNode): void => {
      totalNodes++;
      maxDepth = Math.max(maxDepth, node.depth);

      if (node.isDecisionPoint) decisionPoints++;
      
      if (node.thought.confidence !== undefined) {
        totalConfidence += node.thought.confidence;
        confidenceCount++;
        
        if (node.thought.confidence < 0.6) {
          lowConfidenceNodes++;
        }
      }

      if (!node.thought.evidence || node.thought.evidence.length === 0) {
        evidenceGaps++;
      }

      if (node.thought.assumptions && node.thought.assumptions.length > 2) {
        assumptionRisks++;
      }

      for (const child of node.children) {
        analyzeNode(child);
      }
    };

    for (const root of rootNodes) {
      analyzeNode(root);
    }

    // Calculate breadth (average branching factor)
    const breadth = totalNodes > 1 ? Math.round((totalNodes - rootNodes.length) / Math.max(1, totalNodes - this.getLeafCount(rootNodes))) : 1;

    return {
      totalNodes,
      decisionPoints,
      averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : null,
      criticalPath,
      depth: maxDepth + 1,
      breadth,
      lowConfidenceNodes,
      evidenceGaps,
      assumptionRisks
    };
  }

  private findNodeCriticalPath(node: TreeNode): number[] {
    if (node.isCriticalPath) {
      return [node.thoughtNumber];
    }
    
    for (const child of node.children) {
      const childPath = this.findNodeCriticalPath(child);
      if (childPath.length > 0) {
        return [node.thoughtNumber, ...childPath];
      }
    }
    
    return [];
  }

  private getLeafCount(rootNodes: TreeNode[]): number {
    let leafCount = 0;
    
    const countLeaves = (node: TreeNode): void => {
      if (node.children.length === 0) {
        leafCount++;
      } else {
        for (const child of node.children) {
          countLeaves(child);
        }
      }
    };

    for (const root of rootNodes) {
      countLeaves(root);
    }

    return leafCount;
  }

  /**
   * Generate structured JSON representation of the decision tree
   */
  private generateTreeStructure(rootNodes: TreeNode[]): TreeStructure {
    const nodes: Array<{
      thoughtNumber: number;
      confidence: number | undefined;
      evidenceCount: number;
      assumptionCount: number;
      tags: string[];
      isDecisionPoint: boolean;
      isCriticalPath: boolean;
      children: number[];
      references: number[];
    }> = [];
    const criticalPath: number[] = [];
    let maxDepth = 0;

    // Find critical path from the tree
    for (const root of rootNodes) {
      const path = this.findNodeCriticalPath(root);
      if (path.length > criticalPath.length) {
        criticalPath.push(...path);
      }
    }

    const processNode = (node: TreeNode): void => {
      maxDepth = Math.max(maxDepth, node.depth);
      
      nodes.push({
        thoughtNumber: node.thoughtNumber,
        confidence: node.thought.confidence,
        evidenceCount: node.thought.evidence?.length || 0,
        assumptionCount: node.thought.assumptions?.length || 0,
        tags: node.thought.tags || [],
        isDecisionPoint: node.isDecisionPoint,
        isCriticalPath: node.isCriticalPath,
        children: node.children.map(child => child.thoughtNumber),
        references: node.thought.references || []
      });

      for (const child of node.children) {
        processNode(child);
      }
    };

    for (const root of rootNodes) {
      processNode(root);
    }

    return {
      nodes,
      branches: this.countBranches(rootNodes),
      depth: maxDepth + 1,
      criticalPath
    };
  }

  private countBranches(rootNodes: TreeNode[]): number {
    let branches = 0;
    
    const countNodeBranches = (node: TreeNode): void => {
      if (node.children.length > 1) {
        branches += node.children.length - 1;
      }
      
      for (const child of node.children) {
        countNodeBranches(child);
      }
    };

    for (const root of rootNodes) {
      countNodeBranches(root);
    }

    return branches;
  }

  /**
   * Main visualization method
   */
  public generateDecisionTree(
    confidenceThreshold?: number,
    focusBranch?: string,
    outputFormat: 'ascii' | 'json' | 'both' = 'both',
    showEvidence: boolean = true
  ): DecisionTreeVisualization {
    if (this.thoughtHistory.length === 0) {
      throw new Error('No thoughts available for visualization. Add some thoughts first.');
    }

    const rootNodes = this.buildDecisionTree();
    const ascii = this.generateAsciiTree(rootNodes, confidenceThreshold, focusBranch, showEvidence);
    const json = this.generateTreeStructure(rootNodes);
    const statistics = this.calculateTreeStatistics(rootNodes);

    return {
      ascii,
      json,
      statistics
    };
  }

  public processThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);
      
      // Check if this might be a new session (thought number 1 after having thoughts)
      if (validatedInput.thoughtNumber === 1 && this.thoughtHistory.length > 0) {
        // Automatically reset session for new problems
        this.resetSession();
      }
      
      // Add session tracking
      validatedInput.timestamp = new Date().toISOString();
      validatedInput.sessionId = this.currentSessionId;

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(validatedInput);
        console.error(formattedThought);
      }

      // Provide reasoning quality analysis if we have enough thoughts with confidence data
      const reasoningAnalysis = this.thoughtHistory.length >= 2 ? this.analyzeReasoningQuality() : null;
      const lowConfidenceThoughts = this.getLowConfidenceThoughts();
      const assumptionChains = this.getAssumptionChains();

      // Include all enhanced features in the response
      const responseData: any = {
        thoughtNumber: validatedInput.thoughtNumber,
        totalThoughts: validatedInput.totalThoughts,
        nextThoughtNeeded: validatedInput.nextThoughtNeeded,
        branches: Object.keys(this.branches),
        thoughtHistoryLength: this.thoughtHistory.length,
        confidence: validatedInput.confidence,
        evidenceCount: validatedInput.evidence?.length || 0,
        assumptionsCount: validatedInput.assumptions?.length || 0,
        attachmentCount: validatedInput.attachments?.length || 0,
        reasoningAnalysis: reasoningAnalysis,
        lowConfidenceThoughts: lowConfidenceThoughts.map(t => ({
          thoughtNumber: t.thoughtNumber,
          confidence: t.confidence,
          thought: t.thought.substring(0, 100) + (t.thought.length > 100 ? '...' : '')
        })),
        assumptionChains: assumptionChains.filter(chain => chain.riskLevel !== 'low')
      };

      if (validatedInput.references && validatedInput.references.length > 0) {
        responseData.references = validatedInput.references;
      }

      if (validatedInput.tags && validatedInput.tags.length > 0) {
        responseData.tags = validatedInput.tags;
      }

      if (validatedInput.evidence && validatedInput.evidence.length > 0) {
        responseData.evidence = validatedInput.evidence;
      }

      if (validatedInput.assumptions && validatedInput.assumptions.length > 0) {
        responseData.assumptions = validatedInput.assumptions;
      }

      if (validatedInput.attachments && validatedInput.attachments.length > 0) {
        responseData.attachments = validatedInput.attachments.map(att => ({
          id: att.id,
          type: att.type,
          name: att.name,
          metadata: att.metadata,
          contentPreview: this.generateContentPreview(att)
        }));
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  /**
   * Attachment processing methods for multi-modal content
   */
  
  public addAttachment(thoughtNumber: number, attachment: Omit<Attachment, 'id'>): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const thought = this.thoughtHistory.find(t => t.thoughtNumber === thoughtNumber);
      if (!thought) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Thought ${thoughtNumber} not found`,
              thoughtNumber
            }, null, 2)
          }],
          isError: true
        };
      }

      // Generate unique ID for the attachment
      const attachmentId = `att_${thoughtNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Process and validate the attachment
      const processedAttachment = this.processAttachment(attachment, attachmentId);
      
      // Add to thought
      if (!thought.attachments) {
        thought.attachments = [];
      }
      thought.attachments.push(processedAttachment);

      // Update confidence if attachment provides supporting evidence
      if (this.isEvidentialAttachment(processedAttachment)) {
        this.enhanceConfidenceWithAttachment(thought, processedAttachment);
      }

      const responseData = {
        status: 'success',
        thoughtNumber,
        attachmentId: processedAttachment.id,
        attachmentType: processedAttachment.type,
        attachmentName: processedAttachment.name,
        metadata: processedAttachment.metadata,
        totalAttachments: thought.attachments.length,
        confidenceImpact: this.isEvidentialAttachment(processedAttachment) ? 'positive' : 'none'
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
            thoughtNumber
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public getAttachments(filters: {
    thoughtNumber?: number;
    type?: string;
    language?: string;
    searchContent?: string;
  } = {}): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      let attachments: Array<{ thought: number; attachment: Attachment }> = [];
      
      // Collect all attachments with their thought numbers
      for (const thought of this.thoughtHistory) {
        if (thought.attachments) {
          for (const attachment of thought.attachments) {
            attachments.push({ thought: thought.thoughtNumber, attachment });
          }
        }
      }

      // Apply filters
      if (filters.thoughtNumber) {
        attachments = attachments.filter(item => item.thought === filters.thoughtNumber);
      }
      
      if (filters.type) {
        attachments = attachments.filter(item => item.attachment.type === filters.type);
      }
      
      if (filters.language) {
        attachments = attachments.filter(item => 
          item.attachment.metadata?.language?.toLowerCase().includes(filters.language!.toLowerCase())
        );
      }
      
      if (filters.searchContent) {
        const searchTerm = filters.searchContent.toLowerCase();
        attachments = attachments.filter(item =>
          item.attachment.name.toLowerCase().includes(searchTerm) ||
          (typeof item.attachment.content === 'string' && 
           item.attachment.content.toLowerCase().includes(searchTerm)) ||
          (item.attachment.metadata?.description?.toLowerCase().includes(searchTerm))
        );
      }

      // Generate summary statistics
      const typeDistribution = this.analyzeAttachmentTypes(attachments.map(item => item.attachment));
      const languageDistribution = this.analyzeLanguageDistribution(attachments.map(item => item.attachment));

      const responseData = {
        totalAttachments: attachments.length,
        filters,
        typeDistribution,
        languageDistribution,
        attachments: attachments.map(item => ({
          thoughtNumber: item.thought,
          id: item.attachment.id,
          type: item.attachment.type,
          name: item.attachment.name,
          metadata: item.attachment.metadata,
          contentPreview: this.generateContentPreview(item.attachment),
          thoughtReferences: item.attachment.thoughtReferences
        }))
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public searchAttachments(
    query: string,
    options: {
      types?: string[];
      useRegex?: boolean;
      includeContent?: boolean;
      maxResults?: number;
    } = {}
  ): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      let attachments: Array<{ thought: number; attachment: Attachment; relevanceScore: number }> = [];
      
      // Collect all attachments with their thought numbers
      for (const thought of this.thoughtHistory) {
        if (thought.attachments) {
          for (const attachment of thought.attachments) {
            attachments.push({ 
              thought: thought.thoughtNumber, 
              attachment,
              relevanceScore: 0
            });
          }
        }
      }

      // Apply type filtering
      if (options.types && options.types.length > 0) {
        attachments = attachments.filter(item => 
          options.types!.includes(item.attachment.type)
        );
      }

      // Search and score relevance
      const searchFunction = options.useRegex 
        ? this.searchWithRegex.bind(this, query)
        : this.searchWithText.bind(this, query);

      attachments = attachments.map(item => ({
        ...item,
        relevanceScore: searchFunction(item.attachment)
      })).filter(item => item.relevanceScore > 0);

      // Sort by relevance score
      attachments.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Apply result limit
      if (options.maxResults) {
        attachments = attachments.slice(0, options.maxResults);
      }

      // Generate analysis
      const analysis = this.analyzeSearchResults(attachments, query);

      const responseData = {
        query,
        options,
        totalResults: attachments.length,
        analysis,
        results: attachments.map(item => ({
          thoughtNumber: item.thought,
          relevanceScore: item.relevanceScore,
          id: item.attachment.id,
          type: item.attachment.type,
          name: item.attachment.name,
          metadata: item.attachment.metadata,
          contentPreview: this.generateContentPreview(item.attachment),
          fullContent: options.includeContent ? item.attachment.content : undefined,
          thoughtReferences: item.attachment.thoughtReferences
        }))
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
            query
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  /**
   * Private helper methods for attachment processing
   */
  
  private processAttachment(attachment: Omit<Attachment, 'id'>, id: string): Attachment {
    const processed: Attachment = {
      id,
      type: attachment.type,
      name: attachment.name,
      content: attachment.content,
      metadata: { ...attachment.metadata },
      thoughtReferences: attachment.thoughtReferences
    };

    // Add creation timestamp
    processed.metadata = processed.metadata || {};
    processed.metadata.created = new Date().toISOString();

    // Process based on type
    switch (attachment.type) {
      case 'code':
        this.processCodeAttachment(processed);
        break;
      case 'image':
        this.processImageAttachment(processed);
        break;
      case 'json':
        this.processJsonAttachment(processed);
        break;
      case 'table':
        this.processTableAttachment(processed);
        break;
      case 'diagram':
        this.processDiagramAttachment(processed);
        break;
      case 'file':
        this.processFileAttachment(processed);
        break;
      case 'url':
        this.processUrlAttachment(processed);
        break;
      default:
        this.processTextAttachment(processed);
    }

    return processed;
  }

  private processCodeAttachment(attachment: Attachment): void {
    if (typeof attachment.content === 'string') {
      const metadata = attachment.metadata!;
      
      // Detect language if not provided
      if (!metadata.language) {
        metadata.language = this.detectCodeLanguage(attachment.content);
      }
      
      // Calculate metrics
      metadata.lineCount = attachment.content.split('\n').length;
      metadata.size = new Blob([attachment.content]).size;
      metadata.complexity = this.calculateCodeComplexity(attachment.content);
      metadata.format = 'text/plain';
    }
  }

  private processImageAttachment(attachment: Attachment): void {
    if (typeof attachment.content === 'string') {
      const metadata = attachment.metadata!;
      
      // Detect if base64 encoded
      if (attachment.content.startsWith('data:image/') || attachment.content.match(/^[A-Za-z0-9+/=]+$/)) {
        metadata.encoding = 'base64';
        metadata.size = Math.ceil(attachment.content.length * 0.75); // Rough base64 size estimate
        
        // Extract format from data URL if present
        const dataUrlMatch = attachment.content.match(/^data:image\/([^;]+)/);
        if (dataUrlMatch) {
          metadata.format = dataUrlMatch[1];
        }
      } else {
        // Assume file path or URL
        const extension = attachment.content.split('.').pop()?.toLowerCase();
        metadata.format = extension || 'unknown';
      }
    }
  }

  private processJsonAttachment(attachment: Attachment): void {
    const metadata = attachment.metadata!;
    
    try {
      let jsonObj: any;
      
      if (typeof attachment.content === 'string') {
        jsonObj = JSON.parse(attachment.content);
        attachment.content = jsonObj; // Store as parsed object
      } else {
        jsonObj = attachment.content;
      }
      
      metadata.size = new Blob([JSON.stringify(jsonObj)]).size;
      metadata.format = 'application/json';
      metadata.schema = this.inferJsonSchema(jsonObj);
      
    } catch (error) {
      metadata.format = 'invalid-json';
      metadata.description = `JSON parsing error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private processTableAttachment(attachment: Attachment): void {
    if (typeof attachment.content === 'string') {
      const metadata = attachment.metadata!;
      const lines = attachment.content.trim().split('\n');
      
      metadata.lineCount = lines.length;
      metadata.size = new Blob([attachment.content]).size;
      
      // Detect delimiter
      const firstLine = lines[0] || '';
      if (firstLine.includes('\t')) {
        metadata.format = 'tsv';
      } else if (firstLine.includes(',')) {
        metadata.format = 'csv';
      } else {
        metadata.format = 'table';
      }
    }
  }

  private processDiagramAttachment(attachment: Attachment): void {
    if (typeof attachment.content === 'string') {
      const metadata = attachment.metadata!;
      
      metadata.lineCount = attachment.content.split('\n').length;
      metadata.size = new Blob([attachment.content]).size;
      metadata.format = 'ascii';
      
      // Detect diagram type based on content
      const content = attachment.content.toLowerCase();
      if (content.includes('┌') || content.includes('└') || content.includes('├')) {
        metadata.description = 'ASCII box diagram';
      } else if (content.includes('->') || content.includes('=>')) {
        metadata.description = 'ASCII flow diagram';
      } else {
        metadata.description = 'ASCII diagram';
      }
    }
  }

  private processFileAttachment(attachment: Attachment): void {
    if (typeof attachment.content === 'string') {
      const metadata = attachment.metadata!;
      
      // Assume content is file path or file reference
      const parts = attachment.content.split('.');
      const extension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
      
      metadata.format = extension;
      metadata.size = 0; // Would need file system access to get actual size
    }
  }

  private processUrlAttachment(attachment: Attachment): void {
    if (typeof attachment.content === 'string') {
      const metadata = attachment.metadata!;
      
      try {
        const url = new URL(attachment.content);
        metadata.format = url.protocol;
        metadata.description = `${url.hostname} resource`;
      } catch {
        metadata.format = 'invalid-url';
        metadata.description = 'Invalid URL format';
      }
    }
  }

  private processTextAttachment(attachment: Attachment): void {
    if (typeof attachment.content === 'string') {
      const metadata = attachment.metadata!;
      
      metadata.lineCount = attachment.content.split('\n').length;
      metadata.size = new Blob([attachment.content]).size;
      metadata.encoding = 'utf-8';
      
      if (attachment.type === 'markdown') {
        metadata.format = 'text/markdown';
      } else if (attachment.type === 'yaml') {
        metadata.format = 'application/yaml';
      } else if (attachment.type === 'xml') {
        metadata.format = 'application/xml';
      } else {
        metadata.format = 'text/plain';
      }
    }
  }

  private detectCodeLanguage(code: string): string {
    const languagePatterns = [
      { lang: 'javascript', patterns: [/function\s+\w+/, /const\s+\w+\s*=/, /import\s+.*from/, /=>\s*{?/] },
      { lang: 'typescript', patterns: [/interface\s+\w+/, /type\s+\w+\s*=/, /:\s*string/, /:\s*number/] },
      { lang: 'python', patterns: [/def\s+\w+\(/, /import\s+\w+/, /from\s+\w+\s+import/, /if\s+__name__\s*==\s*['""]__main__['""]:/] },
      { lang: 'java', patterns: [/public\s+class/, /public\s+static\s+void/, /System\.out\.println/] },
      { lang: 'cpp', patterns: [/#include\s*</, /std::/, /cout\s*<</, /int\s+main\s*\(/] },
      { lang: 'rust', patterns: [/fn\s+\w+/, /let\s+mut/, /use\s+std::/, /println!/] },
      { lang: 'go', patterns: [/package\s+\w+/, /func\s+\w+/, /import\s*\(/, /fmt\./] },
      { lang: 'sql', patterns: [/SELECT\s+.*FROM/i, /INSERT\s+INTO/i, /UPDATE\s+.*SET/i, /CREATE\s+TABLE/i] },
      { lang: 'json', patterns: [/^\s*[{[]/, /"[\w-]+":\s*["{[]/, /},?\s*$/] },
      { lang: 'yaml', patterns: [/^\s*[\w-]+:\s*/, /^---/, /^\s*-\s+/] }
    ];

    for (const { lang, patterns } of languagePatterns) {
      const matchCount = patterns.filter((pattern: RegExp) => pattern.test(code)).length;
      if (matchCount >= Math.ceil(patterns.length / 2)) {
        return lang;
      }
    }

    return 'text';
  }

  private calculateCodeComplexity(code: string): number {
    // Simple complexity scoring based on various factors
    let complexity = 0;
    
    // Control structures
    const controlPatterns = [
      /\bif\b/gi, /\belse\b/gi, /\bfor\b/gi, /\bwhile\b/gi, 
      /\bswitch\b/gi, /\btry\b/gi, /\bcatch\b/gi
    ];
    
    controlPatterns.forEach(pattern => {
      const matches = code.match(pattern);
      complexity += matches ? matches.length * 2 : 0;
    });
    
    // Functions/methods
    const functionPatterns = [/function\s+\w+/gi, /def\s+\w+/gi, /\w+\s*\(/gi];
    functionPatterns.forEach(pattern => {
      const matches = code.match(pattern);
      complexity += matches ? matches.length : 0;
    });
    
    // Nesting (approximated by indentation)
    const lines = code.split('\n');
    let maxIndent = 0;
    lines.forEach(line => {
      const indent = line.length - line.trimLeft().length;
      maxIndent = Math.max(maxIndent, indent);
    });
    complexity += Math.floor(maxIndent / 2);
    
    return Math.min(complexity, 100); // Cap at 100
  }

  private inferJsonSchema(obj: any): string {
    const getType = (value: any): string => {
      if (value === null) return 'null';
      if (Array.isArray(value)) return 'array';
      return typeof value;
    };

    const buildSchema = (value: any): any => {
      if (Array.isArray(value)) {
        return {
          type: 'array',
          items: value.length > 0 ? buildSchema(value[0]) : { type: 'any' }
        };
      } else if (value !== null && typeof value === 'object') {
        const properties: any = {};
        Object.keys(value).forEach(key => {
          properties[key] = buildSchema(value[key]);
        });
        return {
          type: 'object',
          properties
        };
      } else {
        return { type: getType(value) };
      }
    };

    return JSON.stringify(buildSchema(obj), null, 2);
  }

  private isEvidentialAttachment(attachment: Attachment): boolean {
    // Attachments that provide supporting evidence
    const evidentialTypes = ['code', 'diagram', 'json', 'table', 'image'];
    return evidentialTypes.includes(attachment.type);
  }

  private enhanceConfidenceWithAttachment(thought: ThoughtData, attachment: Attachment): void {
    // Boost confidence slightly if attachment provides evidence
    if (thought.confidence !== undefined) {
      const boost = 0.05; // 5% confidence boost
      thought.confidence = Math.min(1.0, thought.confidence + boost);
    }
  }

  private analyzeAttachmentTypes(attachments: Attachment[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    attachments.forEach(att => {
      distribution[att.type] = (distribution[att.type] || 0) + 1;
    });
    return distribution;
  }

  private analyzeLanguageDistribution(attachments: Attachment[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    attachments
      .filter(att => att.type === 'code' && att.metadata?.language)
      .forEach(att => {
        const lang = att.metadata!.language!;
        distribution[lang] = (distribution[lang] || 0) + 1;
      });
    return distribution;
  }

  private generateContentPreview(attachment: Attachment): string {
    const maxLength = 150;
    
    if (typeof attachment.content === 'string') {
      if (attachment.content.length <= maxLength) {
        return attachment.content;
      }
      return attachment.content.substring(0, maxLength) + '...';
    } else {
      const jsonStr = JSON.stringify(attachment.content, null, 2);
      if (jsonStr.length <= maxLength) {
        return jsonStr;
      }
      return jsonStr.substring(0, maxLength) + '...';
    }
  }

  private searchWithText(query: string, attachment: Attachment): number {
    const searchTerm = query.toLowerCase();
    let score = 0;
    
    // Search in name (highest weight)
    if (attachment.name.toLowerCase().includes(searchTerm)) {
      score += 10;
    }
    
    // Search in content
    const content = typeof attachment.content === 'string' 
      ? attachment.content 
      : JSON.stringify(attachment.content);
    
    if (content.toLowerCase().includes(searchTerm)) {
      score += 5;
    }
    
    // Search in metadata
    if (attachment.metadata?.description?.toLowerCase().includes(searchTerm)) {
      score += 3;
    }
    
    if (attachment.metadata?.language?.toLowerCase().includes(searchTerm)) {
      score += 2;
    }
    
    return score;
  }

  private searchWithRegex(query: string, attachment: Attachment): number {
    try {
      const regex = new RegExp(query, 'gi');
      let score = 0;
      
      // Search in name
      if (regex.test(attachment.name)) {
        score += 10;
      }
      
      // Search in content
      const content = typeof attachment.content === 'string' 
        ? attachment.content 
        : JSON.stringify(attachment.content);
      
      const matches = content.match(regex);
      if (matches) {
        score += matches.length;
      }
      
      return score;
    } catch {
      // Invalid regex, fall back to text search
      return this.searchWithText(query, attachment);
    }
  }

  private analyzeSearchResults(results: Array<{ attachment: Attachment; relevanceScore: number }>, query: string): any {
    const typeDistribution = this.analyzeAttachmentTypes(results.map(r => r.attachment));
    const avgRelevance = results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length;
    
    return {
      query,
      averageRelevance: avgRelevance,
      typeDistribution,
      highRelevanceCount: results.filter(r => r.relevanceScore >= 10).length
    };
  }

  // Pattern learning methods
  public extractPatterns(minConfidence: number = 0.7, requireCompletion: boolean = true): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    if (this.thoughtHistory.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "No thoughts available for pattern extraction",
            suggestion: "Complete at least one reasoning session before extracting patterns"
          }, null, 2)
        }],
        isError: true
      };
    }

    try {
      // Analyze current session for extraction
      const analysisResult = this.analyzeSessionForPatternExtraction(minConfidence, requireCompletion);
      
      if (!analysisResult.extractable) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              sessionAnalysis: analysisResult,
              message: "Session does not meet criteria for pattern extraction",
              requirements: {
                minConfidence: minConfidence,
                requireCompletion: requireCompletion,
                minThoughts: 3
              }
            }, null, 2)
          }]
        };
      }

      // Extract pattern from session
      const extractedPattern = this.createPatternFromSession(analysisResult);
      
      // Store pattern in library
      this.patternLibrary.addPattern(extractedPattern);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            extractedPattern: {
              id: extractedPattern.id,
              name: extractedPattern.name,
              description: extractedPattern.description,
              domain: extractedPattern.domain,
              approach: extractedPattern.approach,
              complexity: extractedPattern.problemContext.complexity,
              thoughtSequence: extractedPattern.thoughtSequence,
              successMetrics: extractedPattern.successMetrics
            },
            sessionAnalysis: analysisResult,
            message: "Pattern successfully extracted and stored in library"
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Failed to extract pattern",
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public getPatternRecommendations(context?: {
    domains?: string[];
    approach?: string;
    keywords?: string[];
    complexity?: 'low' | 'medium' | 'high';
    problemType?: string[];
  }): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      // If no context provided, analyze current session
      const searchContext = context || this.analyzeCurrentSessionContext();
      
      // Find matching patterns
      const matches = this.patternLibrary.findSimilarPatterns(searchContext);
      
      // Enhanced filtering: reject cross-domain patterns completely
      const filteredMatches = matches.filter(match => {
        // Check for severe domain mismatch (e.g., technical vs creative)
        const contextDomains = searchContext.domains || [];
        const patternDomains = match.pattern.domain || [];
        
        const incompatiblePairs = [
          ['creative', 'technical'],
          ['creative', 'analytical'], 
          ['personal', 'technical'],
          ['emotional', 'technical']
        ];
        
        const hasIncompatibleDomain = incompatiblePairs.some(([a, b]) => 
          (contextDomains.includes(a) && patternDomains.includes(b)) ||
          (contextDomains.includes(b) && patternDomains.includes(a))
        );
        
        // Reject if confidence too low OR incompatible domains
        return match.confidence >= 0.15 && !hasIncompatibleDomain;
      });

      if (filteredMatches.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              context: searchContext,
              totalPatterns: matches.length,
              matches: [],
              status: "no_suitable_patterns",
              message: "No suitable patterns found that meet minimum quality thresholds.",
              reasons: [
                `Found ${matches.length} potential patterns, but all were rejected`,
                "Patterns scored below 15% confidence threshold or had incompatible domains", 
                "Cross-domain pattern recommendations are disabled for quality control"
              ],
              suggestions: [
                "Start reasoning without a template - this appears to be a unique problem type",
                "Focus on building evidence and structured analysis",
                "Consider if this problem truly fits into existing reasoning patterns",
                "Complete this session successfully to potentially create a new pattern"
              ],
              recommendation: "Proceed with original thinking rather than forcing incompatible patterns"
            }, null, 2)
          }]
        };
      }

      // Use filtered matches for recommendations
      const finalMatches = filteredMatches;

      // Format recommendations
      const recommendations = finalMatches.slice(0, 5).map(match => ({
        pattern: {
          id: match.pattern.id,
          name: match.pattern.name,
          description: match.pattern.description,
          approach: match.pattern.approach,
          domain: match.pattern.domain,
          complexity: match.pattern.problemContext.complexity,
          successRate: Math.round(match.pattern.successMetrics.averageConfidence * match.pattern.successMetrics.completionRate * 100) / 100
        },
        matchConfidence: Math.round(match.confidence * 100) / 100,
        applicabilityScore: Math.round(match.applicabilityScore * 100) / 100,
        matchReasons: match.matchReasons,
        adaptationSuggestions: match.adaptationSuggestions,
        thoughtSequence: match.pattern.thoughtSequence.map(step => ({
          stepType: step.stepType,
          description: step.description,
          expectedConfidence: step.expectedConfidence,
          keyTags: step.keyTags
        }))
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            context: searchContext,
            totalPatterns: finalMatches.length,
            topRecommendations: recommendations,
            usageInstructions: {
              howToApply: "Use the thought sequence as a template for your reasoning process",
              adaptationGuidance: "Follow the adaptation suggestions for your specific context",
              confidenceTargets: "Aim for the expected confidence levels at each step"
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Failed to get pattern recommendations",
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public searchPatterns(query: {
    text?: string;
    domains?: string[];
    approaches?: string[];
    minConfidence?: number;
    minUsage?: number;
    complexity?: 'low' | 'medium' | 'high';
  }): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const patterns = this.patternLibrary.searchPatterns(query);
      
      const results = patterns.map(pattern => ({
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        domain: pattern.domain,
        approach: pattern.approach,
        complexity: pattern.problemContext.complexity,
        successMetrics: {
          averageConfidence: Math.round(pattern.successMetrics.averageConfidence * 100) / 100,
          completionRate: Math.round(pattern.successMetrics.completionRate * 100) / 100,
          usageCount: pattern.successMetrics.usageCount,
          lastUsed: pattern.successMetrics.lastUsed
        },
        thoughtSequence: pattern.thoughtSequence.length,
        created: pattern.created,
        updated: pattern.updated
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            totalResults: results.length,
            patterns: results,
            summary: {
              domains: [...new Set(patterns.flatMap(p => p.domain))].slice(0, 10),
              approaches: [...new Set(patterns.map(p => p.approach))].slice(0, 10),
              complexityDistribution: this.calculateComplexityDistribution(patterns),
              avgSuccessRate: patterns.length > 0 ? Math.round(patterns.reduce((sum, p) => 
                sum + (p.successMetrics.averageConfidence * p.successMetrics.completionRate), 0) / patterns.length * 100) / 100 : 0
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Failed to search patterns",
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private analyzeSessionForPatternExtraction(minConfidence: number, requireCompletion: boolean): PatternExtractionContext & { extractable: boolean } {
    // Get current session thoughts only - detect session boundaries
    const currentSessionThoughts = this.getCurrentSessionThoughts();
    
    const thoughtsWithConfidence = currentSessionThoughts.filter(t => t.confidence !== undefined);
    const averageConfidence = thoughtsWithConfidence.length > 0 
      ? thoughtsWithConfidence.reduce((sum, t) => sum + (t.confidence || 0), 0) / thoughtsWithConfidence.length 
      : 0;

    const sessionTags = new Set<string>();
    currentSessionThoughts.forEach(t => t.tags?.forEach(tag => sessionTags.add(tag)));
    
    const domains = this.extractDomains([...sessionTags]);
    const approaches = this.extractApproachesFromThoughts(currentSessionThoughts);
    const successFactors = this.extractSuccessFactorsFromThoughts(currentSessionThoughts);
    const challenges = this.extractChallengesFromThoughts(currentSessionThoughts);
    
    const completionStatus = this.determineCompletionStatusFromThoughts(currentSessionThoughts);
    
    const extractable = currentSessionThoughts.length >= 3 && 
      averageConfidence >= minConfidence &&
      (!requireCompletion || completionStatus === 'complete') &&
      domains.length > 0;

    return {
      sessionId: `session-${Date.now()}`,
      totalThoughts: currentSessionThoughts.length,
      averageConfidence,
      completionStatus,
      domains,
      approaches,
      successFactors,
      challenges,
      extractable
    };
  }

  private createPatternFromSession(context: PatternExtractionContext): ReasoningPattern {
    const patternId = `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    // Analyze thought sequence to create pattern steps
    const thoughtSequence = this.analyzeThoughtSequenceForPattern();
    
    // Determine problem complexity
    const complexity = this.determineComplexity();
    
    // Extract keywords from thought content
    const keywords = this.extractKeywords();
    
    // Create pattern name from primary domain and approach
    const primaryDomain = context.domains[0] || 'general';
    const primaryApproach = context.approaches[0] || 'systematic-analysis';
    const patternName = `${primaryDomain}-${primaryApproach}-pattern`;

    return {
      id: patternId,
      name: patternName,
      description: `Extracted pattern for ${primaryDomain} problems using ${primaryApproach} approach`,
      domain: context.domains,
      approach: primaryApproach,
      problemContext: {
        complexity,
        type: context.domains,
        keywords,
        characteristics: context.successFactors
      },
      successMetrics: {
        averageConfidence: context.averageConfidence,
        completionRate: context.completionStatus === 'complete' ? 1.0 : 0.5,
        evidenceQuality: this.calculateEvidenceQuality(),
        usageCount: 1,
        lastUsed: now
      },
      thoughtSequence,
      adaptationGuidance: this.generateAdaptationGuidance(context),
      variations: [],
      created: now,
      updated: now
    };
  }

  private getCurrentSessionThoughts(): ThoughtData[] {
    if (this.thoughtHistory.length === 0) return [];
    
    // Session boundary detection logic:
    // 1. Find the most recent thought that starts a new reasoning chain (thought number 1)
    // 2. Include all thoughts from that point forward
    const reversedHistory = [...this.thoughtHistory].reverse();
    const lastSessionStartIndex = reversedHistory.findIndex(thought => thought.thoughtNumber === 1);
    
    if (lastSessionStartIndex === -1) {
      // No session boundary found, return all thoughts (fallback)
      return this.thoughtHistory;
    }
    
    // Return thoughts from the last session start to the end
    const sessionStartIndex = this.thoughtHistory.length - 1 - lastSessionStartIndex;
    return this.thoughtHistory.slice(sessionStartIndex);
  }

  private extractApproachesFromThoughts(thoughts: ThoughtData[]): string[] {
    const approaches = new Set<string>();
    
    thoughts.forEach(thought => {
      if (thought.tags?.includes('systematic') || thought.thought.includes('systematic')) {
        approaches.add('systematic-decomposition');
      }
      if (thought.evidence && thought.evidence.length > 0) {
        approaches.add('evidence-based');
      }
      if (thought.tags?.includes('creative')) {
        approaches.add('creative-exploration');
      }
      if (thought.assumptions && thought.assumptions.length > 0) {
        approaches.add('risk-assessment');
      }
    });
    
    return Array.from(approaches);
  }

  private extractSuccessFactorsFromThoughts(thoughts: ThoughtData[]): string[] {
    const factors = new Set<string>();
    const avgConfidence = thoughts.reduce((sum, t) => sum + (t.confidence || 0), 0) / thoughts.length;
    
    if (avgConfidence >= 0.8) factors.add('high-confidence-reasoning');
    if (thoughts.some(t => t.evidence && t.evidence.length >= 2)) factors.add('evidence-backed-reasoning');
    if (thoughts.some(t => t.references && t.references.length > 0)) factors.add('connected-reasoning');
    if (thoughts.some(t => t.assumptions && t.assumptions.length > 0)) factors.add('assumption-awareness');
    
    return Array.from(factors);
  }

  private extractChallengesFromThoughts(thoughts: ThoughtData[]): string[] {
    const challenges = new Set<string>();
    
    if (thoughts.some(t => (t.confidence || 0) < 0.5)) challenges.add('uncertainty-management');
    if (thoughts.some(t => t.assumptions && t.assumptions.length >= 3)) challenges.add('assumption-complexity');
    
    return Array.from(challenges);
  }

  private determineCompletionStatusFromThoughts(thoughts: ThoughtData[]): 'complete' | 'partial' | 'abandoned' {
    if (thoughts.length === 0) return 'abandoned';
    
    const lastThought = thoughts[thoughts.length - 1];
    if (lastThought.nextThoughtNeeded === false) return 'complete';
    
    const avgConfidence = thoughts.reduce((sum, t) => sum + (t.confidence || 0), 0) / thoughts.length;
    if (avgConfidence < 0.3) return 'abandoned';
    
    return 'partial';
  }

  private analyzeCurrentSessionContext(): {
    domains?: string[];
    approach?: string;
    keywords?: string[];
    complexity?: 'low' | 'medium' | 'high';
    problemType?: string[];
  } {
    if (this.thoughtHistory.length === 0) {
      return {};
    }

    const currentSessionThoughts = this.getCurrentSessionThoughts();
    const allTags = new Set<string>();
    currentSessionThoughts.forEach(t => t.tags?.forEach(tag => allTags.add(tag)));
    
    const domains = this.extractDomains([...allTags]);
    const keywords = this.extractKeywords();
    const complexity = this.determineComplexity();
    const approaches = this.extractApproaches();

    return {
      domains,
      approach: approaches[0],
      keywords,
      complexity,
      problemType: domains
    };
  }

  private extractDomains(tags: string[]): string[] {
    const domainKeywords = {
      'technical': ['code', 'programming', 'software', 'system', 'architecture', 'development', 'debugging', 'algorithm', 'database', 'api'],
      'research': ['analysis', 'investigation', 'study', 'research', 'data', 'hypothesis'],
      'strategy': ['planning', 'strategy', 'decision', 'business', 'goals', 'objectives'],
      'design': ['design', 'ui', 'ux', 'interface', 'user', 'experience'],
      'creative': ['creative', 'writing', 'artistic', 'poetry', 'storytelling', 'imagination', 'inspiration', 'art', 'literature', 'narrative', 'character', 'plot', 'theme'],
      'personal': ['personal', 'emotional', 'feelings', 'relationships', 'therapy', 'self', 'growth', 'mindfulness'],
      'problem-solving': ['troubleshooting', 'debugging-issues', 'systematic-problem-solving', 'root-cause', 'fix-implementation'],
      'evaluation': ['evaluation', 'assessment', 'review', 'comparison', 'criteria']
    };

    const domains = new Set<string>();
    
    // Check tags against domain keywords
    tags.forEach(tag => {
      const lowerTag = tag.toLowerCase();
      Object.entries(domainKeywords).forEach(([domain, keywords]) => {
        if (keywords.some(keyword => lowerTag.includes(keyword) || keyword.includes(lowerTag))) {
          domains.add(domain);
        }
      });
    });

    // Also check thought content for domain indicators
    const thoughtContent = this.thoughtHistory.map(t => t.thought.toLowerCase()).join(' ');
    Object.entries(domainKeywords).forEach(([domain, keywords]) => {
      const matchCount = keywords.reduce((count, keyword) => {
        return count + (thoughtContent.split(keyword).length - 1);
      }, 0);
      if (matchCount >= 4) {
        domains.add(domain);
      }
    });

    return Array.from(domains);
  }

  private extractApproaches(): string[] {
    const approachPatterns = {
      'systematic-decomposition': ['break down', 'decompose', 'divide', 'step by step', 'systematic'],
      'iterative-refinement': ['iterate', 'refine', 'improve', 'revise', 'iteration'],
      'evidence-based': ['evidence', 'data', 'proof', 'validate', 'verify'],
      'comparative-analysis': ['compare', 'contrast', 'versus', 'alternative', 'option'],
      'risk-assessment': ['risk', 'threat', 'vulnerability', 'mitigation', 'safety'],
      'creative-exploration': ['creative', 'brainstorm', 'innovative', 'explore', 'idea']
    };

    const currentSessionThoughts = this.getCurrentSessionThoughts();
    const thoughtContent = currentSessionThoughts.map(t => t.thought.toLowerCase()).join(' ');
    const approaches: Array<{name: string, score: number}> = [];

    Object.entries(approachPatterns).forEach(([approach, patterns]) => {
      let score = 0;
      patterns.forEach(pattern => {
        const matches = thoughtContent.split(pattern).length - 1;
        score += matches;
      });
      if (score > 0) {
        approaches.push({name: approach, score});
      }
    });

    return approaches.sort((a, b) => b.score - a.score).map(a => a.name);
  }

  private extractSuccessFactors(): string[] {
    const factors = [];
    
    // High confidence thoughts indicate successful reasoning
    const highConfidenceThoughts = this.thoughtHistory.filter(t => (t.confidence || 0) >= 0.8);
    if (highConfidenceThoughts.length > 0) {
      factors.push('high-confidence-reasoning');
    }
    
    // Evidence usage indicates rigorous thinking
    const evidenceCount = this.thoughtHistory.reduce((sum, t) => sum + (t.evidence?.length || 0), 0);
    if (evidenceCount > 0) {
      factors.push('evidence-backed-reasoning');
    }
    
    // Reference patterns indicate connected thinking
    const referenceCount = this.thoughtHistory.reduce((sum, t) => sum + (t.references?.length || 0), 0);
    if (referenceCount > 0) {
      factors.push('connected-reasoning');
    }
    
    // Assumption tracking indicates careful thinking
    const assumptionCount = this.thoughtHistory.reduce((sum, t) => sum + (t.assumptions?.length || 0), 0);
    if (assumptionCount > 0) {
      factors.push('assumption-awareness');
    }

    return factors;
  }

  private extractChallenges(): string[] {
    const challenges = [];
    
    // Low confidence areas
    const lowConfidenceThoughts = this.thoughtHistory.filter(t => (t.confidence || 1) < 0.5);
    if (lowConfidenceThoughts.length > 0) {
      challenges.push('uncertainty-management');
    }
    
    // Revision patterns indicate difficulty
    const revisions = this.thoughtHistory.filter(t => t.isRevision);
    if (revisions.length > 0) {
      challenges.push('iterative-refinement-needed');
    }
    
    // Branching indicates complexity
    const branches = Object.keys(this.branches);
    if (branches.length > 0) {
      challenges.push('complex-decision-space');
    }

    return challenges;
  }

  private determineCompletionStatus(): 'complete' | 'partial' | 'abandoned' {
    if (this.thoughtHistory.length === 0) return 'abandoned';
    
    const lastThought = this.thoughtHistory[this.thoughtHistory.length - 1];
    
    // Check if explicitly marked as complete
    if (!lastThought.nextThoughtNeeded && (lastThought.confidence || 0) >= 0.7) {
      return 'complete';
    }
    
    // Check for abandonment indicators
    if (lastThought.nextThoughtNeeded && this.thoughtHistory.length < 3) {
      return 'abandoned';
    }
    
    return 'partial';
  }

  private analyzeThoughtSequenceForPattern(): PatternStep[] {
    const steps: PatternStep[] = [];
    const currentSessionThoughts = this.getCurrentSessionThoughts();
    
    currentSessionThoughts.forEach((thought, index) => {
      const stepType = this.determineStepType(thought, index);
      const tags = thought.tags || [];
      const confidence = thought.confidence || 0.5;
      
      const step: PatternStep = {
        stepType,
        description: this.extractStepDescription(thought, stepType),
        expectedConfidence: confidence,
        keyTags: tags,
        evidenceRequirements: thought.evidence || [],
        commonPitfalls: this.identifyCommonPitfalls(thought, stepType)
      };
      
      steps.push(step);
    });

    return this.consolidatePatternSteps(steps);
  }

  private determineStepType(thought: ThoughtData, index: number): PatternStep['stepType'] {
    const content = thought.thought.toLowerCase();
    const tags = (thought.tags || []).map(t => t.toLowerCase());
    
    if (tags.includes('analysis') || content.includes('analyze') || content.includes('examine')) {
      return 'analysis';
    }
    if (tags.includes('decomposition') || content.includes('break down') || content.includes('divide')) {
      return 'decomposition';  
    }
    if (tags.includes('validation') || content.includes('validate') || content.includes('verify')) {
      return 'validation';
    }
    if (tags.includes('synthesis') || content.includes('synthesize') || content.includes('combine')) {
      return 'synthesis';
    }
    if (tags.includes('decision') || content.includes('decide') || content.includes('choose')) {
      return 'decision';
    }
    
    return 'exploration';
  }

  private extractStepDescription(thought: ThoughtData, stepType: PatternStep['stepType']): string {
    const templates = {
      'analysis': 'Analyze key components and relationships',
      'decomposition': 'Break down complex problems into manageable parts',
      'validation': 'Verify assumptions and validate approaches',
      'synthesis': 'Combine insights to form comprehensive understanding',
      'decision': 'Make informed decisions based on analysis',
      'exploration': 'Explore possibilities and gather information'
    };
    
    // Try to extract more specific description from thought content
    const sentences = thought.thought.split(/[.!?]/).filter(s => s.length > 10);
    if (sentences.length > 0) {
      const firstSentence = sentences[0].trim();
      if (firstSentence.length < 100) {
        return firstSentence;
      }
    }
    
    return templates[stepType];
  }

  private identifyCommonPitfalls(thought: ThoughtData, stepType: PatternStep['stepType']): string[] {
    const pitfalls: Record<PatternStep['stepType'], string[]> = {
      'analysis': ['Surface-level analysis', 'Missing key relationships', 'Confirmation bias'],
      'decomposition': ['Over-decomposition', 'Missing dependencies', 'Losing sight of whole'],
      'validation': ['Insufficient evidence', 'Biased validation', 'Ignoring edge cases'],
      'synthesis': ['Premature synthesis', 'Conflicting information ignored', 'Oversimplification'],
      'decision': ['Analysis paralysis', 'Insufficient alternatives', 'Ignoring constraints'],
      'exploration': ['Lack of direction', 'Information overload', 'Missing opportunities']
    };
    
    return pitfalls[stepType] || [];
  }

  private consolidatePatternSteps(steps: PatternStep[]): PatternStep[] {
    // Merge consecutive similar steps to avoid redundancy
    const consolidated: PatternStep[] = [];
    let currentStep: PatternStep | null = null;
    
    steps.forEach(step => {
      if (!currentStep || currentStep.stepType !== step.stepType) {
        if (currentStep) {
          consolidated.push(currentStep);
        }
        currentStep = { ...step };
      } else {
        // Merge with current step
        currentStep.expectedConfidence = (currentStep.expectedConfidence + step.expectedConfidence) / 2;
        currentStep.keyTags = [...new Set([...currentStep.keyTags, ...step.keyTags])];
        currentStep.evidenceRequirements = [...new Set([...currentStep.evidenceRequirements, ...step.evidenceRequirements])];
        currentStep.commonPitfalls = [...new Set([...currentStep.commonPitfalls, ...step.commonPitfalls])];
      }
    });
    
    if (currentStep) {
      consolidated.push(currentStep);
    }
    
    return consolidated;
  }

  private determineComplexity(): 'low' | 'medium' | 'high' {
    const currentSessionThoughts = this.getCurrentSessionThoughts();
    const thoughtCount = currentSessionThoughts.length;
    const branchCount = Object.keys(this.branches).length;
    const revisionCount = currentSessionThoughts.filter(t => t.isRevision).length;
    const avgConfidence = currentSessionThoughts.filter(t => t.confidence !== undefined)
      .reduce((sum, t) => sum + (t.confidence || 0), 0) / Math.max(1, currentSessionThoughts.length);
    
    let complexityScore = 0;
    
    if (thoughtCount > 10) complexityScore += 2;
    else if (thoughtCount > 5) complexityScore += 1;
    
    if (branchCount > 2) complexityScore += 2;
    else if (branchCount > 0) complexityScore += 1;
    
    if (revisionCount > 3) complexityScore += 2;
    else if (revisionCount > 1) complexityScore += 1;
    
    if (avgConfidence < 0.6) complexityScore += 1;
    
    if (complexityScore >= 5) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  private extractKeywords(): string[] {
    const currentSessionThoughts = this.getCurrentSessionThoughts();
    const allText = currentSessionThoughts.map(t => t.thought).join(' ').toLowerCase();
    const words = allText.match(/\b\w{4,}\b/g) || [];
    
    // Count word frequencies
    const frequencies = new Map<string, number>();
    words.forEach(word => {
      frequencies.set(word, (frequencies.get(word) || 0) + 1);
    });
    
    // Filter out common words and return most frequent
    const commonWords = new Set(['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'their', 'said', 'each', 'which', 'what', 'were', 'when', 'where']);
    
    return Array.from(frequencies.entries())
      .filter(([word, freq]) => freq > 1 && !commonWords.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private calculateEvidenceQuality(): number {
    const thoughtsWithEvidence = this.thoughtHistory.filter(t => t.evidence && t.evidence.length > 0);
    if (thoughtsWithEvidence.length === 0) return 0.3;
    
    const avgEvidencePerThought = thoughtsWithEvidence.reduce((sum, t) => sum + (t.evidence?.length || 0), 0) / thoughtsWithEvidence.length;
    
    // Normalize to 0-1 scale
    return Math.min(avgEvidencePerThought / 3, 1);
  }

  private generateAdaptationGuidance(context: PatternExtractionContext): string {
    const guidance = [];
    
    guidance.push(`This pattern works best for ${context.domains.join(', ')} problems`);
    
    if (context.successFactors.length > 0) {
      guidance.push(`Key success factors: ${context.successFactors.join(', ')}`);
    }
    
    if (context.challenges.length > 0) {
      guidance.push(`Common challenges: ${context.challenges.join(', ')}`);
    }
    
    guidance.push(`Adapt the confidence thresholds based on your specific context and risk tolerance`);
    
    return guidance.join('. ') + '.';
  }

  private calculateComplexityDistribution(patterns: ReasoningPattern[]): Record<string, number> {
    const distribution = { low: 0, medium: 0, high: 0 };
    patterns.forEach(p => {
      distribution[p.problemContext.complexity]++;
    });
    return distribution;
  }
}

const SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "sequentialthinking",
  description: `A detailed tool for dynamic and reflective problem-solving through thoughts with confidence and evidence tracking.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Reference previous thoughts by number to build connections
- Tag thoughts for easy categorization and retrieval
- Search and filter thoughts by content or tags
- Find related thoughts through references, branches, and tags
- Track confidence levels to identify uncertain reasoning
- Document evidence supporting each thought
- Record assumptions that underlie your reasoning
- Analyze reasoning quality and identify weak chains
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed
- references: Array of thought numbers that this thought builds upon or references
- tags: Array of strings for categorizing and organizing this thought
- confidence: (Optional) Your confidence level in this thought (0.0 = very uncertain, 1.0 = very confident)
- evidence: (Optional) Array of strings describing evidence that supports this thought
- assumptions: (Optional) Array of strings describing key assumptions this thought relies on

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty by providing lower confidence scores
5. Document evidence supporting your reasoning when available
6. Identify and record key assumptions you're making
7. Mark thoughts that revise previous thinking or branch into new paths
8. Ignore information that is irrelevant to the current step
9. Generate a solution hypothesis when appropriate
10. Verify the hypothesis based on the Chain of Thought steps
11. Repeat the process until satisfied with the solution
12. Provide a single, ideally correct answer as the final output
13. Only set next_thought_needed to false when truly done and a satisfactory answer is reached
14. Use confidence tracking to identify areas that need more evidence or analysis`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current thinking step"
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought step is needed"
      },
      thoughtNumber: {
        type: "integer",
        description: "Current thought number (numeric value, e.g., 1, 2, 3)",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total thoughts needed (numeric value, e.g., 5, 10)",
        minimum: 1
      },
      isRevision: {
        type: "boolean",
        description: "Whether this revises previous thinking"
      },
      revisesThought: {
        type: "integer",
        description: "Which thought is being reconsidered",
        minimum: 1
      },
      branchFromThought: {
        type: "integer",
        description: "Branching point thought number",
        minimum: 1
      },
      branchId: {
        type: "string",
        description: "Branch identifier"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more thoughts are needed"
      },
      references: {
        type: "array",
        items: {
          type: "integer",
          minimum: 1
        },
        description: "Array of thought numbers that this thought builds upon or references"
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of tags for categorizing and organizing this thought"
      },
      confidence: {
        type: "number",
        description: "Confidence level in this thought (0.0 = very uncertain, 1.0 = very confident)",
        minimum: 0,
        maximum: 1
      },
      evidence: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of strings describing evidence that supports this thought"
      },
      assumptions: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of strings describing key assumptions this thought relies on"
      }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

const GET_THOUGHT_TOOL: Tool = {
  name: "getThought",
  description: "Retrieve a specific thought by its number",
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: {
        type: "integer",
        minimum: 1,
        description: "The thought number to retrieve"
      }
    },
    required: ["thoughtNumber"]
  }
};

const SEARCH_THOUGHTS_TOOL: Tool = {
  name: "searchThoughts",
  description: "Search thoughts by content and/or tags",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query to match against thought content (empty string searches all)"
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of tags to filter by (thoughts must have all specified tags)"
      }
    },
    required: ["query"]
  }
};

const GET_RELATED_THOUGHTS_TOOL: Tool = {
  name: "getRelatedThoughts",
  description: "Find all thoughts related to a specific thought through references, branches, or shared tags",
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: {
        type: "integer",
        minimum: 1,
        description: "The thought number to find related thoughts for"
      }
    },
    required: ["thoughtNumber"]
  }
};

const SYNTHESIZE_THOUGHTS_TOOL: Tool = {
  name: "synthesizeThoughts",
  description: `Analyzes and synthesizes the complete thought history to generate structured insights.

This tool provides a comprehensive analysis of the thinking process, extracting:
- Key decisions made and their rationale
- Main assumptions identified with confidence levels
- Risk areas or low-confidence thoughts that need attention
- Action items or next steps with priorities
- Alternative approaches considered with pros/cons
- Overall confidence assessment of the reasoning process

Use this tool when:
- You want to summarize and understand what was decided during thinking
- You need to identify potential risks or areas of uncertainty
- You want to extract actionable next steps from the thought process
- You need to assess the quality and completeness of reasoning
- You want to review alternative approaches that were considered
- You need structured insights for documentation or decision-making

The synthesis works with both simple linear thought chains and complex branching reasoning.
It automatically identifies patterns in the thinking process and provides structured output
with confidence levels and priority assessments.

No parameters are required - it analyzes all thoughts in the current session.`,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
};

const AUTO_THINK_TOOL: Tool = {
  name: "auto_think",
  description: `Autonomous thought generation using MCP sampling or rule-based fallback to drive the thinking process forward.

This tool operates in two modes:

**Direct Mode (useSubagent=false, default):**
Uses Claude's reasoning capabilities through MCP sampling when available, or falls back to rule-based reasoning:

MCP Sampling Mode (when client supports sampling):
- Analyze current thought history and identify next logical steps
- Generate intelligent, contextually-aware thoughts
- Automatically enhance thoughts with confidence, tags, evidence, and references
- Continue iteratively until problem resolution or max iterations reached

Fallback Rule-Based Mode (when sampling unavailable):
- Uses predefined reasoning patterns (assumption analysis, alternative approaches, risk assessment, etc.)
- Generates contextually appropriate follow-up thoughts based on current state
- Applies heuristic-based tagging, evidence extraction, and reference linking
- Provides structured autonomous reasoning without requiring external LLM calls

**Subagent Mode (useSubagent=true):**
Meta-reasoning system that analyzes the current thinking context and returns structured prompts for launching specialized thinking subagents:

- Analyzes problem domain, confidence gaps, and evidence needs
- Recommends appropriate subagent type (technical-analyst, research-specialist, risk-assessor, strategic-planner, quality-reviewer, deep-reasoner, or general-reasoner)
- Generates comprehensive prompts with context, critical issues, and expected output format
- Returns structured SubagentPrompt with subagent type, detailed prompt, context analysis, and output specifications

Subagent types:
- technical-analyst: Architecture, code quality, technical problem-solving
- research-specialist: Investigation, evidence gathering, analytical reasoning
- risk-assessor: Risk identification, analysis, and mitigation
- strategic-planner: Long-term thinking, goal alignment, systematic approach design
- quality-reviewer: Thoroughness, accuracy, process improvement
- deep-reasoner: Complex, multi-layered problems requiring sophisticated analysis
- general-reasoner: Systematic problem-solving and analysis

Key features:
- Automatic detection of MCP sampling capability (direct mode)
- Smart prompt generation based on problem domain and confidence gaps
- Intelligent tagging and metadata enhancement
- Reference detection when thoughts relate to previous ones
- Adaptive stopping based on completion signals
- Graceful fallback when sampling is unavailable
- Meta-reasoning for subagent coordination (subagent mode)

Use this tool when:
- You want to continue thinking automatically from where you left off
- You need to explore different reasoning paths without manual input
- You want to strengthen low-confidence areas through autonomous analysis
- You need to generate follow-up thoughts after manual reasoning
- You want to see systematic follow-up analysis of your reasoning
- You want structured prompts for launching specialized reasoning subagents

Requirements:
- At least one manual thought must exist before using auto-thinking
- Works with or without MCP client sampling support
- The tool will generate 1-5 thoughts per call depending on the maxIterations parameter (direct mode)
- Returns structured subagent prompts with context analysis (subagent mode)`,
  inputSchema: {
    type: "object",
    properties: {
      maxIterations: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        default: 3,
        description: "Maximum number of autonomous thoughts to generate (1-10, default: 3). Only used in direct mode."
      },
      useSubagent: {
        type: "boolean",
        default: false,
        description: "Enable subagent mode to return structured prompts for launching specialized thinking subagents instead of generating thoughts directly"
      }
    },
    additionalProperties: false
  }
};

const VISUALIZE_DECISION_TREE_TOOL: Tool = {
  name: "visualize_decision_tree",
  description: `Generate visual representations of reasoning paths and decision points in your thought process.

This tool creates ASCII tree diagrams and structured JSON representations that show:

**Core Visualization Features:**
- ASCII tree diagrams showing thought relationships and hierarchy
- Confidence levels with visual indicators (███ high, ██░ medium, █░░ low, ░░░ very low)
- Decision points marked with 🔶 (thoughts with uncertainty, branches, or choices)
- Critical path highlighting with ⭐ (highest confidence path to deepest reasoning)
- Evidence counts (+3E) and assumption risks (-2A) for each thought
- Tags and categorization displayed inline

**Tree Structure Analysis:**
- Parses thought references to build parent-child relationships
- Identifies decision nodes based on confidence levels, branching, and content analysis
- Calculates path weights using confidence scores and reasoning depth
- Detects critical reasoning chains and potential bottlenecks
- Analyzes reasoning quality through evidence gaps and assumption risks

**Advanced Features:**
- Filter by confidence thresholds to focus on high/low confidence areas
- Focus on specific branches using branch IDs
- Toggle evidence/assumption display for cleaner or more detailed views
- Comprehensive statistics including depth, breadth, and decision point counts

**Output Formats:**
- ASCII tree for console display and visual analysis
- Structured JSON for external visualization tools and programmatic analysis
- Detailed statistics summary with key insights

**Example ASCII Output:**
\`\`\`
Decision Tree Visualization
══════════════════════════════════════════════════
├── [1] ░░░ Initial Problem Analysis (40%) [problem, analysis] +1E -2A
│   ├── [2] ███ ⭐ Technical Deep-dive (85%) [technical, validation] +3E
│   │   └── [3] ███ ⭐ Solution Implementation (90%) [implementation] +3E
│   └── [4] ██░ 🔶 Alternative Approach (60%) [alternative, risk] +2E -2A
├── [5] █░░ 🔶 Risk Assessment (45%) [risk, uncertainty] +1E -3A
──────────────────────────────────────────────────
Decision Points: 2 | Critical Path: 1→2→3 | Avg Confidence: 0.68
Depth: 3 | Breadth: 1.5 | Low Confidence: 2 | Evidence Gaps: 1
\`\`\`

Use this tool to:
- Understand your reasoning structure and identify decision points
- Find areas that need more evidence or have low confidence
- Locate critical paths through your analysis
- Identify gaps or weak points in your thinking process
- Plan follow-up analysis for uncertain or risky assumptions
- Review the overall quality and completeness of your reasoning

The visualization helps you see patterns in your thinking that might not be obvious from reading thoughts sequentially, making it easier to strengthen weak areas and build upon strong reasoning chains.`,
  inputSchema: {
    type: "object",
    properties: {
      confidenceThreshold: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Only show thoughts with confidence above this threshold (0.0-1.0). Useful for focusing on high or low confidence areas."
      },
      focusBranch: {
        type: "string",
        description: "Focus on a specific branch ID to see only thoughts from that reasoning path."
      },
      outputFormat: {
        type: "string",
        enum: ["ascii", "json", "both"],
        default: "both",
        description: "Output format: 'ascii' for tree diagram, 'json' for structured data, 'both' for complete analysis."
      },
      showEvidence: {
        type: "boolean",
        default: true,
        description: "Show evidence counts (+3E) and assumption counts (-2A) in the tree display."
      }
    },
    additionalProperties: false
  }
};

// New attachment-related tools
const ADD_ATTACHMENT_TOOL: Tool = {
  name: "add_attachment",
  description: `Add multimedia attachments to existing thoughts to enrich reasoning with visual aids, code examples, diagrams, and structured data.

**Supported Attachment Types:**
- **code**: Programming code with syntax highlighting and complexity analysis
- **diagram**: ASCII diagrams, flowcharts, system architecture, network topologies
- **image**: Base64-encoded images with metadata extraction and validation
- **json**: JSON data with schema validation and pretty formatting
- **table**: Tabular data with CSV/TSV parsing and alignment
- **file**: File references with content hashing and metadata
- **url**: Web links and references with metadata
- **text**: Plain text documents with formatting
- **markdown**: Rich text with markdown formatting
- **yaml**: YAML configuration with validation
- **xml**: XML data with structure validation

**Content Processing Features:**
- Automatic syntax highlighting for 20+ programming languages
- ASCII diagram generation and validation
- Image format detection and metadata extraction
- JSON schema validation and formatting
- Table parsing with header detection and alignment
- File size calculation and hash generation
- URL validation and metadata extraction

**Integration Benefits:**
- Attachments enhance confidence scores when providing supporting evidence
- Visual aids improve reasoning clarity and comprehension  
- Code examples enable technical analysis and validation
- Diagrams help visualize complex relationships and architectures
- Structured data supports analytical reasoning

**Example Usage:**
Add a system architecture diagram to thought 3:
{
  "thoughtNumber": 3,
  "attachment": {
    "type": "diagram",
    "name": "System Architecture",
    "content": "┌─────────────┐    ┌──────────────┐\\n│   Client    │───▶│   Gateway    │\\n└─────────────┘    └──────────────┘"
  }
}`,
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: {
        type: "number",
        minimum: 1,
        description: "The thought number to add the attachment to"
      },
      attachment: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["code", "diagram", "image", "json", "table", "file", "url", "text", "markdown", "yaml", "xml"],
            description: "Type of attachment content"
          },
          name: {
            type: "string",
            description: "Human-readable name for the attachment"
          },
          content: {
            description: "The attachment content (string or object depending on type)"
          },
          metadata: {
            type: "object",
            properties: {
              language: { type: "string", description: "Programming language for code" },
              format: { type: "string", description: "File format or diagram type" },
              description: { type: "string", description: "Description of the attachment" },
              encoding: { type: "string", description: "Content encoding (base64, utf-8, etc.)" },
              schema: { type: "string", description: "JSON schema for validation" }
            },
            description: "Additional metadata for the attachment"
          },
          thoughtReferences: {
            type: "array",
            items: { type: "number", minimum: 1 },
            description: "Other thought numbers this attachment relates to"
          }
        },
        required: ["type", "name", "content"]
      }
    },
    required: ["thoughtNumber", "attachment"]
  }
};

const GET_ATTACHMENTS_TOOL: Tool = {
  name: "get_attachments",
  description: `Retrieve attachments by type, thought number, or search criteria.

**Search Capabilities:**
- Filter by attachment type (code, diagram, image, etc.)
- Find attachments for specific thoughts
- Search attachment content and metadata
- Filter by programming language or format
- Find cross-referenced attachments

**Output Features:**
- Detailed attachment metadata including size, format, creation time
- Content preview for text-based attachments
- Image metadata for visual content
- Code complexity metrics for programming content
- Cross-reference analysis showing related thoughts

Use this tool to:
- Review all attachments for a specific thought
- Find code examples of a particular language
- Locate diagrams and visual aids
- Analyze attachment relationships across thoughts`,
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: {
        type: "number",
        minimum: 1,
        description: "Get attachments for a specific thought number"
      },
      type: {
        type: "string",
        enum: ["code", "diagram", "image", "json", "table", "file", "url", "text", "markdown", "yaml", "xml"],
        description: "Filter by attachment type"
      },
      language: {
        type: "string",
        description: "Filter code attachments by programming language"
      },
      searchContent: {
        type: "string",
        description: "Search within attachment content and metadata"
      }
    }
  }
};

const SEARCH_ATTACHMENTS_TOOL: Tool = {
  name: "search_attachments",
  description: `Advanced search across all attachments with content analysis and relationship mapping.

**Search Features:**
- Full-text search across attachment content
- Metadata field searching (names, descriptions, languages)
- Regular expression support for pattern matching
- Cross-reference analysis to find related attachments
- Content type filtering and grouping

**Analysis Capabilities:**
- Code complexity analysis and language distribution
- Diagram type classification and relationship mapping
- Image format analysis and size distribution
- JSON structure analysis and schema detection
- Table structure analysis and data types

**Results Include:**
- Ranked search results with relevance scoring
- Content previews and summaries
- Related thought connections
- Usage patterns and frequency analysis
- Suggested improvements and optimizations`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query for attachment content and metadata"
      },
      types: {
        type: "array",
        items: {
          type: "string",
          enum: ["code", "diagram", "image", "json", "table", "file", "url", "text", "markdown", "yaml", "xml"]
        },
        description: "Filter by specific attachment types"
      },
      useRegex: {
        type: "boolean",
        description: "Treat query as regular expression"
      },
      includeContent: {
        type: "boolean",
        description: "Include full attachment content in results"
      },
      maxResults: {
        type: "number",
        minimum: 1,
        maximum: 100,
        description: "Maximum number of results to return"
      }
    },
    required: ["query"]
  }
};

const EXTRACT_PATTERNS_TOOL: Tool = {
  name: "extract_patterns",
  description: `Extract and store reasoning patterns from current successful thinking session.

**Pattern Extraction Process:**
- Analyzes completed reasoning sessions for successful patterns
- Captures problem-solving approaches and thought sequences
- Identifies domain-specific reasoning strategies
- Stores patterns with success metrics and adaptation guidance

**Extraction Criteria:**
- Minimum confidence threshold for pattern quality
- Optional completion requirement for finished sessions
- Minimum thought count for pattern viability
- Domain identification and approach classification

**Captured Elements:**
- **Problem Context**: Domain, complexity, keywords, characteristics
- **Approach Patterns**: Systematic decomposition, evidence-based reasoning, etc.
- **Thought Sequence**: Step types, confidence targets, key insights
- **Success Factors**: High confidence areas, evidence usage, connected reasoning
- **Adaptation Guidance**: How to modify pattern for different contexts

**Usage:**
- Complete a successful reasoning session first
- Extract patterns when confidence is high and session is complete
- Patterns become available for future problem recommendations`,
  inputSchema: {
    type: "object",
    properties: {
      minConfidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        default: 0.7,
        description: "Minimum average confidence required for pattern extraction (0.0-1.0)"
      },
      requireCompletion: {
        type: "boolean",
        default: true,
        description: "Whether to require session completion for pattern extraction"
      }
    }
  }
};

const GET_PATTERN_RECOMMENDATIONS_TOOL: Tool = {
  name: "get_pattern_recommendations",
  description: `Get recommended reasoning patterns for current problem context or specified criteria.

**Recommendation Process:**
- Analyzes current session context (domains, approach, keywords, complexity)
- Matches against pattern library using similarity scoring
- Ranks patterns by relevance and historical success rates
- Provides adaptation suggestions for your specific context

**Pattern Matching Criteria:**
- **Domain Overlap**: Shared problem domains (technical, research, strategy, etc.)
- **Approach Similarity**: Similar reasoning methodologies
- **Keyword Matching**: Related problem characteristics and terminology
- **Complexity Alignment**: Problem difficulty and scope matching
- **Success Metrics**: Historical effectiveness of patterns

**Recommendation Output:**
- Top 5 most relevant patterns with confidence scores
- Thought sequence templates for each recommended pattern
- Specific adaptation suggestions for your context
- Expected confidence targets for each reasoning step
- Success rates and usage statistics

**Usage Instructions:**
- Use recommended thought sequences as templates
- Follow adaptation guidance for your specific problem
- Aim for suggested confidence levels at each step
- Modify approach based on your domain and constraints`,
  inputSchema: {
    type: "object",
    properties: {
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Problem domains to search for (e.g., ['technical', 'research'])"
      },
      approach: {
        type: "string",
        description: "Preferred reasoning approach (e.g., 'systematic-decomposition', 'evidence-based')"
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Keywords describing the problem context"
      },
      complexity: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Problem complexity level"
      },
      problemType: {
        type: "array",
        items: { type: "string" },
        description: "Specific problem types or categories"
      }
    }
  }
};

const SEARCH_PATTERNS_TOOL: Tool = {
  name: "search_patterns",
  description: `Search the pattern library by text, domains, approaches, and success metrics.

**Search Capabilities:**
- **Text Search**: Pattern names, descriptions, approaches, and keywords
- **Domain Filtering**: Find patterns for specific domains (technical, research, etc.)
- **Approach Filtering**: Filter by reasoning methodology
- **Success Filtering**: Minimum confidence and usage thresholds
- **Complexity Filtering**: Pattern difficulty levels

**Search Results Include:**
- Pattern metadata (name, description, domain, approach, complexity)
- Success metrics (confidence rates, completion rates, usage counts)
- Creation and update timestamps
- Thought sequence lengths and step types
- Domain and approach distributions across results

**Result Analysis:**
- Domain distribution showing pattern coverage areas
- Approach frequency showing common methodologies
- Complexity breakdown showing difficulty levels
- Average success rates across matching patterns

**Use Cases:**
- Find patterns for specific problem domains
- Discover high-performing reasoning approaches
- Analyze pattern library coverage and gaps
- Research successful methodologies for complex problems`,
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text search across pattern content (names, descriptions, approaches, keywords)"
      },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Filter by specific domains"
      },
      approaches: {
        type: "array",
        items: { type: "string" },
        description: "Filter by reasoning approaches"
      },
      minConfidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Minimum average confidence threshold"
      },
      minUsage: {
        type: "number",
        minimum: 0,
        description: "Minimum usage count threshold"
      },
      complexity: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Filter by complexity level"
      }
    }
  }
};

const server = new Server(
  {
    name: "sequential-thinking-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
      sampling: {},
    },
  }
);

const RESET_SESSION_TOOL: Tool = {
  name: "reset_session",
  description: `Reset the current thinking session to start fresh with a new problem.

**Purpose:**
- Clear all thoughts from current session
- Start with thought number 1 for new problems  
- Prevent contamination between different reasoning sessions
- Maintain clean session boundaries for pattern learning

**When to Use:**
- Starting work on a completely different problem
- When thoughts from previous problem are interfering
- After completing one problem and moving to another
- When pattern extraction is complete and ready for new work

**What Gets Reset:**
- All thought history cleared
- Branch tracking reset
- Session ID updated with timestamp
- Attachment history cleared

**What Persists:**
- Pattern library (learned patterns remain available)
- Tool configurations and settings`,
  inputSchema: {
    type: "object",
    properties: {}
  }
};

const GET_SESSION_INFO_TOOL: Tool = {
  name: "get_session_info", 
  description: `Get information about the current thinking session.

**Session Information Includes:**
- Current session ID and start time
- Number of thoughts in current session
- Session duration
- Session isolation status

**Use Cases:**
- Check if you're in a clean session for new problems
- Understand session boundaries for pattern extraction
- Debug session management issues
- Verify session reset worked correctly`,
  inputSchema: {
    type: "object",
    properties: {}
  }
};

const EDIT_THOUGHT_TOOL: Tool = {
  name: "edit_thought",
  description: `Edit an existing thought with comprehensive change tracking.

**Interactive Thought Editing Features:**
- Modify thought content, confidence, evidence, assumptions, or tags
- Complete change tracking with edit history and timestamps
- Original content preservation for rollback capability
- Multi-field editing support with granular change detection
- User attribution and reason tracking for collaborative environments

**Supported Edits:**
- **Content**: Modify the main thought text
- **Confidence**: Update confidence levels (0-1 scale)
- **Evidence**: Add, remove, or modify supporting evidence
- **Assumptions**: Update underlying assumptions
- **Tags**: Change categorization and organization tags

**Change Tracking:**
- Automatic edit ID generation and timestamping
- Previous/new value comparison for each field
- Edit reason documentation for audit trails
- User ID tracking for collaborative sessions
- Complete edit history preservation

**Use Cases:**
- Refine thoughts as understanding develops
- Correct errors without losing original content
- Improve confidence scores based on new evidence
- Update evidence and assumptions iteratively
- Collaborative editing with attribution tracking
- Quality improvement and content refinement`,
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: {
        type: "number",
        description: "The thought number to edit"
      },
      thought: {
        type: "string",
        description: "Updated thought content"
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Updated confidence level (0-1 scale)"
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description: "Updated evidence array"
      },
      assumptions: {
        type: "array", 
        items: { type: "string" },
        description: "Updated assumptions array"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Updated tags array"
      },
      reason: {
        type: "string",
        description: "Reason for the edit (optional, for audit trail)"
      },
      userId: {
        type: "string",
        description: "User ID making the edit (optional, for collaborative environments)"
      }
    },
    required: ["thoughtNumber"]
  }
};

const GET_THOUGHT_EDIT_HISTORY_TOOL: Tool = {
  name: "get_thought_edit_history",
  description: `Retrieve complete edit history for a thought with change tracking analysis.

**Edit History Features:**
- Complete chronological edit history with timestamps
- Change type classification (content, confidence, evidence, etc.)
- Previous/new value comparisons for each edit
- Edit reason and user attribution tracking
- Original content preservation and comparison

**History Analysis:**
- Total edit count and timeline
- Change pattern analysis across different field types
- User contribution tracking for collaborative sessions
- Edit reason categorization and trends
- Content evolution tracking from original to current

**Use Cases:**
- Review thought evolution and refinement process
- Audit collaborative editing sessions
- Understand reasoning development patterns
- Rollback analysis and decision making
- Quality assessment and improvement tracking
- Collaborative workflow transparency`,
  inputSchema: {
    type: "object", 
    properties: {
      thoughtNumber: {
        type: "number",
        description: "The thought number to get edit history for"
      }
    },
    required: ["thoughtNumber"]
  }
};

const CREATE_COLLABORATIVE_SESSION_TOOL: Tool = {
  name: "create_collaborative_session",
  description: `Create a new collaborative thinking session for multi-user reasoning.

**Collaborative Session Features:**
- Multi-user real-time collaboration on shared reasoning problems
- Role-based permissions and access control (owner, moderator, contributor, participant)
- Activity logging and contribution tracking for all participants
- Session management with join/leave functionality and user presence
- Comprehensive audit trail of all collaborative activities

**Session Configuration:**
- **Public/Private Sessions**: Control visibility and access to collaborative sessions
- **Guest User Support**: Allow anonymous or guest users to participate
- **Edit Approval Workflow**: Optional approval process for collaborative edits
- **Permission Management**: Fine-grained control over user capabilities

**Use Cases:**
- Team brainstorming and ideation sessions with structured thought development
- Peer review and collaborative analysis of complex problems
- Multi-stakeholder decision-making with transparent reasoning processes
- Educational collaboration with student-teacher interaction tracking
- Research collaboration with contribution attribution and peer validation`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the collaborative session"
      },
      description: {
        type: "string",
        description: "Description of the session purpose and scope"
      },
      createdBy: {
        type: "string", 
        description: "User ID of the session creator"
      },
      creatorName: {
        type: "string",
        description: "Display name of the session creator"
      },
      isPublic: {
        type: "boolean",
        description: "Whether the session is publicly accessible"
      },
      allowGuestUsers: {
        type: "boolean",
        description: "Whether to allow guest/anonymous users"
      },
      requireApprovalForEdits: {
        type: "boolean",
        description: "Whether edits require approval from moderators"
      },
      allowAnonymousContributions: {
        type: "boolean", 
        description: "Whether to allow contributions from anonymous users"
      }
    },
    required: ["name", "createdBy"]
  }
};

const JOIN_COLLABORATIVE_SESSION_TOOL: Tool = {
  name: "join_collaborative_session",
  description: `Join an existing collaborative thinking session.

**Joining Process:**
- Connect to active collaborative sessions using session ID
- Automatic role assignment based on session permissions
- Real-time integration with ongoing collaborative reasoning
- User presence tracking and activity status monitoring

**Participation Features:**
- Role-based access to session features and capabilities
- Contribution tracking with user attribution for all activities
- Real-time collaboration with other participants
- Activity logging for accountability and session analysis

**User Roles:**
- **Owner**: Full control including session management and user permissions
- **Moderator**: Can manage users, approve edits, and moderate discussions
- **Contributor**: Can create and edit thoughts, participate fully in reasoning
- **Participant**: Basic participation with limited editing capabilities`,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "ID of the collaborative session to join"
      },
      userId: {
        type: "string",
        description: "Unique user ID for the participant"
      },
      userName: {
        type: "string", 
        description: "Display name for the participant"
      },
      role: {
        type: "string",
        enum: ["owner", "moderator", "contributor", "participant"],
        description: "Role for the participant in the session"
      }
    },
    required: ["sessionId", "userId"]
  }
};

const GET_COLLABORATIVE_SESSION_STATUS_TOOL: Tool = {
  name: "get_collaborative_session_status",
  description: `Get comprehensive status and analytics for a collaborative thinking session.

**Status Information:**
- Session metadata including creation details and activity timeline
- Complete participant list with roles, join times, and last activity
- Thought contribution tracking with attribution to specific participants
- Recent activity log showing all collaborative interactions and changes

**Analytics & Insights:**
- Participation statistics including active vs total participants
- Contribution analysis showing thought creation and editing patterns
- Session duration and activity timeline for collaboration assessment
- User engagement metrics and interaction frequency analysis

**Activity Tracking:**
- Real-time activity feed with participant actions and timestamps
- Thought creation, editing, and attachment activities with full attribution
- Pattern extraction and synthesis activities with collaborative context
- Join/leave events and session management activities

**Use Cases:**
- Monitor collaborative session health and participant engagement
- Analyze contribution patterns for team collaboration assessment
- Review session history for accountability and decision audit trails
- Track collaborative reasoning development and pattern emergence`,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "ID of the collaborative session (optional, uses current session if not provided)"
      }
    }
  }
};

const thinkingServer = new SequentialThinkingServer();
thinkingServer.setServer(server);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SEQUENTIAL_THINKING_TOOL, GET_THOUGHT_TOOL, SEARCH_THOUGHTS_TOOL, GET_RELATED_THOUGHTS_TOOL, SYNTHESIZE_THOUGHTS_TOOL, AUTO_THINK_TOOL, VISUALIZE_DECISION_TREE_TOOL, ADD_ATTACHMENT_TOOL, GET_ATTACHMENTS_TOOL, SEARCH_ATTACHMENTS_TOOL, EXTRACT_PATTERNS_TOOL, GET_PATTERN_RECOMMENDATIONS_TOOL, SEARCH_PATTERNS_TOOL, RESET_SESSION_TOOL, GET_SESSION_INFO_TOOL, EDIT_THOUGHT_TOOL, GET_THOUGHT_EDIT_HISTORY_TOOL, CREATE_COLLABORATIVE_SESSION_TOOL, JOIN_COLLABORATIVE_SESSION_TOOL, GET_COLLABORATIVE_SESSION_STATUS_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "sequentialthinking") {
      return thinkingServer.processThought(args);
    }

    if (name === "getThought") {
      const { thoughtNumber } = args as { thoughtNumber: number };
      const thought = thinkingServer.getThought(thoughtNumber);
      
      if (!thought) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Thought ${thoughtNumber} not found`,
              thoughtNumber
            }, null, 2)
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(thought, null, 2)
        }]
      };
    }

    if (name === "searchThoughts") {
      const { query, tags } = args as { query: string; tags?: string[] };
      const results = thinkingServer.searchThoughts(query, tags);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            tags,
            results: results.length,
            thoughts: results
          }, null, 2)
        }]
      };
    }

    if (name === "getRelatedThoughts") {
      const { thoughtNumber } = args as { thoughtNumber: number };
      const related = thinkingServer.getRelatedThoughts(thoughtNumber);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber,
            relatedCount: related.length,
            relatedThoughts: related
          }, null, 2)
        }]
      };
    }

    if (name === "synthesizeThoughts") {
      try {
        const synthesis = thinkingServer.synthesizeInsights();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(synthesis, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              status: 'failed'
            }, null, 2)
          }],
          isError: true
        };
      }
    }

    if (name === "auto_think") {
      const { maxIterations = 3, useSubagent = false } = args as { maxIterations?: number; useSubagent?: boolean };
      return await thinkingServer.autoThink(maxIterations, useSubagent);
    }

    if (name === "visualize_decision_tree") {
      const { 
        confidenceThreshold, 
        focusBranch, 
        outputFormat = 'both', 
        showEvidence = true 
      } = args as { 
        confidenceThreshold?: number; 
        focusBranch?: string; 
        outputFormat?: 'ascii' | 'json' | 'both'; 
        showEvidence?: boolean; 
      };
      
      try {
        const visualization = thinkingServer.generateDecisionTree(
          confidenceThreshold,
          focusBranch,
          outputFormat,
          showEvidence
        );
        
        let responseData: any = {
          outputFormat,
          statistics: visualization.statistics
        };

        if (outputFormat === 'ascii' || outputFormat === 'both') {
          responseData.ascii = visualization.ascii;
        }
        
        if (outputFormat === 'json' || outputFormat === 'both') {
          responseData.json = visualization.json;
        }

        // Add filtering info if applicable
        if (confidenceThreshold !== undefined) {
          responseData.appliedFilters = responseData.appliedFilters || {};
          responseData.appliedFilters.confidenceThreshold = confidenceThreshold;
        }
        
        if (focusBranch) {
          responseData.appliedFilters = responseData.appliedFilters || {};
          responseData.appliedFilters.focusBranch = focusBranch;
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(responseData, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              status: 'failed',
              tool: 'visualize_decision_tree'
            }, null, 2)
          }],
          isError: true
        };
      }
    }

    if (name === "add_attachment") {
      const { thoughtNumber, attachment } = args as { 
        thoughtNumber: number; 
        attachment: Omit<Attachment, 'id'>
      };
      return thinkingServer.addAttachment(thoughtNumber, attachment);
    }

    if (name === "get_attachments") {
      const filters = args as {
        thoughtNumber?: number;
        type?: string;
        language?: string;
        searchContent?: string;
      };
      return thinkingServer.getAttachments(filters);
    }

    if (name === "search_attachments") {
      const { query, types, useRegex, includeContent, maxResults } = args as {
        query: string;
        types?: string[];
        useRegex?: boolean;
        includeContent?: boolean;
        maxResults?: number;
      };
      return thinkingServer.searchAttachments(query, {
        types,
        useRegex,
        includeContent,
        maxResults
      });
    }

    if (name === "extract_patterns") {
      const { minConfidence, requireCompletion } = args as {
        minConfidence?: number;
        requireCompletion?: boolean;
      };
      return thinkingServer.extractPatterns(minConfidence, requireCompletion);
    }

    if (name === "get_pattern_recommendations") {
      const { domains, approach, keywords, complexity, problemType } = args as {
        domains?: string[];
        approach?: string;
        keywords?: string[];
        complexity?: 'low' | 'medium' | 'high';
        problemType?: string[];
      };
      return thinkingServer.getPatternRecommendations({
        domains,
        approach,
        keywords,
        complexity,
        problemType
      });
    }

    if (name === "search_patterns") {
      const { text, domains, approaches, minConfidence, minUsage, complexity } = args as {
        text?: string;
        domains?: string[];
        approaches?: string[];
        minConfidence?: number;
        minUsage?: number;
        complexity?: 'low' | 'medium' | 'high';
      };
      return thinkingServer.searchPatterns({
        text,
        domains,
        approaches,
        minConfidence,
        minUsage,
        complexity
      });
    }
    if (name === "reset_session") {
      return thinkingServer.resetSession();
    }
    if (name === "get_session_info") {
      return thinkingServer.getCurrentSessionInfo();
    }
    if (name === "edit_thought") {
      return thinkingServer.editThought(args);
    }
    if (name === "get_thought_edit_history") {
      return thinkingServer.getThoughtEditHistory(args);
    }

    if (name === "create_collaborative_session") {
      return thinkingServer.createCollaborativeSession(args);
    }

    if (name === "join_collaborative_session") {
      return thinkingServer.joinCollaborativeSession(args);
    }

    if (name === "get_collaborative_session_status") {
      return thinkingServer.getCollaborativeSessionStatus(args);
    }

    return {
      content: [{
        type: "text",
        text: `Unknown tool: ${name}`
      }],
      isError: true
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          tool: name
        }, null, 2)
      }],
      isError: true
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
