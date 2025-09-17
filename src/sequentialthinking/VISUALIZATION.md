# Decision Tree Visualization Tool

The Sequential Thinking MCP server now includes a powerful `visualize_decision_tree` tool that generates visual representations of your reasoning paths and decision points.

## Features

### Core Visualization
- **ASCII tree diagrams** showing thought relationships and hierarchy
- **Confidence indicators** with visual bars (███ high, ██░ medium, █░░ low, ░░░ very low)  
- **Decision point markers** (🔶) for thoughts with uncertainty, branches, or choices
- **Critical path highlighting** (⭐) showing the highest confidence path to deepest reasoning
- **Evidence/assumption counts** (+3E -2A) showing supporting data and risks

### Advanced Analysis  
- **Tree structure analysis** parsing thought references to build relationships
- **Path weight calculation** based on confidence scores and reasoning depth
- **Decision node identification** through content analysis and confidence levels
- **Bottleneck detection** in reasoning chains
- **Quality assessment** through evidence gaps and assumption risks

### Filtering and Focus
- **Confidence thresholds** to focus on high or low confidence areas
- **Branch focusing** to examine specific reasoning paths
- **Evidence display toggles** for cleaner or more detailed views
- **Format options** (ASCII, JSON, or both)

## Usage Examples

### Basic Usage
```javascript
{
  "name": "visualize_decision_tree",
  "arguments": {}
}
```

### Focus on Low Confidence Areas
```javascript
{
  "name": "visualize_decision_tree", 
  "arguments": {
    "confidenceThreshold": 0.0,
    "outputFormat": "ascii"
  }
}
```

### Examine Specific Branch
```javascript
{
  "name": "visualize_decision_tree",
  "arguments": {
    "focusBranch": "alternative-approach",
    "showEvidence": true
  }
}
```

### Get Structured Data for External Tools
```javascript
{
  "name": "visualize_decision_tree",
  "arguments": {
    "outputFormat": "json"
  }
}
```

## Example Output

```
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
```

## Interpretation Guide

### Confidence Bars
- **███** (High): 70-100% confidence
- **██░** (Medium-High): 50-70% confidence  
- **█░░** (Medium-Low): 30-50% confidence
- **░░░** (Low): 0-30% confidence

### Decision Markers
- **🔶** Decision Point: Thought with uncertainty, multiple options, or branches
- **⭐** Critical Path: Part of the highest-confidence reasoning chain

### Metadata
- **+3E**: Number of supporting evidence items
- **-2A**: Number of underlying assumptions (potential risks)
- **[tags]**: Categorization tags for the thought

### Statistics
- **Decision Points**: Number of nodes requiring choices or having uncertainty
- **Critical Path**: Sequence of thought numbers forming the strongest reasoning chain
- **Avg Confidence**: Mean confidence across all thoughts with confidence data
- **Depth**: Maximum depth of the reasoning tree
- **Breadth**: Average branching factor
- **Low Confidence**: Count of thoughts below 60% confidence
- **Evidence Gaps**: Count of thoughts lacking supporting evidence

## Use Cases

1. **Identify weak reasoning**: Find low-confidence areas that need strengthening
2. **Trace critical paths**: Follow the strongest chains of reasoning
3. **Find decision points**: Locate places where choices were made or uncertainty exists
4. **Assess evidence coverage**: See which thoughts lack supporting data
5. **Review assumption risks**: Identify thoughts with many untested assumptions
6. **Plan follow-up work**: Use statistics to prioritize areas for further analysis

## Integration with Other Tools

The visualization works seamlessly with other Sequential Thinking tools:
- Use after `synthesizeThoughts` to visualize decision patterns
- Combine with `searchThoughts` to focus on specific tagged areas  
- Use with `getRelatedThoughts` to understand thought connections
- Apply after `auto_think` to see autonomous reasoning patterns

This visualization tool transforms linear thought sequences into intuitive tree diagrams, making it easier to understand complex reasoning structures and identify areas for improvement.