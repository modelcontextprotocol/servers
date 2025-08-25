# DeepThink Claude Agent

A specialized Claude agent that leverages the enhanced Sequential Thinking MCP server for complex reasoning, problem-solving, and analysis tasks.

## Overview

The DeepThink Agent automatically enhances your thinking process with:

- **Smart Problem Domain Detection**: Automatically identifies problem types and applies appropriate strategies
- **Confidence-Driven Branching**: Explores alternative paths when confidence is low or at decision points
- **Automatic Synthesis**: Combines insights at key decision points and phase transitions
- **Reference Building**: Tracks connections between thoughts for complex reasoning chains
- **Evidence Tracking**: Organizes supporting evidence for research and debugging
- **Specialized Modes**: Optimized patterns for architecture, debugging, research, and general analysis

## Features

### Intelligent Context Management
- **Domain Detection**: Automatically identifies problem domains (architecture, debugging, research, etc.)
- **Complexity Assessment**: Evaluates problem complexity to adjust thinking strategies
- **Phase Management**: Guides thinking through analysis → exploration → synthesis → validation → conclusion
- **Confidence Tracking**: Monitors reasoning confidence and triggers branching when needed

### Enhanced Sequential Thinking
- **Smart Tagging**: Auto-generates relevant tags based on thought content and context
- **Reference Linking**: Automatically detects and links related thoughts
- **Branching Logic**: Strategic exploration of alternatives based on confidence and complexity
- **Synthesis Points**: Automatic combination of insights at decision boundaries

### Specialized Modes

#### Architecture Mode
- Focus on system design, scalability, and component interactions
- Enhanced branching for architectural trade-offs
- Synthesis of design patterns and best practices

#### Debugging Mode  
- Evidence-based problem isolation
- Hypothesis testing and validation
- Root cause analysis with confidence tracking

#### Research Mode
- Comprehensive evidence gathering
- Literature and finding synthesis
- Hypothesis generation and testing

#### General Mode
- Flexible reasoning for any problem type
- Adaptive strategies based on problem characteristics

## Installation

```bash
cd /home/rpm/claude/mcp-servers/agents
npm install
npm run build
```

## Usage

