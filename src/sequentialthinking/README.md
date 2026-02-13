# Sequential Thinking MCP Server

An MCP server for dynamic, reflective problem-solving through sequential thoughts with MCTS-based tree exploration and metacognitive self-awareness.

## Overview

This server provides structured, step-by-step thinking with support for:
- **Revisions** - Reconsider previous thoughts
- **Branching** - Explore alternative reasoning paths
- **Session tracking** - Maintain context across requests
- **MCTS exploration** - Monte Carlo Tree Search for optimal reasoning paths
- **Thinking modes** - Fast, Expert, and Deep exploration strategies
- **Metacognition** - Self-awareness for confidence, circularity detection, problem classification

## Tools

### `sequentialthinking`

Process a single thought in a sequential chain.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `thought` | string | yes | The current thinking step |
| `nextThoughtNeeded` | boolean | yes | Whether another thought step is needed |
| `thoughtNumber` | number | yes | Current thought number (1-based) |
| `totalThoughts` | number | yes | Estimated total thoughts needed |
| `isRevision` | boolean | no | Whether this revises previous thinking |
| `revisesThought` | number | no | Which thought number is being reconsidered |
| `branchFromThought` | number | no | Branching point thought number |
| `branchId` | string | no | Branch identifier |
| `needsMoreThoughts` | boolean | no | If more thoughts are needed beyond estimate |
| `sessionId` | string | no | Session identifier for tracking |

**Response fields:** `thoughtNumber`, `totalThoughts`, `nextThoughtNeeded`, `branches`, `thoughtHistoryLength`, `sessionId`, `timestamp`

### `get_thought_history`

Retrieve the thought history for a session.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session identifier |
| `branchId` | string | no | Filter by branch |

### `set_thinking_mode`

Configure the thinking mode for a session (enables MCTS exploration).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session identifier |
| `mode` | string | yes | Thinking mode: `fast`, `expert`, or `deep` |

### `suggest_next_thought`

Get AI-powered suggestions for the next thought using MCTS.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session identifier |
| `strategy` | string | no | Selection strategy: `explore`, `exploit`, or `balanced` |

### `evaluate_thought`

Evaluate a thought's quality (0-1 scale) for MCTS backpropagation.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session identifier |
| `nodeId` | string | yes | Node ID to evaluate |
| `value` | number | yes | Quality score (0-1) |

### `backtrack`

Move the thought tree cursor back to a previous node.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session identifier |
| `nodeId` | string | yes | Target node ID |

### `get_thinking_summary`

Get a comprehensive summary of the thought tree.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session identifier |
| `maxDepth` | number | no | Maximum depth to include |

### `health_check`

Returns server health status including memory, response time, error rate, storage, and security checks.

### `metrics`

Returns request metrics (counts, response times), thought metrics (totals, branches), and system metrics.

## Thinking Modes

The server supports three thinking modes for MCTS exploration:

| Mode | Exploration | Target Depth | Best For |
|------|-------------|--------------|----------|
| `fast` | Low (0.5) | 3-5 | Quick decisions |
| `expert` | Balanced (1.41) | 5-10 | Complex analysis |
| `deep` | High (2.0) | 10-20 | Thorough exploration |

### Mode Configuration

| Parameter | fast | expert | deep |
|-----------|------|--------|------|
| `explorationConstant` | 0.5 | √2 (~1.41) | 2.0 |
| `maxBranchingFactor` | 1 | 3 | 5 |
| `targetDepthMin` | 3 | 5 | 10 |
| `targetDepthMax` | 5 | 10 | 20 |
| `autoEvaluate` | true | false | false |
| `enableBacktracking` | false | true | true |

## Metacognition

The server includes self-awareness features that analyze thought patterns:

### Features

- **Circularity Detection** - Detects repetitive thinking patterns using Jaccard similarity
- **Confidence Scoring** - Assesses thought confidence based on linguistic markers
- **Problem Type Classification** - Identifies problem type (analysis, design, debugging, planning, optimization, decision, creative)
- **Perspective Switching** - Suggests alternative viewpoints (optimist, pessimist, expert, beginner, skeptic)
- **Reasoning Gap Analysis** - Detects premature conclusions and missing evidence
- **Adaptive Strategy** - Learns from evaluation history to recommend better strategies

### ModeGuidance Response

When thinking mode is active, responses include:

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | Current thinking mode |
| `currentPhase` | string | Phase: exploring, evaluating, converging, concluded |
| `recommendedAction` | string | Suggested next action |
| `confidenceScore` | number | Thought confidence (0-1) |
| `circularityWarning` | boolean | Whether circular thinking detected |
| `problemType` | string | Classified problem type |
| `strategyGuidance` | string | Problem-type-specific strategy |
| `confidenceTrend` | string | improving, declining, stable, insufficient |
| `reasoningGapWarning` | string | Detected reasoning gaps |
| `reflectionPrompt` | string | Metacognitive reflection question |

## Configuration

All configuration is via environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_NAME` | `sequential-thinking-server` | Server name reported in MCP metadata |
| `SERVER_VERSION` | `1.0.0` | Server version reported in MCP metadata |
| `MAX_HISTORY_SIZE` | `1000` | Maximum thoughts stored in circular buffer |
| `MAX_THOUGHT_LENGTH` | `5000` | Maximum character length per thought |
| `MAX_THOUGHTS_PER_MIN` | `60` | Rate limit per minute per session |
| `MAX_THOUGHTS_PER_BRANCH` | `100` | Maximum thoughts stored per branch |
| `MAX_BRANCH_AGE` | `3600000` | Branch expiration time (ms) |
| `CLEANUP_INTERVAL` | `300000` | Periodic cleanup interval (ms) |
| `BLOCKED_PATTERNS` | *(built-in list)* | Comma-separated regex patterns to block |
| `DISABLE_THOUGHT_LOGGING` | `false` | Disable console thought formatting |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `ENABLE_COLORS` | `true` | Enable colored console output |
| `ENABLE_METRICS` | `true` | Enable metrics collection |
| `ENABLE_HEALTH_CHECKS` | `true` | Enable health check endpoint |
| `HEALTH_MAX_MEMORY` | `90` | Memory usage % threshold for unhealthy status |
| `HEALTH_MAX_STORAGE` | `80` | Storage usage % threshold for unhealthy status |
| `HEALTH_MAX_RESPONSE_TIME` | `200` | Response time (ms) threshold for unhealthy status |
| `HEALTH_ERROR_RATE_DEGRADED` | `2` | Error rate % threshold for degraded status |
| `HEALTH_ERROR_RATE_UNHEALTHY` | `5` | Error rate % threshold for unhealthy status |

## Development

```bash
npm install
npm run build
npm test
```

### Scripts

- `npm run build` — Compile TypeScript
- `npm run watch` — Compile in watch mode
- `npm run test` — Run tests
- `npm run lint` — Run ESLint
- `npm run lint:fix` — Auto-fix lint issues
- `npm run type-check` — TypeScript type checking
- `npm run check` — Run type-check, lint, and format
- `npm run docs` — Generate TypeDoc documentation
- `npm run docker:build` — Build Docker image

## Documentation

Generated API documentation is available in the `docs/` folder. Run `npm run docs` to regenerate.

## License

SEE LICENSE IN LICENSE
