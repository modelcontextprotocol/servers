# Pattern Learning System - Example Usage

This document demonstrates how to use the new pattern learning system in the Sequential Thinking MCP server to capture, store, and reuse successful reasoning patterns.

## Overview

The pattern learning system automatically captures successful reasoning approaches and makes them available for future problem-solving. It learns from your thinking patterns and recommends proven approaches for similar problems.

## Core Concepts

### Pattern Components
- **Problem Context**: Domain, complexity, keywords, characteristics
- **Approach**: Systematic method (decomposition, evidence-based, comparative, etc.)
- **Thought Sequence**: Step-by-step reasoning template with confidence targets
- **Success Metrics**: Historical performance data
- **Adaptation Guidance**: How to modify for different contexts

### Learning Process
1. **Capture**: Extract patterns from successful reasoning sessions
2. **Store**: Index patterns by domain, approach, and success metrics
3. **Match**: Find similar patterns for new problems
4. **Recommend**: Suggest best approaches with adaptation guidance
5. **Learn**: Update patterns based on repeated success/failure

## Example Workflow

### Step 1: Complete a Reasoning Session

First, work through a problem using the sequential thinking tool:

```json
{
  "thought": "I need to analyze this complex software architecture problem. Let me break it down systematically.",
  "thoughtNumber": 1,
  "totalThoughts": 5,
  "nextThoughtNeeded": true,
  "tags": ["technical", "architecture", "analysis"],
  "confidence": 0.8,
  "evidence": ["System has 15 microservices", "Database bottleneck identified"]
}
```

Continue with several more thoughts, building confidence and adding evidence:

```json
{
  "thought": "Based on my analysis, I'll implement a caching layer and optimize the database queries. This addresses both performance and scalability concerns.",
  "thoughtNumber": 5,
  "totalThoughts": 5,
  "nextThoughtNeeded": false,
  "tags": ["technical", "solution", "implementation"],
  "confidence": 0.9,
  "evidence": ["Caching reduces load by 60%", "Query optimization improves response time"],
  "references": [1, 3, 4]
}
```

### Step 2: Extract Pattern from Successful Session

Once you've completed a high-confidence reasoning session, extract the pattern:

```json
{
  "tool": "extract_patterns",
  "arguments": {
    "minConfidence": 0.7,
    "requireCompletion": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "extractedPattern": {
    "id": "pattern-1699123456789-abc123def",
    "name": "technical-systematic-decomposition-pattern",
    "description": "Extracted pattern for technical problems using systematic-decomposition approach",
    "domain": ["technical", "problem-solving"],
    "approach": "systematic-decomposition",
    "complexity": "medium",
    "thoughtSequence": [
      {
        "stepType": "analysis",
        "description": "Analyze key components and relationships",
        "expectedConfidence": 0.8,
        "keyTags": ["technical", "architecture", "analysis"]
      },
      {
        "stepType": "synthesis",
        "description": "Combine insights to form comprehensive solution",
        "expectedConfidence": 0.9,
        "keyTags": ["technical", "solution", "implementation"]
      }
    ],
    "successMetrics": {
      "averageConfidence": 0.85,
      "completionRate": 1.0,
      "evidenceQuality": 0.8,
      "usageCount": 1
    }
  }
}
```

### Step 3: Get Pattern Recommendations for New Problems

When facing a new problem, get recommendations:

```json
{
  "tool": "get_pattern_recommendations",
  "arguments": {
    "domains": ["technical"],
    "keywords": ["performance", "scalability"],
    "complexity": "medium"
  }
}
```

**Response:**
```json
{
  "context": {
    "domains": ["technical"],
    "keywords": ["performance", "scalability"],
    "complexity": "medium"
  },
  "totalPatterns": 3,
  "topRecommendations": [
    {
      "pattern": {
        "id": "pattern-1699123456789-abc123def",
        "name": "technical-systematic-decomposition-pattern",
        "approach": "systematic-decomposition",
        "domain": ["technical", "problem-solving"],
        "complexity": "medium",
        "successRate": 0.85
      },
      "matchConfidence": 0.92,
      "applicabilityScore": 0.87,
      "matchReasons": ["Shares 1 domain(s): technical", "1 keyword matches"],
      "adaptationSuggestions": [
        "This pattern works best for technical, problem-solving problems",
        "Key success factors: high-confidence-reasoning, evidence-backed-reasoning"
      ],
      "thoughtSequence": [
        {
          "stepType": "analysis", 
          "description": "Analyze key components and relationships",
          "expectedConfidence": 0.8,
          "keyTags": ["technical", "architecture", "analysis"]
        },
        {
          "stepType": "synthesis",
          "description": "Combine insights to form comprehensive solution", 
          "expectedConfidence": 0.9,
          "keyTags": ["technical", "solution", "implementation"]
        }
      ]
    }
  ],
  "usageInstructions": {
    "howToApply": "Use the thought sequence as a template for your reasoning process",
    "adaptationGuidance": "Follow the adaptation suggestions for your specific context",
    "confidenceTargets": "Aim for the expected confidence levels at each step"
  }
}
```

### Step 4: Search Pattern Library

Search for specific types of patterns:

```json
{
  "tool": "search_patterns",
  "arguments": {
    "text": "architecture",
    "domains": ["technical"],
    "minConfidence": 0.7
  }
}
```