### Basic Usage with MCP

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "deepthink-agent": {
      "command": "node",
      "args": ["/path/to/deepthink-agent/dist/deepthink-agent.js"],
      "env": {
        "DEEPTHINK_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Tool Reference

#### `deepthink_analyze`
Initialize deep analysis of a problem.

**Parameters:**
- `problem` (required): The problem or question to analyze
- `mode` (optional): Force specific analysis mode (`architecture`, `debugging`, `research`, `general`)
- `complexity_override` (optional): Override complexity detection (`low`, `medium`, `high`, `extreme`)
- `evidence_level` (optional): Required evidence level (`minimal`, `standard`, `comprehensive`, `exhaustive`)

**Example:**
```json
{
  "tool": "deepthink_analyze",
  "arguments": {
    "problem": "Design a scalable microservices architecture for a high-traffic e-commerce platform",
    "mode": "architecture",
    "evidence_level": "comprehensive"
  }
}
```

#### `deepthink_continue`
Continue the analysis with enhanced thought processing.

**Parameters:**
- `thought` (required): Your current thinking step
- `thought_number` (required): Current thought number in sequence
- `force_branch` (optional): Force branching exploration
- `force_synthesis` (optional): Force synthesis of recent thoughts

**Example:**
```json
{
  "tool": "deepthink_continue", 
  "arguments": {
    "thought": "Considering the trade-offs between service granularity and operational complexity",
    "thought_number": 3,
    "force_branch": false
  }
}
```

#### `deepthink_report`
Generate comprehensive analysis report.

**Example:**
```json
{
  "tool": "deepthink_report",
  "arguments": {}
}
```

## Advanced Features

### Confidence-Driven Branching

The agent automatically branches when:
- Confidence drops below 40% (uncertainty exploration)
- Decision points are detected (option analysis)
- Extreme complexity requires multiple perspectives

```json
// Example branching response
{
  "branching_suggestion": {
    "recommended": true,
    "reason": "low-confidence-exploration",
    "branch_id": "low-conf-3",
    "alternatives": [
      "explore-alternative-approach",
      "gather-more-evidence", 
      "challenge-assumptions"
    ]
  }
}
```

### Automatic Synthesis

Synthesis occurs at:
- Regular intervals for complex problems (every 5 thoughts)
- Phase transitions
- User-requested synthesis points

```json
// Example synthesis opportunity
{
  "synthesis_opportunity": {
    "type": "convergent",
    "thoughts_to_synthesize": [1, 2, 3, 4, 5],
    "confidence_threshold": 0.6
  }
}
```

### Smart Tagging System

Automatic tags include:
- **Phase tags**: `analysis`, `exploration`, `synthesis`, `validation`, `conclusion`
- **Domain tags**: `software-architecture`, `debugging`, `research`, etc.
- **Confidence tags**: `low-confidence`, `high-confidence`
- **Type tags**: `hypothesis`, `evidence`, `conclusion`, `alternative`, `risk-analysis`
- **Complexity tags**: `complexity-low`, `complexity-extreme`

## Integration Examples

### Example 1: Architecture Design Session

```javascript
// Initialize architecture analysis
await deepthink_analyze({
  problem: "Design a scalable real-time chat system for 1M concurrent users",
  mode: "architecture", 
  evidence_level: "comprehensive"
});

// Continue with enhanced thoughts
await deepthink_continue({
  thought: "WebSocket connections will be the primary challenge at this scale",
  thought_number: 1
});

// Agent automatically adds tags: ["analysis", "software-architecture", "scalability"]
// References: [] (first thought)
// Confidence: 0.7 (high confidence statement)

await deepthink_continue({
  thought: "Need to consider connection pooling, load balancing, and message routing strategies",
  thought_number: 2  
});

// Agent detects decision point, suggests branching for different strategies
```

### Example 2: Debug Session

```javascript
await deepthink_analyze({
  problem: "Application crashes intermittently under load with no clear error logs",
  mode: "debugging",
  evidence_level: "exhaustive"
});

// Agent automatically tags with ["debugging", "intermittent-issue"]
// Sets up evidence tracking for debugging hypotheses
```

### Example 3: Research Analysis

```javascript
await deepthink_analyze({
  problem: "Evaluate the impact of remote work on software development productivity",
  mode: "research",
  evidence_level: "comprehensive"
});

// Agent sets up for literature review, evidence synthesis, and hypothesis testing
```

## Environment Variables

- `DEEPTHINK_LOG_LEVEL`: Logging level (`debug`, `info`, `warn`, `error`)
- `DEEPTHINK_MAX_BRANCHES`: Maximum concurrent branches (default: 5)
- `DEEPTHINK_CONFIDENCE_THRESHOLD`: Branching confidence threshold (default: 0.4)
- `DEEPTHINK_AUTO_SYNTHESIS`: Enable automatic synthesis (default: true)

## Development

### Running Tests
```bash
npm test
```

### Building
```bash
npm run build
```

### Watching for Changes
```bash
npm run watch
```

## Architecture

The DeepThink Agent consists of several key components:

### Core Classes

- **DeepThinkAgent**: Main orchestration class
- **ThoughtPattern**: Represents enhanced thought structures
- **SynthesisPoint**: Manages convergence opportunities
- **ContextManager**: Tracks problem domain and complexity

### Key Algorithms

- **Domain Detection**: Keyword-based classification with scoring
- **Complexity Assessment**: Multi-factor analysis (length, structure, keywords)
- **Confidence Tracking**: Content analysis with historical trending
- **Branching Decisions**: Multi-criteria decision making
- **Reference Extraction**: Pattern matching with context awareness

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: [repository-url]/docs
- Examples: See `examples/` directory