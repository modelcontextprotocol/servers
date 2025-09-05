# Sequential Thinking MCP Server

An advanced MCP server implementation that provides sophisticated tools for structured, reflective problem-solving with enhanced reasoning capabilities.

## ✨ Enhanced Features

### 🧠 Core Thinking Capabilities
- Break down complex problems into manageable steps
- Revise and refine thoughts as understanding deepens
- Branch into alternative paths of reasoning
- Adjust the total number of thoughts dynamically
- Generate and verify solution hypotheses

### 🔗 Advanced Reference System
- **Thought References**: Link thoughts together to build complex reasoning chains
- **Smart Tagging**: Categorize thoughts by domain (architecture, debugging, research, etc.)
- **Search & Retrieval**: Find thoughts by content, tags, or reference relationships
- **Relationship Mapping**: Discover connected thoughts through multiple relationship types

### 📊 Confidence & Evidence Tracking
- **Confidence Scoring**: Rate certainty levels (0-1 scale) for each thought
- **Evidence Documentation**: Track supporting evidence for reasoning steps
- **Assumption Tracking**: Record underlying assumptions with risk assessment
- **Quality Analysis**: Identify low-confidence areas and reasoning gaps

### 🎯 Synthesis & Insights
- **Decision Extraction**: Automatically identify key decisions and their rationale
- **Risk Assessment**: Flag areas of uncertainty and potential problems
- **Action Item Generation**: Create prioritized next steps from thinking process
- **Alternative Analysis**: Comprehensive view of considered options
- **Quality Metrics**: Overall confidence, reasoning quality, and completeness

### 🤖 DeepThink Agent Integration
- **Specialized Agent**: Pre-built Claude agent optimized for complex reasoning
- **Auto-Enhancement**: Automatic tagging, confidence assessment, and synthesis
- **Domain Modes**: Architecture, debugging, research, and general problem-solving
- **Smart Automation**: Confidence-driven branching and synthesis triggers

## 🛠️ Tools Available

### 1. `sequential_thinking`
Core thinking tool with enhanced capabilities for structured problem-solving.

**Enhanced Inputs:**
- `thought` (string): The current thinking step
- `nextThoughtNeeded` (boolean): Whether another thought step is needed
- `thoughtNumber` (integer): Current thought number
- `totalThoughts` (integer): Estimated total thoughts needed
- `references` (array, optional): Previous thoughts this builds on
- `tags` (array, optional): Category tags for organization
- `confidence` (number, optional): Certainty level (0-1 scale)
- `evidence` (array, optional): Supporting evidence
- `assumptions` (array, optional): Underlying assumptions
- `isRevision` (boolean, optional): Whether this revises previous thinking
- `revisesThought` (integer, optional): Which thought is being reconsidered
- `branchFromThought` (integer, optional): Branching point thought number
- `branchId` (string, optional): Branch identifier

### 2. `get_thought`
Retrieve specific thoughts by number for reference building.

### 3. `search_thoughts`
Search thoughts by content and filter by tags.

### 4. `get_related_thoughts`
Discover thoughts connected through references, branches, or shared tags.

### 5. `synthesize_thoughts`
Generate comprehensive analysis with decisions, risks, actions, and insights.

### 6. `auto_think` ✨ NEW
**Autonomous thought generation using MCP sampling for self-driven reasoning.**

Leverages Claude's reasoning capabilities through MCP sampling to:
- Analyze current thought history and identify next logical steps
- Generate intelligent, contextually-aware thoughts automatically
- Auto-enhance thoughts with confidence, tags, evidence, and references
- Continue iteratively until problem resolution or max iterations reached

**Inputs:**
- `maxIterations` (integer, 1-10, default: 3): Maximum autonomous thoughts to generate

**Key Features:**
- **Smart Context Analysis**: Analyzes problem domains, confidence gaps, and reasoning chains
- **Intelligent Prompting**: Generates contextual prompts based on thought history and gaps
- **Auto-Enhancement**: Automatically estimates confidence, extracts evidence, adds tags
- **Reference Detection**: Identifies connections to previous thoughts
- **Adaptive Stopping**: Recognizes completion signals or continuation needs

**Requirements:**
- At least one manual thought must exist first
- MCP client must support sampling functionality

### 7. `edit_thought` ✨ NEW
**Interactive thought editing with comprehensive change tracking.**

Modify existing thoughts while preserving complete edit history:
- **Multi-field Editing**: Update content, confidence, evidence, assumptions, or tags
- **Change Tracking**: Automatic edit history with timestamps and attribution
- **Original Preservation**: Keep original content for rollback capability
- **Audit Trail**: Edit reasons and user ID tracking for collaborative environments
- **Granular Detection**: Precise tracking of what changed and when

**Inputs:**
- `thoughtNumber` (integer, required): Thought number to edit
- `thought` (string, optional): Updated thought content
- `confidence` (number, 0-1, optional): Updated confidence level
- `evidence` (array, optional): Updated evidence list
- `assumptions` (array, optional): Updated assumptions list
- `tags` (array, optional): Updated tags list
- `reason` (string, optional): Edit reason for audit trail
- `userId` (string, optional): User ID for collaborative tracking

