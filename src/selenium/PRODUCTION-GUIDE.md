# Selenium MCP Server - Production Grade Implementation

## Overview

This is an **APEX-enforced** Selenium MCP server with production-grade patterns including multi-stage validation, circuit breakers, exponential backoff retries, audit logging, and resource management.

## 🎯 Key Features

### 1. **APEX Enforcement Pattern**

- **Mode**: `enforced` - violations terminate execution
- **Max Runtime**: 300 seconds per tool call
- **Kill on Violation**: Schema violations = immediate termination

### 2. **Multi-Stage Validation**

```
Input Validation → Execution → Output Validation & Audit
```

- **Input Stage**: URL validation, selector validation, script security checks
- **Execution Stage**: Timeouts, retry logic, circuit breaker checks
- **Output Stage**: Audit trail, confidence scoring, contradiction detection

### 3. **Circuit Breaker Pattern**

- **Threshold**: 5 consecutive failures
- **Timeout**: 60 seconds (circuit OPEN)
- **Reset**: 30 seconds (HALF_OPEN attempt)

States:

- `CLOSED`: Normal operation
- `OPEN`: Rejecting requests (cooling down)
- `HALF_OPEN`: Testing recovery

### 4. **Exponential Backoff Retry**

- **Max Attempts**: 3
- **Base Delay**: 1000ms
- **Max Delay**: 10000ms
- **Jitter**: ±10% to prevent thundering herd

Retry only on:

- `5xx` errors (server failures)
- Timeouts
- `429` (rate limiting)

**Never retry** on `4xx` errors (client errors) except 429.

### 5. **Resource Management**

```typescript
resources: {
    max_sessions: 10,           // Maximum concurrent browser sessions
    max_memory_mb: 2048,        // Total memory limit (rough estimate)
    session_timeout_ms: 600000, // 10 minutes idle timeout
    page_load_timeout_ms: 30000,
    implicit_wait_ms: 5000,
}
```

### 6. **Audit Logging**

Every tool call is logged with:

- `timestamp`: When the call occurred
- `stage`: Which stage (execution)
- `tool`: Tool name
- `session_id`: Active session
- `duration_ms`: Execution time
- `success`: true/false
- `error`: Error message (if failed)
- `metadata`: Confidence score, etc.

Logs are:

