# DeepThink Agent Integration Guide

This guide shows how to integrate the DeepThink Agent with the Sequential Thinking MCP server for enhanced reasoning capabilities.

## Prerequisites

1. **Sequential Thinking MCP Server**: Must be running and accessible
2. **DeepThink Agent**: Built and configured
3. **MCP Client**: Claude or compatible MCP client

## Integration Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Claude Client │    │  DeepThink Agent │    │ Sequential Thinking │
│                 │────│                  │────│   MCP Server        │
│ - User queries  │    │ - Domain detect  │    │ - Thought storage   │
│ - Final answers │    │ - Smart tagging  │    │ - Reference links   │
│                 │    │ - Confidence     │    │ - Search/synthesis  │
└─────────────────┘    │ - Branching      │    └─────────────────────┘
                       │ - Synthesis      │
                       └──────────────────┘
```

## Setup Instructions

### 1. Build the Agent

```bash
cd /home/rpm/claude/mcp-servers/agents
npm install
npm run build
```

### 2. Configure MCP Client

Add both servers to your MCP configuration:

```json
{
  "mcpServers": {
    "deepthink-agent": {
      "command": "node",
      "args": ["/home/rpm/claude/mcp-servers/agents/dist/deepthink-agent.js"],
      "env": {
        "DEEPTHINK_LOG_LEVEL": "info",
        "DEEPTHINK_AUTO_SYNTHESIS": "true"
      }
    },
    "sequential-thinking": {
      "command": "node", 
      "args": ["/home/rpm/claude/mcp-servers/src/sequentialthinking/dist/index.js"],
      "env": {
        "DISABLE_THOUGHT_LOGGING": "false"
      }
    }
  }
}
```

### 3. Integration Patterns

## Pattern 1: Agent-Enhanced Thinking

The DeepThink Agent enhances thoughts before sending to Sequential Thinking server:

```javascript
// 1. Agent analyzes and enhances the thought
const enhanced = await deepthink_continue({
  thought: "Analyzing the trade-offs between microservices and monoliths",
  thought_number: 3
});

// 2. Enhanced thought sent to Sequential Thinking server
const stored = await sequentialthinking({
  thought: enhanced.enhanced_thought.thought,
  thoughtNumber: enhanced.enhanced_thought.thoughtNumber,
  totalThoughts: enhanced.enhanced_thought.totalThoughts,
  nextThoughtNeeded: enhanced.enhanced_thought.nextThoughtNeeded,
  tags: enhanced.enhanced_thought.tags,
  references: enhanced.enhanced_thought.references,
  // Branching if suggested
  branchFromThought: enhanced.branchingInfo?.branchFromThought,
  branchId: enhanced.branchingInfo?.branchId
});
```

## Pattern 2: Automatic Problem Analysis

Agent automatically sets up thinking context based on problem characteristics:

```javascript
// 1. Initialize with problem analysis
const context = await deepthink_analyze({
  problem: "Design a real-time chat system for 1M users",
  mode: "architecture"  // Agent detected this automatically
});

// 2. Agent provides structured thinking approach
console.log(context.suggestions);
// ["Break down scalability requirements", "Analyze connection management", "Consider message routing options"]

// 3. Start sequential thinking with agent guidance
await sequentialthinking({
  thought: "Starting with scalability analysis: 1M concurrent connections require distributed architecture",
  thoughtNumber: 1,
  totalThoughts: context.enhanced_thought.totalThoughts, // Agent estimated 15
  tags: context.enhanced_thought.tags, // ["analysis", "software-architecture", "scalability"]
  nextThoughtNeeded: true
});
```

## Pattern 3: Confidence-Driven Branching

Agent monitors confidence and triggers exploration:

```javascript
// Agent detects low confidence and suggests branching
const result = await deepthink_continue({
  thought: "Not sure if we should use WebSocket or Server-Sent Events",
  thought_number: 4
});

if (result.branching_suggestion?.recommended) {
  // Create branch for alternative exploration
  await sequentialthinking({
    thought: "Branch A: WebSocket analysis - bi-directional, higher overhead but full-duplex communication",
    thoughtNumber: 5,
    totalThoughts: result.enhanced_thought.totalThoughts,
    branchFromThought: 4,
    branchId: result.branching_suggestion.branch_id,
    tags: [...result.enhanced_thought.tags, "websocket-analysis"],
    nextThoughtNeeded: true
  });
}
```

## Pattern 4: Automatic Synthesis

Agent identifies synthesis opportunities and combines insights:

```javascript
const result = await deepthink_continue({
  thought: "Comparing all the messaging approaches we've explored",
  thought_number: 8
});

