/**
 * Test script for the enhanced error handling system
 * 
 * This script tests the functionality of the error handling system including
 * custom error classes, error handling wrappers, and circuit breakers.
 */

import { 
  AppError, 
  ApiError, 
  ProcessingError, 
  ErrorType, 
  ErrorSeverity, 
  errorHandler,
  withErrorHandling,
  createCircuitBreaker
} from '../config/errors.js';

// Test custom error classes
console.log('Testing custom error classes...');

// Create an AppError
const appError = new AppError({
  type: ErrorType.INTERNAL_ERROR,
  message: 'Test application error',
  severity: ErrorSeverity.ERROR,
  timestamp: Date.now()
});

console.log('AppError created:', appError.message);
console.log('Error type:', appError.type);
console.log('Error severity:', appError.severity);

// Create an ApiError
const apiError = new ApiError(
  'Test API error',
  ErrorType.API_REQUEST_ERROR,
  ErrorSeverity.WARNING
);

console.log('ApiError created:', apiError.message);
console.log('Error type:', apiError.type);
console.log('Error severity:', apiError.severity);

// Create a ProcessingError
const processingError = new ProcessingError(
  'Test processing error',
  ErrorType.PROCESSING_ERROR,
  ErrorSeverity.ERROR,
  { stage: 'analysis' }
);

console.log('ProcessingError created:', processingError.message);
console.log('Error type:', processingError.type);
console.log('Error severity:', processingError.severity);
console.log('Error details:', processingError.details);

// Test error handler
console.log('\nTesting error handler...');
const handledError = errorHandler.handleError(new Error('Test standard error'));
console.log('Standard error converted to AppError:', handledError instanceof AppError);
console.log('Error message:', handledError.message);

// Test withErrorHandling wrapper
console.log('\nTesting withErrorHandling wrapper...');

// Create a function that might throw an error
async function riskyFunction(shouldFail: boolean): Promise<string> {
  if (shouldFail) {
    throw new Error('Risky function failed');
  }
  return 'Risky function succeeded';
}

// Wrap the function with error handling
const safeFunction = withErrorHandling(riskyFunction);

// Test successful execution
try {
  console.log('Testing successful execution...');
  const result = await safeFunction(false);
  console.log('Result:', result);
} catch (error) {
  console.error('Unexpected error:', error);
}

// Test error handling
try {
  console.log('\nTesting error handling...');
  await safeFunction(true);
  console.error('Error was not thrown as expected');
} catch (error) {
  console.log('Error was caught as expected');
  console.log('Error is AppError:', error instanceof AppError);
  console.log('Error message:', (error as AppError).message);
}

// Test circuit breaker
console.log('\nTesting circuit breaker...');

// Create a function that might fail
async function unreliableFunction(shouldFail: boolean): Promise<string> {
  if (shouldFail) {
    throw new Error('Unreliable function failed');
  }
  return 'Unreliable function succeeded';
}

// Create a fallback function
async function fallbackFunction(): Promise<string> {
  return 'Fallback function called';
}

// Wrap the function with a circuit breaker
const protectedFunction = createCircuitBreaker(
  unreliableFunction,
  {
    maxFailures: 2,
    resetTimeout: 5000,
    fallback: fallbackFunction
  }
);

// Test successful execution
try {
  console.log('Testing successful execution...');
  const result = await protectedFunction(false);
  console.log('Result:', result);
} catch (error) {
  console.error('Unexpected error:', error);
}

// Test circuit breaker triggering
try {
  console.log('\nTesting circuit breaker triggering...');
  console.log('First failure...');
  try {
    await protectedFunction(true);
  } catch (error) {
    console.log('Error caught as expected:', (error as AppError).message);
  }
  
  console.log('Second failure...');
  try {
    await protectedFunction(true);
  } catch (error) {
    console.log('Error caught as expected:', (error as AppError).message);
  }
  
  console.log('Third call (should use fallback)...');
  const result = await protectedFunction(true);
  console.log('Result:', result);
} catch (error) {
  console.error('Unexpected error:', error);
}

console.log('\nError handling test completed successfully');
