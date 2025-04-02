/**
 * Test script for the enhanced logging system
 * 
 * This script tests the functionality of the centralized logging system
 * including different log levels and formatting options.
 */

import { logger, debug, info, warn, error, LogLevel } from '../config/logger.js';

// Test different log levels
console.log('Testing different log levels...');

debug('This is a debug message');
info('This is an info message');
warn('This is a warning message');
error('This is an error message');

// Test logging with context
console.log('\nTesting logging with context...');

debug('Debug message with context', { source: 'logger-test', value: 42 });
info('Info message with context', { source: 'logger-test', items: ['a', 'b', 'c'] });
warn('Warning message with context', { source: 'logger-test', warning: true });
error('Error message with context', { source: 'logger-test', error: new Error('Test error') });

// Test logging with request ID
console.log('\nTesting logging with request ID...');

const requestId = 'req-' + Date.now();
debug('Debug message with request ID', { source: 'logger-test' }, requestId);
info('Info message with request ID', { source: 'logger-test' }, requestId);
warn('Warning message with request ID', { source: 'logger-test' }, requestId);
error('Error message with request ID', { source: 'logger-test' }, requestId);

// Test changing log level
console.log('\nTesting changing log level...');

console.log('Setting log level to WARN');
logger.setLogLevel(LogLevel.WARN);

debug('This debug message should not be logged');
info('This info message should not be logged');
warn('This warning message should be logged');
error('This error message should be logged');

// Reset log level
console.log('\nResetting log level to INFO');
logger.setLogLevel(LogLevel.INFO);

debug('This debug message should not be logged');
info('This info message should be logged');
warn('This warning message should be logged');
error('This error message should be logged');

console.log('\nLogging test completed successfully');
