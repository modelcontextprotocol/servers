# Sequential Thinking MCP Server

An MCP server for dynamic, reflective problem-solving through sequential thoughts.

## Overview

This server provides structured, step-by-step thinking with support for revisions, branching, and session tracking. Thoughts are validated, sanitized, and stored in a bounded circular buffer.

## Tools

### `sequentialthinking`

Process a single thought in a sequential chain.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `thought` | string | yes | The current thinking step |
| `nextThoughtNeeded` | boolean | yes | Whether another thought step is needed |
| `thoughtNumber` | number | yes | Current thought number (1-based) |
| `totalThoughts` | number | yes | Estimated total thoughts needed (adjusts automatically) |
| `isRevision` | boolean | no | Whether this revises previous thinking |
| `revisesThought` | number | no | Which thought number is being reconsidered |
| `branchFromThought` | number | no | Branching point thought number |
| `branchId` | string | no | Branch identifier |
| `needsMoreThoughts` | boolean | no | If more thoughts are needed beyond the estimate |
| `sessionId` | string | no | Session identifier for tracking |

**Response fields:** `thoughtNumber`, `totalThoughts`, `nextThoughtNeeded`, `branches`, `thoughtHistoryLength`, `sessionId`, `timestamp`

### `health_check`

Returns server health status including memory, response time, error rate, storage, and security checks.

### `metrics`

Returns request metrics (counts, response times), thought metrics (totals, branches), and system metrics.

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
- `npm test` — Run tests
- `npm run lint` — Run ESLint
- `npm run lint:fix` — Auto-fix lint issues
- `npm run type-check` — TypeScript type checking

## License

SEE LICENSE IN LICENSE