if (result.synthesis_opportunity) {
  // Retrieve thoughts to synthesize
  const thoughtsToSynthesize = [];
  for (const num of result.synthesis_opportunity.thoughts_to_synthesize) {
    const thought = await getThought({ thoughtNumber: num });
    thoughtsToSynthesize.push(thought);
  }
  
  // Create synthesis thought
  await sequentialthinking({
    thought: `Synthesis: ${generateSynthesis(thoughtsToSynthesize)}`,
    thoughtNumber: 9,
    totalThoughts: result.enhanced_thought.totalThoughts,
    references: result.synthesis_opportunity.thoughts_to_synthesize,
    tags: [...result.enhanced_thought.tags, "synthesis"],
    nextThoughtNeeded: true
  });
}
```

## Advanced Integration Features

### 1. Custom Domain Detection

Override agent's domain detection for specialized use cases:

```javascript
const context = await deepthink_analyze({
  problem: "Optimize database queries for mobile app",
  mode: "debugging",  // Force debugging mode
  complexity_override: "high",
  evidence_level: "comprehensive"
});
```

### 2. Multi-Modal Analysis

Combine different thinking modes within a session:

```javascript
// Start with research mode
let context = await deepthink_analyze({
  problem: "Should we migrate from REST to GraphQL?",
  mode: "research"
});

// Switch to architecture mode for technical design
context = await deepthink_continue({
  thought: "Based on research, now designing the migration architecture",
  thought_number: 8,
  force_mode: "architecture"
});
```

### 3. Evidence Tracking Integration

Use agent's evidence tracking with Sequential Thinking's search:

```javascript
// Agent tracks evidence by domain
const evidence = await deepthink_continue({
  thought: "Performance testing shows 40% improvement with GraphQL batching",
  thought_number: 12
});

// Search related evidence using Sequential Thinking
const related = await searchThoughts({
  query: "performance",
  tags: ["evidence", "graphql"]
});
```

## Best Practices

### 1. Problem Initialization
Always start with `deepthink_analyze` for complex problems:

```javascript
// ✅ Good: Let agent analyze and set context
const context = await deepthink_analyze({
  problem: "Complex multi-faceted problem description"
});

// ❌ Avoid: Starting sequential thinking without context
await sequentialthinking({
  thought: "Starting to think about this problem",
  thoughtNumber: 1,
  totalThoughts: 5  // Likely underestimated
});
```

### 2. Trust Agent Suggestions
Follow agent's branching and synthesis recommendations:

```javascript
const result = await deepthink_continue({ ... });

// ✅ Good: Follow agent's branching suggestion
if (result.branching_suggestion?.recommended) {
  // Create branches as suggested
}

// ✅ Good: Synthesize when agent recommends
if (result.synthesis_opportunity) {
  // Perform synthesis
}
```

### 3. Use Appropriate Evidence Levels
Match evidence level to problem complexity:

```javascript
// For research problems
deepthink_analyze({ 
  problem: "...", 
  evidence_level: "comprehensive" 
});

// For quick decisions
deepthink_analyze({ 
  problem: "...", 
  evidence_level: "standard" 
});
```

### 4. Monitor Confidence Trends
Use agent reports to track reasoning quality:

```javascript
const report = await deepthink_report();
// Check confidence trajectory and branching decisions
if (report.confidence < 0.7) {
  // Consider more exploration or evidence gathering
}
```

## Troubleshooting

### Common Issues

1. **Agent not detecting domain correctly**
   - Use `mode` parameter to force specific mode
   - Provide more specific problem description

2. **Too much/too little branching**
   - Adjust `DEEPTHINK_CONFIDENCE_THRESHOLD` environment variable
   - Use `force_branch: true/false` to override

3. **Synthesis not happening**
   - Check `DEEPTHINK_AUTO_SYNTHESIS` is enabled
   - Use `force_synthesis: true` when needed

4. **Tags not relevant**
   - Agent learns from problem domain and content
   - Ensure clear, specific problem descriptions

### Debug Mode

Enable debug logging to see agent decision-making:

```json
{
  "env": {
    "DEEPTHINK_LOG_LEVEL": "debug"
  }
}
```

## Performance Considerations

### Thought Estimation
Agent estimates total thoughts based on:
- Problem complexity (low: 3, medium: 5, high: 8, extreme: 12)
- Mode adjustments (+2-4 thoughts)
- Confidence adjustments (+2-3 thoughts for low confidence)

### Memory Usage
- Agent maintains context and history in memory
- Consider restarting for very long sessions (>100 thoughts)
- Evidence tracking grows with session length

### Response Times
- Agent processing adds ~50-100ms per thought
- Domain detection and tagging are fast (<10ms)
- Branching analysis may take longer for complex problems

This integration guide demonstrates how the DeepThink Agent transforms the Sequential Thinking experience from manual thought management to intelligent, automated reasoning assistance.