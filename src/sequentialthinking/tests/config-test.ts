/**
 * Test script for the enhanced configuration system
 * 
 * This script tests the functionality of the centralized configuration system.
 */

import { configManager, getConfig, get } from '../config/index.js';

// Test configuration initialization
console.log('Testing configuration initialization...');
configManager.initialize();
console.log('Configuration initialized successfully');

// Test getting complete configuration
console.log('\nTesting getConfig()...');
const config = getConfig();
console.log('Server port:', config.server.port);
console.log('Log level:', config.server.logLevel);
console.log('OpenAI API key:', config.api.openai.apiKey ? '[REDACTED]' : 'Not configured');
console.log('OpenRouter API key:', config.api.openrouter.apiKey ? '[REDACTED]' : 'Not configured');

// Test getting specific configuration values
console.log('\nTesting get() with dot notation...');
const port = get('server.port');
const logLevel = get('server.logLevel');
const maxWorkingMemorySize = get('memory.workingMemory.maxSize');
const defaultContextWindowSize = get('processing.defaultContextWindowSize');

console.log('Server port:', port);
console.log('Log level:', logLevel);
console.log('Max working memory size:', maxWorkingMemorySize);
console.log('Default context window size:', defaultContextWindowSize);

// Test getting configuration with default values
console.log('\nTesting get() with default values...');
const nonExistentValue = get('nonexistent.path', 'default value');
const customTimeout = get('api.custom.timeout', 30000);

console.log('Non-existent value:', nonExistentValue);
console.log('Custom timeout:', customTimeout);

console.log('\nConfiguration test completed successfully');