- Rotated (max 10,000 entries)
- Written to `stderr` (doesn't interfere with stdio MCP)
- Drained on graceful shutdown

### 7. **Stale Session Cleanup**

Background task runs every 60 seconds:

- Detects sessions idle > 10 minutes
- Gracefully closes driver
- Frees resources

## 📊 Configuration

Located at top of `index.ts`:

```typescript
const CONFIG = {
    system: {
        mode: "enforced",
        max_runtime_sec: 300,
        allow_parallel: false,
        kill_on_violation: true,
    },
    resources: { /* ... */ },
    validation: {
        schema_violation: "DROP",
        confidence_min: 0.7,
        contradiction_limit: 0,
    },
    retry: { /* ... */ },
    circuit_breaker: { /* ... */ },
    audit: { /* ... */ },
};
```

## 🛠️ Available Tools

### Core Tools (14)

1. `start_browser` - Launch Chrome/Firefox with options
2. `navigate` - Navigate to URL
3. `find_element` - Find element with wait
4. `click_element` - Click with optional force-click
5. `send_keys` - Type text, optional clear
6. `take_screenshot` - Capture screenshot (PNG)
7. `get_page_info` - Title, URL, source
8. `execute_script` - Run JavaScript (security validated)
9. `wait_for_element` - Wait for element to appear/be visible
10. `get_element_text` - Extract text content
11. `list_sessions` - Show all active sessions
12. `switch_session` - Switch between sessions
13. `close_session` - Close specific session
14. **`get_audit_stats`** ✨ - System health metrics

### New: get_audit_stats

Returns:

```json
{
  "success": true,
  "stats": {
    "total_requests": 1234,
    "total_errors": 21,
    "success_rate": 0.983,
    "avg_duration_ms": 342.5,
    "active_sessions": 3,
    "uptime_ms": 1234567
  }
}
```

## 🚀 Usage Examples

### 1. Start Browser with Enhanced Security

```json
{
  "tool": "start_browser",
  "arguments": {
    "browser": "chrome",
    "options": {
      "headless": true,
      "window_size": "1920x1080",
      "incognito": true
    }
  }
}
```

Features:

- User-Agent spoofing (anti-detection)
- Automation flags disabled
- Sandbox disabled for Docker compatibility

### 2. Navigate with Validation

```json
{
  "tool": "navigate",
  "arguments": {
    "url": "https://example.com"
  }
}
```

Validation:

- URL format check (must be valid HTTP/HTTPS)
- Confidence scoring
- If invalid → schema violation → DROP (in enforced mode)

### 3. Execute Script (with Security Check)

```json
{
  "tool": "execute_script",
  "arguments": {
    "script": "return document.title"
  }
}
```

Security filters:

- Max length: 10,000 characters
- Blocks: `eval()`, `Function()`, `<script>` tags
- Confidence penalty for dangerous patterns

### 4. Monitor System Health

```json
{
  "tool": "get_audit_stats",
  "arguments": {}
}
```

Use this to:

- Check success rate
- Monitor error spikes
- Detect performance degradation
- Verify circuit breaker state

## 📈 Monitoring & Observability

### Audit Log Structure

```json
{
  "level": "INFO",
  "timestamp": "2025-12-16T10:30:45.123Z",
  "stage": "execution",
  "tool": "navigate",
  "session_id": "session-1734345045123-a1b2c3",
  "duration_ms": 523,
  "success": true,
  "metadata": { "confidence": 1.0 }
}
```

### Circuit Breaker Logs

```
Circuit breaker OPEN for click_element. Will retry at 2025-12-16T10:31:45.123Z
Circuit breaker entering HALF_OPEN for click_element
```

### Retry Logs

```
Retry attempt 1/3 for navigate after 1100ms
Retry attempt 2/3 for navigate after 2200ms
```

### Graceful Shutdown

```
Received SIGINT. Starting graceful shutdown...
Writing 1234 audit entries...
Closing 3 active sessions...
Closed session: session-xxx
Closed session: session-yyy
Closed session: session-zzz
Shutdown complete.
```

## 🔧 Troubleshooting

### Circuit Breaker is OPEN

**Symptom**: `Circuit breaker is OPEN for <tool>. Next retry in 45s`

**Cause**: 5+ consecutive failures

**Fix**:

1. Wait 60 seconds for automatic reset
2. Check upstream service health
3. Review audit logs for root cause:

   ```bash
   # Check recent errors
   grep '"success":false' audit.log | tail -20
   ```

### Schema Validation Errors

**Symptom**: `Schema violation (mode=enforced): Invalid URL format`

**Cause**: Input doesn't match expected schema

**Fix**:

1. Validate inputs before calling tool
2. Check URL format (must start with http/https)
3. Verify selector types (css, xpath, id, name, class, tag only)

### Memory Limit Exceeded

**Symptom**: `Memory limit exceeded: 2100MB / 2048MB`

**Cause**: Too many active sessions

**Fix**:

1. Close unused sessions: `close_session`
2. Increase `CONFIG.resources.max_memory_mb`
3. Reduce `CONFIG.resources.max_sessions`

### Execution Timeout

**Symptom**: `Execution timeout after 300s`

**Cause**: Long-running operation

**Fix**:

1. Increase `CONFIG.system.max_runtime_sec`
2. Break into smaller operations
3. Check page load timeout settings

## 🔐 Security Considerations

### 1. JavaScript Execution

- Scripts are validated for dangerous patterns
- Max length enforced (10KB)
- Confidence penalty for risky code

### 2. Browser Isolation

- Each session is isolated
- Incognito mode option
- No shared state between sessions

### 3. Resource Exhaustion Prevention

- Max sessions limit (10)
- Memory tracking (rough estimate)
- Stale session cleanup (10 min idle)

### 4. Audit Trail

- Immutable log entries
- Timestamp + metadata
- Full trace of all operations

## 🎨 Advanced Patterns

### Pattern 1: Multi-Session Testing

```python
# Start multiple browsers
chrome_id = call_tool("start_browser", {"browser": "chrome"})
firefox_id = call_tool("start_browser", {"browser": "firefox"})

# Test on Chrome
call_tool("switch_session", {"session_id": chrome_id})
call_tool("navigate", {"url": "https://example.com"})
# ... test ...

# Test on Firefox
call_tool("switch_session", {"session_id": firefox_id})
call_tool("navigate", {"url": "https://example.com"})
# ... test ...
```

### Pattern 2: Retry with Backoff (Automatic)

All operations automatically retry on transient failures:

- 1st retry: ~1s delay
- 2nd retry: ~2s delay
- 3rd retry: ~4s delay

No code changes needed—built into the server.

### Pattern 3: Health Check Loop

```python
while True:
    stats = call_tool("get_audit_stats", {})

    if stats["success_rate"] < 0.9:
        alert("Error rate spiking!")

    if stats["active_sessions"] > 8:
        cleanup_old_sessions()

    time.sleep(60)
```

### Pattern 4: Circuit Breaker Aware

```python
try:
    result = call_tool("click_element", {...})
except CircuitBreakerOpenError:
    # Wait for cooldown
    time.sleep(60)
    # Retry
    result = call_tool("click_element", {...})
```

## 📦 Deployment

### Option 1: Direct Node.js

```bash
node dist/index.js
```

### Option 2: Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "selenium": {
      "command": "node",
      "args": ["/path/to/mcp-servers-repo/src/selenium/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Option 3: Docker

```dockerfile
FROM node:20-slim

# Install Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist

CMD ["node", "dist/index.js"]
```

## 🧪 Testing

### Test Circuit Breaker

```python
# Force failures
for i in range(6):
    try:
        call_tool("navigate", {"url": "invalid://url"})
    except:
        pass

# Should trigger circuit breaker
try:
    call_tool("navigate", {"url": "https://example.com"})
except CircuitBreakerOpenError:
    print("Circuit breaker working!")
```

### Test Retry Logic

```python
# Simulate transient failure (will auto-retry)
call_tool("navigate", {"url": "https://httpstat.us/503"})
```

### Test Resource Limits

```python
# Start 11 sessions (should fail on 11th)
for i in range(11):
    try:
        call_tool("start_browser", {"browser": "chrome"})
    except ResourceLimitError:
        print("Resource limit enforced!")
```

## 📝 Audit Log Analysis

### Success Rate Over Time

```bash
grep '"success":true' audit.log | wc -l    # Success count
grep '"success":false' audit.log | wc -l   # Failure count
```

### Average Duration by Tool

```bash
grep '"tool":"navigate"' audit.log | \
  jq '.duration_ms' | \
  awk '{sum+=$1; count++} END {print sum/count}'
```

### Error Breakdown

```bash
grep '"success":false' audit.log | \
  jq '.error' | \
  sort | uniq -c | sort -rn
```

## 🚨 Alerts & Thresholds

Recommended alert thresholds:

| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | > 5% | > 10% |
| Avg duration | > 2s | > 5s |
| Active sessions | > 8 | > 9 |
| Circuit breaker opens | > 3/hour | > 10/hour |

## 🔄 Maintenance

### Daily

- Review audit logs for anomalies
- Check circuit breaker activation frequency
- Verify success rate > 95%

### Weekly

- Analyze duration trends
- Review and tune timeout settings
- Update browser versions

### Monthly

- Audit security patterns
- Review and adjust resource limits
- Performance optimization review

## 📚 References

- [Model Context Protocol](https://modelcontextprotocol.io)
- [Selenium WebDriver](https://www.selenium.dev/documentation/webdriver/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

---

**Version**: 1.0.0
**Updated**: December 16, 2025
**Status**: Production Ready ✅