**Response:**
```json
{
  "query": {
    "text": "architecture",
    "domains": ["technical"],
    "minConfidence": 0.7
  },
  "totalResults": 5,
  "patterns": [
    {
      "id": "pattern-1699123456789-abc123def",
      "name": "technical-systematic-decomposition-pattern",
      "description": "Extracted pattern for technical problems using systematic-decomposition approach",
      "domain": ["technical", "problem-solving"],
      "approach": "systematic-decomposition",
      "complexity": "medium",
      "successMetrics": {
        "averageConfidence": 0.85,
        "completionRate": 1.0,
        "usageCount": 3,
        "lastUsed": "2024-11-05T10:30:00.000Z"
      },
      "thoughtSequence": 2,
      "created": "2024-11-05T09:15:00.000Z",
      "updated": "2024-11-05T10:30:00.000Z"
    }
  ],
  "summary": {
    "domains": ["technical", "problem-solving", "research"],
    "approaches": ["systematic-decomposition", "evidence-based", "comparative-analysis"],
    "complexityDistribution": {"low": 1, "medium": 3, "high": 1},
    "avgSuccessRate": 0.82
  }
}
```

## Advanced Usage Patterns

### Domain-Specific Learning

Extract patterns for specific domains by using consistent tagging:

```json
// Research-focused session
{
  "tags": ["research", "hypothesis", "validation"],
  "evidence": ["Literature review complete", "3 supporting studies found"]
}

// Strategy-focused session  
{
  "tags": ["strategy", "business", "decision"],
  "evidence": ["Market analysis complete", "ROI projections positive"]
}
```

### Complexity-Adaptive Patterns

The system automatically detects complexity based on:
- Number of thoughts (>10 = high complexity)
- Branching and revisions (>2 branches = high complexity)  
- Average confidence levels (<0.6 = higher complexity)

### Cross-Domain Pattern Transfer

Patterns can transfer knowledge across related domains:

```json
{
  "domains": ["technical", "research"],
  "approach": "systematic-decomposition", 
  "adaptationSuggestions": [
    "Apply technical analysis methods to research problems",
    "Use evidence-gathering techniques from research domain"
  ]
}
```

## Pattern Types Captured

### Problem Decomposition Patterns
- **Systematic breakdown**: Complex → simple components
- **Hierarchical analysis**: Top-down problem structuring
- **Dependency mapping**: Understanding interconnections

### Evidence Gathering Patterns  
- **Multi-source validation**: Gathering diverse evidence
- **Incremental confidence building**: Step-by-step validation
- **Risk-aware assessment**: Considering uncertainty

### Decision-Making Patterns
- **Option comparison**: Systematic alternative evaluation
- **Constraint analysis**: Understanding limitations
- **Iterative refinement**: Progressive decision improvement

### Domain-Specific Patterns
- **Technical**: Architecture, debugging, optimization
- **Research**: Hypothesis testing, literature review, analysis
- **Strategy**: Planning, goal setting, risk assessment
- **Design**: User experience, interface, aesthetics

## Learning and Evolution

The pattern library continuously improves through:

### Usage Tracking
- **Success correlation**: Patterns that lead to high-confidence solutions
- **Failure analysis**: Identifying when patterns don't work
- **Context refinement**: Better matching criteria over time

### Metric Updates
- **Exponential moving average**: Recent performance weighted higher
- **Confidence calibration**: Expected vs. actual confidence tracking
- **Completion rate**: Pattern effectiveness measurement

### Pattern Variations
Successful adaptations create new pattern variations:
```json
{
  "variations": [
    {
      "name": "high-stakes-variant",
      "description": "Extra validation steps for critical decisions",
      "conditions": ["high-risk", "important-outcome"],
      "modifications": ["Add peer review step", "Increase evidence threshold"]
    }
  ]
}
```

## Best Practices

### For Pattern Extraction
1. **Complete sessions**: Extract patterns from finished reasoning chains
2. **High confidence**: Only extract from successful (>0.7 confidence) sessions
3. **Rich tagging**: Use descriptive tags for better categorization
4. **Evidence documentation**: Include supporting evidence for pattern quality

### For Pattern Application
1. **Context matching**: Use patterns for similar problem types
2. **Adaptation**: Modify recommendations for your specific context
3. **Confidence targeting**: Aim for suggested confidence levels
4. **Iterative improvement**: Update patterns based on outcomes

### for Library Management
1. **Regular extraction**: Build library from successful sessions
2. **Quality filtering**: Maintain high standards for pattern inclusion
3. **Search exploration**: Discover patterns for new problem types
4. **Cross-domain learning**: Apply patterns across related domains

## Integration with Existing Tools

The pattern learning system integrates with all existing Sequential Thinking features:

### With Decision Trees
- Visualize pattern application in decision trees
- Identify critical paths in pattern sequences
- Analyze pattern effectiveness visually

### With Attachments
- Attach code examples to technical patterns
- Include diagrams for complex patterns
- Store validation data as pattern evidence

### With Synthesis
- Include pattern recommendations in synthesis reports
- Analyze pattern library coverage and gaps
- Generate pattern-based action items

This creates a **learning reasoning system** that becomes more intelligent and helpful over time by capturing and reusing your most successful problem-solving approaches.