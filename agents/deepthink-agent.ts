#!/usr/bin/env node

/**
 * DeepThink Claude Agent
 * 
 * A specialized Claude agent that leverages the enhanced Sequential Thinking MCP server
 * for complex reasoning, problem-solving, and analysis tasks.
 * 
 * Features:
 * - Automatic problem domain detection and tagging
 * - Confidence-driven branch exploration
 * - Automatic synthesis at decision points
 * - Reference building for complex reasoning chains
 * - Evidence tracking for research/debugging
 * - Specialized modes for different problem types
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Enhanced interfaces for the DeepThink agent
interface DeepThinkContext {
  mode: 'architecture' | 'debugging' | 'research' | 'general';
  domain: string;
  confidence: number;
  complexity: 'low' | 'medium' | 'high' | 'extreme';
  currentPhase: 'analysis' | 'exploration' | 'synthesis' | 'validation' | 'conclusion';
  branchingStrategy: 'depth-first' | 'breadth-first' | 'confidence-based' | 'hybrid';
  evidenceLevel: 'minimal' | 'standard' | 'comprehensive' | 'exhaustive';
}

interface ThoughtPattern {
  type: 'hypothesis' | 'evidence' | 'analysis' | 'synthesis' | 'validation' | 'insight';
  confidence: number;
  dependencies: number[];
  implications: string[];
  domain: string[];
}

interface SynthesisPoint {
  thoughtNumbers: number[];
  synthesisType: 'convergent' | 'divergent' | 'evaluative';
  confidenceThreshold: number;
  keyInsights: string[];
  nextSteps: string[];
}

class DeepThinkAgent {
  private context: DeepThinkContext;
  private thoughtPatterns: Map<number, ThoughtPattern> = new Map();
  private synthesisPoints: SynthesisPoint[] = [];
  private evidenceTracker: Map<string, number[]> = new Map();
  private confidenceHistory: number[] = [];
  private branchingDecisions: Array<{
    thoughtNumber: number;
    reason: string;
    confidenceAtBranch: number;
    alternatives: string[];
  }> = [];

  constructor() {
    this.context = {
      mode: 'general',
      domain: 'unknown',
      confidence: 0.5,
      complexity: 'medium',
      currentPhase: 'analysis',
      branchingStrategy: 'hybrid',
      evidenceLevel: 'standard'
    };
  }

  // Domain detection based on problem characteristics
  private detectDomain(problem: string): string {
    const domainKeywords = {
      'software-architecture': ['architecture', 'system design', 'scalability', 'microservices', 'api', 'database', 'patterns', 'components'],
      'debugging': ['error', 'bug', 'issue', 'problem', 'fails', 'broken', 'exception', 'crash', 'unexpected'],
      'data-analysis': ['data', 'analyze', 'statistics', 'trends', 'patterns', 'insights', 'metrics', 'visualization'],
      'algorithm-design': ['algorithm', 'optimization', 'performance', 'complexity', 'efficiency', 'sorting', 'search'],
      'research': ['research', 'investigate', 'study', 'explore', 'findings', 'literature', 'evidence', 'hypothesis'],
      'planning': ['plan', 'strategy', 'roadmap', 'timeline', 'phases', 'milestones', 'objectives', 'goals'],
      'security': ['security', 'vulnerability', 'attack', 'encryption', 'authentication', 'authorization', 'threat'],
      'business-logic': ['business', 'requirements', 'stakeholders', 'process', 'workflow', 'operations', 'rules']
    };

    const problemLower = problem.toLowerCase();
    let bestDomain = 'general';
    let maxScore = 0;

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const score = keywords.reduce((acc, keyword) => 
        acc + (problemLower.includes(keyword) ? 1 : 0), 0);
      
      if (score > maxScore) {
        maxScore = score;
        bestDomain = domain;
      }
    }

    return bestDomain;
  }

  // Complexity assessment
  private assessComplexity(problem: string): 'low' | 'medium' | 'high' | 'extreme' {
    const complexityIndicators = {
      low: ['simple', 'basic', 'straightforward', 'easy', 'quick'],
      medium: ['moderate', 'standard', 'typical', 'average'],
      high: ['complex', 'difficult', 'challenging', 'intricate', 'multiple'],
      extreme: ['extremely', 'highly complex', 'multi-faceted', 'interdisciplinary', 'system-wide', 'enterprise']
    };

    const problemLower = problem.toLowerCase();
    
    // Count indicators for each level
    const scores = Object.entries(complexityIndicators).map(([level, indicators]) => ({
      level,
      score: indicators.reduce((acc, indicator) => 
        acc + (problemLower.includes(indicator) ? 1 : 0), 0)
    }));

    // Also consider length and structure as complexity factors
    const length = problem.length;
    const sentenceCount = problem.split(/[.!?]+/).length;
    
    let baseComplexity: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
    
    if (length > 1000 || sentenceCount > 10) baseComplexity = 'high';
    if (length > 2000 || sentenceCount > 20) baseComplexity = 'extreme';
    if (length < 100 && sentenceCount <= 2) baseComplexity = 'low';

    // Override with keyword-based assessment if strong signals
    const strongSignal = scores.find(s => s.score >= 2);
    if (strongSignal) {
      return strongSignal.level as 'low' | 'medium' | 'high' | 'extreme';
    }

    return baseComplexity;
  }

  // Generate smart tags based on context
  private generateSmartTags(thought: string, thoughtNumber: number): string[] {
    const tags = [];
    
    // Add phase tag
    tags.push(this.context.currentPhase);
    
    // Add domain tag
    if (this.context.domain !== 'general') {
      tags.push(this.context.domain);
    }
    
    // Add thought type tags
    if (thought.toLowerCase().includes('hypothesis') || thought.toLowerCase().includes('assume')) {
      tags.push('hypothesis');
    }
    if (thought.toLowerCase().includes('evidence') || thought.toLowerCase().includes('proof')) {
      tags.push('evidence');
    }
    if (thought.toLowerCase().includes('therefore') || thought.toLowerCase().includes('conclude')) {
      tags.push('conclusion');
    }
    if (thought.toLowerCase().includes('alternative') || thought.toLowerCase().includes('another approach')) {
      tags.push('alternative');
    }
    if (thought.toLowerCase().includes('risk') || thought.toLowerCase().includes('problem')) {
      tags.push('risk-analysis');
    }
    if (thought.toLowerCase().includes('benefit') || thought.toLowerCase().includes('advantage')) {
      tags.push('benefit-analysis');
    }
    
    // Add confidence-based tags
    if (this.context.confidence < 0.3) {
      tags.push('low-confidence');
    } else if (this.context.confidence > 0.7) {
      tags.push('high-confidence');
    }
    
    // Add complexity tag
    tags.push(`complexity-${this.context.complexity}`);
    
    return tags;
  }

  // Determine if branching is needed based on confidence and context
  private shouldBranch(currentThought: string, thoughtNumber: number): {
    shouldBranch: boolean;
    branchReason: string;
    branchId?: string;
    alternatives: string[];
  } {
    const confidence = this.context.confidence;
    const alternatives: string[] = [];
    
    // Low confidence branching
    if (confidence < 0.4) {
      alternatives.push('explore-alternative-approach');
      alternatives.push('gather-more-evidence');
      alternatives.push('challenge-assumptions');
      
      return {
        shouldBranch: true,
        branchReason: 'low-confidence-exploration',
        branchId: `low-conf-${thoughtNumber}`,
        alternatives
      };
    }
    
    // Decision point detection
    const decisionKeywords = ['decide', 'choose', 'option', 'alternative', 'either', 'or', 'versus'];
    const hasDecisionKeywords = decisionKeywords.some(keyword => 
      currentThought.toLowerCase().includes(keyword));
    
    if (hasDecisionKeywords) {
      alternatives.push('option-a-analysis');
      alternatives.push('option-b-analysis');
      alternatives.push('hybrid-approach');
      
      return {
        shouldBranch: true,
        branchReason: 'decision-point-exploration',
        branchId: `decision-${thoughtNumber}`,
        alternatives
      };
    }
    
    // Complexity-based branching
    if (this.context.complexity === 'extreme' && thoughtNumber > 3) {
      alternatives.push('deep-dive-subsystem');
      alternatives.push('high-level-overview');
      alternatives.push('stakeholder-perspective');
      
      return {
        shouldBranch: true,
        branchReason: 'complexity-management',
        branchId: `complex-${thoughtNumber}`,
        alternatives
      };
    }
    
    return {
      shouldBranch: false,
      branchReason: 'no-branching-needed',
      alternatives: []
    };
  }

  // Determine if synthesis is needed
  private shouldSynthesize(thoughtNumber: number): SynthesisPoint | null {
    // Synthesis at regular intervals for complex problems
    if (this.context.complexity === 'extreme' && thoughtNumber % 5 === 0) {
      const recentThoughts = Array.from({length: 5}, (_, i) => thoughtNumber - i)
        .filter(n => n > 0);
      
      return {
        thoughtNumbers: recentThoughts,
        synthesisType: 'convergent',
        confidenceThreshold: 0.6,
        keyInsights: [],
        nextSteps: ['continue-analysis', 'pivot-approach', 'seek-validation']
      };
    }
    
    // Synthesis when switching phases
    if (this.shouldSwitchPhase()) {
      const phaseThoughts = this.getPhaseThoughts();
      
      return {
        thoughtNumbers: phaseThoughts,
        synthesisType: 'evaluative',
        confidenceThreshold: 0.5,
        keyInsights: [],
        nextSteps: ['advance-to-next-phase', 'revisit-assumptions', 'gather-more-data']
      };
    }
    
    return null;
  }

  // Phase management
  private shouldSwitchPhase(): boolean {
    const phaseThoughts = this.getPhaseThoughts();
    
    switch (this.context.currentPhase) {
      case 'analysis':
        return phaseThoughts.length >= 3 && this.context.confidence > 0.6;
      case 'exploration':
        return phaseThoughts.length >= 5 && this.context.confidence > 0.5;
      case 'synthesis':
        return phaseThoughts.length >= 2 && this.context.confidence > 0.7;
      case 'validation':
        return phaseThoughts.length >= 2;
      default:
        return false;
    }
  }

  private getPhaseThoughts(): number[] {
    // This would track thoughts by phase in a real implementation
    // For now, return a mock array
    return [1, 2, 3];
  }

  private getNextPhase(): DeepThinkContext['currentPhase'] {
    const phaseSequence: DeepThinkContext['currentPhase'][] = [
      'analysis', 'exploration', 'synthesis', 'validation', 'conclusion'
    ];
    
    const currentIndex = phaseSequence.indexOf(this.context.currentPhase);
    return phaseSequence[Math.min(currentIndex + 1, phaseSequence.length - 1)];
  }

  // Update confidence based on thought content
  private updateConfidence(thought: string, thoughtNumber: number): number {
    let confidenceDelta = 0;
    
    // Positive confidence indicators
    const positiveIndicators = ['evidence', 'proof', 'confirmed', 'verified', 'validated', 'clear', 'obvious'];
    const negativeIndicators = ['uncertain', 'unclear', 'maybe', 'possibly', 'might', 'confusion', 'ambiguous'];
    
    positiveIndicators.forEach(indicator => {
      if (thought.toLowerCase().includes(indicator)) confidenceDelta += 0.1;
    });
    
    negativeIndicators.forEach(indicator => {
      if (thought.toLowerCase().includes(indicator)) confidenceDelta -= 0.1;
    });
    
    // Adjust based on references (more references = more confidence)
    const referenceCount = (thought.match(/thought \d+/gi) || []).length;
    confidenceDelta += referenceCount * 0.05;
    
    // Clamp between 0 and 1
    const newConfidence = Math.max(0, Math.min(1, this.context.confidence + confidenceDelta));
    this.confidenceHistory.push(newConfidence);
    
    return newConfidence;
  }

  // Generate contextual next thought suggestions
  private generateNextThoughtSuggestions(): string[] {
    const suggestions = [];
    
    switch (this.context.currentPhase) {
      case 'analysis':
        suggestions.push('Break down the problem into smaller components');
        suggestions.push('Identify key constraints and requirements');
        suggestions.push('Examine assumptions and prerequisites');
        break;
        
      case 'exploration':
        suggestions.push('Explore alternative approaches');
        suggestions.push('Consider edge cases and scenarios');
        suggestions.push('Investigate potential risks and benefits');
        break;
        
      case 'synthesis':
        suggestions.push('Combine insights from previous analysis');
        suggestions.push('Identify patterns and connections');
        suggestions.push('Formulate preliminary conclusions');
        break;
        
      case 'validation':
        suggestions.push('Test the proposed solution');
        suggestions.push('Verify assumptions with evidence');
        suggestions.push('Check for logical consistency');
        break;
        
      case 'conclusion':
        suggestions.push('Summarize key findings');
        suggestions.push('Provide actionable recommendations');
        suggestions.push('Identify next steps and follow-ups');
        break;
    }
    
    return suggestions;
  }

  // Main method to process and enhance thinking
  public processDeepThought(input: {
    problem?: string;
    thought: string;
    thoughtNumber: number;
    mode?: DeepThinkContext['mode'];
    forceMode?: boolean;
  }): {
    enhancedThought: any;
    contextUpdate: DeepThinkContext;
    suggestions: string[];
    shouldBranch: boolean;
    branchingInfo?: any;
    synthesisNeeded?: SynthesisPoint;
  } {
    // Initialize context if problem provided
    if (input.problem) {
      this.context.domain = this.detectDomain(input.problem);
      this.context.complexity = this.assessComplexity(input.problem);
      
      if (input.mode && (input.forceMode || this.context.mode === 'general')) {
        this.context.mode = input.mode;
      } else {
        // Auto-detect mode based on domain
        if (this.context.domain.includes('architecture')) this.context.mode = 'architecture';
        else if (this.context.domain.includes('debug')) this.context.mode = 'debugging';
        else if (this.context.domain.includes('research') || this.context.domain.includes('data')) this.context.mode = 'research';
      }
    }
    
    // Update confidence
    this.context.confidence = this.updateConfidence(input.thought, input.thoughtNumber);
    
    // Generate smart tags
    const tags = this.generateSmartTags(input.thought, input.thoughtNumber);
    
    // Check for branching
    const branchingAnalysis = this.shouldBranch(input.thought, input.thoughtNumber);
    
    // Check for synthesis needs
    const synthesisPoint = this.shouldSynthesize(input.thoughtNumber);
    
    // Determine references based on content
    const references = this.extractReferences(input.thought, input.thoughtNumber);
    
    // Update phase if needed
    if (this.shouldSwitchPhase()) {
      this.context.currentPhase = this.getNextPhase();
    }
    
    // Create enhanced thought structure
    const enhancedThought: any = {
      thought: input.thought,
      thoughtNumber: input.thoughtNumber,
      totalThoughts: this.estimateTotalThoughts(),
      nextThoughtNeeded: this.context.currentPhase !== 'conclusion' || this.context.confidence < 0.8,
      tags: tags,
      references: references,
      confidence: this.context.confidence,
      phase: this.context.currentPhase,
      domain: this.context.domain,
      complexity: this.context.complexity
    };
    
    // Add branching info if needed
    if (branchingAnalysis.shouldBranch) {
      enhancedThought.branchFromThought = input.thoughtNumber;
      enhancedThought.branchId = branchingAnalysis.branchId;
      
      this.branchingDecisions.push({
        thoughtNumber: input.thoughtNumber,
        reason: branchingAnalysis.branchReason,
        confidenceAtBranch: this.context.confidence,
        alternatives: branchingAnalysis.alternatives
      });
    }
    
    const suggestions = this.generateNextThoughtSuggestions();
    
    return {
      enhancedThought,
      contextUpdate: this.context,
      suggestions,
      shouldBranch: branchingAnalysis.shouldBranch,
      branchingInfo: branchingAnalysis.shouldBranch ? branchingAnalysis : undefined,
      synthesisNeeded: synthesisPoint || undefined
    };
  }

  private extractReferences(thought: string, currentThoughtNumber: number): number[] {
    const references: number[] = [];
    
    // Extract explicit references like "as in thought 3" or "from thought 1"
    const explicitMatches = thought.match(/thought (\d+)/gi);
    if (explicitMatches) {
      explicitMatches.forEach(match => {
        const num = parseInt(match.replace(/thought /i, ''));
        if (num < currentThoughtNumber && !references.includes(num)) {
          references.push(num);
        }
      });
    }
    
    // Add implicit references based on context
    if (thought.toLowerCase().includes('previously') || thought.toLowerCase().includes('earlier')) {
      const previousThought = currentThoughtNumber - 1;
      if (previousThought > 0 && !references.includes(previousThought)) {
        references.push(previousThought);
      }
    }
    
    // Add references based on building upon concepts
    if (thought.toLowerCase().includes('building on') || thought.toLowerCase().includes('extending')) {
      // Reference the last few thoughts that might be relevant
      for (let i = 1; i <= 3; i++) {
        const refThought = currentThoughtNumber - i;
        if (refThought > 0 && !references.includes(refThought)) {
          references.push(refThought);
          break; // Just add one implicit reference
        }
      }
    }
    
    return references.sort((a, b) => a - b);
  }

  private estimateTotalThoughts(): number {
    const baseEstimate = {
      'low': 3,
      'medium': 5,
      'high': 8,
      'extreme': 12
    };
    
    let estimate = baseEstimate[this.context.complexity];
    
    // Adjust based on mode
    if (this.context.mode === 'architecture') estimate += 3;
    if (this.context.mode === 'debugging') estimate += 2;
    if (this.context.mode === 'research') estimate += 4;
    
    // Adjust based on confidence (lower confidence = more thoughts needed)
    if (this.context.confidence < 0.5) estimate += 2;
    if (this.context.confidence < 0.3) estimate += 3;
    
    return estimate;
  }

  // Generate comprehensive analysis report
  public generateAnalysisReport(): string {
    const report = [];
    
    report.push("# DeepThink Analysis Report");
    report.push(`**Domain**: ${this.context.domain}`);
    report.push(`**Mode**: ${this.context.mode}`);
    report.push(`**Complexity**: ${this.context.complexity}`);
    report.push(`**Current Phase**: ${this.context.currentPhase}`);
    report.push(`**Confidence**: ${(this.context.confidence * 100).toFixed(1)}%`);
    report.push("");
    
    if (this.branchingDecisions.length > 0) {
      report.push("## Branching Decisions");
      this.branchingDecisions.forEach(decision => {
        report.push(`- **Thought ${decision.thoughtNumber}**: ${decision.reason} (confidence: ${(decision.confidenceAtBranch * 100).toFixed(1)}%)`);
        report.push(`  - Alternatives: ${decision.alternatives.join(', ')}`);
      });
      report.push("");
    }
    
    if (this.synthesisPoints.length > 0) {
      report.push("## Synthesis Points");
      this.synthesisPoints.forEach((point, index) => {
        report.push(`- **Synthesis ${index + 1}** (${point.synthesisType}): Thoughts ${point.thoughtNumbers.join(', ')}`);
        report.push(`  - Key Insights: ${point.keyInsights.join(', ')}`);
        report.push(`  - Next Steps: ${point.nextSteps.join(', ')}`);
      });
      report.push("");
    }
    
    if (this.confidenceHistory.length > 0) {
      report.push("## Confidence Trajectory");
      const trend = this.confidenceHistory.length > 1 ? 
        (this.confidenceHistory[this.confidenceHistory.length - 1] > this.confidenceHistory[0] ? "increasing" : "decreasing") : "stable";
      report.push(`Confidence has been ${trend} throughout the analysis.`);
      report.push(`Range: ${(Math.min(...this.confidenceHistory) * 100).toFixed(1)}% - ${(Math.max(...this.confidenceHistory) * 100).toFixed(1)}%`);
      report.push("");
    }
    
    return report.join("\n");
  }
}

// Tool definitions for the DeepThink agent
const DEEPTHINK_ANALYZE_TOOL: Tool = {
  name: "deepthink_analyze",
  description: `Analyze a problem using the DeepThink methodology with enhanced sequential thinking.
  
  This tool automatically:
  - Detects problem domain and complexity
  - Applies appropriate thinking strategies
  - Manages confidence-driven branching
  - Tracks evidence and references
  - Suggests optimal next steps
  
  Use this tool for complex problems that benefit from structured, deep analysis.`,
  inputSchema: {
    type: "object",
    properties: {
      problem: {
        type: "string",
        description: "The problem or question to analyze"
      },
      mode: {
        type: "string",
        enum: ["architecture", "debugging", "research", "general"],
        description: "Force a specific analysis mode"
      },
      complexity_override: {
        type: "string",
        enum: ["low", "medium", "high", "extreme"],
        description: "Override automatic complexity detection"
      },
      evidence_level: {
        type: "string",
        enum: ["minimal", "standard", "comprehensive", "exhaustive"],
        description: "Level of evidence gathering required"
      }
    },
    required: ["problem"]
  }
};

const DEEPTHINK_CONTINUE_TOOL: Tool = {
  name: "deepthink_continue",
  description: `Continue deep thinking analysis with an additional thought.
  
  This tool enhances your thought with:
  - Smart tagging based on content and context
  - Automatic reference detection and linking  
  - Confidence tracking and branching decisions
  - Phase management and synthesis points
  - Contextual suggestions for next steps`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current thinking step"
      },
      thought_number: {
        type: "integer",
        minimum: 1,
        description: "Current thought number in the sequence"
      },
      force_branch: {
        type: "boolean",
        description: "Force branching even if not automatically suggested"
      },
      force_synthesis: {
        type: "boolean", 
        description: "Force synthesis of recent thoughts"
      }
    },
    required: ["thought", "thought_number"]
  }
};

const DEEPTHINK_REPORT_TOOL: Tool = {
  name: "deepthink_report",
  description: "Generate a comprehensive analysis report of the current thinking session",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

// Main server setup
const server = new Server(
  {
    name: "deepthink-agent",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const deepThinkAgent = new DeepThinkAgent();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [DEEPTHINK_ANALYZE_TOOL, DEEPTHINK_CONTINUE_TOOL, DEEPTHINK_REPORT_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "deepthink_analyze") {
      const { problem, mode, complexity_override, evidence_level } = args as {
        problem: string;
        mode?: 'architecture' | 'debugging' | 'research' | 'general';
        complexity_override?: 'low' | 'medium' | 'high' | 'extreme';
        evidence_level?: 'minimal' | 'standard' | 'comprehensive' | 'exhaustive';
      };

      // Initialize the thinking session
      const result = deepThinkAgent.processDeepThought({
        problem,
        thought: `Starting deep analysis of the problem: ${problem}`,
        thoughtNumber: 1,
        mode,
        forceMode: !!mode
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: "Deep thinking analysis initiated",
            context: result.contextUpdate,
            enhanced_thought: result.enhancedThought,
            suggestions: result.suggestions,
            branching_available: result.shouldBranch,
            synthesis_recommended: !!result.synthesisNeeded,
            next_steps: [
              "Use deepthink_continue to add your next thought",
              "The agent will automatically enhance it with tags, references, and branching decisions",
              "Use deepthink_report to get a comprehensive analysis summary"
            ]
          }, null, 2)
        }]
      };
    }

    if (name === "deepthink_continue") {
      const { thought, thought_number, force_branch, force_synthesis } = args as {
        thought: string;
        thought_number: number;
        force_branch?: boolean;
        force_synthesis?: boolean;
      };

      const result = deepThinkAgent.processDeepThought({
        thought,
        thoughtNumber: thought_number
      });

      // If forcing branch or synthesis, include that information
      const responseData: any = {
        enhanced_thought: result.enhancedThought,
        context_update: result.contextUpdate,
        suggestions: result.suggestions,
        confidence_level: result.contextUpdate.confidence,
        current_phase: result.contextUpdate.currentPhase
      };

      if (result.shouldBranch || force_branch) {
        responseData.branching_suggestion = {
          recommended: true,
          reason: result.branchingInfo?.branchReason,
          branch_id: result.branchingInfo?.branchId,
          alternatives: result.branchingInfo?.alternatives
        };
      }

      if (result.synthesisNeeded || force_synthesis) {
        responseData.synthesis_opportunity = {
          type: result.synthesisNeeded?.synthesisType,
          thoughts_to_synthesize: result.synthesisNeeded?.thoughtNumbers,
          confidence_threshold: result.synthesisNeeded?.confidenceThreshold
        };
      }

      return {
        content: [{
          type: "text", 
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    }

    if (name === "deepthink_report") {
      const report = deepThinkAgent.generateAnalysisReport();
      
      return {
        content: [{
          type: "text",
          text: report
        }]
      };
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
  console.error("DeepThink Claude Agent running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running DeepThink agent:", error);
  process.exit(1);
});