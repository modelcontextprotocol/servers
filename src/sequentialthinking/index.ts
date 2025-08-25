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

class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;
  private server: Server | null = null;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  public setServer(server: Server) {
    this.server = server;
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

    return {
      summary: {
        totalThoughts: this.thoughtHistory.length,
        branches: Object.keys(this.branches).length,
        revisions: this.thoughtHistory.filter(t => t.isRevision).length,
        keyInsights
      },
      decisions,
      assumptions,
      risks,
      actionItems,
      alternativeApproaches,
      confidenceAssessment,
      nextSteps
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

  public processThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);

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
        description: "Current thought number",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total thoughts needed",
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

const thinkingServer = new SequentialThinkingServer();
thinkingServer.setServer(server);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SEQUENTIAL_THINKING_TOOL, GET_THOUGHT_TOOL, SEARCH_THOUGHTS_TOOL, GET_RELATED_THOUGHTS_TOOL, SYNTHESIZE_THOUGHTS_TOOL, AUTO_THINK_TOOL],
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
