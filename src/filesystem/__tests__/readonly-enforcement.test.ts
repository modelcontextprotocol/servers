import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

// Path to compiled server entry (kept in sync with other integration tests)
const SERVER_PATH = path.join(__dirname, '..', 'dist', 'index.js');

type ServerHandle = {
    proc: ChildProcessWithoutNullStreams;
    stdout: string;
    stderr: string;
    sendRequest: (method: string, params: any) => Promise<any>;
};

async function spawnServer(args: string[], env: Record<string, string> = {}, startupTimeoutMs = 4000): Promise<ServerHandle> {
    const proc = spawn('node', [SERVER_PATH, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env }
    });

    let stderr = '';
    let stdout = '';

    proc.stderr?.on('data', (data) => {
        stderr += data.toString();
    });

    proc.stdout?.on('data', (data) => {
        stdout += data.toString();
    });

    const sendRequest = (method: string, params: any) => {
        const id = Math.floor(Math.random() * 10000);
        const request = JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params
        }) + '\n';

        return new Promise((resolve) => {
            const handler = (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const response = JSON.parse(line);
                        if (response.id === id) {
                            proc.stdout?.removeListener('data', handler);
                            resolve(response);
                            return;
                        }
                    } catch (e) {
                        // Not a JSON line
                    }
                }
            };
            proc.stdout?.on('data', handler);
            proc.stdin?.write(request);
        });
    };

    // Wait for server to be ready with a timeout to avoid hanging tests
    await new Promise((resolve, reject) => {
        const check = (data: Buffer) => {
            if (data.toString().toLowerCase().includes('running on stdio')) {
                clearTimeout(timeout);
                proc.stderr?.off('data', check);
                resolve(null);
            }
        };

        const timeout = setTimeout(() => {
            proc.stderr?.off('data', check);
            reject(new Error('Server did not start within timeout'));
        }, startupTimeoutMs);

        proc.stderr?.on('data', check);
    });

    return {
        proc,
        stdout,
        stderr,
        sendRequest
    };
}

describe('Read-Only Mode Enforcement', () => {
    let testDir: string;
    let server: ServerHandle | undefined;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-readonly-test-'));
    });

    afterEach(async () => {
        server?.proc.kill();
        server = undefined;
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should allow write operations in default mode', async () => {
        server = await spawnServer([testDir]);

        // Initializing
        await server.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        const writeResponse = await server.sendRequest('tools/call', {
            name: 'write_file',
            arguments: {
                path: path.join(testDir, 'test.txt'),
                content: 'hello world'
            }
        });

        expect(writeResponse.error).toBeUndefined();
        expect(writeResponse.result.content[0].text).toContain('Successfully wrote');

        // Tool metadata should still advertise write capabilities with readOnlyHint false
        const toolsResponse: any = await server.sendRequest('tools/list', {});
        const toolHints = Object.fromEntries(
            toolsResponse.result.tools.map((t: any) => [t.name, t.annotations?.readOnlyHint])
        );

        expect(toolHints['write_file']).toBe(false);
        expect(toolHints['edit_file']).toBe(false);
        expect(toolHints['create_directory']).toBe(false);
        expect(toolHints['move_file']).toBe(false);
        expect(toolHints['read_file']).toBe(true);
    });

    it('should block write operations in --read-only mode', async () => {
        server = await spawnServer(['--read-only', testDir]);

        await server.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        const destructiveTools: { name: string, args: any }[] = [
            {
                name: 'write_file',
                args: { path: path.join(testDir, 'test.txt'), content: 'hello world' }
            },
            {
                name: 'edit_file',
                args: { path: path.join(testDir, 'test.txt'), edits: [{ oldText: 'a', newText: 'b' }], dryRun: true }
            },
            {
                name: 'create_directory',
                args: { path: path.join(testDir, 'new-dir') }
            },
            {
                name: 'move_file',
                args: { source: path.join(testDir, 'a.txt'), destination: path.join(testDir, 'b.txt') }
            }
        ];

        for (const { name, args } of destructiveTools) {
            const response: any = await server.sendRequest('tools/call', {
                name,
                arguments: args
            });

            // Tool should be missing; SDK may surface this either as JSON-RPC error or as an MCP result error
            if (response.error) {
                expect(response.error.code).toBe(-32601);
                expect(response.error.message.toLowerCase()).toContain(name);
            } else {
                expect(response.result?.isError).toBe(true);
                const errorText = response.result?.content?.[0]?.text ?? '';
                expect(errorText.toLowerCase()).toContain(name);
            }
        }

        // Check tool list omits destructive tools but keeps reads
        const toolsResponse: any = await server.sendRequest('tools/list', {});
        const toolNames = toolsResponse.result.tools.map((t: any) => t.name);

        expect(toolNames).not.toContain('write_file');
        expect(toolNames).not.toContain('edit_file');
        expect(toolNames).not.toContain('create_directory');
        expect(toolNames).not.toContain('move_file');
        expect(toolNames).toContain('read_file');

    });

it('should block write operations via environment variable', async () => {
    server = await spawnServer([testDir], { READ_ONLY: 'true' });

        await server.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        const toolsResponse: any = await server.sendRequest('tools/list', {});
        const toolNames = toolsResponse.result.tools.map((t: any) => t.name);

    expect(toolNames).not.toContain('write_file');
});

    it('should default to read-only when DEFAULT_READ_ONLY is set', async () => {
        server = await spawnServer([testDir], { DEFAULT_READ_ONLY: 'yes' });

        await server.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        const toolsResponse: any = await server.sendRequest('tools/list', {});
        const toolNames = toolsResponse.result.tools.map((t: any) => t.name);

        expect(toolNames).not.toContain('write_file');
    });

    it('should allow overriding DEFAULT_READ_ONLY with --write-enabled', async () => {
        server = await spawnServer(['--write-enabled', testDir], { DEFAULT_READ_ONLY: '1' });

        await server.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        const toolsResponse: any = await server.sendRequest('tools/list', {});
        const toolNames = toolsResponse.result.tools.map((t: any) => t.name);

        expect(toolNames).toContain('write_file');
    });

    it('should allow read operations while in --read-only mode', async () => {
        await fs.writeFile(path.join(testDir, 'readme.txt'), 'hello read-only');

        server = await spawnServer(['--read-only', testDir]);

        await server.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });

        const readResponse: any = await server.sendRequest('tools/call', {
            name: 'read_file',
            arguments: { path: path.join(testDir, 'readme.txt') }
        });

        expect(readResponse.error).toBeUndefined();
        const text = readResponse.result?.content?.[0]?.text ?? '';
        expect(text).toContain('hello read-only');
    });
});
