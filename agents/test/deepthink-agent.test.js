import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';

describe('DeepThink Agent Tests', () => {
  let agentProcess;

  // Helper to send MCP request and get response
  const sendMCPRequest = (request) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);

      let response = '';
      
      const onData = (data) => {
        response += data.toString();
        try {
          const parsed = JSON.parse(response);
          clearTimeout(timeout);
          agentProcess.stdout.off('data', onData);
          resolve(parsed);
        } catch (e) {
          // Continue collecting data
        }
      };

      agentProcess.stdout.on('data', onData);
      agentProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  };

  test('should start DeepThink agent successfully', async () => {
    const agentPath = path.join(process.cwd(), 'dist', 'deepthink-agent.js');
    agentProcess = spawn('node', [agentPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Wait for startup message
    await new Promise((resolve) => {
      agentProcess.stderr.on('data', (data) => {
        if (data.toString().includes('DeepThink Claude Agent running')) {
          resolve();
        }
      });
    });

    assert.ok(agentProcess.pid, 'Agent process should start');
  });

  test('should list available tools', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    };

    const response = await sendMCPRequest(request);
    
    assert.strictEqual(response.jsonrpc, '2.0');
    assert.strictEqual(response.id, 1);
    assert.ok(response.result.tools);
    assert.strictEqual(response.result.tools.length, 3);
    
    const toolNames = response.result.tools.map(t => t.name);
    assert.ok(toolNames.includes('deepthink_analyze'));
    assert.ok(toolNames.includes('deepthink_continue'));
    assert.ok(toolNames.includes('deepthink_report'));
  });

  test('should analyze architecture problem correctly', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'deepthink_analyze',
        arguments: {
          problem: 'Design a scalable microservices architecture for high-traffic e-commerce',
          mode: 'architecture'
        }
      }
    };

    const response = await sendMCPRequest(request);
    
    assert.strictEqual(response.jsonrpc, '2.0');
    assert.strictEqual(response.id, 2);
    assert.ok(response.result.content[0].text);
    
    const result = JSON.parse(response.result.content[0].text);
    assert.strictEqual(result.context.mode, 'architecture');
    assert.strictEqual(result.context.domain, 'software-architecture');
    assert.ok(result.context.complexity);
    assert.ok(result.enhanced_thought.tags.includes('software-architecture'));
    assert.ok(result.suggestions.length > 0);
  });

  test('should detect debugging domain automatically', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'deepthink_analyze',
        arguments: {
          problem: 'Application crashes with memory leaks and no clear error logs'
        }
      }
    };

    const response = await sendMCPRequest(request);
    const result = JSON.parse(response.result.content[0].text);
    
    assert.strictEqual(result.context.domain, 'debugging');
    assert.ok(result.enhanced_thought.tags.includes('debugging'));
    assert.ok(result.enhanced_thought.tags.includes('memory-leak'));
  });

  test('should continue thinking with enhanced features', async () => {
    // First analyze
    await sendMCPRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'deepthink_analyze',
        arguments: {
          problem: 'Choose between REST and GraphQL for mobile API'
        }
      }
    });

    // Then continue
    const request = {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'deepthink_continue',
        arguments: {
          thought: 'Both REST and GraphQL have significant trade-offs in this context. REST is simpler but GraphQL offers better mobile efficiency.',
          thought_number: 2
        }
      }
    };

    const response = await sendMCPRequest(request);
    const result = JSON.parse(response.result.content[0].text);
    
    assert.ok(result.enhanced_thought.tags.includes('decision-point') || 
              result.enhanced_thought.tags.includes('alternative'));
    assert.ok(result.confidence_level >= 0 && result.confidence_level <= 1);
    assert.ok(result.suggestions.length > 0);
  });

  test('should suggest branching for low confidence', async () => {
    // Analyze first
    await sendMCPRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'deepthink_analyze',
        arguments: {
          problem: 'Complex distributed systems problem with many unknowns'
        }
      }
    });

    // Continue with uncertain thought
    const request = {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'deepthink_continue',
        arguments: {
          thought: 'I am uncertain about the best approach here. Maybe we should consider different options but not sure which ones.',
          thought_number: 2
        }
      }
    };

    const response = await sendMCPRequest(request);
    const result = JSON.parse(response.result.content[0].text);
    
    // Low confidence should trigger branching suggestion
    assert.ok(result.confidence_level < 0.5);
    assert.ok(result.branching_suggestion?.recommended === true ||
              result.enhanced_thought.tags.includes('low-confidence'));
  });

  test('should generate analysis report', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'deepthink_report',
        arguments: {}
      }
    };

    const response = await sendMCPRequest(request);
    
    assert.strictEqual(response.jsonrpc, '2.0');
    assert.ok(response.result.content[0].text);
    
    const report = response.result.content[0].text;
    assert.ok(report.includes('# DeepThink Analysis Report'));
    assert.ok(report.includes('Domain:'));
    assert.ok(report.includes('Confidence:'));
  });

  test('should handle invalid tool calls gracefully', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'invalid_tool',
        arguments: {}
      }
    };

    const response = await sendMCPRequest(request);
    
    assert.ok(response.result.isError);
    assert.ok(response.result.content[0].text.includes('Unknown tool'));
  });

  test('should validate required parameters', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'deepthink_analyze',
        arguments: {
          // Missing required 'problem' parameter
          mode: 'general'
        }
      }
    };

    const response = await sendMCPRequest(request);
    
    assert.ok(response.error || response.result.isError);
  });

  // Cleanup
  test.after(() => {
    if (agentProcess) {
      agentProcess.kill();
    }
  });
});