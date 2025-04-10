import * as path from 'node:path';
import * as fs from 'fs';
import { executeCode } from './vm-execution.js';
import { executeCodeWithNode } from './direct-node-executor.js';
import { debugLog, formatValue } from './utils.js';

// Default timeout for code execution (5 seconds)
const DEFAULT_TIMEOUT = 5000;

// Note: Needs access to the defaultWorkingDirectory from the main server file.
// This could be passed in during initialization or via a shared config module.
// For now, we'll assume it's globally accessible or passed implicitly.

export const listToolsHandler = async () => {
    debugLog('Handling ListToolsRequestSchema');
    return {
        tools: [
            {
                name: "execute",
                description: "Execute JavaScript code in the universal ESM sandbox, importing code from the current repository is encouraged for testing their functionality. Only use ESM code.",
                inputSchema: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description: "ESM code to execute, no top-level await is allowed"
                        },
                        timeout: {
                            type: "number",
                            description: "Optional timeout in milliseconds (default: 5000)"
                        },
                        workingDir: {
                            type: "string",
                            description: "Optional working directory override"
                        }
                    },
                    required: ["code"]
                }
            }
        ],
    };
};

export const callToolHandler = async (request, defaultWorkingDir) => {
    debugLog(`Handling CallToolRequestSchema: ${JSON.stringify(request)}`);

    try {
        // Ensure defaultWorkingDir is always provided
        if (!defaultWorkingDir) {
            debugLog('Warning: defaultWorkingDir not provided, using the directory specified by argv[2] or process.cwd()');
            const argv2Dir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
            defaultWorkingDir = argv2Dir;
            debugLog(`Using defaultWorkingDir: ${defaultWorkingDir}`);
        }

        const { name, arguments: args = {} } = request.params;
        
        // Extract the tool name
        debugLog(`Tool call received: ${name}`);
        
        if (name === 'execute' || name === 'mcp_mcp_repl_execute') {
            // Special direct handling for the execute tool
            const { code, timeout = DEFAULT_TIMEOUT, workingDir = defaultWorkingDir } = args;
            
            // Add special handling for mcp_mcp_repl_execute to extract results for tests
            const isDirectRepl = name === 'mcp_mcp_repl_execute';

            if (!code) {
                debugLog(`Missing code argument for execute tool`);
                throw new Error("Missing code argument for execute tool");
            }

            const timeoutValue = parseInt(timeout) || 5000; 
            
            // Process working directory - ensure argv[2] works correctly
            debugLog(`Determined working directory for execution: ${workingDir}`);
            
            // Load environment variables from .env files
            loadEnvironmentVariables(workingDir);
            
            // Enhanced pattern detection for better timeout and handling
            const codePatterns = detectCodePatterns(code);
            
            // Dynamic timeout adjustment based on code patterns
            let adjustedTimeout = timeoutValue;
            if (codePatterns.hasNetworkOperations) {
                adjustedTimeout = Math.max(timeoutValue, 20000);
                debugLog(`Network operations detected, using adjusted timeout: ${adjustedTimeout}ms`);
            } else if (codePatterns.hasAsyncPatterns) {
                adjustedTimeout = Math.max(timeoutValue, 10000);
                debugLog(`Async patterns detected, using adjusted timeout: ${adjustedTimeout}ms`);
            }
            
            debugLog(`Executing code via direct Node.js: ${code.substring(0, 100)}... with timeout ${adjustedTimeout} in dir ${workingDir}`);

            // Execute the code with Node.js directly for native import support
            const executionResult = await executeCodeWithNode(code, adjustedTimeout, workingDir);
            debugLog(`Execution completed with ${executionResult.logs?.length || 0} logs and result: ${executionResult.success ? 'success' : 'error'}`);
            
            return {
                result: {
                    value: executionResult.result,
                    logs: executionResult.logs
                }
            };
        }
        
        throw new Error(`Unknown tool name: ${name}`);
    } catch (error) {
        debugLog(`Error in callToolHandler: ${error.message}`);
        return {
            error: {
                message: error.message,
                code: error.code || 'EXECUTION_ERROR',
                data: error.data || null
            }
        };
    }
};

/**
 * Load environment variables from .env files
 */
function loadEnvironmentVariables(workingDir) {
    // First, try to load .env from the C:/dev/tasker directory if it exists
    try {
        const taskerEnvPath = 'C:/dev/tasker/.env';
        if (fs.existsSync(taskerEnvPath)) {
            debugLog(`Loading .env file from ${taskerEnvPath}`);
            const envContent = fs.readFileSync(taskerEnvPath, 'utf8');
            processEnvFile(envContent);
        }
    } catch (taskerEnvErr) {
        debugLog(`Error loading tasker .env file: ${taskerEnvErr.message}`);
    }
    
    // Then, try the regular .env file loading logic
    try {
        const envPath = path.join(workingDir, '.env');
        if (fs.existsSync(envPath)) {
            debugLog(`Loading .env file from ${envPath}`);
            const envContent = fs.readFileSync(envPath, 'utf8');
            processEnvFile(envContent);
        }
    } catch (envErr) {
        debugLog(`Error loading .env file: ${envErr.message}`);
    }
}

/**
 * Process an .env file content and set environment variables
 */
function processEnvFile(content) {
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match && match[1] && !match[1].startsWith('#')) {
            const key = match[1].trim();
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length - 1);
            }
            process.env[key] = value; 
            debugLog(`Set env var ${key}`);
        }
    });
}

/**
 * Detect patterns in code for better execution handling
 */
function detectCodePatterns(code) {
    return {
        hasNetworkOperations: code.includes('fetch(') || 
            code.includes('http://') || 
            code.includes('https://') ||
            code.includes('await') && (code.includes('get') || code.includes('post')),
        
        hasAsyncPatterns: code.includes('async ') || 
            code.includes('await ') || 
            code.includes('Promise') ||
            code.includes('.then(') ||
            code.includes('.catch('),
        
        hasObjectLiterals: (code.includes('{') && code.includes(':')) ||
            code.includes('new Object') ||
            code.includes('Object.create'),
        
        isTestCode: code.includes('Test.assert') || 
            code.includes('expect(') || 
            code.includes('assertEqual') ||
            code.includes('assert('),
        
        usesES6Features: code.includes('=>') || 
            code.includes('class ') ||
            code.includes('...') ||
            code.includes('const {'),
        
        usesEnvOrArgv: code.includes('process.env') ||
            code.includes('process.argv'),
        
        hasRegexOperations: code.includes('RegExp') ||
            code.includes('/') && code.includes('/g'),
        
        usesBufferOrStreams: code.includes('Buffer') ||
            code.includes('Stream') ||
            code.includes('createReadStream'),
        
        hasErrorHandling: code.includes('try ') ||
            code.includes('catch ') ||
            code.includes('throw ') ||
            code.includes('Error('),
        
        isESM: code.includes('import ') || 
            code.includes('export ') ||
            code.includes('from \'') ||
            code.includes('from "')
    };
} 