// __tests__/tools.test.ts
const { spawn } = require('child_process');

describe('Daum Search MCP Server Tools', () => {
    let serverProcess;
    
    beforeAll(() => {
        if (!process.env.KAKAO_API_KEY) {
            throw new Error('KAKAO_API_KEY environment variable is required for testing');
        }

        // Start the server before running tests
        serverProcess = spawn('node', ['dist/index.js'], {
            env: {
                ...process.env,
                KAKAO_API_KEY: process.env.KAKAO_API_KEY
            }
        });

        // Wait for server to be ready
        return new Promise((resolve) => {
            const serverStartTimeout = setTimeout(() => {
                throw new Error('Server failed to start within 30 seconds');
            }, 30000);

            const checkServerReady = (data) => {
                const message = data.toString();
                if (message.includes('Daum Search MCP Server running')) {
                    clearTimeout(serverStartTimeout);
                    resolve();
                }
            };

            serverProcess.stdout.on('data', checkServerReady);
            serverProcess.stderr.on('data', checkServerReady);

            serverProcess.on('error', (error) => {
                clearTimeout(serverStartTimeout);
                throw new Error(`Server process error: ${error.message}`);
            });
        });
    });

    afterAll((done) => {
        // Clean up the server process after tests
        if (serverProcess) {
            serverProcess.once('exit', () => {
                done();
            });
            serverProcess.kill();
        } else {
            done();
        }
    });

    const testTool = async (toolName, toolArgs) => {
        return new Promise((resolve, reject) => {
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: toolArgs
                }
            };

            let responseData = '';
            let timeoutHandle;

            const cleanup = () => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                serverProcess.stdout.removeListener('data', responseHandler);
                serverProcess.stderr.removeListener('data', responseHandler);
            };

            const responseHandler = (data) => {
                responseData += data.toString();
                try {
                    const response = JSON.parse(responseData);
                    cleanup();
                    resolve(response);
                } catch (e) {
                    // 완전한 JSON이 아직 수신되지 않았을 수 있음
                }
            };

            serverProcess.stdout.on('data', responseHandler);
            serverProcess.stderr.on('data', responseHandler);

            serverProcess.stdin.write(JSON.stringify(request) + '\n');

            // Set timeout for individual request
            timeoutHandle = setTimeout(() => {
                cleanup();
                reject(new Error(`Request timeout for ${toolName}`));
            }, 10000);
        });
    };

    test('daum_web_search should return valid response', async () => {
        const response = await testTool('daum_web_search', { query: '테스트' });
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('content');
        expect(Array.isArray(response.result.content)).toBe(true);
        expect(response.result.content[0]).toHaveProperty('text');
        expect(response.result.isError).toBe(false);
    }, 15000);

    test('daum_vclip_search should return valid response', async () => {
        const response = await testTool('daum_vclip_search', { query: '테스트' });
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('content');
        expect(Array.isArray(response.result.content)).toBe(true);
        expect(response.result.content[0]).toHaveProperty('text');
        expect(response.result.isError).toBe(false);
    }, 15000);

    test('daum_image_search should return valid response', async () => {
        const response = await testTool('daum_image_search', { query: '테스트' });
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('content');
        expect(Array.isArray(response.result.content)).toBe(true);
        expect(response.result.content[0]).toHaveProperty('text');
        expect(response.result.isError).toBe(false);
    }, 15000);

    test('daum_blog_search should return valid response', async () => {
        const response = await testTool('daum_blog_search', { query: '테스트' });
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('content');
        expect(Array.isArray(response.result.content)).toBe(true);
        expect(response.result.content[0]).toHaveProperty('text');
        expect(response.result.isError).toBe(false);
    }, 15000);

    test('daum_book_search should return valid response', async () => {
        const response = await testTool('daum_book_search', { query: '테스트' });
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('content');
        expect(Array.isArray(response.result.content)).toBe(true);
        expect(response.result.content[0]).toHaveProperty('text');
        expect(response.result.isError).toBe(false);
    }, 15000);

    test('daum_cafe_search should return valid response', async () => {
        const response = await testTool('daum_cafe_search', { query: '테스트' });
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('content');
        expect(Array.isArray(response.result.content)).toBe(true);
        expect(response.result.content[0]).toHaveProperty('text');
        expect(response.result.isError).toBe(false);
    }, 15000);
});