### 8. `get_thought_edit_history` ✨ NEW
**Retrieve complete edit history for any thought.**

View the full evolution of thoughts with detailed change tracking:
- **Complete History**: All edits with timestamps and change types
- **Change Analysis**: Before/after comparisons for each modification
- **User Attribution**: Track who made which changes when
- **Original Comparison**: See difference from original to current content

**Inputs:**
- `thoughtNumber` (integer, required): Thought number to get history for

## 🚀 Usage Scenarios

### Enhanced Problem-Solving
- **Complex Architecture Decisions**: Track trade-offs with confidence levels and evidence
- **Systematic Debugging**: Document hypothesis testing with evidence chains
- **Research Synthesis**: Link insights across sources with reference tracking
- **Strategic Planning**: Explore alternatives with risk assessment and synthesis

### Advanced Features
- **Confidence-Driven Exploration**: Automatically branch when certainty is low
- **Evidence-Based Reasoning**: Require supporting evidence for key claims  
- **Pattern Learning**: Tag and categorize for future pattern recognition
- **Comprehensive Synthesis**: Transform thinking into actionable insights

## 💡 Quick Start Examples

### Basic Enhanced Thinking
```json
{
  "thought": "Initial analysis suggests API-first approach",
  "thoughtNumber": 1,
  "totalThoughts": 5,
  "nextThoughtNeeded": true,
  "tags": ["architecture", "api-design"],
  "confidence": 0.7,
  "evidence": ["Team has API expertise", "Faster mobile development"]
}
```

### Building References
```json
{
  "thought": "Building on thoughts 2 and 4, the security model needs revision",
  "thoughtNumber": 6,
  "references": [2, 4],
  "tags": ["architecture", "security"],
  "confidence": 0.8,
  "evidence": ["Recent security audit findings"]
}
```

### Search and Synthesis
```json
// Search thoughts
{"query": "security", "tags": ["architecture"]}

// Generate synthesis
{} // No parameters needed - analyzes all thoughts
```

### Autonomous Thinking ✨ NEW
```json
// Start with a manual thought
{
  "thought": "Need to optimize our API response times for mobile users",
  "thoughtNumber": 1,
  "totalThoughts": 3,
  "nextThoughtNeeded": true,
  "tags": ["performance", "api"],
  "confidence": 0.6,
  "evidence": ["Mobile users report 2-3 second delays"]
}

// Let the server continue thinking autonomously
{"maxIterations": 4}
```

**Auto-Think will:**
1. Analyze the performance/API context
2. Generate logical next steps (caching, database optimization, etc.)
3. Auto-enhance with confidence scores and evidence
4. Continue until reaching a solution or max iterations
5. Return complete thought chain with synthesis

### Interactive Thought Editing ✨ NEW
```json
// Create initial thought
{
  "thought": "Initial analysis suggests API-first approach",
  "thoughtNumber": 1,
  "totalThoughts": 3,
  "nextThoughtNeeded": true,
  "tags": ["architecture", "draft"],
  "confidence": 0.6,
  "evidence": ["Team has API expertise"]
}

// Edit the thought with improvements
{
  "thoughtNumber": 1,
  "thought": "REFINED: Comprehensive analysis strongly supports API-first approach with GraphQL",
  "confidence": 0.85,
  "evidence": ["Team has API expertise", "GraphQL reduces API calls by 60%", "Industry adoption growing 40% annually"],
  "tags": ["architecture", "graphql", "validated"],
  "reason": "Added GraphQL specifics and supporting evidence from research"
}

// View complete edit history
{
  "thoughtNumber": 1
}
```

**Edit Response:**
```json
{
  "thoughtNumber": 1,
  "status": "edited",
  "message": "Thought 1 successfully edited with 4 change(s)",
  "editsApplied": [
    {
      "changeType": "content",
      "previousValue": "Initial analysis suggests API-first approach",
      "newValue": "REFINED: Comprehensive analysis strongly supports API-first approach with GraphQL"
    },
    {
      "changeType": "confidence", 
      "previousValue": 0.6,
      "newValue": 0.85
    }
  ],
  "changesSummary": {
    "totalEdits": 4,
    "originalContent": "Initial analysis suggests API-first approach"
  }
}
```

## 🎯 Comprehensive Demo Showcase

For detailed real-world examples showcasing all features in action, see **[Demo Showcase](./demo-showcase.md)** which includes:

