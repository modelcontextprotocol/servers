# Auto-Think Feature Test Guide

This guide demonstrates how to test the new `auto_think` tool in the Sequential Thinking server.

## Prerequisites

1. The server must be built: `npm run build`
2. The MCP client must support sampling
3. At least one manual thought must exist before using auto-thinking

## Usage Example

### Step 1: Start with Manual Thoughts
```json
{
  "tool": "sequentialthinking",
  "arguments": {
    "thought": "I need to solve the problem of optimizing database queries for our e-commerce platform. The main issue is slow page loads during peak traffic.",
    "thoughtNumber": 1,
    "totalThoughts": 5,
    "nextThoughtNeeded": true,
    "tags": ["database", "optimization", "performance"],
    "confidence": 0.7,
    "evidence": ["User complaints about slow loading", "Analytics showing 3-5 second page loads"]
  }
}
```

### Step 2: Use Auto-Thinking
```json
{
  "tool": "auto_think", 
  "arguments": {
    "maxIterations": 3
  }
}
```

## Expected Behavior

The `auto_think` tool will:

1. **Analyze Context**: Review existing thoughts, tags, and confidence levels
2. **Generate Next Step**: Use MCP sampling to create contextually appropriate next thoughts
3. **Auto-Enhance**: Automatically add confidence, tags, evidence, references
4. **Iterate**: Continue generating thoughts until completion or max iterations
5. **Return Results**: Provide summary of all generated thoughts

## Key Features Demonstrated

### Smart Prompt Generation
- Analyzes problem domains from existing tags
- Identifies low-confidence areas needing attention
- Considers assumption chains and evidence gaps

### Auto-Enhancement
- Confidence estimation based on language certainty
- Intelligent tagging based on content analysis  
- Reference detection to previous thoughts
- Evidence extraction from generated content

### Adaptive Stopping
- Recognizes completion signals ("conclusion", "final", "solved")
- Continues on uncertainty signals ("need to", "unclear", "however")
- Respects maxIterations parameter

## Error Handling

The tool will return errors for:
- No server initialization for sampling
- No existing thoughts to build upon
- Sampling failures or timeouts
- JSON parsing errors in enhancement

## Integration with Existing Features

The auto-generated thoughts integrate seamlessly with:
- `getThought` - Retrieve specific auto-generated thoughts
- `searchThoughts` - Find thoughts by auto-generated tags
- `getRelatedThoughts` - Follow auto-detected references
- `synthesizeThoughts` - Include auto-thoughts in synthesis

This creates a complete autonomous reasoning system where the server can drive its own thinking process using Claude's capabilities!