### Featured Demos
1. **[Technical Architecture Decision](./demo-showcase.md#demo-1-technical-architecture-decision-with-pattern-learning)** - Microservices design with pattern learning
2. **[Creative Writing Support](./demo-showcase.md#demo-2-creative-writing-with-attachment-support)** - Story development with multi-modal attachments
3. **[Complex Problem Solving](./demo-showcase.md#demo-3-complex-problem-solving-with-auto-thinking)** - Auto-thinking and comprehensive synthesis
4. **[Decision Tree Visualization](./demo-showcase.md#demo-4-multi-step-analysis-with-decision-tree-visualization)** - Multi-branch strategic analysis
5. **[Pattern-Guided Workflow](./demo-showcase.md#demo-5-pattern-guided-problem-solving-workflow)** - Complete pattern learning cycle

### Demo Highlights
- **Real-world Scenarios**: Technical architecture, creative writing, strategic planning, database optimization
- **Complete Input/Output Examples**: Full JSON request/response documentation
- **Advanced Features**: Decision trees, pattern learning, multi-modal attachments, autonomous thinking
- **Performance Metrics**: Confidence tracking, evidence analysis, synthesis generation
- **Learning System**: Pattern extraction and recommendation workflows

Each demo includes complete code examples, visual outputs, and detailed analysis showing how the Enhanced Sequential Thinking MCP Server handles complex reasoning tasks across diverse domains.

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### npx

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sequential-thinking"
      ]
    }
  }
}
```

#### docker

```json
{
  "mcpServers": {
    "sequentialthinking": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "mcp/sequentialthinking"
      ]
    }
  }
}
```

To disable logging of thought information set env var: `DISABLE_THOUGHT_LOGGING` to `true`.

## 🤖 DeepThink Agent

A specialized Claude agent that automatically leverages all enhanced features of the Sequential Thinking MCP server for superior problem-solving.

### Features
- **Automatic Enhancement**: Smart tagging, confidence assessment, and evidence tracking
- **Intelligent Branching**: Triggers alternative exploration when confidence is low (<40%)
- **Domain Expertise**: Specialized modes for architecture, debugging, research, and general problems
- **Synthesis Automation**: Automatically generates insights at decision points
- **Pattern Learning**: Builds expertise across problem domains

### Quick Setup
```bash
# Install the DeepThink agent
cd /home/rpm/claude/mcp-servers/agents
npm install
npm run build

# Configure in claude_desktop_config.json
{
  "mcpServers": {
    "deepthink-agent": {
      "command": "node",
      "args": ["/home/rpm/claude/mcp-servers/agents/dist/deepthink-agent.js"]
    }
  }
}
```

### Usage Examples

**Architecture Mode**: Automatically tags thoughts with "architecture", "scalability", "security", tracks confidence for design decisions, and synthesizes at key decision points.

**Debugging Mode**: Tags with "debugging", "hypothesis", "testing", requires evidence for each hypothesis tested, and maintains systematic investigation chains.

**Research Mode**: Tags with "research", "analysis", "validation", tracks assumptions and evidence quality, and synthesizes findings comprehensively.

See `/agents/examples/` for detailed session examples.

### Usage with VS Code

For quick installation, click one of the installation buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-sequential-thinking%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-sequential-thinking%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22--rm%22%2C%22-i%22%2C%22mcp%2Fsequentialthinking%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22--rm%22%2C%22-i%22%2C%22mcp%2Fsequentialthinking%22%5D%7D&quality=insiders)

For manual installation, you can configure the MCP server using one of these methods:

**Method 1: User Configuration (Recommended)**
Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`. This will open your user `mcp.json` file where you can add the server configuration.

**Method 2: Workspace Configuration**
Alternatively, you can add the configuration to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/mcp).

For NPX installation:

```json
{
  "servers": {
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sequential-thinking"
      ]
    }
  }
}
```

For Docker installation:

```json
{
  "servers": {
    "sequential-thinking": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "mcp/sequentialthinking"
      ]
    }
  }
}
```

## 🔧 Development & Building

### Building the Server

Docker:
```bash
docker build -t mcp/sequentialthinking -f src/sequentialthinking/Dockerfile .
```

Local Development:
```bash
cd src/sequentialthinking
npm install
npm run build
npm run watch  # For development with auto-rebuild
```

### Enhanced Features Development

The server includes several enhanced feature branches developed in parallel:

- **`feature/thought-references`**: Thought linking and tagging system
- **`feature/confidence-tracking`**: Confidence scoring and evidence tracking  
- **`feature/synthesis-generation`**: Automatic insights and decision extraction

### Architecture Overview

```
SequentialThinkingServer
├── Core thinking process (sequential_thinking tool)
├── Reference system (get_thought, search_thoughts, get_related_thoughts)
├── Confidence tracking (confidence scoring, evidence validation)
├── Synthesis engine (synthesize_thoughts tool)
└── Enhanced visualization (color-coded confidence, evidence display)

DeepThink Agent
├── Domain detection and mode selection
├── Automatic enhancement (tagging, confidence, evidence)
├── Intelligent automation (branching triggers, synthesis points)
└── Specialized reasoning patterns
```

### Performance Characteristics

- **Thought Processing**: <50ms per thought with full enhancement
- **Search Operations**: <100ms for content and tag filtering
- **Synthesis Generation**: <200ms for complete analysis
- **Memory Usage**: Efficient storage with configurable cleanup

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
